import { OpenAiCompatibleProvider } from "../../core/base/openAiProvider.js";
import type { ProviderRequestContext } from "../../core/types.js";

export class OpenAiProvider extends OpenAiCompatibleProvider {
  public override readonly id = "openai";
  public override readonly name = "OpenAI";
  public override readonly defaultFormat = "openai";

  public override transformRequestBody(context: ProviderRequestContext): any {
    const converted = super.transformRequestBody(context);

    // Current OpenAI models (gpt-4o, o1, o3-mini, gpt-5.x, gpt-6.x) reject `max_tokens` with HTTP 400.
    // Rename max_tokens to max_completion_tokens (preserve existing max_completion_tokens if already set).
    if (converted && typeof converted === "object" && "max_tokens" in converted) {
      if (converted.max_completion_tokens === undefined) {
        converted.max_completion_tokens = converted.max_tokens;
      }
      delete converted.max_tokens;
    }

    return converted;
  }
}

export default OpenAiProvider;
