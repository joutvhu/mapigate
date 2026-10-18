import dns from "node:dns";
import { promisify } from "node:util";
import { Agent as UndiciAgent, fetch as undiciFetch } from "undici";

// ── Shared Public DNS Resolver (Bypasses local hosts file 127.0.0.1 / ::1 loops) ──
const cachedTargetIPs: Record<string, { ip: string; ts: number }> = {};
const CACHE_TTL_MS = 5 * 60 * 1000;

let publicResolver: dns.Resolver | null = null;
let publicResolverAsync: ((hostname: string) => Promise<string[]>) | null = null;

function getResolver(): { resolver: dns.Resolver; resolve4: (hostname: string) => Promise<string[]> } {
  if (!publicResolver) {
    publicResolver = new dns.Resolver();
    publicResolver.setServers(["8.8.8.8", "1.1.1.1"]);
    publicResolverAsync = promisify(publicResolver.resolve4.bind(publicResolver));
  }
  return { resolver: publicResolver, resolve4: publicResolverAsync! };
}

/**
 * Resolves a hostname to its real public IPv4 address using public DNS (8.8.8.8, 1.1.1.1),
 * caching results for 5 minutes.
 */
export async function resolveTargetIP(hostname: string): Promise<string> {
  const cached = cachedTargetIPs[hostname];
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.ip;
  }
  try {
    const { resolve4 } = getResolver();
    const addresses = await resolve4(hostname);
    const ip = addresses[0] || hostname;
    cachedTargetIPs[hostname] = { ip, ts: Date.now() };
    return ip;
  } catch {
    return hostname;
  }
}

let publicDnsAgentInstance: UndiciAgent | null = null;

/**
 * Returns an undici Agent that resolves DNS via public resolvers,
 * completely avoiding local hosts file redirections (e.g. 127.0.0.1 for MITM tools).
 */
export function getPublicDnsAgent(): UndiciAgent {
  if (!publicDnsAgentInstance) {
    const { resolve4 } = getResolver();
    publicDnsAgentInstance = new UndiciAgent({
      connect: {
        lookup: (hostname, opts, cb) => {
          let callback = cb;
          let options: any = opts;
          if (typeof options === "function") {
            callback = options;
            options = {};
          }
          resolve4(hostname)
            .then((ips) => {
              if (options && options.all) {
                callback(null, ips.map((ip) => ({ address: ip, family: 4 })) as any);
              } else {
                callback(null, ips[0] as any, 4);
              }
            })
            .catch(() => {
              dns.lookup(hostname, options, callback);
            });
        },
      },
    });
  }
  return publicDnsAgentInstance;
}

/**
 * Fetch wrapper that automatically uses the public DNS dispatcher to bypass local loopback.
 */
export async function fetchWithDnsBypass(
  url: string | URL,
  init?: any
): Promise<Response> {
  const agent = getPublicDnsAgent();
  return (await undiciFetch(url as any, { ...(init || {}), dispatcher: agent })) as unknown as Response;
}
