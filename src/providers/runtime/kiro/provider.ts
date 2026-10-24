import { OpenAiCompatibleProvider } from "../../core/base/openAiProvider.js";
import type { ProviderRequestContext, ProviderProbeContext, ProviderProbeResult } from "../../core/types.js";
import type { ProviderUsageContext, RawProviderQuotaResult } from "../../../core/usage/types.js";
import { getKiroUsage, resolveDefaultProfileArn } from "./quota.js";
import { getPublicDnsAgent } from "../../../shared/utils/dnsResolver.js";
import { fetch as undiciFetch } from "undici";
import { extractModelsFromPayload } from "../../../core/scanner/payloadExtractor.js";

const ANTHROPIC_SNAPSHOT_SUFFIX = /-\d{8}$/;

export function normalizeKiroUpstreamModelId(model?: string): string {
  if (typeof model !== "string" || !model) return model || "";

  const id = model.toLowerCase().replace(ANTHROPIC_SNAPSHOT_SUFFIX, "");

  if (id.includes("sonnet")) {
    if (id.includes("5.5") || id.includes("5-5")) return "claude-sonnet-5.5";
    if (id.includes("4.6") || id.includes("4-6")) return "claude-sonnet-4.6";
    if (id.includes("sonnet-5") || id.includes("sonnet.5")) return "claude-sonnet-5";
    if (id.includes("4.5") || id.includes("4-5")) return "claude-sonnet-4.5";
    if (id.includes("sonnet-4") || id.includes("sonnet.4")) return "claude-sonnet-4";
    return "claude-sonnet-4.5";
  }
  if (id.includes("fable")) return "claude-fable-5";
  if (id.includes("opus")) {
    if (id.includes("5.5") || id.includes("5-5")) return "claude-opus-5.5";
    if (id.includes("opus-5") || id.includes("opus.5") || id.includes("opus 5")) return "claude-opus-5";
    if (id.includes("4.8") || id.includes("4-8")) return "claude-opus-4.8";
    if (id.includes("4.7") || id.includes("4-7")) return "claude-opus-4.7";
    if (id.includes("4.5") || id.includes("4-5")) return "claude-opus-4.5";
    return "claude-opus-4.6";
  }
  if (id.includes("haiku")) {
    return id.includes("5.5") || id.includes("5-5") ? "claude-haiku-5.5" : "claude-haiku-4.5";
  }
  if (id === "auto") return "auto";
  if (id.includes("deepseek")) return "deepseek-3.2";
  if (id.includes("glm")) return "glm-5";
  if (id.includes("minimax")) {
    return id.includes("2.5") || id.includes("2-5") ? "minimax-m2.5" : "minimax-m2.1";
  }
  if (id.includes("qwen")) return "qwen3-coder-next";
  if (id.includes("kimi")) return "kimi-k3";
  if (id.includes("gpt")) {
    if (id.includes("terra")) return "gpt-5.6-terra";
    if (id.includes("luna")) return "gpt-5.6-luna";
    if (id.includes("sol") || id.includes("5.6") || id.includes("5-6")) return "gpt-5.6-sol";
    return model;
  }
  return model;
}

export class KiroProvider extends OpenAiCompatibleProvider {
  public override readonly id = "kiro";
  public override readonly name = "Kiro API";
  public override readonly defaultFormat = "openai";

  public override supportsQuota(): boolean {
    return true;
  }

  public async fetchQuota(context: ProviderUsageContext): Promise<RawProviderQuotaResult> {
    return await getKiroUsage(context.account.rawApiKey, context.account.providerSpecificData);
  }

  public override transformRequestBody(context: ProviderRequestContext): any {
    const targetModel = normalizeKiroUpstreamModelId(context.targetModel);
    const converted = super.transformRequestBody({ ...context, targetModel });
    converted.model = targetModel;
    return converted;
  }

  public override async probeModels(context: ProviderProbeContext): Promise<ProviderProbeResult | null> {
    const timeoutMs = context.timeoutMs || 6000;
    const region = context.region || context.account?.providerSpecificData?.region || "us-east-1";
    const url = `https://codewhisperer.${region}.amazonaws.com`;

    let token = (context.apiKey || context.account?.rawApiKey || "").trim();
    const profileArn = context.account?.providerSpecificData?.profileArn || resolveDefaultProfileArn(context.account?.providerSpecificData?.authMethod);

    const reqHeaders: Record<string, string> = {
      "Content-Type": "application/x-amz-json-1.0",
      "x-amz-target": "AmazonCodeWhispererService.ListAvailableModels",
      "x-amz-user-agent": "aws-sdk-js/1.0.0 KiroIDE",
      "user-agent": "aws-sdk-js/1.0.0 KiroIDE",
      Accept: "application/json",
      ...(context.customHeaders || {}),
    };
    if (token) {
      reqHeaders["Authorization"] = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
    }
    if (context.account?.providerSpecificData?.authMethod === "api-key") {
      reqHeaders["tokentype"] = "API_KEY";
    } else if (context.account?.providerSpecificData?.authMethod === "external_idp") {
      reqHeaders["TokenType"] = "EXTERNAL_IDP";
    }

    try {
      const res = ((await undiciFetch(url, {
        method: "POST",
        headers: reqHeaders,
        body: JSON.stringify({
          origin: "AI_EDITOR",
          ...(profileArn ? { profileArn } : {}),
        }),
        signal: AbortSignal.timeout(timeoutMs),
        dispatcher: getPublicDnsAgent(),
      })) as unknown as globalThis.Response);

      if (res.ok || res.status === 200) {
        const payload: any = await res.json();
        const models = extractModelsFromPayload(payload, this.id);
        return {
          success: true,
          endpointUrl: url,
          models,
          count: models.length,
        };
      }

      return {
        success: false,
        error: `Endpoint ${url} returned HTTP ${res.status}: ${res.statusText}`,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `Failed to connect to ${url}: ${msg}`,
      };
    }
  }
}

export default KiroProvider;
