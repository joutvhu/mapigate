import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Cursor MITM handler.
 * Cursor IDE connects via binary gRPC/Protobuf.
 * If intercepted, gracefully passes through to real Cursor upstream if passthrough is provided;
 * otherwise provides an informative response guiding users to use OpenAI Base URL override.
 */
export async function interceptCursor(
  req: IncomingMessage,
  res: ServerResponse,
  bodyBuffer?: Buffer,
  _mappedModel?: string | null,
  passthrough?: (req: IncomingMessage, res: ServerResponse, body: Buffer) => Promise<void>
): Promise<void> {
  if (passthrough && bodyBuffer) {
    return await passthrough(req, res, bodyBuffer);
  }

  if (!res.headersSent) {
    res.writeHead(501, { "Content-Type": "application/json" });
  }
  res.end(
    JSON.stringify({
      error: {
        message: "Cursor MITM binary interception is not active. Please configure Cursor Settings → Models → OpenAI API Key → Override Base URL: http://127.0.0.1:20127/v1",
        type: "not_implemented",
      },
    })
  );
}
