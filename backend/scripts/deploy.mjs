import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const backendDirectory = fileURLToPath(new URL("../", import.meta.url));
const configPath = fileURLToPath(new URL("../wrangler.deploy.jsonc", import.meta.url));
const args = process.argv.slice(2);
if (args.some((arg) => !["--check", "--dry-run"].includes(arg))) {
  console.error("Use npm run deploy, npm run deploy:check, or npm run deploy -- --dry-run.");
  process.exit(1);
}

let config;
try {
  config = readFileSync(configPath, "utf8");
} catch {
  console.error("Create backend/wrangler.deploy.jsonc from wrangler.jsonc and fill in your deployment settings. See backend/README.md.");
  process.exit(1);
}
if (/YOUR_[A-Z_]+|your-worker-name|your-r2-bucket-name|"namespace_id"\s*:\s*"0"/.test(config)) {
  console.error("Deployment settings still contain placeholders. Fill in backend/wrangler.deploy.jsonc; keep the tracked template unchanged.");
  process.exit(1);
}
if (args.includes("--check")) {
  console.log("Private deployment configuration exists and contains no template placeholders. No cloud request was made; use --dry-run to validate with Wrangler.");
  process.exit(0);
}

const wrangler = fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url));
const result = spawnSync(process.execPath, [
  wrangler, "deploy", "--config", configPath, "--env", "production",
  ...(args.includes("--dry-run") ? ["--dry-run"] : []),
], { cwd: backendDirectory, stdio: "inherit" });
if (result.error) console.error("Unable to start Wrangler. Run npm ci in backend first.");
process.exit(result.status ?? 1);
