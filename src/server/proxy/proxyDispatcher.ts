import { fetch as undiciFetch, ProxyAgent } from "undici";
import { getPublicDnsAgent } from "../../shared/utils/dnsResolver.js";
import { isMitmHost } from "../../mitm/toolsHelper.js";

const defaultGlobalFetch = globalThis.fetch;
const MAX_PROXY_DISPATCHERS = 50;
const proxyDispatchers = new Map<string, ProxyAgent>();

export function getProxyDispatcher(proxyUrl: string): ProxyAgent {
  let dispatcher = proxyDispatchers.get(proxyUrl);
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
    dispatcher = new ProxyAgent(proxyUrl);
    proxyDispatchers.set(proxyUrl, dispatcher);
  } else {
    proxyDispatchers.delete(proxyUrl);
    proxyDispatchers.set(proxyUrl, dispatcher);
  }
  return dispatcher;
}

export async function executeUpstreamFetch(
  url: string,
  options: RequestInit & { dispatcher?: any },
  proxyUrl?: string
): Promise<globalThis.Response> {
  // If globalThis.fetch was mocked (e.g. in unit tests), honor the mock
  if (globalThis.fetch !== defaultGlobalFetch && !proxyUrl && !options?.dispatcher) {
    return (await globalThis.fetch(url, options as any)) as globalThis.Response;
  }

  const effectiveProxy = proxyUrl?.trim();
  if (effectiveProxy) {
    const dispatcher = getProxyDispatcher(effectiveProxy);
    return (await (undiciFetch as any)(url, { ...options, dispatcher })) as globalThis.Response;
  }

  if (options?.dispatcher) {
    return (await (undiciFetch as any)(url, options)) as globalThis.Response;
  }

  let hostname = "";
  try {
    hostname = new URL(url).hostname;
  } catch {}

  if (isMitmHost(hostname)) {
    const publicAgent = getPublicDnsAgent();
    return (await (undiciFetch as any)(url, { ...options, dispatcher: publicAgent })) as globalThis.Response;
  }

  return (await globalThis.fetch(url, options as any)) as globalThis.Response;
}

export function clearProxyDispatchers(): void {
  for (const dispatcher of proxyDispatchers.values()) {
    try {
      (dispatcher as any)?.destroy?.();
      (dispatcher as any)?.close?.();
    } catch {}
  }
  proxyDispatchers.clear();
}
