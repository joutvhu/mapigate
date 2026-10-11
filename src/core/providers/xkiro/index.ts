import { OpenAiCompatibleProvider } from "../base/openAiProvider.js";
import type { ProviderUsageContext, RawProviderQuotaResult } from "../../usage/types.js";
import { getXKiroUsage } from "./quota.js";

export * from "./quota.js";

export class XKiroProvider extends OpenAiCompatibleProvider {
  public override readonly id = "xkiro";
  public override readonly name = "xKiro";
  public override readonly defaultFormat = "openai";

  public override supportsQuota(): boolean {
    return true;
  }

  public async fetchQuota(context: ProviderUsageContext): Promise<RawProviderQuotaResult> {
    return await getXKiroUsage(context.account.rawApiKey, context.account.providerSpecificData);
  }
}
