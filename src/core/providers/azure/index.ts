import { BaseProvider } from "../base/baseProvider.js";
import type { ProviderRequestContext } from "../types.js";
import { AnthropicAdapter } from "../../adapters/anthropicAdapter.js";

export class AzureProvider extends BaseProvider {
  public readonly id = "azure";
  public readonly name = "Azure OpenAI";
  public readonly defaultFormat = "openai";

  public override buildUrl(context: ProviderRequestContext): string {
    const psd = context.account?.providerSpecificData || {};
    const baseUrl = (psd.azureEndpoint || context.provider?.baseUrl || "").replace(/\/+$/, "");
    const deployment = psd.deployment || context.targetModel || "gpt-4";
    const apiVersion = psd.apiVersion || "2024-10-01-preview";
    return `${baseUrl}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
  }

  public override async buildHeaders(context: ProviderRequestContext): Promise<Record<string, string>> {
    const headers = await super.buildHeaders(context);
    const bearerToken = context.account?.rawApiKey || "";
    headers["api-key"] = bearerToken;
    delete headers["Authorization"];

    const psd = context.account?.providerSpecificData || {};
    if (psd.organization) {
      headers["OpenAI-Organization"] = psd.organization;
    }
    return headers;
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
