import { APIError, CATALOG_ID, canonicalJSON, canonicalSourceURL, pageKeyFor, revisionOf, type CompileOutput, type PageBundle } from "./protocol.ts";

const COMPONENTS = new Set(["Column", "Row", "List", "Card", "Text", "Image", "Divider", "Button"]);
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
function invalid(message: string): never { throw new APIError("INVALID_ARTIFACT", message, 422); }

function checkDepth(value: unknown, depth = 0): void {
  if (depth > 30) invalid("Artifact nesting exceeds the supported limit.");
  if (Array.isArray(value)) value.forEach(item => checkDepth(item, depth + 1));
  else if (object(value)) Object.values(value).forEach(item => checkDepth(item, depth + 1));
}

export function validateSpec(spec: PageBundle["spec"]): void {
  if (!object(spec) || spec.catalogId !== CATALOG_ID || !Array.isArray(spec.messages) || spec.messages.length < 2 || spec.messages.length > 8) invalid("Unsupported native catalog or surface messages.");
  let created = false;
  const components = new Map<string, Record<string, unknown>>();
  for (const message of spec.messages) {
    if (!object(message) || message.version !== "v0.9") invalid("Only A2UI v0.9 messages are supported.");
    if (object(message.createSurface) && !created && components.size === 0) {
      if (message.createSurface.surfaceId !== "page" || message.createSurface.catalogId !== CATALOG_ID) invalid("The surface identity or catalog is invalid.");
      created = true;
    } else if (created && object(message.updateComponents)) {
      const update = message.updateComponents;
      if (update.surfaceId !== "page" || !Array.isArray(update.components)) invalid("Component update is invalid.");
      for (const component of update.components as unknown[]) {
        if (!object(component) || typeof component.id !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(component.id) || typeof component.component !== "string" || !COMPONENTS.has(component.component)) invalid("A component has an unsupported type or ID.");
        if (components.has(component.id)) invalid("Component IDs must be unique.");
        if (component.action !== undefined) {
          const action = component.action;
          if (!object(action) || !object(action.event) || action.event.name !== "openURL" || Object.keys(action).some(key => key !== "event")) invalid("Only source-link navigation actions are supported.");
        }
        components.set(component.id, component);
      }
    } else invalid("Specifications may contain only surface creation and component updates.");
  }
  if (!created || !components.has("root") || components.size > 200) invalid("The surface requires a root and at most 200 components.");
  const edges = new Map<string, string[]>();
  for (const [id, component] of components) {
    const children: string[] = [];
    if (typeof component.child === "string") children.push(component.child);
    if (Array.isArray(component.children)) {
      if (component.children.some(child => typeof child !== "string")) invalid("Child references must be component IDs.");
      children.push(...component.children as string[]);
    } else if (object(component.children) && typeof component.children.componentId === "string") children.push(component.children.componentId);
    for (const child of children) if (!components.has(child)) invalid("A component refers to a missing child.");
    edges.set(id, children);
  }
  const visited = new Set<string>();
  const visit = (id: string, chain: Set<string>, depth: number): void => {
    if (chain.has(id) || depth > 24) invalid("The component graph is cyclic or too deep.");
    if (visited.has(id)) return;
    const next = new Set(chain).add(id);
    for (const child of edges.get(id) ?? []) visit(child, next, depth + 1);
    visited.add(id);
  };
  visit("root", new Set(), 0);
  if (visited.size !== components.size) invalid("Every component must be reachable from the root.");
}

export async function validateBundle(bundle: PageBundle): Promise<void> {
  checkDepth(bundle);
  if (new TextEncoder().encode(canonicalJSON(bundle)).byteLength > 2_000_000) invalid("Artifact is too large.");
  if (bundle.protocolVersion !== 1 || !/^[a-f0-9]{64}$/.test(bundle.pageKey)) invalid("Unsupported artifact protocol or page key.");
  if (canonicalSourceURL(bundle.sourceURL) !== bundle.sourceURL) invalid("Source URL must be canonical.");
  if (bundle.pageKey !== await pageKeyFor(bundle.sourceURL)) invalid("Page key does not match the source and public variant.");
  if (typeof bundle.title !== "string" || !bundle.title.trim() || !Number.isFinite(Date.parse(bundle.capturedAt))) invalid("Artifact source metadata is incomplete.");
  if (!object(bundle.recipe) || !object(bundle.content) || !object(bundle.generation) || typeof bundle.generation.model !== "string" || !bundle.generation.model || !Number.isFinite(Date.parse(bundle.generation.generatedAt)) || typeof bundle.generation.promptVersion !== "string") invalid("Artifact provenance or content is incomplete.");
  validateSpec(bundle.spec);
  const [specRevision, recipeRevision, contentRevision] = await Promise.all([revisionOf(bundle.spec), revisionOf(bundle.recipe), revisionOf(bundle.content)]);
  if (bundle.specRevision !== specRevision || bundle.recipeRevision !== recipeRevision || bundle.contentRevision !== contentRevision) invalid("Artifact revision hashes do not match its values.");
}

export async function createBundle(pageKey: string, sourceURL: string, capturedAt: string, output: CompileOutput): Promise<PageBundle> {
  const [specRevision, recipeRevision, contentRevision] = await Promise.all([revisionOf(output.spec), revisionOf(output.recipe), revisionOf(output.content)]);
  const bundle: PageBundle = { ...output, protocolVersion: 1, pageKey, sourceURL, capturedAt, specRevision, recipeRevision, contentRevision };
  await validateBundle(bundle);
  return bundle;
}
