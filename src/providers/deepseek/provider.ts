import { OpenAiCompatibleProvider } from "../base/openAiProvider.js";
import type { ProviderUsageContext, RawProviderQuotaResult } from "../../core/usage/types.js";
import { getDeepseekUsage } from "./quota.js";

export class DeepSeekProvider extends OpenAiCompatibleProvider {
  public override readonly id = "deepseek";
  public override readonly name = "DeepSeek";
  public override readonly defaultFormat = "openai";

  public override supportsQuota(): boolean {
    return true;
  }

  public async fetchQuota(context: ProviderUsageContext): Promise<RawProviderQuotaResult> {
    return await getDeepseekUsage(context.account.rawApiKey);
  }
}
