import { OpenAiCompatibleProvider } from "../base/openAiProvider.js";
import type { ProviderUsageContext, RawProviderQuotaResult } from "../../usage/types.js";
import { getCodexUsage } from "./quota.js";

export * from "./quota.js";

export class CodexProvider extends OpenAiCompatibleProvider {
  public override readonly id = "codex";
  public override readonly name = "OpenAI Codex";
  public override readonly defaultFormat = "openai";

  public override supportsQuota(): boolean {
    return true;
  }

  public async fetchQuota(context: ProviderUsageContext): Promise<RawProviderQuotaResult> {
    return await getCodexUsage(context.account.rawApiKey, context.account.providerSpecificData);
  }
}
