import { OpenAiCompatibleProvider } from "../../core/base/openAiProvider.js";
import type { ProviderUsageContext, RawProviderQuotaResult } from "../../../core/usage/types.js";
import { getQoderUsage } from "./quota.js";

export class QoderProvider extends OpenAiCompatibleProvider {
  public override readonly id = "qoder";
  public override readonly name = "Qoder";
  public override readonly defaultFormat = "openai";

  public override supportsQuota(): boolean {
    return true;
  }

  public async fetchQuota(context: ProviderUsageContext): Promise<RawProviderQuotaResult> {
    return await getQoderUsage(context.account.rawApiKey, context.providerId);
  }
}

export default QoderProvider;
