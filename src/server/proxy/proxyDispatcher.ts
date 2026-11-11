import { Agent as UndiciAgent, fetch as undiciFetch, ProxyAgent } from "undici";
import {
  EYEBALLS_CONNECT,
  FRESH_RETRY_KEEPALIVE_TIMEOUT_MS,
  TLS_ECDH_CURVE,
  getPublicDnsAgent,
  resolveKeepAliveTimeouts,
} from "../../shared/utils/dnsResolver.js";
import { isMitmHost } from "../../mitm/toolsHelper.js";

const defaultGlobalFetch = globalThis.fetch;
const MAX_PROXY_DISPATCHERS = 50;
const proxyDispatchers = new Map<string, ProxyAgent>();
const directDispatchers = new Map<string, UndiciAgent>();

// Dead keep-alive sockets surface as these codes/substrings; DNS, connect-refused and TLS
// failures are excluded so a real unreachable host is never mistaken for a stale socket.
export const STALE_SOCKET_ERROR_CODES = new Set([
  "UND_ERR_SOCKET",
  "ECONNRESET",
  "EPIPE",
  "UND_ERR_HEADERS_TIMEOUT",
]);

export const NON_STALE_SOCKET_ERROR_CODES = new Set([
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_INVALID_ARG",
]);

// Deliberately excludes a bare "fetch failed": with no error code the upstream may already
// hold the request, and replaying it would send (and bill) the same completion twice.
export const STALE_SOCKET_ERROR_SUBSTRINGS = [
  "other side closed",
  "socket hang up",
];

export function isFreshSocketReplayEnabled(): boolean {
  const raw = String(process.env.MAPIGATE_FETCH_FRESH_RETRY ?? "").trim().toLowerCase();
  return !(raw === "off" || raw === "0" || raw === "false" || raw === "no");
}

export function isStaleSocketError(error: any): boolean {
  if (!error || error.name === "AbortError") return false;
  const code = error?.cause?.code || error?.code || "";
  if (typeof code === "string" && code.startsWith("ERR_TLS_")) return false;
  if (NON_STALE_SOCKET_ERROR_CODES.has(code)) return false;
  if (STALE_SOCKET_ERROR_CODES.has(code)) return true;
  const msg = `${error?.message || ""} ${error?.cause?.message || ""}`.toLowerCase();
  return STALE_SOCKET_ERROR_SUBSTRINGS.some((sub) => msg.includes(sub));
}

function buildDirectAgent(
  key: string,
  insecure: boolean,
  keepAliveTimeout: number,
  keepAliveMaxTimeout: number
): UndiciAgent {
  const cached = directDispatchers.get(key);
  if (cached) {
    directDispatchers.delete(key);
    directDispatchers.set(key, cached);
    return cached;
  }
  if (directDispatchers.size >= MAX_PROXY_DISPATCHERS) {
    const oldestKey = directDispatchers.keys().next().value;
    if (oldestKey) {
      const oldAgent = directDispatchers.get(oldestKey);
      directDispatchers.delete(oldestKey);
      try {
        oldAgent?.destroy?.();
        oldAgent?.close?.();
      } catch {}
    }
  }
  const agent = new UndiciAgent({
    connect: {
      ...EYEBALLS_CONNECT,
      ecdhCurve: TLS_ECDH_CURVE,
      ...(insecure ? { rejectUnauthorized: false } : {}),
    },
    keepAliveTimeout,
    keepAliveMaxTimeout,
  });
  directDispatchers.set(key, agent);
  return agent;
}

export function getDirectDispatcher(insecure = false): UndiciAgent {
  const { keepAliveTimeout, keepAliveMaxTimeout } = resolveKeepAliveTimeouts();
  const key = `direct::${insecure ? "insecure" : "secure"}::${keepAliveTimeout}::${keepAliveMaxTimeout}`;
  return buildDirectAgent(key, insecure, keepAliveTimeout, keepAliveMaxTimeout);
}

