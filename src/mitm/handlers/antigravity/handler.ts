import type { IMitmHandler, MitmRequestContext } from "../../types.js";
import { interceptAntigravity } from "./interceptor.js";
import { interceptAntigravityModels } from "./modelInjector.js";

export class AntigravityMitmHandler implements IMitmHandler {
  public readonly id = "antigravity";

  public canHandle(hostname: string, _url: string): boolean {
    const host = (hostname || "").split(":")[0].toLowerCase();
    return host.includes("cloudcode-pa.googleapis.com");
  }

  public async handle(context: MitmRequestContext): Promise<void> {
    if (context.isModelDiscovery) {
      await interceptAntigravityModels(context.req, context.res, context.bodyBuffer, context.passthrough);
      return;
    }
    await interceptAntigravity(context.req, context.res, context.bodyBuffer, context.mappedModel || "");
  }
}
