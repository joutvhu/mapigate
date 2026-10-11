import { BaseProvider } from "../base/baseProvider.js";
import type { ProviderRequestContext } from "../types.js";
import { AnthropicAdapter } from "../../adapters/anthropicAdapter.js";

export class OllamaProvider extends BaseProvider {
  public readonly id = "ollama";
  public readonly name = "Ollama Local";
  public readonly defaultFormat = "openai";
  public override readonly requiresAccount = false;

  public override buildUrl(context: ProviderRequestContext): string {
    const psd = context.account?.providerSpecificData || {};
    const host = (psd.baseUrl || context.provider?.baseUrl || "http://127.0.0.1:11434").replace(/\/+$/, "");
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
