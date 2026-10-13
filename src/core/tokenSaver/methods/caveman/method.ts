import type {
  ITokenSaverMethod,
  TokenSaverConfig,
  TokenSaverContext,
  TokenSaverResult,
} from "../../core/types.js";
import { cavemanMetadata } from "./metadata.js";
import { CAVEMAN_PROMPTS, CAVEMAN_LEVELS } from "./prompts.js";
import { injectSystemPrompt } from "../../core/systemInject.js";

export class CavemanMethod implements ITokenSaverMethod {
  public readonly id = cavemanMetadata.id;
  public readonly name = cavemanMetadata.name;
  public readonly type = cavemanMetadata.type;
  public readonly description = cavemanMetadata.description;

  public process(
    body: any,
    config: TokenSaverConfig,
    context?: TokenSaverContext
  ): TokenSaverResult {
    if (config?.enabled === false || !body || typeof body !== "object") {
      return { methodId: this.id, applied: false, tokensSaved: 0 };
    }

    try {
      const level = config.level || CAVEMAN_LEVELS.LITE;
      const prompt = CAVEMAN_PROMPTS[level] || CAVEMAN_PROMPTS[CAVEMAN_LEVELS.LITE];
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
