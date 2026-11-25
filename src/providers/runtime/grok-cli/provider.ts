import { OpenAiCompatibleProvider } from "../../core/base/openAiProvider.js";
import type { ModelCallResult, ProviderRequestContext, ProviderProbeContext, ProviderProbeResult } from "../../core/types.js";
import { buildResponsesRequestPayload } from "../../core/base/responsesPayloadBuilder.js";
import { executeResponsesUpstream } from "../../core/base/responsesExecution.js";
import { ProviderRepository } from "../../../storage/repositories/providerRepo.js";
import { executeGrokWebCookie } from "./grokWeb.js";
import { metadata } from "./metadata.js";

function isGrokCookieSession(context: ProviderRequestContext): boolean {
  const psd = ((context.account?.providerSpecificData || {}) as any);
  const token = context.account?.rawApiKey || "";
  return psd.authType === "cookie" || token.includes("sso=") || token.includes("connect.sid");
}

export class GrokSubscriptionProvider extends OpenAiCompatibleProvider {
  public override readonly id = metadata.id;
  public override readonly name = metadata.name;
  public override readonly defaultFormat = metadata.format || "openai-responses";

  public override buildUrl(context: ProviderRequestContext): string {
    if (isGrokCookieSession(context)) {
      return "https://grok.com/rest/app-chat/conversations/new";
    }
    return super.buildUrl(context);
  }

  public override async buildHeaders(context: ProviderRequestContext): Promise<Record<string, string>> {
    const headers = await super.buildHeaders(context);
    const token = (context.account?.rawApiKey || "").trim();

    if (isGrokCookieSession(context)) {
      headers["Cookie"] = token;
      delete headers["Authorization"];
    }
    return headers;
  }

  public override transformRequestBody(context: ProviderRequestContext): any {
    if (isGrokCookieSession(context)) {
      return super.transformRequestBody(context);
    }
    return buildResponsesRequestPayload(context, this.resolveUpstreamModelId(context), {
      forceStoreFalse: true,
      allowMaxOutputTokens: true,
      allowSamplingParams: true,
    });
  }

  public async execute(context: ProviderRequestContext): Promise<ModelCallResult> {
    if (isGrokCookieSession(context)) {
      return await executeGrokWebCookie(context);
    }
    return await executeResponsesUpstream(context, this);
  }

  public async handleAuthRefresh(context: ProviderRequestContext, status: number): Promise<boolean> {
    if (status !== 401 || !context.account || isGrokCookieSession(context)) return false;
    const account = context.account;
    const psd = ((account.providerSpecificData || {}) as Record<string, any>);
    let rToken = psd.refreshToken || psd.refresh_token;
    let parsedRaw: Record<string, any> | null = null;
    const trimmedRaw = (account.rawApiKey || "").trim();
    if (trimmedRaw.startsWith("{") && trimmedRaw.endsWith("}")) {
      try {
        parsedRaw = JSON.parse(trimmedRaw);
        rToken = rToken || parsedRaw?.refreshToken || parsedRaw?.refresh_token;
      } catch {}
    }
    const tokenUrl = metadata.oauth?.refreshUrl || metadata.oauth?.tokenUrl;
    const clientId = metadata.oauth?.clientId;
    if (!rToken || !tokenUrl || !clientId) return false;

    try {
      const refreshRes = await fetch(tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          ...(metadata.defaultHeaders || {}),
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: clientId,
          refresh_token: rToken,
        }),
      });
      if (!refreshRes.ok) return false;
      const data: any = await refreshRes.json();
      if (!data?.access_token) return false;
      const newExpiresAt = Date.now() + (Number(data.expires_in) || 3600) * 1000;
      const newRefreshToken = data.refresh_token || rToken;
      const updatedRawApiKey = parsedRaw
        ? JSON.stringify({
            ...parsedRaw,
            accessToken: data.access_token,
            refreshToken: newRefreshToken,
            expiresAt: newExpiresAt,
          })
        : data.access_token;
      const updatedPsd = { ...psd, refreshToken: newRefreshToken, expiresAt: newExpiresAt };
      account.rawApiKey = updatedRawApiKey;
      account.providerSpecificData = updatedPsd;
      if (account.id) {
        ProviderRepository.updateAccount(account.id, {
          rawApiKey: updatedRawApiKey,
          providerSpecificData: updatedPsd,
        });
      }
      return true;
    } catch {
      return false;
    }
  }

  public override async probeModels(context: ProviderProbeContext): Promise<ProviderProbeResult | null> {
    const token = (context.apiKey || context.account?.rawApiKey || "").trim();
    if (!token) {
      return {
        success: false,
        error: "Grok subscription token (OAuth or Web Cookie) is required.",
      };
    }

    const timeoutMs = context.timeoutMs || 8000;
    const isCookie = token.includes("sso=") || token.includes("connect.sid");

    if (isCookie) {
      try {
        const res = await fetch("https://grok.com/rest/app-chat/conversations/new", {
          method: "OPTIONS",
          headers: {
            Cookie: token,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (res.ok || res.status === 200 || res.status === 204) {
          return {
            success: true,
            endpointUrl: "https://grok.com/rest/app-chat/conversations/new",
            models: metadata.models.map((m) => ({ id: m.id, name: m.name, contextLength: m.contextLength })),
            count: metadata.models.length,
          };
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { success: false, error: `Failed to connect to grok.com: ${msg}` };
      }
    }

    // OAuth / Device Code token flow
    const testUrl = "https://cli-chat-proxy.grok.com/v1/models";
    try {
      const res = await fetch(testUrl, {
        method: "GET",
        headers: {
          Authorization: token.startsWith("Bearer ") ? token : `Bearer ${token}`,
          "User-Agent": "grok-shell/1.0.44 (linux; x86_64)",
          "x-grok-client-identifier": "grok-shell",
          "x-grok-client-version": "1.0.44",
          Accept: "application/json",
          ...(context.customHeaders || {}),
        },
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (res.ok || res.status === 200) {
        return {
          success: true,
          endpointUrl: testUrl,
          models: metadata.models.map((m) => ({ id: m.id, name: m.name, contextLength: m.contextLength })),
          count: metadata.models.length,
        };
      }

      if (res.status === 401 || res.status === 403) {
        return {
          success: false,
          error: `Authentication failed (HTTP ${res.status}): Invalid or expired Grok subscription token`,
          authError: "Invalid or expired Grok subscription token",
        };
      }

      return {
        success: false,
        error: `Endpoint ${testUrl} returned HTTP ${res.status}: ${res.statusText}`,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `Failed to connect to Grok: ${msg}`,
      };
    }
  }
}

export default GrokSubscriptionProvider;
