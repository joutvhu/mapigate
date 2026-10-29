import { OpenAiCompatibleProvider } from "../../core/base/openAiProvider.js";
import type { ProviderRequestContext } from "../../core/types.js";
import { metadata } from "./metadata.js";

export class NvidiaProvider extends OpenAiCompatibleProvider {
  public override readonly id = metadata.id;
  public override readonly name = metadata.name;
  public override readonly defaultFormat = metadata.format || "openai";

  public override transformRequestBody(context: ProviderRequestContext): any {
    const body = super.transformRequestBody(context);
    if (body && Array.isArray(body.messages)) {
      for (const msg of body.messages) {
        if (!msg || msg.role !== "assistant") continue;
        if (msg.reasoning !== undefined) {
          const existing = msg.reasoning_content;
          if (existing === undefined || existing === null || (typeof existing === "string" && !existing.trim())) {
            msg.reasoning_content = msg.reasoning;
          }
          delete msg.reasoning;
        }
      }
    }
    return body;
  }
}

export default NvidiaProvider;
