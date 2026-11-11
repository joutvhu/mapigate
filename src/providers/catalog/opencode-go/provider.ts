import crypto from "node:crypto";
import { OpenAiCompatibleProvider } from "../../core/base/openAiProvider.js";
import type { ModelCallResult, ProviderRequestContext } from "../../core/types.js";
import type { ProviderUsageContext, RawProviderQuotaResult } from "../../../core/usage/types.js";
import { AnthropicAdapter } from "../../../core/adapters/anthropicAdapter.js";
import { extractSessionId } from "../../../server/proxy/executorHelpers.js";
import { metadata } from "./metadata.js";
import { getOpenCodeGoUsage } from "./quota.js";
import {
  OPENCODE_GO_RESPONSES_URL,
  executeOpenCodeGoResponses,
  isOpenCodeGoResponsesModel,
} from "./responses.js";

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

function resolveOpenCodeGoSession(context: ProviderRequestContext): string {
  const incoming = context.req?.headers?.["x-opencode-session"];
  if (typeof incoming === "string" && incoming.trim() && incoming.trim().length <= 256) {
    return incoming.trim();
  }
  const sessionId = context.req ? extractSessionId(context.req, context.body) : context.requestId;
  const digest = crypto
    .createHash("sha256")
    .update(`opencode-go\0${context.clientTool || "generic"}\0${sessionId}`)
    .digest("hex")
    .slice(0, 32);
  return `ses_${digest}`;
}

export class OpencodeGoProvider extends OpenAiCompatibleProvider {
  public override readonly id = metadata.id;
  public override readonly name = metadata.name;
  public override readonly defaultFormat = metadata.format || "openai";

  public override supportsQuota(): boolean {
    return true;
  }

  public async fetchQuota(context: ProviderUsageContext): Promise<RawProviderQuotaResult> {
    return await getOpenCodeGoUsage(context.account.rawApiKey);
  }

  public shouldExecute(context: ProviderRequestContext): boolean {
    return isOpenCodeGoResponsesModel(context.targetModel);
  }

  public async execute(context: ProviderRequestContext): Promise<ModelCallResult> {
    const url = this.buildUrl(context);
    const headers = await this.buildHeaders(context);
    return await executeOpenCodeGoResponses(context, url, headers);
  }

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
      if (isOpenCodeGoResponsesModel(context.targetModel)) {
        return cleanBase.endsWith("/responses") ? cleanBase : `${cleanBase}/v1/responses`;
      }
      if (context.targetFormat === "claude") {
        return cleanBase.endsWith("/messages") ? cleanBase : `${cleanBase}/v1/messages`;
      }
      return cleanBase.endsWith("/chat/completions") ? cleanBase : `${cleanBase}/v1/chat/completions`;
    }

    if (isOpenCodeGoResponsesModel(context.targetModel)) {
      return OPENCODE_GO_RESPONSES_URL;
    }
    if (context.targetFormat === "claude") {
      return "https://opencode.ai/inference/go/anthropic/v1/messages";
    }
    return "https://opencode.ai/inference/go/openai/v1/chat/completions";
  }

  public override async buildHeaders(context: ProviderRequestContext): Promise<Record<string, string>> {
    const headers = await super.buildHeaders(context);
    headers["x-opencode-session"] = resolveOpenCodeGoSession(context);
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
