import { OpenAiCompatibleProvider } from "../../core/base/openAiProvider.js";
import type { ProviderUsageContext, RawProviderQuotaResult } from "../../../core/usage/types.js";
import { getMiniMaxUsage } from "./quota.js";

export class MiniMaxProvider extends OpenAiCompatibleProvider {
  public override readonly id = "minimax";
  public override readonly name = "MiniMax";
  public override readonly defaultFormat = "openai";

  public override supportsQuota(): boolean {
    return true;
  }

  public async fetchQuota(context: ProviderUsageContext): Promise<RawProviderQuotaResult> {
    return await getMiniMaxUsage(context.account.rawApiKey, context.providerId);
  }
}

export default MiniMaxProvider;
