import type { IncomingMessage, ServerResponse } from "node:http";
import { fetchRouter, pipeSSE } from "../base.js";

export async function interceptAntigravity(
  req: IncomingMessage,
  res: ServerResponse,
  bodyBuffer: Buffer,
  mappedModel: string
): Promise<void> {
  const isStream = req.url?.includes(":streamGenerateContent");
  try {
    const body = JSON.parse(bodyBuffer.toString("utf-8"));
    if (body.model) {
      body.model = mappedModel;
    }

    const routerRes = await fetchRouter(body, "/v1/chat/completions", req.headers);
    await pipeSSE(routerRes, res);
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
