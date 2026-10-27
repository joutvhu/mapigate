import type { IMitmHandler, MitmRequestContext } from "../../types.js";
import { interceptCopilot } from "./interceptor.js";
import { interceptCopilotModels } from "./modelInjector.js";

export class CopilotMitmHandler implements IMitmHandler {
  public readonly id = "copilot";

  public canHandle(hostname: string, _url: string): boolean {
    const host = (hostname || "").split(":")[0].toLowerCase();
    return host.includes("githubcopilot") || host.includes("copilot");
  }

  public async handle(context: MitmRequestContext): Promise<void> {
    if (context.isModelDiscovery) {
      await interceptCopilotModels(context.req, context.res, context.bodyBuffer, context.passthrough);
      return;
    }
    await interceptCopilot(context.req, context.res, context.bodyBuffer, context.mappedModel || "");
  }
}
