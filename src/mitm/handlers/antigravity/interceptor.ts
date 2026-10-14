import type { IncomingMessage, ServerResponse } from "node:http";
import { fetchRouter, waitForDrainOrClose } from "../base.js";
import {
  convertGeminiToOpenAI,
  convertOpenAIToGeminiResponse,
  convertOpenAIToGeminiChunk,
  type GeminiRequestBody,
} from "./converter.js";

export async function interceptAntigravity(
  req: IncomingMessage,
  res: ServerResponse,
  bodyBuffer: Buffer,
  mappedModel: string
): Promise<void> {
  const isStream = req.url?.includes(":streamGenerateContent");
  try {
    const rawBody = JSON.parse(bodyBuffer.toString("utf-8")) as GeminiRequestBody;
    const openaiPayload = convertGeminiToOpenAI(rawBody, mappedModel, !!isStream);

    const routerRes = await fetchRouter(openaiPayload, "/v1/chat/completions", req.headers);

    if (!routerRes.ok) {
      const errText = await routerRes.text().catch(() => "");
      throw new Error(`Router error ${routerRes.status}: ${errText}`);
    }

    if (!isStream) {
      const data = await routerRes.json();
      const geminiRes = convertOpenAIToGeminiResponse(data);
      const resText = JSON.stringify(geminiRes);
      if (!res.headersSent) {
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Length": String(Buffer.byteLength(resText)),
        });
      }
      res.end(resText);
      return;
    }

    // Streaming path (:streamGenerateContent)
    if (!res.headersSent) {
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
    }

    if (!routerRes.body) {
      res.end();
      return;
    }

    const reader = routerRes.body.getReader();
    const decoder = new TextDecoder();
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
            const geminiChunk = convertOpenAIToGeminiChunk(parsed);
            if (geminiChunk) {
              const sseLine = `data: ${JSON.stringify(geminiChunk)}\r\n\r\n`;
              const canWrite = res.write(sseLine);
              if (!canWrite) {
                await waitForDrainOrClose(res);
              }
            }
          } catch {
            // Skip unparseable lines
          }
        }
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
  } catch (error: any) {
    if (isStream) {
      if (!res.headersSent) {
        res.writeHead(200, { "Content-Type": "text/event-stream" });
      }
      res.end(`data: ${JSON.stringify({ error: { message: error.message } })}\r\n\r\n`);
    } else {
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
      }
      res.end(JSON.stringify({ error: { message: error.message, type: "mitm_error" } }));
    }
  }
}
