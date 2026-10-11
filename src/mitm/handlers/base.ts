import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";
import https from "node:https";
import dns from "node:dns";
import { promisify } from "node:util";
import { HOST_REWRITE } from "../../shared/constants/mitmToolHosts.js";

export const DEFAULT_ROUTER_BASE = "http://127.0.0.1:20127";
export const ROUTER_BASE = String(process.env.MAPIGATE_BASE_URL || process.env.MAPIGATE_BASE_URL || DEFAULT_ROUTER_BASE)
  .trim()
  .replace(/\/+$/, "");

const STRIP_HEADERS = new Set([
  "host",
  "content-length",
  "connection",
  "transfer-encoding",
  "content-type",
  "authorization",
]);

// ── Custom DNS Resolver (Bypasses local hosts file 127.0.0.1 loop) ─────────────
const cachedTargetIPs: Record<string, { ip: string; ts: number }> = {};
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function resolveTargetIP(hostname: string): Promise<string> {
  const cached = cachedTargetIPs[hostname];
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.ip;
  }
  const resolver = new dns.Resolver();
  resolver.setServers(["8.8.8.8", "1.1.1.1"]);
  const resolve4 = promisify(resolver.resolve4.bind(resolver));
  const addresses = await resolve4(hostname);
  const ip = addresses[0] || hostname;
  cachedTargetIPs[hostname] = { ip, ts: Date.now() };
  return ip;
}

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
    const headers = { ...req.headers, host: targetHost };
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
        rejectUnauthorized: false,
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

  const response = await fetch(`${ROUTER_BASE}${path}`, {
    method: "POST",
    headers: {
      ...forwarded,
      "Content-Type": "application/json",
      ...(process.env.ROUTER_API_KEY && { Authorization: `Bearer ${process.env.ROUTER_API_KEY}` }),
    },
    body: JSON.stringify(openaiBody),
  });

  return response;
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
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      res.end();
      break;
    }
    res.write(decoder.decode(value, { stream: true }));
  }
}

export async function pipeTransformedEventStream(
  routerRes: Response,
  res: ServerResponse,
  transformFn: (parsedChunk: any | null, state: any) => Uint8Array | Uint8Array[] | null,
  state: any
): Promise<void> {
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

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
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
            res.write(Buffer.from(output));
          }
        }
      } catch {
        // Skip unparseable lines
      }
    }
  }

  // Flush
  try {
    const flushed = transformFn(null, state);
    if (flushed != null) {
      const outputs = Array.isArray(flushed) ? flushed : [flushed];
      for (const output of outputs) {
        res.write(Buffer.from(output));
      }
    }
  } catch {
    // ignore
  }

  res.end();
}
