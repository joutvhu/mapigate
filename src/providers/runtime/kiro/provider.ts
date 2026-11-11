import { OpenAiCompatibleProvider } from "../../core/base/openAiProvider.js";
import { extractTokenFromAccount } from "../../core/base/baseProvider.js";
import type { ProviderRequestContext, ProviderProbeContext, ProviderProbeResult, ModelCallResult } from "../../core/types.js";
import type { ProviderUsageContext, RawProviderQuotaResult } from "../../../core/usage/types.js";
import { getKiroUsage, resolveDefaultProfileArn } from "./quota.js";
import { getPublicDnsAgent } from "../../../shared/utils/dnsResolver.js";
import { fetch as undiciFetch } from "undici";
import { extractModelsFromPayload } from "../../../core/scanner/payloadExtractor.js";
import { executeKiro } from "./executor.js";
import { refreshKiroToken } from "./auth.js";

import { normalizeKiroUpstreamModelId, resolveKiroServiceRegion } from "./models.js";
export { normalizeKiroUpstreamModelId };

export class KiroProvider extends OpenAiCompatibleProvider {
  public override readonly id = "kiro";
  public override readonly name = "Kiro API";
  public override readonly defaultFormat = "openai";

  public override supportsQuota(): boolean {
    return true;
  }

  public async execute(
    context: ProviderRequestContext,
    _dispatchSingleModel?: any
  ): Promise<ModelCallResult> {
    return await executeKiro(context, this);
  }

  public async handleAuthRefresh(
    context: ProviderRequestContext,
    status: number
  ): Promise<boolean> {
    if ((status !== 401 && status !== 403) || !context.account) return false;
    const refreshed = await refreshKiroToken(context.account);
    return Boolean(refreshed);
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

  public override buildUrl(context: ProviderRequestContext): string {
    const accountBase = (context.account?.providerSpecificData?.baseUrl || "").trim();
    if (accountBase) return accountBase;

    const psd = (context.account?.providerSpecificData || {}) as Record<string, any>;
    const authMethod = psd.authMethod;
    const region = psd.region || "us-east-1";

    if (authMethod === "external_idp") {
      return `https://codewhisperer.${resolveKiroServiceRegion("codewhisperer", region)}.amazonaws.com/generateAssistantResponse`;
    }
    if (authMethod === "api-key" || authMethod === "api_key") {
      return `https://q.${resolveKiroServiceRegion("q", region)}.amazonaws.com/generateAssistantResponse`;
    }

    const provBase = (context.provider?.baseUrl || "").trim();
    if (provBase) return provBase;

    return `https://runtime.${resolveKiroServiceRegion("runtime", region)}.kiro.dev/generateAssistantResponse`;
  }

  public override async buildHeaders(context: ProviderRequestContext): Promise<Record<string, string>> {
    const headers = await super.buildHeaders(context);
    const psd = (context.account?.providerSpecificData || {}) as Record<string, any>;
    const authMethod = psd.authMethod;

    if (authMethod === "api-key" || authMethod === "api_key") {
      headers["tokentype"] = "API_KEY";
    } else if (authMethod === "external_idp") {
      headers["TokenType"] = "EXTERNAL_IDP";
    }

    const bearerToken = extractTokenFromAccount(context.account);
    if (bearerToken) {
      headers["x-amz-sso-bearer"] = bearerToken;
    }
    headers["x-amzn-kiro-agent-mode"] = "spec";
    headers["x-amzn-codewhisperer-machine-id"] = "kiro-desktop";

    const profileArn = psd.profileArn;
    if (profileArn) {
      headers["x-amzn-codewhisperer-profile-arn"] = profileArn;
    }

    return headers;
  }

  public override async probeModels(context: ProviderProbeContext): Promise<ProviderProbeResult | null> {
    const timeoutMs = context.timeoutMs || 8000;
    const region = context.region || context.account?.providerSpecificData?.region || "us-east-1";

    const token = (context.apiKey || context.account?.providerSpecificData?.accessToken || context.account?.rawApiKey || "").trim();
    const profileArn = context.account?.providerSpecificData?.profileArn || resolveDefaultProfileArn(context.account?.providerSpecificData?.authMethod);

    // Enforce Coral JSON RPC headers (customHeaders must not override Content-Type or Accept)
    const reqHeaders: Record<string, string> = {
      ...(context.customHeaders || {}),
      "x-amz-target": "AmazonCodeWhispererService.ListAvailableModels",
      "x-amz-user-agent": "aws-sdk-js/3.0.0 KiroIDE/1.4.154 KAS/0.66.92-hotfix.5 os/win32 md/appVersion-1.4.154",
      "user-agent": "aws-sdk-js/3.0.0 KiroIDE/1.4.154 KAS/0.66.92-hotfix.5 os/win32 md/appVersion-1.4.154",
      "Content-Type": "application/x-amz-json-1.0",
      "Accept": "application/json",
    };

    if (token) {
      reqHeaders["Authorization"] = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
    }
    if (context.account?.providerSpecificData?.authMethod === "api-key") {
      reqHeaders["tokentype"] = "API_KEY";
    } else if (context.account?.providerSpecificData?.authMethod === "external_idp") {
      reqHeaders["TokenType"] = "EXTERNAL_IDP";
    }

    const candidateUrls = [
      `https://management.${resolveKiroServiceRegion("management", region)}.kiro.dev`,
      `https://codewhisperer.${resolveKiroServiceRegion("codewhisperer", region)}.amazonaws.com`,
      `https://q.${resolveKiroServiceRegion("q", region)}.amazonaws.com`,
    ];

    let lastError: string | undefined;

    for (const url of candidateUrls) {
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
          // Check for Coral exception payloads returned with HTTP 200
          if (payload?.__type?.includes("Exception") || payload?.Output?.__type?.includes("Exception")) {
            lastError = payload?.message || payload?.Output?.message || "Unknown Coral service exception";
            continue;
          }

          const models = extractModelsFromPayload(payload, this.id);
          if (models.length > 0) {
            return {
              success: true,
              endpointUrl: url,
              models,
              count: models.length,
            };
          }
        } else {
          lastError = `Endpoint ${url} returned HTTP ${res.status}: ${res.statusText}`;
        }
      } catch (err: unknown) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }

    return {
      success: false,
      error: lastError || "Failed to discover models from Kiro API endpoints",
    };
  }
}

export default KiroProvider;
