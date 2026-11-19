import dns from "node:dns";
import { promisify } from "node:util";
import { Agent as UndiciAgent, fetch as undiciFetch } from "undici";

// ── Shared Public DNS Resolver (Bypasses local hosts file 127.0.0.1 / ::1 loops) ──
const cachedTargetIPs: Record<string, { ip: string; ts: number }> = Object.create(null);
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_DNS_CACHE_ENTRIES = 500;

// ISP DPI (e.g. VN -> api.anthropic.com) RSTs Node's default TLS ClientHello curve
// list; keeping X25519 first rewrites the fingerprint enough to pass while
// prime256v1:secp384r1 preserves compatibility with AWS OIDC / Kiro endpoints.
export const TLS_ECDH_CURVE = process.env.MAPIGATE_TLS_ECDH_CURVE || "X25519:prime256v1:secp384r1";

// Happy Eyeballs (RFC 8305): race IPv4/IPv6 with a 250ms fallback window.
export const EYEBALLS_CONNECT = {
  autoSelectFamily: true,
  autoSelectFamilyAttemptTimeout: 250,
} as const;

export const DEFAULT_KEEPALIVE_TIMEOUT_MS = 4 * 1000;
export const FRESH_RETRY_KEEPALIVE_TIMEOUT_MS = 1;

export function resolveKeepAliveTimeouts(): { keepAliveTimeout: number; keepAliveMaxTimeout: number } {
  const raw = Number(process.env.MAPIGATE_FETCH_KEEPALIVE_TIMEOUT_MS);
  const timeout = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_KEEPALIVE_TIMEOUT_MS;
  return { keepAliveTimeout: timeout, keepAliveMaxTimeout: timeout };
}

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
    const keys = Object.keys(cachedTargetIPs);
    if (keys.length >= MAX_DNS_CACHE_ENTRIES && !(hostname in cachedTargetIPs)) {
      delete cachedTargetIPs[keys[0]];
    }
    cachedTargetIPs[hostname] = { ip, ts: Date.now() };
    return ip;
  } catch {
    return hostname;
  }
}

/**
 * Node.js net/tls/http2 compatible `lookup` function that resolves via public DNS
 * (8.8.8.8 / 1.1.1.1), bypassing local hosts file entries (e.g. MITM 127.0.0.1).
 */
export function publicDnsLookup(
  hostname: string,
  options: any,
  callback: (err: NodeJS.ErrnoException | null, address: any, family?: number) => void
): void {
  const cb = typeof options === "function" ? options : callback;
  const opts = typeof options === "function" ? {} : options || {};

  resolveTargetIP(hostname)
    .then((ip) => {
      const family = ip.includes(":") ? 6 : 4;
      if (opts.all) {
        cb(null, [{ address: ip, family }]);
      } else {
        cb(null, ip, family);
      }
    })
    .catch((err) => {
      cb(err, opts.all ? [] : "", 4);
    });
}

let publicDnsAgentInstance: UndiciAgent | null = null;
let publicDnsFreshAgentInstance: UndiciAgent | null = null;

function createPublicDnsAgent(keepAliveTimeout: number, keepAliveMaxTimeout: number): UndiciAgent {
  const { resolve4 } = getResolver();
  return new UndiciAgent({
    keepAliveTimeout,
    keepAliveMaxTimeout,
    connect: {
      ...EYEBALLS_CONNECT,
      ecdhCurve: TLS_ECDH_CURVE,
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

/**
 * Returns an undici Agent that resolves DNS via public resolvers,
 * completely avoiding local hosts file redirections (e.g. 127.0.0.1 for MITM tools),
 * with capped keep-alive TTL and DPI-safe TLS curve options.
 */
export function getPublicDnsAgent(options?: { forceFreshSocket?: boolean }): UndiciAgent {
  if (options?.forceFreshSocket) {
    if (!publicDnsFreshAgentInstance) {
      publicDnsFreshAgentInstance = createPublicDnsAgent(
        FRESH_RETRY_KEEPALIVE_TIMEOUT_MS,
        FRESH_RETRY_KEEPALIVE_TIMEOUT_MS
      );
    }
    return publicDnsFreshAgentInstance;
  }

  if (!publicDnsAgentInstance) {
    const { keepAliveTimeout, keepAliveMaxTimeout } = resolveKeepAliveTimeouts();
    publicDnsAgentInstance = createPublicDnsAgent(keepAliveTimeout, keepAliveMaxTimeout);
  }
  return publicDnsAgentInstance;
}

export function clearPublicDnsAgents(): void {
  for (const agent of [publicDnsAgentInstance, publicDnsFreshAgentInstance]) {
    try {
      agent?.destroy?.();
      agent?.close?.();
    } catch {}
  }
  publicDnsAgentInstance = null;
  publicDnsFreshAgentInstance = null;
}

const initialGlobalFetch = globalThis.fetch;
const isTestEnv = process.env.NODE_ENV === "test" || process.env.MAPIGATE_TEST === "1";

/**
 * Fetch wrapper that automatically uses the public DNS dispatcher to bypass local loopback.
 * Respects globalThis.fetch mocks/overrides (e.g. in unit tests).
 */
export async function fetchWithDnsBypass(
  url: string | URL,
  init?: any
): Promise<Response> {
  if (isTestEnv && typeof globalThis.fetch === "function" && globalThis.fetch !== initialGlobalFetch) {
    return await globalThis.fetch(url as any, init);
  }
  const agent = getPublicDnsAgent();
  return (await undiciFetch(url as any, { ...(init || {}), dispatcher: agent })) as unknown as Response;
}
