import type { IncomingMessage, ServerResponse } from "node:http";

export interface MitmRequestContext {
  req: IncomingMessage;
  res: ServerResponse;
  bodyBuffer: Buffer;
  mappedModel?: string | null;
  passthrough: (req: IncomingMessage, res: ServerResponse, buffer: Buffer) => Promise<void>;
}

export interface IMitmHandler {
  readonly id: string;
  canHandle(hostname: string, url: string): boolean;
  handle(context: MitmRequestContext): Promise<void>;
}
