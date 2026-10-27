import type { IMitmHandler, MitmRequestContext } from "../../types.js";
import { interceptKiro } from "./interceptor.js";
import { interceptKiroModels } from "./modelInjector.js";

export class KiroMitmHandler implements IMitmHandler {
  public readonly id = "kiro";

  public canHandle(hostname: string, _url: string): boolean {
    const host = (hostname || "").split(":")[0].toLowerCase();
    return host.includes("kiro") || host.includes("codewhisperer") || host.includes("q.us-east-1.amazonaws.com");
  }

  public async handle(context: MitmRequestContext): Promise<void> {
    if (context.isModelDiscovery) {
      await interceptKiroModels(context.req, context.res, context.bodyBuffer, context.passthrough);
      return;
    }
    await interceptKiro(context.req, context.res, context.bodyBuffer, context.mappedModel || "");
  }
}
