import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Cursor MITM handler — 501 / informative JSON handler for binary proto requests.
 * Aligned with 9router's Cursor MITM handler stub.
 */
export async function interceptCursor(
  _req: IncomingMessage,
  res: ServerResponse,
  _bodyBuffer?: Buffer,
  _mappedModel?: string | null,
  _passthrough?: (req: IncomingMessage, res: ServerResponse, body: Buffer) => Promise<void>
): Promise<void> {
  if (!res.headersSent) {
    res.writeHead(501, { "Content-Type": "application/json" });
  }
  res.end(
    JSON.stringify({
      error: {
        message: "Cursor MITM support is coming soon.",
        type: "not_implemented",
      },
    })
  );
}
