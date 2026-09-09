import { parseHTML } from "linkedom";
import { normalizePublicURL } from "./url-policy.ts";
import { TranslationError, type CaptureEvidence, type ExtractionField, type ExtractionRecipe, type JSONObject } from "./types.ts";

const SAFE_KEY = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor", "id"]);
const cleanText = (value: string) => value.replace(/\s+/g, " ").trim();
function invalid(message: string): never { throw new TranslationError("INVALID_RECIPE", message); }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
interface DOMElement {
  textContent: string | null;
  getAttribute(name: string): string | null;
  querySelector(selector: string): DOMElement | null;
  querySelectorAll(selector: string): ArrayLike<DOMElement>;
  attributes: ArrayLike<{ name: string }>;
  remove(): void;
  removeAttribute(name: string): void;
}
interface DOMDocument extends DOMElement { body: DOMElement | null; documentElement: DOMElement; toString(): string }
function parseDocument(html: string): DOMDocument { return parseHTML(html).document as unknown as DOMDocument; }

export function validateRecipe(value: unknown): ExtractionRecipe {
  if (!record(value) || value.version !== 1 || !Array.isArray(value.fields) || !Array.isArray(value.lists)) invalid("Recipe must contain version 1, fields, and lists.");
  if (value.fields.length > 32 || value.lists.length > 6 || value.fields.length + value.lists.length === 0) invalid("Recipe exceeds the bounded field/list limits or is empty.");
  const validateFields = (fields: unknown[], label: string): ExtractionField[] => {
    const names = new Set<string>();
    if (!fields.length || fields.length > 32) invalid(`${label} must contain 1–32 fields.`);
    return fields.map(field => {
      if (!record(field) || typeof field.key !== "string" || !SAFE_KEY.test(field.key) || FORBIDDEN_KEYS.has(field.key) || names.has(field.key)) invalid(`${label} contains an invalid or duplicate field key.`);
      names.add(field.key);
      if (typeof field.selector !== "string" || field.selector.length > 300 || /[\u0000-\u001f]/.test(field.selector) || /:has\s*\(/i.test(field.selector)) invalid(`${label}.${field.key} has an invalid selector.`);
      if (!["text", "href", "src", "alt", "content"].includes(String(field.value)) || typeof field.required !== "boolean") invalid(`${label}.${field.key} has an unsupported extraction operation.`);
      return { key: field.key, selector: field.selector, value: field.value as ExtractionField["value"], required: field.required };
    });
  };
  const listNames = new Set<string>();
  return {
    version: 1,
    fields: value.fields.length ? validateFields(value.fields, "fields") : [],
    lists: value.lists.map(list => {
      if (!record(list) || typeof list.key !== "string" || !SAFE_KEY.test(list.key) || FORBIDDEN_KEYS.has(list.key) || listNames.has(list.key)) invalid("Recipe contains an invalid or duplicate list key.");
      listNames.add(list.key);
      if (typeof list.selector !== "string" || !list.selector.trim() || list.selector.length > 300 || /:has\s*\(/i.test(list.selector) || !Array.isArray(list.fields)) invalid(`List ${list.key} has an invalid selector or fields.`);
      if (!Number.isInteger(list.maxItems) || Number(list.maxItems) < 1 || Number(list.maxItems) > 60) invalid(`List ${list.key} must be limited to 1–60 items.`);
      if (list.keyAttribute !== null && (typeof list.keyAttribute !== "string" || !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(list.keyAttribute))) invalid(`List ${list.key} has an invalid identity attribute.`);
      return { key: list.key, selector: list.selector, keyAttribute: list.keyAttribute as string | null, maxItems: Number(list.maxItems), fields: validateFields(list.fields, list.key) };
    }),
  };
}

/** Fixed operations only: no generated JavaScript, templates, evaluators, or network I/O. */
export function reextract(evidence: Pick<CaptureEvidence, "html" | "sourceURL">, rawRecipe: unknown): JSONObject {
  const recipe = validateRecipe(rawRecipe);
  if (evidence.html.length > 1_000_000) throw new TranslationError("SOURCE_TOO_LARGE", "Captured HTML exceeds the extraction limit.");
  const document = parseDocument(evidence.html);
  for (const node of Array.from(document.querySelectorAll("script,style,noscript,iframe,object,embed,template"))) node.remove();
  type Root = DOMDocument | DOMElement;
  const extract = (root: Root, field: ExtractionField): string => {
    let node: DOMElement | null;
    try { node = !field.selector || field.selector === ":scope" ? (root === document ? document.documentElement : root) : root.querySelector(field.selector); }
    catch { throw new TranslationError("INVALID_SELECTOR", `Selector for ${field.key} is invalid.`); }
    let value = node ? (field.value === "text" ? cleanText(node.textContent ?? "") : node.getAttribute(field.value) ?? "") : "";
    if (field.value === "href" || field.value === "src") {
      try { value = value ? normalizePublicURL(new URL(value, evidence.sourceURL)).href : ""; }
      catch { value = ""; }
    }
    if (value.length > 24_000) throw new TranslationError("FIELD_TOO_LARGE", `Source field ${field.key} exceeds the content limit.`);
    if (field.required && !value) throw new TranslationError("RECIPE_DRIFT", `Required source field ${field.key} is missing; the previous content must be retained.`);
    return value;
  };
  const fields: JSONObject = {};
  for (const field of recipe.fields) fields[field.key] = extract(document, field);
  const lists: JSONObject = {};
  for (const list of recipe.lists) {
    let nodes: ReturnType<typeof document.querySelectorAll>;
    try { nodes = document.querySelectorAll(list.selector); }
    catch { throw new TranslationError("INVALID_SELECTOR", `Selector for ${list.key} is invalid.`); }
    if (!nodes.length) throw new TranslationError("RECIPE_DRIFT", `Source collection ${list.key} is missing; the previous content must be retained.`);
    const identities = new Map<string, number>();
    lists[list.key] = Array.from(nodes).slice(0, list.maxItems).map(node => {
      const item: JSONObject = {};
      for (const field of list.fields) item[field.key] = extract(node, field);
      const identityField = list.fields.find(field => field.value === "href") ?? list.fields[0];
      const identity = (list.keyAttribute ? node.getAttribute(list.keyAttribute) : null) || (identityField ? String(item[identityField.key]) : "");
      const baseID = stableID(`${list.key}:${identity}`);
      const duplicate = identities.get(baseID) ?? 0;
      identities.set(baseID, duplicate + 1);
      item.id = duplicate ? `${baseID}-${duplicate}` : baseID;
      return item;
    });
  }
  const result = { fields, lists };
  if (JSON.stringify(result).length > 400_000) throw new TranslationError("CONTENT_TOO_LARGE", "Extracted content exceeds the bundle limit.");
  return result;
}

function stableID(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 0x01000193); }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Prepare source evidence only; this does not generate or choose a native layout. */
export function evidenceFromHTML(html: string, sourceURL: string, deadlineAt = Date.now() + 90_000): CaptureEvidence {
  if (html.length > 5_000_000) throw new TranslationError("SOURCE_TOO_LARGE", "Source HTML exceeds the bounded capture limit.");
  const document = parseDocument(html);
  const title = cleanText(document.querySelector("title")?.textContent ?? document.querySelector("h1")?.textContent ?? new URL(sourceURL).hostname).slice(0, 300);
  const primaryColor = document.querySelector('meta[name="theme-color"]')?.getAttribute("content") ?? undefined;
  for (const node of Array.from(document.querySelectorAll("script,style,noscript,iframe,object,embed,template"))) node.remove();
  for (const element of Array.from(document.querySelectorAll("*"))) {
    for (const attribute of Array.from(element.attributes)) {
      if (/^on/i.test(attribute.name) || ["srcdoc", "nonce", "integrity", "value"].includes(attribute.name)) element.removeAttribute(attribute.name);
    }
  }
  const sanitized = document.toString();
  if (sanitized.length > 1_000_000) throw new TranslationError("SOURCE_TOO_LARGE", "Cleaned source HTML exceeds the extraction limit.");
  const links = Array.from(document.querySelectorAll("a[href]")).slice(0, 160).flatMap(node => {
    try { const url = normalizePublicURL(new URL(node.getAttribute("href") ?? "", sourceURL)); return [{ text: cleanText(node.textContent ?? "").slice(0, 180), url: url.href }]; }
    catch { return []; }
  });
  return { sourceURL, title, capturedAt: new Date().toISOString(), html: sanitized, text: cleanText(document.body?.textContent ?? document.textContent ?? "").slice(0, 35_000), links, theme: primaryColor && /^#[a-f\d]{6}$/i.test(primaryColor) ? { primaryColor } : {}, deadlineAt };
}
