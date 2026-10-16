import { OpenAiCompatibleProvider } from "../../core/base/openAiProvider.js";
import { metadata } from "./metadata.js";
import type { ProviderRequestContext } from "../../core/types.js";
import type { ProviderUsageContext, RawProviderQuotaResult } from "../../../core/usage/types.js";
import { getMimoUsage } from "../../runtime/mimo/quota.js";
import { AnthropicAdapter } from "../../../core/adapters/anthropicAdapter.js";

export class XiaomiTokenplanProvider extends OpenAiCompatibleProvider {
  public override readonly id = metadata.id;
  public override readonly name = metadata.name;
  public override readonly defaultFormat = metadata.format || "openai";

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

  public override transformRequestBody(context: ProviderRequestContext): any {
    if (context.targetFormat === "claude") {
      if (context.clientFormat === "anthropic") {
        return { ...context.body, model: context.targetModel };
      }
      return {
        ...AnthropicAdapter.openAiToAnthropic(context.body),
        model: context.targetModel,
      };
    }
    return super.transformRequestBody(context);
  }

  public override buildUrl(context: ProviderRequestContext): string {
    const psd = context.account?.providerSpecificData || {};
    const region = psd.region || "sgp";
    if (context.targetFormat === "claude") {
      return `https://token-plan-${region}.xiaomimimo.com/anthropic/v1/messages`;
    }
    return `https://token-plan-${region}.xiaomimimo.com/v1/chat/completions`;
  }

  public override async buildHeaders(context: ProviderRequestContext): Promise<Record<string, string>> {
    const headers = await super.buildHeaders(context);
    const apiKey = (context.account?.rawApiKey || "").trim();
    if (context.targetFormat === "claude") {
      delete headers["Authorization"];
      if (apiKey) {
        headers["x-api-key"] = apiKey;
      }
      if (!headers["anthropic-version"]) {
        headers["anthropic-version"] = "2023-06-01";
      }
    }
    return headers;
  }
}

export default XiaomiTokenplanProvider;
