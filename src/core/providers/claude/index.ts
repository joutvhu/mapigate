import { AnthropicCompatibleProvider } from "../base/anthropicProvider.js";
import type { ProviderUsageContext, RawProviderQuotaResult } from "../../usage/types.js";
import { getClaudeUsage } from "./quota.js";

export * from "./quota.js";

export class ClaudeProvider extends AnthropicCompatibleProvider {
  public override readonly id = "claude";
  public override readonly name = "Anthropic Claude";
  public override readonly defaultFormat = "claude";

  public override supportsQuota(): boolean {
    return true;
  }

  public async fetchQuota(context: ProviderUsageContext): Promise<RawProviderQuotaResult> {
    return await getClaudeUsage(context.account.rawApiKey, { force: context.force });
  }
}
