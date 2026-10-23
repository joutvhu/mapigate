import type {
  ITokenSaverMethod,
  TokenSaverConfig,
  TokenSaverContext,
  TokenSaverResult,
} from "../../core/types.js";
import { customPromptMetadata } from "./metadata.js";
import { injectSystemPrompt } from "../../core/systemInject.js";

export class CustomPromptMethod implements ITokenSaverMethod {
  public readonly id = customPromptMetadata.id;
  public readonly name = customPromptMetadata.name;
  public readonly type = customPromptMetadata.type;
  public readonly description = customPromptMetadata.description;

  public process(
    body: any,
    config: TokenSaverConfig,
    context?: TokenSaverContext
  ): TokenSaverResult {
    if (config?.enabled === false || !body || typeof body !== "object") {
      return { methodId: this.id, applied: false, tokensSaved: 0 };
    }

    try {
      const text = typeof config.prompt === "string" ? config.prompt.trim() : "";
      if (!text) {
        return { methodId: this.id, applied: false, tokensSaved: 0 };
      }

      const format = context?.targetFormat || context?.clientFormat;
      const applied = injectSystemPrompt(body, format, text);

      return {
        methodId: this.id,
        applied,
        tokensSaved: 0,
        details: { length: text.length, format },
      };
    } catch {
      return { methodId: this.id, applied: false, tokensSaved: 0 };
    }
  }
}
