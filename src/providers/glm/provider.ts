import { OpenAiCompatibleProvider } from "../base/openAiProvider.js";
import type { ProviderUsageContext, RawProviderQuotaResult } from "../../core/usage/types.js";
import { getGlmUsage } from "./quota.js";

export class GlmProvider extends OpenAiCompatibleProvider {
  public override readonly id = "glm";
  public override readonly name = "GLM / Zhipu";
  public override readonly defaultFormat = "openai";

  public override supportsQuota(): boolean {
    return true;
  }

  public async fetchQuota(context: ProviderUsageContext): Promise<RawProviderQuotaResult> {
    return await getGlmUsage(context.account.rawApiKey, context.providerId);
  }
}
