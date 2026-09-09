/** A controlled public-source demo. All quotes are simulated, never live market data. */
const companies = [
  ["ASTR", "Astral Systems", 184.25], ["ORBT", "Orbit Labs", 72.60],
  ["PRSM", "Prism Computing", 126.80], ["NOVA", "Nova Energy", 43.75],
  ["LUMA", "Luma Devices", 98.10], ["APEX", "Apex Robotics", 215.40],
  ["VELO", "Velocity Networks", 64.35], ["ECHO", "Echo Software", 138.90],
  ["MESA", "Mesa Materials", 52.20], ["HALO", "Halo Research", 167.55],
  ["ATLS", "Atlas Logistics", 81.70], ["COMT", "Comet Mobility", 39.85],
  ["NEON", "Neon Computing", 112.30], ["FLUX", "Flux Power", 91.45],
  ["SOLR", "Solaris Systems", 148.65], ["AERO", "Aero Instruments", 76.95],
  ["TIDE", "Tide Analytics", 58.40], ["POLR", "Polar Networks", 103.20],
  ["VECT", "Vector Devices", 192.15], ["LYRA", "Lyra Software", 87.50],
] as const;

export function financeSnapshot(now = Date.now()) {
  const revision = Math.floor(now / 30_000);
  return {
    revision,
    observedAt: new Date(revision * 30_000).toISOString(),
    quotes: companies.map(([symbol, name, base], index) => {
      const delta = (((revision + index * 17) % 101) - 50) / 100;
      return { symbol, name, price: (base + delta).toFixed(2), change: `${delta >= 0 ? "+" : ""}${delta.toFixed(2)}`, positive: delta >= 0 };
    }),
  };
}

export function renderFinancePage(now = Date.now()): string {
  const snapshot = financeSnapshot(now);
  const rows = snapshot.quotes.map(q => `<tr id="${q.symbol}" data-symbol="${q.symbol}"><td><a href="#${q.symbol}" class="symbol">${q.symbol}</a><span class="company">${q.name}</span></td><td class="price">$${q.price}</td><td class="change ${q.positive ? "up" : "down"}">${q.change}</td><td class="market">Simulated</td></tr>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Yehoooo! Finance — Simulated market snapshots</title><meta name="theme-color" content="#5c27c2"><meta name="description" content="A controlled source website with clearly labeled simulated quotes for the AstraBrowse live-content demonstration."><style>
  :root{font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#172033;background:#f4f5fa}*{box-sizing:border-box}body{margin:0}header{background:white;border-bottom:1px solid #e1e4ed;padding:24px max(24px,calc((100vw - 1080px)/2));display:flex;align-items:center;gap:26px;flex-wrap:wrap}.brand{font-size:30px;font-weight:850;letter-spacing:-1.3px;color:#5c27c2}.badge{font-size:12px;font-weight:700;background:#fff1c7;color:#6f4a00;padding:6px 10px;border-radius:20px}main{max-width:1080px;margin:32px auto;padding:0 24px}h1{font-size:34px;line-height:1.12;letter-spacing:-1px;margin-bottom:10px}.intro{color:#5e6879;max-width:720px}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:28px 0}.card{background:white;border:1px solid #e1e4ed;border-radius:14px;padding:18px}.card strong{display:block;font-size:23px}.card span{font-size:13px;color:#697386}.panel{background:white;border:1px solid #e1e4ed;border-radius:16px;overflow:hidden}.panel h2{padding:22px 24px 0;font-size:20px}table{width:100%;border-collapse:collapse;text-align:left}th{font-size:12px;text-transform:uppercase;letter-spacing:.07em;color:#758093}td,th{padding:17px 24px;border-bottom:1px solid #edf0f5}td:not(:first-child){font-variant-numeric:tabular-nums}.symbol{font-weight:750;color:#552ab2;text-decoration:none}.company{display:block;color:#6c7483;font-size:13px;margin-top:3px}.up{color:#12774a}.down{color:#b43743}.market{color:#758093;font-size:13px}footer{font-size:13px;color:#687386;margin:22px 0 40px}time{font-variant-numeric:tabular-nums}@media(max-width:650px){.cards{grid-template-columns:1fr}td,th{padding:14px 12px}.market{display:none}}
  </style></head><body><header><div class="brand">Yehoooo! Finance</div><span class="badge">SIMULATED QUOTES · DEMO</span></header><main><h1>A market that changes while you read.</h1><p class="intro">This is a controlled source website for AstraBrowse. Every company and quote below is fictional. Values change every 30 seconds, letting a native browser demonstrate source revalidation without interrupting your reading.</p><section class="cards" aria-label="Demo overview"><div class="card"><strong>20</strong><span>Fictional companies</span></div><div class="card"><strong>30 seconds</strong><span>Source update interval</span></div><div class="card"><strong>Source-backed</strong><span>AstraBrowse must extract these actual displayed values</span></div></section><section class="panel"><h2>Simulated watchlist</h2><table><thead><tr><th>Company</th><th>Snapshot price</th><th>Change</th><th>Data type</th></tr></thead><tbody>${rows}</tbody></table></section><footer>Snapshot <time datetime="${snapshot.observedAt}">${snapshot.observedAt}</time> · revision <span id="revision">${snapshot.revision}</span>. Simulated data for software demonstration; no live quotes, trading, or financial advice.</footer></main></body></html>`;
}
