import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";
import https from "node:https";
import zlib from "node:zlib";
import { HOST_REWRITE } from "../../shared/constants/mitmToolHosts.js";
import { serverLifecycle } from "../../server/lifecycle.js";
import { SettingsRepository } from "../../storage/repositories/settingsRepo.js";
import { MitmRepository } from "../../storage/repositories/mitmRepo.js";
import { DEFAULT_BASE_URL } from "../../shared/constants/index.js";

export const DEFAULT_ROUTER_BASE = DEFAULT_BASE_URL;

export interface MitmRouterTarget {
  baseUrl: string;
  authHeader: string;
  isRemote: boolean;
}

export function getRouterTarget(): MitmRouterTarget {
  if (process.env.MAPIGATE_BASE_URL) {
    const baseUrl = process.env.MAPIGATE_BASE_URL.trim().replace(/\/+$/, "");
    const apiKey = process.env.ROUTER_API_KEY ? process.env.ROUTER_API_KEY.trim() : "";
    return {
      baseUrl,
      authHeader: apiKey ? `Bearer ${apiKey}` : "",
      isRemote: true,
    };
  }

  try {
    const configured = MitmRepository.getRouterTarget();
    if (configured.baseUrl) {
      const apiKey = process.env.ROUTER_API_KEY ? process.env.ROUTER_API_KEY.trim() : (configured.apiKey || "");
      let authHeader = apiKey ? `Bearer ${apiKey}` : "";

      // Only fall back to local gateway key if target is local
      if (!authHeader && !configured.isRemote) {
        try {
          const activeKey = SettingsRepository.getGatewayApiKeys().find((k) => k.isActive)?.key;
          if (activeKey) {
            authHeader = `Bearer ${activeKey}`;
          }
        } catch {}
      }

      return {
        baseUrl: configured.baseUrl,
        authHeader,
        isRemote: configured.isRemote,
      };
    }
  } catch {}

  // Fallback to local gateway
  try {
    const port = serverLifecycle.getPort();
    const host = serverLifecycle.getHost() || "127.0.0.1";
    const cleanHost = host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host;
    const baseUrl = `http://${cleanHost}:${port}`;

    let authHeader = process.env.ROUTER_API_KEY ? `Bearer ${process.env.ROUTER_API_KEY.trim()}` : "";
    if (!authHeader) {
      try {
        const activeKey = SettingsRepository.getGatewayApiKeys().find((k) => k.isActive)?.key;
        if (activeKey) {
          authHeader = `Bearer ${activeKey}`;
        }
      } catch {}
    }

    return {
      baseUrl,
      authHeader,
      isRemote: false,
    };
  } catch {
    return {
      baseUrl: DEFAULT_ROUTER_BASE,
      authHeader: process.env.ROUTER_API_KEY ? `Bearer ${process.env.ROUTER_API_KEY.trim()}` : "",
      isRemote: false,
    };
  }
}

export function getRouterBaseUrl(): string {
  return getRouterTarget().baseUrl;
}

const STRIP_HEADERS = new Set([
  "host",
  "content-length",
  "connection",
  "transfer-encoding",
  "content-type",
  "authorization",
]);

import { resolveTargetIP } from "../../shared/utils/dnsResolver.js";
export { resolveTargetIP };

/**
 * Forward request to real upstream server bypassing local hosts file.
 */
