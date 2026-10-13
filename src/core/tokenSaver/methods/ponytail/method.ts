import type {
  ITokenSaverMethod,
  TokenSaverConfig,
  TokenSaverContext,
  TokenSaverResult,
} from "../../core/types.js";
import { ponytailMetadata } from "./metadata.js";
import { PONYTAIL_PROMPTS, PONYTAIL_LEVELS } from "./prompts.js";
import { injectSystemPrompt } from "../../core/systemInject.js";

export class PonytailMethod implements ITokenSaverMethod {
  public readonly id = ponytailMetadata.id;
  public readonly name = ponytailMetadata.name;
  public readonly type = ponytailMetadata.type;
  public readonly description = ponytailMetadata.description;

  public process(
    body: any,
    config: TokenSaverConfig,
    context?: TokenSaverContext
  ): TokenSaverResult {
    if (config?.enabled === false || !body || typeof body !== "object") {
      return { methodId: this.id, applied: false, tokensSaved: 0 };
    }

    try {
      const level = config.level || PONYTAIL_LEVELS.LITE;
      const prompt = PONYTAIL_PROMPTS[level] || PONYTAIL_PROMPTS[PONYTAIL_LEVELS.LITE];
      if (!prompt) {
        return { methodId: this.id, applied: false, tokensSaved: 0 };
      }

      const format = context?.targetFormat || context?.clientFormat;
      const applied = injectSystemPrompt(body, format, prompt);

      return {
        methodId: this.id,
        applied,
        tokensSaved: 0,
        details: { level, format },
      };
    } catch {
      return { methodId: this.id, applied: false, tokensSaved: 0 };
    }
  }
}
