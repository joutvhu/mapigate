import { OpenAiCompatibleProvider } from "../../core/base/openAiProvider.js";
import type { ProviderRequestContext } from "../../core/types.js";
import type { ProviderUsageContext, RawProviderQuotaResult } from "../../../core/usage/types.js";
import { getQoderUsage } from "./quota.js";
import { buildCosyHeaders } from "./cosy.js";

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

  public override async buildHeaders(context: ProviderRequestContext): Promise<Record<string, string>> {
    const baseHeaders = await super.buildHeaders(context);
    const psd = context.account?.providerSpecificData || {};
    const userId = psd.userId;
    const token = context.account?.rawApiKey || "";

    if (userId && token) {
      const url = this.buildUrl(context);
      const bodyBytes = Buffer.from(JSON.stringify(context.body || {}), "utf8");
      const cosyHeaders = buildCosyHeaders(bodyBytes, url, {
        userId,
        authToken: token,
        machineId: psd.machineId,
      });
      return { ...baseHeaders, ...cosyHeaders };
    }

    return baseHeaders;
  }
}

export default QoderProvider;