export async function passthroughHttps(
  req: IncomingMessage,
  res: ServerResponse,
  bodyBuffer: Buffer,
  overrideTargetHost?: string,
  onResponse?: (chunk: Buffer, headers: IncomingHttpHeaders) => void
): Promise<void> {
  const originalHost = (overrideTargetHost || (req.headers.host as string) || "").split(":")[0];
  const isChatEndpoint =
    (req.url || "").includes(":generateContent") || (req.url || "").includes(":streamGenerateContent");
  const targetHost = isChatEndpoint ? HOST_REWRITE[originalHost] || originalHost : originalHost;

  try {
    const targetIP = await resolveTargetIP(targetHost);
    if (targetIP === "127.0.0.1" || targetIP === "::1" || targetIP.startsWith("127.")) {
      console.error(`[MITM Passthrough] Target IP for ${targetHost} resolved to loopback (${targetIP}). Aborting forward to prevent infinite recursion.`);
      if (!res.headersSent) {
        res.writeHead(502, { "Content-Type": "application/json" });
      }
      res.end(JSON.stringify({ error: { message: "Bad Gateway: DNS resolution pointed to local loopback", type: "mitm_loop_prevention" } }));
      return;
    }

    const headers = { ...req.headers, host: targetHost, "x-mapigate-mitm-loop": "1" };
    if (bodyBuffer.length > 0) {
      headers["content-length"] = String(bodyBuffer.length);
    }

    const forwardReq = https.request(
      {
        hostname: targetIP,
        port: 443,
        path: req.url,
        method: req.method,
        headers,
        servername: targetHost,
        rejectUnauthorized: process.env.MITM_DISABLE_TLS_VERIFY === "1" ? false : true,
      },
      (forwardRes) => {
        res.writeHead(forwardRes.statusCode || 200, forwardRes.headers);

        if (!onResponse) {
          forwardRes.pipe(res);
          return;
        }

        const chunks: Buffer[] = [];
        forwardRes.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          res.write(chunk);
        });
        forwardRes.on("end", () => {
          res.end();
          try {
            onResponse(Buffer.concat(chunks), forwardRes.headers);
          } catch {
            // ignore
          }
        });
      }
    );

    forwardReq.on("error", (e: any) => {
      console.error(`[MITM Passthrough] Error forwarding to ${targetHost}:`, e.message);
      if (!res.headersSent) {
        res.writeHead(502, { "Content-Type": "application/json" });
      }
      res.end(JSON.stringify({ error: { message: "Bad Gateway", details: e.message } }));
    });

    if (bodyBuffer.length > 0) {
      forwardReq.write(bodyBuffer);
    }
    forwardReq.end();
  } catch (error: any) {
    console.error(`[MITM Passthrough] DNS resolution failed for ${targetHost}:`, error.message);
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "application/json" });
    }
    res.end(JSON.stringify({ error: { message: "Bad Gateway", details: error.message } }));
  }
}

export interface UpstreamResponse {
  statusCode: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
}

/**
 * Forward request to real upstream server and collect the complete response buffer.
 */
export async function fetchUpstreamDirect(
  req: IncomingMessage,
  bodyBuffer: Buffer,
  overrideTargetHost?: string
): Promise<UpstreamResponse> {
  const originalHost = (overrideTargetHost || (req.headers.host as string) || "").split(":")[0];
  const targetHost = HOST_REWRITE[originalHost] || originalHost;
  const targetIP = await resolveTargetIP(targetHost);
  if (targetIP === "127.0.0.1" || targetIP === "::1" || targetIP.startsWith("127.")) {
    throw new Error(`Target IP for ${targetHost} resolved to loopback (${targetIP})`);
  }

  const headers = {
    ...req.headers,
    host: targetHost,
    "x-mapigate-mitm-loop": "1",
    "accept-encoding": "gzip, deflate, br",
  };
  if (bodyBuffer.length > 0) {
    headers["content-length"] = String(bodyBuffer.length);
  }

  return new Promise((resolve, reject) => {
    const forwardReq = https.request(
      {
        hostname: targetIP,
        port: 443,
        path: req.url,
        method: req.method,
        headers,
        servername: targetHost,
        rejectUnauthorized: process.env.MITM_DISABLE_TLS_VERIFY === "1" ? false : true,
      },
      (forwardRes) => {
        const chunks: Buffer[] = [];
        forwardRes.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        forwardRes.on("end", () => {
          resolve({
            statusCode: forwardRes.statusCode || 200,
            headers: forwardRes.headers,
            body: Buffer.concat(chunks),
          });
        });
      }
    );

    forwardReq.on("error", reject);
    if (bodyBuffer.length > 0) {
      forwardReq.write(bodyBuffer);
    }
    forwardReq.end();
  });
}

export function decompressBuffer(buffer: Buffer, encoding?: string | string[]): Buffer {
  if (!buffer || buffer.length === 0) return buffer;
  const enc = Array.isArray(encoding) ? encoding[0] : encoding;
  const cleanEnc = (enc || "").toLowerCase().trim();

  try {
    if (cleanEnc === "gzip") {
      return zlib.gunzipSync(buffer);
    }
    if (cleanEnc === "deflate") {
      return zlib.inflateSync(buffer);
    }
    if (cleanEnc === "br") {
      return zlib.brotliDecompressSync(buffer);
    }
  } catch {
    // If decompression fails, return raw buffer fail-open
  }
  return buffer;
}

export async function fetchRouter(
  openaiBody: any,
  path = "/v1/chat/completions",
  clientHeaders: IncomingHttpHeaders = {}
): Promise<Response> {
  const forwarded: Record<string, string> = {};
  for (const [k, v] of Object.entries(clientHeaders)) {
    if (!STRIP_HEADERS.has(k.toLowerCase()) && typeof v === "string") {
      forwarded[k] = v;
    }
  }

  const { baseUrl, authHeader } = getRouterTarget();

  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      ...forwarded,
      "Content-Type": "application/json",
      ...(authHeader ? { Authorization: authHeader } : {}),
    },
    body: JSON.stringify(openaiBody),
  });

  return response;
}

