import type { IMitmHandler, MitmRequestContext } from "../../types.js";
import { interceptCursor } from "./interceptor.js";

export class CursorMitmHandler implements IMitmHandler {
  public readonly id = "cursor";

  public canHandle(hostname: string, _url: string): boolean {
    const host = (hostname || "").split(":")[0].toLowerCase();
    return host.includes("cursor") || host.includes("anysphere");
  }

  public async handle(context: MitmRequestContext): Promise<void> {
    await interceptCursor(context.req, context.res, context.bodyBuffer, context.mappedModel, context.passthrough);
  }
}
