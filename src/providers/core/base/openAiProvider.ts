import { BaseProvider } from "./baseProvider.js";
import type { ProviderRequestContext } from "../types.js";
import { AnthropicAdapter } from "../../../core/adapters/anthropicAdapter.js";

export class OpenAiCompatibleProvider extends BaseProvider {
  public readonly id: string;
  public readonly name: string;
  public readonly defaultFormat: string = "openai";

  constructor(options?: {
    id?: string;
    name?: string;
    format?: string;
    requiresApiKey?: boolean;
    isLocal?: boolean;
    defaultBaseUrl?: string;
  }) {
    super();
    this.id = options?.id || "openai";
    this.name = options?.name || "OpenAI";
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

  public override transformRequestBody(context: ProviderRequestContext): any {
    if (context.clientFormat === "anthropic") {
      const converted = AnthropicAdapter.anthropicToOpenAi(context.body);
      converted.model = context.targetModel;
      return converted;
    }
    return { ...context.body, model: context.targetModel };
  }
}
