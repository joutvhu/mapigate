import { AnthropicCompatibleProvider } from "../../core/base/anthropicProvider.js";
import type { ProviderUsageContext, RawProviderQuotaResult } from "../../../core/usage/types.js";
import { metadata } from "./metadata.js";
import { getKimiUsage } from "./quota.js";

export class KimiProvider extends AnthropicCompatibleProvider {
  public override readonly id = metadata.id;
  public override readonly name = metadata.name;
  public override readonly defaultFormat = metadata.format || "claude";

  public override supportsQuota(): boolean {
    return true;
  }

  public async fetchQuota(context: ProviderUsageContext): Promise<RawProviderQuotaResult> {
    return await getKimiUsage(
      context.account.rawApiKey,
      context.account.rawApiKey,
      context.account.providerSpecificData
    );
  }
}

export default KimiProvider;
