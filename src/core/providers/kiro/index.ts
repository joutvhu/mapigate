import { OpenAiCompatibleProvider } from "../base/openAiProvider.js";
import type { ProviderUsageContext, RawProviderQuotaResult } from "../../usage/types.js";
import { getKiroUsage } from "./quota.js";

export * from "./quota.js";

export class KiroProvider extends OpenAiCompatibleProvider {
  public override readonly id = "kiro";
  public override readonly name = "Kiro API";
  public override readonly defaultFormat = "openai";

  public override supportsQuota(): boolean {
    return true;
  }

  public async fetchQuota(context: ProviderUsageContext): Promise<RawProviderQuotaResult> {
    return await getKiroUsage(context.account.rawApiKey, context.account.providerSpecificData);
  }
}
