import { isIP } from "node:net";
import { TranslationError, type CloudAccessGate } from "./types.ts";

export type DNSResolver = (hostname: string, signal?: AbortSignal) => Promise<string[]>;

export function isPublicIPAddress(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, "").toLowerCase();
  if (isIP(ip) === 4) {
    const [a = 0, b = 0, c = 0] = ip.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113));
  }
  // Only global unicast; reject transition/documentation ranges and IPv4-mapped forms.
  if (isIP(ip) === 6) {
    if (!/^[23][0-9a-f]{3}:/.test(ip) || ip.startsWith("2002:") || ip.startsWith("3fff:")) return false;
    if (ip.startsWith("2001:")) {
      const second = parseInt(ip.split(":")[1] || "0", 16);
      if (second <= 0x1ff || second === 0xdb8) return false;
    }
    return true;
  }
  return false;
}

export function normalizePublicURL(input: string | URL): URL {
  let url: URL;
  try { url = new URL(input); }
  catch { throw new TranslationError("INVALID_URL", "Enter a complete http or https website URL.", 400); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || (url.port && url.port !== "80" && url.port !== "443")) {
    throw new TranslationError("UNSAFE_URL", "Only public HTTP(S) websites on standard ports are supported.", 400);
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const bare = host.replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || /\.(localhost|local|internal|lan|home|test|invalid)$/.test(host) || (!host.includes('.') && !isIP(bare))) {
    throw new TranslationError("UNSAFE_URL", "Private and local network addresses are not supported.", 400);
  }
  if (isIP(bare) && !isPublicIPAddress(bare)) throw new TranslationError("UNSAFE_URL", "Private or reserved network addresses are not supported.", 400);
  url.hostname = host;
  url.hash = "";
  return url;
}

export async function validatePublicURL(input: string | URL, resolveDNS: DNSResolver, signal?: AbortSignal): Promise<URL> {
  const url = normalizePublicURL(input);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(hostname) ? [hostname] : await resolveDNS(hostname, signal);
  if (!addresses.length || addresses.some(ip => !isPublicIPAddress(ip))) {
    throw new TranslationError("UNSAFE_DNS", "The website does not resolve exclusively to public addresses.", 400);
  }
  return url;
}

export function createDNSResolver(gate: CloudAccessGate, fetcher: typeof fetch = fetch): DNSResolver {
  return async (hostname, signal) => {
    gate.assertAllowed("dns");
    const addresses = await Promise.all(["A", "AAAA"].map(async type => {
      const endpoint = new URL("https://cloudflare-dns.com/dns-query");
      endpoint.searchParams.set("name", hostname); endpoint.searchParams.set("type", type);
      const response = await fetcher(endpoint, { headers: { Accept: "application/dns-json" }, ...(signal ? { signal } : {}) });
      if (!response.ok) throw new TranslationError("DNS_FAILED", "Website address validation failed.", 502);
      const data = await response.json() as { Status?: number; Answer?: { type: number; data: string }[] };
      if (data.Status !== 0) throw new TranslationError("DNS_FAILED", "Website address validation failed.", 502);
      return (data.Answer ?? []).filter(record => record.type === 1 || record.type === 28).map(record => record.data);
    }));
    return addresses.flat();
  };
}
