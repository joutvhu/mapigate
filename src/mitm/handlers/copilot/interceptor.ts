import type { IncomingMessage, ServerResponse } from "node:http";
import { fetchRouter, pipeSSE } from "../base.js";

const URL_MAP: Record<string, string> = {
  "/chat/completions": "/v1/chat/completions",
  "/v1/messages": "/v1/messages",
  "/responses": "/v1/responses",
};

export function resolveRouterPath(reqUrl: string = ""): string {
  for (const [pattern, routerPath] of Object.entries(URL_MAP)) {
    if (reqUrl.includes(pattern)) return routerPath;
  }
  return "/v1/chat/completions";
}

export async function interceptCopilot(
  req: IncomingMessage,
  res: ServerResponse,
  bodyBuffer: Buffer,
  mappedModel: string
): Promise<void> {
  try {
    const body = JSON.parse(bodyBuffer.toString("utf-8"));
    body.model = mappedModel;
    const routerPath = resolveRouterPath(req.url);
    const routerRes = await fetchRouter(body, routerPath, req.headers);
    await pipeSSE(routerRes, res);
  } catch (error: any) {
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
    }
    res.end(JSON.stringify({ error: { message: error.message, type: "mitm_error" } }));
  }
}
