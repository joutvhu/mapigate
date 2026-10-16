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
    let body = context.body;
    if (context.clientFormat === "anthropic") {
      body = AnthropicAdapter.anthropicToOpenAi(body);
    }
    const converted: any = { ...body, model: context.targetModel };
    if (Array.isArray(converted.tools)) {
      converted.tools = converted.tools
        .map((t: any) => {
          if (!t || typeof t !== "object") return null;
          if (t.function && typeof t.function === "object") return t;
          if (t.type === "function" || t.name) {
            return {
              type: "function",
              function: {
                name: t.name || "",
                description: t.description,
                parameters: t.parameters || { type: "object", properties: {} },
                ...(t.strict !== undefined && { strict: t.strict }),
              },
            };
          }
          return t;
        })
        .filter(Boolean);
      if (converted.tools.length === 0) {
        delete converted.tools;
        delete converted.tool_choice;
      }
    }
    return converted;
  }
}
