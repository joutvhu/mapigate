import { BaseProvider } from "../../core/base/baseProvider.js";
import type { ProviderRequestContext } from "../../core/types.js";
import { AnthropicAdapter } from "../../../core/adapters/anthropicAdapter.js";

export class CloudflareProvider extends BaseProvider {
  public readonly id = "cloudflare";
  public readonly name = "Cloudflare Workers AI";
  public readonly defaultFormat = "openai";

  public override buildUrl(context: ProviderRequestContext): string {
    const psd = context.account?.providerSpecificData || {};
    const accountId = psd.accountId || "";
    if (accountId) {
      return `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`;
    }
    return super.buildUrl(context);
  }

  public override transformRequestBody(context: ProviderRequestContext): any {
    if (context.clientFormat === "anthropic") {
      const converted = AnthropicAdapter.anthropicToOpenAi(context.body);
      converted.model = context.targetModel;
      return converted;
    }
    return { ...context.body, model: context.targetModel };
  }
}

export default CloudflareProvider;
