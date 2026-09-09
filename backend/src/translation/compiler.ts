import { COMPILATION_SCHEMA, COMPILER_INSTRUCTIONS } from "./schema.ts";
import { reextract, validateRecipe } from "./extraction.ts";
import { CATALOG_ID, MAX_RUN_MS, PROMPT_VERSION, SURFACE_ID, TranslationError, deadlineSignal, withinDeadline, type CaptureEvidence, type CaptureTransport, type CompilationResult, type JSONObject, type JSONValue, type ModelTransport, type RunOptions } from "./types.ts";
import { normalizePublicURL } from "./url-policy.ts";

const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
function fail(message: string): never { throw new TranslationError("INVALID_SPEC", message); }
const identifier = /^[A-Za-z][A-Za-z0-9_-]{0,80}$/;
const enums: Record<string, string[]> = {
  Text: ["h1", "h2", "h3", "h4", "h5", "body", "caption"],
  Image: ["contain", "cover", "fill", "none", "scaleDown"],
};

/** Validate the bounded subset supported by the pinned native catalog. */
export function validateCompilation(value: unknown, evidence: CaptureEvidence): Omit<CompilationResult, "generation"> {
  if (!object(value) || !Array.isArray(value.components) || value.components.length < 1 || value.components.length > 120) fail("Expected 1–120 components.");
  const recipe = validateRecipe(value.recipe);
  const content = reextract(evidence, recipe);
  const components = new Map<string, Record<string, unknown>>();
  for (const component of value.components) {
    if (!object(component) || typeof component.id !== "string" || !identifier.test(component.id) || components.has(component.id)) fail("Each component requires a unique valid ID.");
    if (typeof component.component !== "string" || !["Text", "Column", "Row", "Card", "Image", "Divider", "Button"].includes(component.component)) fail("Unsupported component type.");
    components.set(component.id, component);
  }
  if (!components.has("root")) fail("Missing root component.");
  const visited = new Set<string>();
  const validatedContexts = new Set<string>();
  const binding = (raw: unknown, template: string | null) => {
    if (!object(raw) || Object.keys(raw).length !== 1 || typeof raw.path !== "string") fail("All source values must be path bindings.");
    const path = raw.path as string;
    if (path.startsWith("/content/fields/")) {
      const key = path.slice("/content/fields/".length);
      const field = recipe.fields.find(field => field.key === key);
      if (!field) fail(`Binding ${path} has no extraction field.`);
      return field;
    } else if (template && /^[A-Za-z][A-Za-z0-9_]*$/.test(path)) {
      const field = recipe.lists.find(list => list.key === template)?.fields.find(field => field.key === path);
      if (!field) fail(`Template binding ${path} has no item field.`);
      return field;
    } else fail(`Binding ${path} is outside the supported content context.`);
  };
  const walk = (id: string, ancestry: Set<string>, template: string | null) => {
    if (ancestry.has(id)) fail("Component hierarchy contains a cycle.");
    if (ancestry.size >= 18) fail("Component hierarchy is too deep.");
    const contextKey = `${id}:${template ?? "document"}`;
    if (validatedContexts.has(contextKey)) return;
    validatedContexts.add(contextKey);
    const component = components.get(id);
    if (!component) fail(`Child ${id} does not exist.`);
    visited.add(id);
    const next = new Set(ancestry); next.add(id);
    const type = String(component.component);
    const allowed: Record<string, string[]> = {
      Text: ["id", "component", "text", "variant"], Column: ["id", "component", "children", "align", "justify"], Row: ["id", "component", "children", "align", "justify"],
      Card: ["id", "component", "child"], Image: ["id", "component", "url", "fit"], Divider: ["id", "component", "axis"], Button: ["id", "component", "child", "action"],
    };
    if (Object.keys(component).some(key => !allowed[type]?.includes(key))) fail(`Unsupported ${type} property.`);
    if (type === "Text") {
      binding(component.text, template);
      if (!enums.Text?.includes(String(component.variant))) fail("Invalid Text variant.");
    } else if (type === "Image") {
      if (!["src", "href"].includes(binding(component.url, template).value)) fail("Image URL must bind a source URL attribute.");
      if (!enums.Image?.includes(String(component.fit))) fail("Invalid Image fit.");
    } else if (type === "Column" || type === "Row") {
      if (!["start", "center", "end", "stretch"].includes(String(component.align)) || !["start", "center", "end", "spaceBetween", "spaceAround", "spaceEvenly"].includes(String(component.justify))) fail("Invalid layout alignment.");
      const children = component.children;
      if (Array.isArray(children)) {
        if (!children.length || children.length > 120 || children.some(child => typeof child !== "string")) fail("Layout children must be component IDs.");
        for (const child of children) walk(child as string, next, template);
      } else if (object(children) && typeof children.componentId === "string" && typeof children.path === "string" && Object.keys(children).length === 2) {
        const prefix = "/content/lists/";
        const list = children.path.startsWith(prefix) ? children.path.slice(prefix.length) : "";
        if (template || !recipe.lists.some(item => item.key === list)) fail("Collection template must reference a declared list; nested templates are unsupported.");
        walk(children.componentId, next, list);
      } else fail("Invalid layout children.");
    } else if (type === "Card" || type === "Button") {
      if (typeof component.child !== "string") fail(`${type} must reference one child.`);
      walk(component.child as string, next, template);
      if (type === "Button") {
        const action = component.action;
        if (!object(action) || Object.keys(action).length !== 1 || !object(action.event) || Object.keys(action.event).length !== 2 || action.event.name !== "openURL" || !object(action.event.context) || Object.keys(action.event.context).length !== 1) fail("Only the openURL Button event is allowed.");
        if (binding(action.event.context.url, template).value !== "href") fail("Button URL must bind a source href attribute.");
      }
    } else if (!["horizontal", "vertical"].includes(String(component.axis))) fail("Invalid Divider axis.");
  };
  walk("root", new Set(), null);
  if (visited.size !== components.size) fail("Every generated component must be reachable from root.");
  if (value.theme !== undefined && (!object(value.theme) || (value.theme.primaryColor !== null && (typeof value.theme.primaryColor !== "string" || !/^#[0-9a-f]{6}$/i.test(value.theme.primaryColor))))) fail("Theme must contain a hexadecimal source color or null.");
  const color = object(value.theme) && typeof value.theme.primaryColor === "string" ? value.theme.primaryColor : undefined;
  const messages: JSONObject[] = [
    { version: "v0.9", createSurface: { surfaceId: SURFACE_ID, catalogId: CATALOG_ID, ...(color ? { theme: { primaryColor: color } } : {}) } },
    { version: "v0.9", updateComponents: { surfaceId: SURFACE_ID, components: value.components as JSONValue[] } },
  ];
  return { spec: { catalogId: CATALOG_ID, messages }, recipe, content, title: evidence.title };
}

export function createTranslationPipeline(dependencies: { captureTransport: CaptureTransport; modelTransport: ModelTransport }) {
  return {
    async capture(input: string | URL, options: RunOptions = {}): Promise<CaptureEvidence> {
      const url = normalizePublicURL(input);
      const deadlineAt = Date.now() + MAX_RUN_MS;
      const signal = deadlineSignal(deadlineAt, options.signal);
      await options.onProgress?.({ type: "status", stage: "capture", message: "Inspecting the public source page." });
      return withinDeadline(dependencies.captureTransport.capture(url, { ...options, signal, deadlineAt }), signal);
    },
    async compile(evidence: CaptureEvidence, options: RunOptions = {}): Promise<CompilationResult> {
      const signal = deadlineSignal(evidence.deadlineAt, options.signal);
      const input = JSON.stringify({ sourceURL: evidence.sourceURL, title: evidence.title, theme: evidence.theme, html: evidence.html.slice(0, 240_000), text: evidence.text, relatedPages: evidence.relatedPages ?? [] });
      let repair: string | undefined;
      let previous: unknown;
      for (let attempt = 0; attempt < 2; attempt++) {
        await options.onProgress?.({ type: "status", stage: attempt ? "repair" : "compile", message: attempt ? "Repairing one validation issue in the generated layout." : "Astra is generating native layout and extraction rules." });
        const generated = await withinDeadline(dependencies.modelTransport.generate({
          instructions: COMPILER_INSTRUCTIONS,
          input: repair ? `${input}\nPrevious output failed validation: ${repair}\nRepair this output, using only the captured source:\n${JSON.stringify(previous).slice(0, 180_000)}` : input,
          schema: COMPILATION_SCHEMA,
          maxOutputTokens: 12_000,
          signal,
        }), signal);
        previous = generated.value;
        try {
          const result = validateCompilation(generated.value, evidence);
          await options.onProgress?.({ type: "status", stage: "validated", message: "Native layout and source bindings passed validation." });
          return { ...result, generation: { model: generated.model, generatedAt: new Date().toISOString(), promptVersion: PROMPT_VERSION } };
        } catch (error) {
          if (!(error instanceof TranslationError) || attempt > 0) throw error;
          repair = error.message;
        }
      }
      throw new TranslationError("COMPILATION_FAILED", "The generated layout could not be validated.");
    },
    reextract,
  };
}
