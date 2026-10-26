import { BaseProvider, extractTokenFromAccount } from "./baseProvider.js";
import type { ProviderRequestContext } from "../types.js";
import { AnthropicAdapter } from "../../../core/adapters/anthropicAdapter.js";

export class AnthropicCompatibleProvider extends BaseProvider {
  public readonly id: string;
  public readonly name: string;
  public readonly defaultFormat: string = "claude";

  constructor(options?: {
    id?: string;
    name?: string;
    format?: string;
    requiresApiKey?: boolean;
    isLocal?: boolean;
    defaultBaseUrl?: string;
  }) {
    super();
    this.id = options?.id || "anthropic";
    this.name = options?.name || "Anthropic";
    if (options?.format) {
      this.defaultFormat = options.format;
    }
    if (options?.requiresApiKey !== undefined) {
      this.requiresApiKey = options.requiresApiKey;
    }
    if (options?.isLocal !== undefined) {
      this.isLocal = options.isLocal;
    }
    if (options?.defaultBaseUrl !== undefined) {
      this.defaultBaseUrl = options.defaultBaseUrl;
    }
  }

  public override async buildHeaders(context: ProviderRequestContext): Promise<Record<string, string>> {
    const headers = await super.buildHeaders(context);
    const bearerToken = extractTokenFromAccount(context.account);
    const prov = context.provider as any;
    const isNoApiKey =
      prov?.requiresApiKey === false ||
      prov?.authType === "none" ||
      this.requiresApiKey === false;

    if (bearerToken && !headers["x-api-key"]) {
      headers["x-api-key"] = bearerToken;
    }
    if (isNoApiKey && !bearerToken) {
      delete headers["x-api-key"];
      delete headers["Authorization"];
    }
    if (!headers["anthropic-version"]) {
      headers["anthropic-version"] = "2023-06-01";
    }

    return headers;
  }

  public override transformRequestBody(context: ProviderRequestContext): any {
    const modelToUse = this.resolveUpstreamModelId(context);
    if (context.clientFormat === "openai") {
      const converted = AnthropicAdapter.openAiToAnthropic(context.body);
      converted.model = modelToUse;
      return converted;
    }
    return { ...context.body, model: modelToUse };
  }
}
