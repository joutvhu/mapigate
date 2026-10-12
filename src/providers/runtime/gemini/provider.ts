import { OpenAiCompatibleProvider } from "../../core/base/openAiProvider.js";
import type { ProviderUsageContext, RawProviderQuotaResult } from "../../../core/usage/types.js";
import { getGeminiUsage } from "./quota.js";

export class GeminiProvider extends OpenAiCompatibleProvider {
  public override readonly id = "gemini";
  public override readonly name = "Google Gemini";
  public override readonly defaultFormat = "openai";

  public override supportsQuota(): boolean {
    return true;
  }

  public async fetchQuota(context: ProviderUsageContext): Promise<RawProviderQuotaResult> {
    return await getGeminiUsage(context.account.rawApiKey, context.account.providerSpecificData);
  }
}

export default GeminiProvider;
