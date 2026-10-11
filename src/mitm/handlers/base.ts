import type { IncomingHttpHeaders, ServerResponse } from "node:http";

export const DEFAULT_ROUTER_BASE = "http://127.0.0.1:20127";
export const ROUTER_BASE = String(process.env.ROUTEN_BASE_URL || DEFAULT_ROUTER_BASE).trim().replace(/\/+$/, "");

const STRIP_HEADERS = new Set([
  "host",
  "content-length",
  "connection",
  "transfer-encoding",
  "content-type",
  "authorization",
]);

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
