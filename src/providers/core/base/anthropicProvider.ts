import { BaseProvider, extractTokenFromAccount } from "./baseProvider.js";
import type { ProviderRequestContext } from "../types.js";
import { AnthropicAdapter } from "../../../core/adapters/anthropicAdapter.js";
import { resolveTargetEffortFromContext } from "../../../core/thinking/effortResolver.js";

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

    const hasHeaderCi = (target: string) =>
      Object.keys(headers).some((k) => k.toLowerCase() === target);
    const removeHeaderCi = (target: string) => {
      for (const k of Object.keys(headers)) {
        if (k.toLowerCase() === target) {
          delete headers[k];
        }
      }
    };

    if (bearerToken && !hasHeaderCi("x-api-key")) {
      headers["x-api-key"] = bearerToken;
    }
    if (isNoApiKey && !bearerToken) {
      removeHeaderCi("x-api-key");
      removeHeaderCi("authorization");
    }
    if (!hasHeaderCi("anthropic-version")) {
      headers["anthropic-version"] = "2023-06-01";
    }

    return headers;
  }

  public override transformRequestBody(context: ProviderRequestContext): any {
    const modelToUse = this.resolveUpstreamModelId(context);
    const providerId = context.provider?.id || this.id;
    const effortRes = resolveTargetEffortFromContext({
      providerId,
      targetModel: modelToUse || context.targetModel,
      targetEffort: context.targetEffort,
      body: context.body,
      providerThinkingMode: context.provider?.thinkingMode,
    });
    const out =
      context.clientFormat === "openai" || context.clientFormat === "responses"
        ? AnthropicAdapter.openAiToAnthropic(context.body, effortRes.cleanModel, providerId)
        : { ...context.body };

    out.model = effortRes.cleanModel;
    delete out.reasoning_effort;

    if (effortRes.caps.thinkingFormat === "claude-adaptive") {
      if (typeof effortRes.effort === "string") {
        out.output_config = { ...(out.output_config || {}), effort: effortRes.effort };
      } else if (effortRes.effort === null && out.output_config && typeof out.output_config === "object") {
        const nextOc = { ...out.output_config };
        delete nextOc.effort;
        if (Object.keys(nextOc).length === 0) {
          delete out.output_config;
        } else {
          out.output_config = nextOc;
        }
      }
    } else if (out.output_config && typeof out.output_config === "object" && "effort" in out.output_config) {
      const nextOc = { ...out.output_config };
      delete nextOc.effort;
      if (Object.keys(nextOc).length === 0) {
        delete out.output_config;
      } else {
        out.output_config = nextOc;
      }
    }

    return out;
  }
}
