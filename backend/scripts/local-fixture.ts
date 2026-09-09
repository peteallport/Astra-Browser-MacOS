import { createServer } from "node:http";
import { createLocalFixtureRouter } from "../src/local-fixture.ts";

const handle = createLocalFixtureRouter();
const port = Number(process.env.LOCAL_FIXTURE_PORT ?? 8787);
createServer(async (incoming, outgoing) => {
  const controller = new AbortController();
  outgoing.once("close", () => { if (!outgoing.writableEnded) controller.abort(); });
  try {
    const body: Uint8Array[] = [];
    for await (const chunk of incoming) {
      body.push(Buffer.from(chunk));
      if (body.reduce((sum, part) => sum + part.length, 0) > 12_000) { outgoing.writeHead(413).end(); return; }
    }
    const headers = new Headers();
    for (const [key, value] of Object.entries(incoming.headers)) if (typeof value === "string") headers.set(key, value);
    const request = new Request(`http://localhost:${port}${incoming.url ?? "/"}`, { method: incoming.method ?? "GET", headers, signal: controller.signal, ...(body.length ? { body: Buffer.concat(body) } : {}) });
    const response = await handle(request);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    if (response.body) for await (const chunk of response.body) outgoing.write(chunk);
    outgoing.end();
  } catch { if (!outgoing.headersSent) outgoing.writeHead(500); outgoing.end("Local fixture server failed."); }
}).listen(port, "127.0.0.1", () => process.stdout.write(`LOCAL TEST FIXTURE at http://localhost:${port} — no cloud, no model, no source fetch\n`));
