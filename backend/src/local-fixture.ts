import { MemoryArtifactStore } from "./artifacts.ts";
import { renderFinancePage } from "./demo/finance.ts";
import { type CompileOutput } from "./protocol.ts";
import { createRouter } from "./router.ts";
import { validateCompilation } from "./translation/compiler.ts";
import { evidenceFromHTML, reextract } from "./translation/extraction.ts";

const notice = "LOCAL TEST FIXTURE · Hand-authored layout using the real deterministic extractor. No Astra, Browser Run, or source network request.";
const escapeHTML = (text: string) => text.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

function fixtureEvidence(sourceURL: string, at: number) {
  const html = renderFinancePage(at).replace("<main>", `<main><p id="fixture-notice">${notice}</p><a id="fixture-original" href="${escapeHTML(sourceURL)}">Open original website</a>`);
  return { ...evidenceFromHTML(html, sourceURL), capturedAt: new Date(at).toISOString(), at };
}

const bound = (path: string) => ({ path });
const field = (key: string, selector: string, value = "text") => ({ key, selector, value, required: true });
const recipe = {
  version: 1,
  fields: [field("title", ".brand"), field("notice", "#fixture-notice"), field("intro", ".intro"), field("linkLabel", "#fixture-original"), field("linkURL", "#fixture-original", "href")],
  lists: [{ key: "quotes", selector: "tbody tr", keyAttribute: "data-symbol", maxItems: 60,
    fields: [field("symbol", ".symbol"), field("company", ".company"), field("price", ".price"), field("change", ".change")] }],
};
const components = [
  { id: "root", component: "Column", align: "stretch", justify: "start", children: ["title", "notice", "intro", "open", "divider", "quotes"] },
  { id: "title", component: "Text", text: bound("/content/fields/title"), variant: "h1" },
  { id: "notice", component: "Text", text: bound("/content/fields/notice"), variant: "caption" },
  { id: "intro", component: "Text", text: bound("/content/fields/intro"), variant: "body" },
  { id: "open", component: "Button", child: "open-label", action: { event: { name: "openURL", context: { url: bound("/content/fields/linkURL") } } } },
  { id: "open-label", component: "Text", text: bound("/content/fields/linkLabel"), variant: "body" },
  { id: "divider", component: "Divider", axis: "horizontal" },
  { id: "quotes", component: "Column", align: "stretch", justify: "start", children: { componentId: "quote-card", path: "/content/lists/quotes" } },
  { id: "quote-card", component: "Card", child: "quote-row" },
  { id: "quote-row", component: "Row", align: "center", justify: "spaceBetween", children: ["quote-name", "quote-value"] },
  { id: "quote-name", component: "Column", align: "start", justify: "start", children: ["symbol", "company"] },
  { id: "quote-value", component: "Column", align: "end", justify: "start", children: ["price", "change"] },
  { id: "symbol", component: "Text", text: bound("symbol"), variant: "h3" },
  { id: "company", component: "Text", text: bound("company"), variant: "caption" },
  { id: "price", component: "Text", text: bound("price"), variant: "h3" },
  { id: "change", component: "Text", text: bound("change"), variant: "body" },
];

/** Explicitly hand-authored fixture, validated by the same compiler and extractor as real output. */
export function fixtureOutput(sourceURL: string, at: number): CompileOutput {
  const compiled = validateCompilation({ components, recipe, theme: { primaryColor: "#5c27c2" } }, fixtureEvidence(sourceURL, at));
  return { ...compiled, title: "LOCAL TEST FIXTURE · Yehoooo! Finance", recipe: { ...compiled.recipe },
    generation: { model: "local-test-fixture-no-model", generatedAt: new Date(at).toISOString(), promptVersion: "local-fixture-v2" } };
}

export function createLocalFixtureRouter(now = Date.now) {
  return createRouter({
    store: new MemoryArtifactStore(), now, mode: "local-test-fixture", assertExecutionAllowed() {},
    pipeline: {
      async capture(sourceURL: string) { return fixtureEvidence(sourceURL, now()); },
      async compile(evidence) { return fixtureOutput(evidence.sourceURL, evidence.at); },
      reextract(evidence, recipe) { return reextract(evidence, recipe); },
    },
  });
}
