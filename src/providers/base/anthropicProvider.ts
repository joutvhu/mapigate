import { BaseProvider } from "./baseProvider.js";
import type { ProviderRequestContext } from "../types.js";
import { AnthropicAdapter } from "../../core/adapters/anthropicAdapter.js";

export class AnthropicCompatibleProvider extends BaseProvider {
  public readonly id: string;
  public readonly name: string;
  public readonly defaultFormat: string = "claude";

  constructor(options?: { id?: string; name?: string; format?: string }) {
    super();
    this.id = options?.id || "anthropic";
    this.name = options?.name || "Anthropic";
    if (options?.format) {
      this.defaultFormat = options.format;
    }
  }

  public override async buildHeaders(context: ProviderRequestContext): Promise<Record<string, string>> {
    const headers = await super.buildHeaders(context);
    const bearerToken = context.account?.rawApiKey || "";

    if (bearerToken && !headers["x-api-key"]) {
      headers["x-api-key"] = bearerToken;
    }
    if (!headers["anthropic-version"]) {
      headers["anthropic-version"] = "2023-06-01";
    }

    return headers;
  }

  public override transformRequestBody(context: ProviderRequestContext): any {
    if (context.clientFormat === "openai") {
      const converted = AnthropicAdapter.openAiToAnthropic(context.body);
      converted.model = context.targetModel;
      return converted;
    }
    return { ...context.body, model: context.targetModel };
  }
}
