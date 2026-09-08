import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createLocalFixtureRouter } from "../../backend/src/local-fixture.ts";
import type { PageManifest } from "../../backend/src/protocol.ts";

// Exercise the real in-memory router and extractor. A source URL is only an identifier.
// This guard makes accidental fetches fail instead of reaching any external service.
globalThis.fetch = async () => { throw new Error("Network access is forbidden in protocol fixtures"); };
const output = process.argv[2];
assert.ok(output, "Provide a temporary output directory");
await mkdir(output, { recursive: true });
let now = Date.parse("2026-09-08T20:00:00Z");
const handle = createLocalFixtureRouter(() => now);
const request = (path: string, body?: unknown) => new Request(`http://localhost${path}`, {
  method: body === undefined ? "GET" : "POST",
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const save = (name: string, data: string) => writeFile(join(output, name), data);

const response = await handle(request("/resolve", { url: "https://example.com/astrabrowse-fixture" }));
assert.equal(response.status, 200);
assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/);
const stream = await response.text();
const terminals = [...stream.matchAll(/^event: (ready|error)$/gm)];
assert.equal(terminals.length, 1);
assert.equal(terminals[0]![1], "ready");
const match = stream.match(/event: ready\ndata: ([^\n]+)/);
assert.ok(match, "The real router must emit a ready event");
const { manifest } = JSON.parse(match[1]!) as { manifest: PageManifest };
await save("ready.sse", stream);

for (const [name, path] of [["manifest.json", `/pages/${manifest.pageKey}/manifest`], ["bundle.json", manifest.bundleURL]]) {
  const result = await handle(request(path!));
  assert.equal(result.status, 200);
  await save(name!, await result.text());
}
now += 60_000;
const refresh = await handle(request(`/pages/${manifest.pageKey}/revalidate`, {}));
assert.equal(refresh.status, 200);
const refreshed = await refresh.text();
assert.equal(JSON.parse(refreshed).changed, true);
await save("revalidation.json", refreshed);
console.log("Generated local protocol fixtures from the TypeScript router; no cloud or source requests.");
