import http2 from "node:http2";

export const AGENT_RUN_URL = "https://agent.api5.cursor.sh/agent.v1.AgentService/Run";
export const TAIL_ONLY_THRESHOLD = 80;

export function isComposerModel(model: string): boolean {
  const modelId = String(model || "").split("/").pop() || "";
  return /^composer(?:-|$)/i.test(modelId);
}

export function visibleComposerContentFromThinking(thinking: string): string {
  if (!thinking) return "";
  const endTag = "</think>";
  const endIdx = thinking.lastIndexOf(endTag);
  if (endIdx < 0) return "";
  return thinking.slice(endIdx + endTag.length).trimStart();
}

export interface AgentSession {
  responseHeaders: Promise<http2.IncomingHttpHeaders>;
  write(frame: Uint8Array): void;
  end(): void;
  close(): void;
  read(): Promise<{ value?: Buffer; done: boolean }>;
}

export function openAgentHttp2Stream(
  url: string,
  headers: Record<string, string>,
  signal?: AbortSignal
): AgentSession {
  const urlObj = new URL(url);
  const client = http2.connect(`https://${urlObj.host}`);
  const chunkQueue: Buffer[] = [];
  let waiting: ((result: { value?: Buffer; done: boolean } | null) => void) | null = null;
  let ended = false;
  let streamError: Error | null = null;
  let req: http2.ClientHttp2Stream | null = null;

  const wake = (result: { value?: Buffer; done: boolean } | null) => {
    if (!waiting) return;
    const resolve = waiting;
    waiting = null;
    resolve(result);
  };

  const fail = (error: Error) => {
    if (streamError) return;
    streamError = error;
    ended = true;
    wake(null);
  };

  const close = () => {
    try {
      req?.destroy();
    } catch {}
    try {
      client.close();
    } catch {}
  };

  client.on("error", fail);

  req = client.request({
    ":method": "POST",
    ":path": urlObj.pathname,
    ":authority": urlObj.host,
    ":scheme": "https",
    ...headers,
  });

  req.on("error", fail);
  req.on("data", (chunk: Buffer) => {
    if (waiting) wake({ value: chunk, done: false });
    else chunkQueue.push(chunk);
  });
  req.on("end", () => {
    ended = true;
    wake({ value: undefined, done: true });
  });

  if (signal) {
    const onAbort = () => {
      fail(new Error("Request aborted"));
      close();
    };
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }

  const responseHeaders = new Promise<http2.IncomingHttpHeaders>((resolve, reject) => {
    const onEarlyError = (error: Error) => reject(error);
    client.once("error", onEarlyError);
    req!.once("error", onEarlyError);
    req!.once("response", (hdrs) => {
      client.off("error", onEarlyError);
      req!.off("error", onEarlyError);
      resolve(hdrs);
    });
  });

  return {
    responseHeaders,
    write(frame: Uint8Array) {
      if (req && !req.destroyed) req.write(Buffer.from(frame));
    },
    end() {
      try {
        if (req && !req.destroyed) req.end();
      } catch {}
    },
    close,
    async read() {
      if (chunkQueue.length) return { value: chunkQueue.shift(), done: false };
      if (ended) {
        if (streamError) throw streamError;
        return { value: undefined, done: true };
      }
      const result = await new Promise<{ value?: Buffer; done: boolean } | null>((resolve) => {
        waiting = resolve;
      });
      if (streamError) throw streamError;
      return result || { value: undefined, done: true };
    },
  };
}
