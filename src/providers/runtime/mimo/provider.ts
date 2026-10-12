import { OpenAiCompatibleProvider } from "../../core/base/openAiProvider.js";
import type { ProviderRequestContext } from "../../core/types.js";
import type { ProviderUsageContext, RawProviderQuotaResult } from "../../../core/usage/types.js";
import { getMimoUsage } from "./quota.js";

export class MimoProvider extends OpenAiCompatibleProvider {
  public override readonly id = "mimo";
  public override readonly name = "Xiaomi MiMo / TokenPlan";
  public override readonly defaultFormat = "openai";

  public override supportsQuota(): boolean {
    return true;
  }

  public async fetchQuota(context: ProviderUsageContext): Promise<RawProviderQuotaResult> {
    return await getMimoUsage(
      context.account.rawApiKey,
      context.providerId,
      context.account.providerSpecificData,
      context.account.id
    );
  }

  public override buildUrl(context: ProviderRequestContext): string {
    const psd = context.account?.providerSpecificData || {};
    const region = psd.region || "sgp";
    const pId = context.provider?.id?.toLowerCase() || this.id;
    if (pId === "xiaomi-tokenplan" || pId === "xmtp") {
      return `https://token-plan-${region}.xiaomimimo.com/v1/chat/completions`;
    }
    return super.buildUrl(context);
  }
}

export default MimoProvider;
