import { OpenAiCompatibleProvider } from "../../core/base/openAiProvider.js";
import type { ProviderRequestContext, ProviderProbeContext, ProviderProbeResult } from "../../core/types.js";
import type { ProviderUsageContext, RawProviderQuotaResult } from "../../../core/usage/types.js";
import { getCodexUsage } from "./quota.js";
import {
  sanitizeCodexTools,
  convertSystemToDeveloperRole,
  stripStoredItemReferences,
} from "./schemaSanitizer.js";
import { ProviderRepository } from "../../../storage/repositories/providerRepo.js";
import { extractModelsFromPayload } from "../../../core/scanner/payloadExtractor.js";
import { checkBinaryInstalled } from "../../core/base/baseProvider.js";
import { metadata } from "./metadata.js";

export class CodexProvider extends OpenAiCompatibleProvider {
  public override readonly id = "codex";
  public override readonly name = "OpenAI Codex";
  public override readonly defaultFormat = "openai";

  public override supportsQuota(): boolean {
    return true;
  }

  public async fetchQuota(context: ProviderUsageContext): Promise<RawProviderQuotaResult> {
    return await getCodexUsage(context.account.rawApiKey, context.account.providerSpecificData);
  }

  public override transformRequestBody(context: ProviderRequestContext): any {
    const body = super.transformRequestBody(context);
    if (body && typeof body === "object") {
      sanitizeCodexTools(body);
      convertSystemToDeveloperRole(body);
      stripStoredItemReferences(body);
    }
    return body;
  }

  public override async probeModels(context: ProviderProbeContext): Promise<ProviderProbeResult | null> {
    const account = context.account;
    const psd = ((account?.providerSpecificData || context.providerSpecificData || {}) as any);

    let token = (context.apiKey || account?.rawApiKey || "").trim();
    let chatgptAccountId = psd.chatgptAccountId || psd.accountId || psd.workspaceId;

    if (token.startsWith("{") && token.endsWith("}")) {
      try {
        const parsed = JSON.parse(token);
        token = parsed.accessToken || parsed.access_token || parsed.token || parsed.apiKey || token;
        chatgptAccountId = chatgptAccountId || parsed.chatgptAccountId || parsed.accountId;
      } catch {}
    }

    const rawBase = (context.baseUrl || psd.baseUrl || "").trim();
    if (rawBase.startsWith("codex-app-server://") || (!token && rawBase.endsWith("/websocket"))) {
      const isInstalled = await checkBinaryInstalled("codex");
      if (isInstalled) {
        return {
          success: true,
          endpointUrl: rawBase,
          models: metadata.models.map((m) => ({ id: m.id, name: m.name, contextLength: m.contextLength })),
          count: metadata.models.length,
        };
      }
      return {
        success: false,
        error: `Codex App-Server CLI binary "codex" not found locally. Please install Codex CLI or connect via ChatGPT OAuth.`,
      };
    }

    const timeoutMs = context.timeoutMs || 6000;
    const endpoints = [
      "https://chatgpt.com/backend-api/codex/models?client_version=0.159.0",
      "https://chatgpt.com/backend-api/models",
      "https://chatgpt.com/backend-api/wham/usage",
    ];

    const reqHeaders: Record<string, string> = {
      originator: "codex_cli_rs",
      "User-Agent": "codex_cli_rs/0.159.0",
      version: "0.159.0",
      Accept: "application/json",
      ...(context.customHeaders || {}),
    };

    if (chatgptAccountId) {
      reqHeaders["chatgpt-account-id"] = chatgptAccountId;
      reqHeaders["ChatGPT-Account-Id"] = chatgptAccountId;
    }
    if (token) {
      reqHeaders["Authorization"] = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
    }

    let authError: string | null = null;
    let lastError: string | null = null;

    for (const url of endpoints) {
      try {
        const fetchOptions: any = {
          method: "GET",
          headers: reqHeaders,
          signal: AbortSignal.timeout(timeoutMs),
        };

        let response = await fetch(url, fetchOptions);

        if (response.status === 401) {
          let rToken = psd.refreshToken || psd.refresh_token;
          if (!rToken && account?.rawApiKey?.startsWith("{")) {
            try {
              const parsed = JSON.parse(account.rawApiKey);
              rToken = parsed.refreshToken || parsed.refresh_token;
            } catch {}
          }
          if (rToken) {
            try {
              const refreshRes = await fetch("https://auth.openai.com/oauth/token", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
                body: new URLSearchParams({
                  grant_type: "refresh_token",
                  client_id: "REDACTED_CODEX_CLIENT_ID",
                  refresh_token: rToken,
                }),
              });
              if (refreshRes.ok) {
                const data: any = await refreshRes.json();
                if (data.access_token) {
                  token = data.access_token;
                  reqHeaders["Authorization"] = `Bearer ${token}`;
                  if (account?.id) {
                    ProviderRepository.updateAccount(account.id, {
                      providerSpecificData: {
                        ...psd,
                        refreshToken: data.refresh_token || rToken,
                        expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000,
                      },
                    });
                  }
                  response = await fetch(url, { ...fetchOptions, headers: reqHeaders });
                }
              }
            } catch {}
          }
        }

        if (response.ok || response.status === 200) {
          const payload: any = await response.json();
          const scanned = extractModelsFromPayload(payload, this.id);
          if (scanned.length > 0) {
            return {
              success: true,
              endpointUrl: url,
              models: scanned,
              count: scanned.length,
            };
          }
          if (payload.user_id || payload.plan_type || payload.rate_limit || url.includes("usage")) {
            return {
              success: true,
              endpointUrl: url,
              models: metadata.models.map((m) => ({
                id: m.id,
                name: m.name,
                contextLength: m.contextLength,
              })),
              count: metadata.models.length,
            };
          }
        }

        if (response.status === 401 || response.status === 403) {
          authError = `Authentication failed (HTTP ${response.status}) for account "${account?.name || this.name}". Please verify credentials.`;
        } else {
          lastError = `Endpoint ${url} returned HTTP ${response.status}: ${response.statusText}`;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        lastError = `Failed to connect to ${url}: ${msg}`;
      }
    }

    return {
      success: false,
      error: authError || lastError || "Failed to probe Codex models",
      authError: authError || undefined,
    };
  }
}

export default CodexProvider;
