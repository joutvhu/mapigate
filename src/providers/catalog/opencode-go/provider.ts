import { OpenAiCompatibleProvider } from "../../core/base/openAiProvider.js";
import type { ProviderRequestContext } from "../../core/types.js";
import { AnthropicAdapter } from "../../../core/adapters/anthropicAdapter.js";
import { metadata } from "./metadata.js";

const MESSAGES_CAPABLE_PREFIXES = [
  "claude-",
  "deepseek-v4",
  "minimax-m",
  "qwen3.",
  "space-bunny-free",
];

function stripThinkingSuffix(model: string): string {
  return String(model || "").replace(/\([^()]+\)\s*$/, "").trim().toLowerCase();
}

function isClaudeOnlyModel(model: string): boolean {
  return stripThinkingSuffix(model).startsWith("claude-");
}

function supportsMessagesTransport(model: string): boolean {
  const clean = stripThinkingSuffix(model);
  return MESSAGES_CAPABLE_PREFIXES.some((prefix) => clean.startsWith(prefix));
}

export class OpencodeGoProvider extends OpenAiCompatibleProvider {
  public override readonly id = metadata.id;
  public override readonly name = metadata.name;
  public override readonly defaultFormat = metadata.format || "openai";

  public override resolveTargetFormat(targetModel: string, clientFormat: string): string | undefined {
    if (isClaudeOnlyModel(targetModel)) {
      return "claude";
    }
    if (clientFormat === "anthropic" && supportsMessagesTransport(targetModel)) {
      return "claude";
    }
    return undefined;
  }

  public override transformRequestBody(context: ProviderRequestContext): any {
    if (context.targetFormat === "claude") {
      const modelToUse = this.resolveUpstreamModelId(context);
      const converted =
        context.clientFormat === "anthropic"
          ? { ...context.body, model: modelToUse }
          : {
              ...AnthropicAdapter.openAiToAnthropic(
                context.body,
                modelToUse || context.targetModel,
                context.provider?.id || this.id
              ),
              model: modelToUse,
            };

      // OpenCode Go's /messages transport uses adaptive thinking + output_config.effort for DeepSeek.
      if (
        stripThinkingSuffix(context.targetModel).startsWith("deepseek") &&
        converted?.output_config?.effort &&
        !converted.thinking
      ) {
        converted.thinking = { type: "adaptive" };
      }
      return converted;
    }

    return super.transformRequestBody(context);
  }

  public override buildUrl(context: ProviderRequestContext): string {
    const accountBase = (context.account?.providerSpecificData?.baseUrl || "").trim();
    const providerBase = (context.provider?.baseUrl || "").trim();
    const customBase = accountBase || (providerBase && !providerBase.includes("opencode.ai") ? providerBase : "");

    if (customBase) {
      const cleanBase = customBase.replace(/\/+$/, "");
      if (context.targetFormat === "claude") {
        return cleanBase.endsWith("/messages") ? cleanBase : `${cleanBase}/v1/messages`;
      }
      return cleanBase.endsWith("/chat/completions") ? cleanBase : `${cleanBase}/v1/chat/completions`;
    }

    if (context.targetFormat === "claude") {
      return "https://opencode.ai/inference/go/anthropic/v1/messages";
    }
    return "https://opencode.ai/inference/go/openai/v1/chat/completions";
  }

  public override async buildHeaders(context: ProviderRequestContext): Promise<Record<string, string>> {
    const headers = await super.buildHeaders(context);
    if (context.targetFormat === "claude") {
      const apiKey = (context.account?.rawApiKey || "").trim();
      delete headers["Authorization"];
      if (apiKey && !headers["x-api-key"]) {
        headers["x-api-key"] = apiKey;
      }
      if (!headers["anthropic-version"]) {
        headers["anthropic-version"] = "2023-06-01";
      }
    }
    return headers;
  }
}

export default OpencodeGoProvider;
