import { OpenAiCompatibleProvider } from "../base/openAiProvider.js";
import type { ProviderUsageContext, RawProviderQuotaResult } from "../../core/usage/types.js";
import { getGrokUsage } from "./quota.js";

export class GrokProvider extends OpenAiCompatibleProvider {
  public override readonly id = "grok";
  public override readonly name = "xAI Grok";
  public override readonly defaultFormat = "openai";

  public override supportsQuota(): boolean {
    return true;
  }

  public async fetchQuota(context: ProviderUsageContext): Promise<RawProviderQuotaResult> {
    return await getGrokUsage(context.account.rawApiKey, context.account.providerSpecificData);
  }
}
