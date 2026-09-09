import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test, type TestContext } from "node:test";

const script = readFileSync(new URL("../scripts/deploy.mjs", import.meta.url), "utf8");
const template = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");

function deploymentFixture(t: TestContext, config?: string) {
  const directory = mkdtempSync(join(tmpdir(), "astrabrowse-deploy-check-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(join(directory, "scripts"));
  writeFileSync(join(directory, "scripts", "deploy.mjs"), script);
  if (config !== undefined) writeFileSync(join(directory, "wrangler.deploy.jsonc"), config);
  // Any accidental Wrangler invocation must fail these tests, without network access.
  mkdirSync(join(directory, "node_modules", "wrangler", "bin"), { recursive: true });
  writeFileSync(join(directory, "node_modules", "wrangler", "bin", "wrangler.js"), "process.exit(99);");
  return (...args: string[]) => spawnSync(process.execPath, [join(directory, "scripts", "deploy.mjs"), ...args], { encoding: "utf8" });
}

test("fresh checkout refuses deployment until private configuration exists", (t) => {
  const result = deploymentFixture(t)();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Create backend\/wrangler.deploy.jsonc/);
});

test("copied public template cannot be deployed with unfilled placeholders", (t) => {
  const result = deploymentFixture(t, template)();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /still contain placeholders/);
});

test("private configuration check succeeds locally without launching Wrangler", (t) => {
  const configured = template
    .replaceAll("YOUR_CLOUDFLARE_ACCOUNT_ID", "1".repeat(32))
    .replaceAll("your-worker-name", "fixture-worker")
    .replaceAll("your-r2-bucket-name", "fixture-bucket")
    .replaceAll("YOUR_AI_GATEWAY_ID", "fixture-gateway")
    .replaceAll("YOUR_AI_GATEWAY_BYOK_ALIAS", "fixture-alias")
    .replaceAll('"namespace_id": "0"', '"namespace_id": "123"');
  const run = deploymentFixture(t, configured);
  const result = run("--check");
  assert.equal(result.status, 0);
  assert.match(result.stdout, /No cloud request was made/);
  const override = run("--config", "wrangler.jsonc");
  assert.equal(override.status, 1);
  assert.match(override.stderr, /Use npm run deploy/);
});
