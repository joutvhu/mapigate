import type { IMitmHandler, MitmRequestContext } from "../../types.js";
import { interceptCopilot } from "./interceptor.js";
import { interceptCopilotModels } from "./modelInjector.js";

export class CopilotMitmHandler implements IMitmHandler {
  public readonly id = "copilot";

  public canHandle(hostname: string, _url: string): boolean {
    const h = (hostname || "").split(":")[0].trim().toLowerCase();
    return (
      ["githubcopilot.com", "copilot-proxy.githubusercontent.com", "copilot-telemetry.github.com"].some(
        (d) => h === d || h.endsWith("." + d)
      ) ||
      (h.endsWith(".github.com") && h.split(".")[0].startsWith("copilot"))
    );
  }

  public async handle(context: MitmRequestContext): Promise<void> {
    if (context.isModelDiscovery) {
      await interceptCopilotModels(context.req, context.res, context.bodyBuffer, context.passthrough);
      return;
    }
    await interceptCopilot(context.req, context.res, context.bodyBuffer, context.mappedModel || "");
  }
}