export function getFreshRetryDispatcher(insecure = false): UndiciAgent {
  const key = `fresh::${insecure ? "insecure" : "secure"}`;
  return buildDirectAgent(
    key,
    insecure,
    FRESH_RETRY_KEEPALIVE_TIMEOUT_MS,
    FRESH_RETRY_KEEPALIVE_TIMEOUT_MS
  );
}

export function getProxyDispatcher(proxyUrl: string, insecure = false): ProxyAgent {
  const key = `${proxyUrl}::${insecure ? "insecure" : "secure"}`;
  let dispatcher = proxyDispatchers.get(key);
  if (!dispatcher) {
    if (proxyDispatchers.size >= MAX_PROXY_DISPATCHERS) {
      const oldestKey = proxyDispatchers.keys().next().value;
      if (oldestKey) {
        const oldDispatcher = proxyDispatchers.get(oldestKey);
        proxyDispatchers.delete(oldestKey);
        try {
          (oldDispatcher as any)?.destroy?.();
          (oldDispatcher as any)?.close?.();
        } catch {}
      }
    }
    dispatcher = new ProxyAgent({
      uri: proxyUrl,
      connect: { ...EYEBALLS_CONNECT },
      requestTls: {
        ecdhCurve: TLS_ECDH_CURVE,
        ...(insecure ? { rejectUnauthorized: false } : {}),
      },
    });
    proxyDispatchers.set(key, dispatcher);
  } else {
    proxyDispatchers.delete(key);
    proxyDispatchers.set(key, dispatcher);
  }
  return dispatcher;
}

export type UpstreamFetchOptions = RequestInit & {
  dispatcher?: any;
  forceFreshSocket?: boolean;
};

async function performSingleUpstreamFetch(
  url: string,
  options: UpstreamFetchOptions,
  proxyUrl?: string,
  forceFreshSocket = false
): Promise<globalThis.Response> {
  const { forceFreshSocket: _ignored, ...fetchOpts } = options || {};

  // If globalThis.fetch was mocked (e.g. in unit tests), honor the mock
  if (globalThis.fetch !== defaultGlobalFetch && !proxyUrl && !fetchOpts.dispatcher) {
    return (await globalThis.fetch(url, fetchOpts as any)) as globalThis.Response;
  }

  const effectiveProxy = proxyUrl?.trim();
  if (effectiveProxy) {
    const dispatcher = getProxyDispatcher(effectiveProxy);
    return (await (undiciFetch as any)(url, { ...fetchOpts, dispatcher })) as globalThis.Response;
  }

  if (fetchOpts.dispatcher) {
    return (await (undiciFetch as any)(url, fetchOpts)) as globalThis.Response;
  }

  let hostname = "";
  try {
    hostname = new URL(url).hostname;
  } catch {}

  if (isMitmHost(hostname)) {
    const publicAgent = getPublicDnsAgent({ forceFreshSocket });
    return (await (undiciFetch as any)(url, { ...fetchOpts, dispatcher: publicAgent })) as globalThis.Response;
  }

  const directDispatcher = forceFreshSocket ? getFreshRetryDispatcher(false) : getDirectDispatcher(false);
  return (await (undiciFetch as any)(url, { ...fetchOpts, dispatcher: directDispatcher })) as globalThis.Response;
}

export async function executeUpstreamFetch(
  url: string,
  options: UpstreamFetchOptions,
  proxyUrl?: string
): Promise<globalThis.Response> {
  const forceFresh = options?.forceFreshSocket === true;
  try {
    return await performSingleUpstreamFetch(url, options, proxyUrl, forceFresh);
  } catch (err: any) {
    if (!forceFresh && !options?.dispatcher && isFreshSocketReplayEnabled() && isStaleSocketError(err)) {
      return await performSingleUpstreamFetch(url, options, proxyUrl, true);
    }
    throw err;
  }
}

export function clearProxyDispatchers(): void {
  for (const dispatcher of proxyDispatchers.values()) {
    try {
      (dispatcher as any)?.destroy?.();
      (dispatcher as any)?.close?.();
    } catch {}
  }
  proxyDispatchers.clear();

  for (const agent of directDispatchers.values()) {
    try {
      agent?.destroy?.();
      agent?.close?.();
    } catch {}
  }
  directDispatchers.clear();
}
