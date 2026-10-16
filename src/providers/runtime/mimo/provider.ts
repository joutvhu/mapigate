import { OpenAiCompatibleProvider } from "../../core/base/openAiProvider.js";
import type { ProviderUsageContext, RawProviderQuotaResult } from "../../../core/usage/types.js";
import { getMimoUsage } from "./quota.js";

export class MimoProvider extends OpenAiCompatibleProvider {
  public override readonly id = "mimo";
  public override readonly name = "Xiaomi MiMo";
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
}

export default MimoProvider;
