import type { IMitmHandler, MitmRequestContext } from "../../types.js";
import { interceptAntigravity } from "./interceptor.js";

export class AntigravityMitmHandler implements IMitmHandler {
  public readonly id = "antigravity";

  public canHandle(hostname: string, _url: string): boolean {
    const host = (hostname || "").split(":")[0].toLowerCase();
    return host.includes("cloudcode-pa.googleapis.com");
  }

  public async handle(context: MitmRequestContext): Promise<void> {
    await interceptAntigravity(context.req, context.res, context.bodyBuffer, context.mappedModel || "");
  }
}