/**
 * Await socket drain event when socket write buffer is full,
 * or immediately resolve if socket closes or is destroyed.
 */
export function waitForDrainOrClose(res: ServerResponse): Promise<void> {
  if (res.destroyed) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      res.removeListener("drain", onDrain);
      res.removeListener("close", onClose);
    };
    const onDrain = () => {
      cleanup();
      resolve();
    };
    const onClose = () => {
      cleanup();
      resolve();
    };
    res.once("drain", onDrain);
    res.once("close", onClose);
  });
}

export async function pipeSSE(routerRes: Response, res: ServerResponse): Promise<void> {
  const ct = routerRes.headers.get("content-type") || "application/json";
  const status = routerRes.status || 200;
  const resHeaders: Record<string, string> = {
    "Content-Type": ct,
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  };
  if (ct.includes("text/event-stream")) {
    resHeaders["X-Accel-Buffering"] = "no";
  }
  res.writeHead(status, resHeaders);

  if (!routerRes.body) {
    const text = await routerRes.text().catch(() => "");
    res.end(text);
    return;
  }

  const reader = routerRes.body.getReader();
  const decoder = new TextDecoder();
  let clientDisconnected = false;

  const onClose = () => {
    clientDisconnected = true;
    reader.cancel().catch(() => {});
  };
  res.once("close", onClose);

  try {
    while (true) {
      if (clientDisconnected || res.destroyed) break;

      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      if (clientDisconnected || res.destroyed) break;

      const canWrite = res.write(chunk);
      if (!canWrite) {
        await waitForDrainOrClose(res);
      }
    }
  } catch (err: any) {
    if (!clientDisconnected && !res.destroyed) {
      console.error("[MITM pipeSSE] Error reading upstream stream:", err?.message);
    }
  } finally {
    res.removeListener("close", onClose);
    try {
      reader.cancel().catch(() => {});
    } catch {
      // ignore
    }
    if (!res.writableEnded && !res.destroyed) {
      res.end();
    }
  }
}

export async function pipeTransformedEventStream(
  routerRes: Response,
  res: ServerResponse,
  transformFn: (parsedChunk: any | null, state: any) => Uint8Array | Uint8Array[] | null,
  state: any
): Promise<void> {
  if (!routerRes.ok) {
    const errorText = await routerRes.text().catch(() => "");
    if (!res.headersSent) {
      res.writeHead(routerRes.status, {
        "Content-Type": routerRes.headers.get("content-type") || "application/json",
      });
    }
    res.end(errorText);
    return;
  }

  res.writeHead(200, {
    "Content-Type": "application/vnd.amazon.eventstream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  if (!routerRes.body) {
    res.end();
    return;
  }

  const reader = routerRes.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let buffer = "";
  let clientDisconnected = false;

  const onClose = () => {
    clientDisconnected = true;
    reader.cancel().catch(() => {});
  };
  res.once("close", onClose);

  try {
    while (true) {
      if (clientDisconnected || res.destroyed) break;

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (clientDisconnected || res.destroyed) break;
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;

        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") continue;

        try {
          const parsed = JSON.parse(data);
          const result = transformFn(parsed, state);
          if (result != null) {
            const outputs = Array.isArray(result) ? result : [result];
            for (const output of outputs) {
              if (clientDisconnected || res.destroyed) break;
              const canWrite = res.write(Buffer.from(output));
              if (!canWrite) {
                await waitForDrainOrClose(res);
              }
            }
          }
        } catch {
          // Skip unparseable lines
        }
      }
    }

    // Flush
    if (!clientDisconnected && !res.destroyed) {
      try {
        const flushed = transformFn(null, state);
        if (flushed != null) {
          const outputs = Array.isArray(flushed) ? flushed : [flushed];
          for (const output of outputs) {
            if (clientDisconnected || res.destroyed) break;
            const canWrite = res.write(Buffer.from(output));
            if (!canWrite) {
              await waitForDrainOrClose(res);
            }
          }
        }
      } catch {
        // ignore
      }
    }
  } catch (err: any) {
    if (!clientDisconnected && !res.destroyed) {
      console.error("[MITM pipeTransformedEventStream] Stream error:", err?.message);
    }
  } finally {
    res.removeListener("close", onClose);
    try {
      reader.cancel().catch(() => {});
    } catch {
      // ignore
    }
    if (!res.writableEnded && !res.destroyed) {
      res.end();
    }
  }
}
