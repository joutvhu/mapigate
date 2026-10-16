import { BaseProvider } from "../../core/base/baseProvider.js";
import type { ProviderRequestContext } from "../../core/types.js";
import { AnthropicAdapter } from "../../../core/adapters/anthropicAdapter.js";

export class OllamaProvider extends BaseProvider {
  public readonly id = "ollama";
  public readonly name = "Ollama Cloud";
  public readonly defaultFormat = "openai";
  public override readonly requiresAccount = false;

  public override buildUrl(context: ProviderRequestContext): string {
    const psd = context.account?.providerSpecificData || {};
    const host = (psd.baseUrl || context.provider?.baseUrl || "https://ollama.com").replace(/\/+$/, "");
    if (host.includes("/v1") || host.includes("/api/chat")) {
      return host;
    }
    return `${host}/v1/chat/completions`;
  }

  public override async buildHeaders(context: ProviderRequestContext): Promise<Record<string, string>> {
    const headers = await super.buildHeaders(context);
    const bearerToken = context.account?.rawApiKey || "";
    if (!bearerToken) {
      delete headers["Authorization"];
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

export default OllamaProvider;
