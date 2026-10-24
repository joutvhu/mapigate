import { OpenAiCompatibleProvider } from "../../core/base/openAiProvider.js";
import type { ProviderUsageContext, RawProviderQuotaResult } from "../../../core/usage/types.js";
import type { ProviderProbeContext, ProviderProbeResult } from "../../core/types.js";
import { getGeminiUsage } from "./quota.js";
import { getPublicDnsAgent } from "../../../shared/utils/dnsResolver.js";
import { refreshGoogleOAuthToken } from "../antigravity/routes.js";
import { fetch as undiciFetch } from "undici";
import { extractModelsFromPayload } from "../../../core/scanner/payloadExtractor.js";
import { ProviderRepository } from "../../../storage/repositories/providerRepo.js";

export class GeminiProvider extends OpenAiCompatibleProvider {
  public override readonly id = "gemini";
  public override readonly name = "Google Gemini";
  public override readonly defaultFormat = "openai";

  public override supportsQuota(): boolean {
    return true;
  }

  public async fetchQuota(context: ProviderUsageContext): Promise<RawProviderQuotaResult> {
    return await getGeminiUsage(context.account.rawApiKey, context.account.providerSpecificData);
  }

  public override async probeModels(context: ProviderProbeContext): Promise<ProviderProbeResult | null> {
    const account = context.account;
    const psd = ((account?.providerSpecificData || context.providerSpecificData || {}) as any);
    const timeoutMs = context.timeoutMs || 6000;

    let token = (context.apiKey || account?.rawApiKey || "").trim();
    if (token.startsWith("{") && token.endsWith("}")) {
      try {
        const parsed = JSON.parse(token);
        token = parsed.accessToken || parsed.access_token || parsed.token || parsed.apiKey || token;
      } catch {}
    }
    if (!token && psd.accessToken) {
      token = psd.accessToken;
    }

    const isCloudCode =
      token.startsWith("ya29.") ||
      context.baseUrl?.includes("cloudcode-pa.googleapis.com") ||
      (this.id as string) === "gemini-cli";

    // 1. Google Cloud Code / Gemini CLI (OAuth flow)
    if (isCloudCode) {
      const projectId = psd.projectId || "aicode-consumers";
      const endpoints = [
        {
          url: "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist",
          body: JSON.stringify({ metadata: { ideType: 9, platform: 5, pluginType: 2 } }),
        },
        {
          url: "https://daily-cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels",
          body: JSON.stringify({ project: projectId }),
        },
      ];

      const reqHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        "User-Agent": "antigravity/hub/2.24.0 darwin/arm64",
        "X-Client-Name": "antigravity",
        "X-Client-Version": "2.24.0",
        "x-request-source": "local",
        Accept: "application/json",
        ...(context.customHeaders || {}),
      };
      delete reqHeaders["x-goog-api-key"];
      delete reqHeaders["X-GOOG-API-KEY"];

      if (token) {
        reqHeaders["Authorization"] = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
      }

      let authError: string | null = null;
      let lastError: string | null = null;

      for (const ep of endpoints) {
        try {
          const fetchOptions: any = {
            method: "POST",
            headers: reqHeaders,
            body: ep.body,
            signal: AbortSignal.timeout(timeoutMs),
            dispatcher: getPublicDnsAgent(),
          };

          let response = ((await undiciFetch(ep.url, fetchOptions)) as unknown as globalThis.Response);

          if (response.status === 401) {
            let rToken = psd.refreshToken || psd.refresh_token;
            if (rToken) {
              try {
                const refreshed = await refreshGoogleOAuthToken(rToken);
                if (refreshed?.accessToken) {
                  token = refreshed.accessToken;
                  reqHeaders["Authorization"] = `Bearer ${token}`;
                  if (account?.id) {
                    ProviderRepository.updateAccount(account.id, {
                      providerSpecificData: {
                        ...psd,
                        refreshToken: refreshed.refreshToken || rToken,
                        expiresAt: Date.now() + (refreshed.expiresIn || 3600) * 1000,
                      },
                    });
                  }
                  response = ((await undiciFetch(ep.url, { ...fetchOptions, headers: reqHeaders })) as unknown as globalThis.Response);
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
                endpointUrl: ep.url,
                models: scanned,
                count: scanned.length,
              };
            }
            if (payload.cloudaicompanionProject || payload.allowedTiers || ep.url.includes("loadCodeAssist")) {
              if (payload.cloudaicompanionProject && account?.id) {
                const companionId =
                  payload.cloudaicompanionProject.id ||
                  (typeof payload.cloudaicompanionProject === "string" ? payload.cloudaicompanionProject : "");
                if (companionId) {
                  ProviderRepository.updateAccount(account.id, {
                    providerSpecificData: {
                      ...psd,
                      projectId: companionId,
                    },
                  });
                }
              }
              return {
                success: true,
                endpointUrl: ep.url,
                count: 1,
              };
            }
          }

          if (response.status === 401 || response.status === 403) {
            authError = `Authentication failed (HTTP ${response.status}) for account "${account?.name || this.name}". Please verify credentials.`;
          } else {
            lastError = `Endpoint ${ep.url} returned HTTP ${response.status}: ${response.statusText}`;
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          lastError = `Failed to connect to ${ep.url}: ${msg}`;
        }
      }

      return {
        success: false,
        error: authError || lastError || "Failed to probe Gemini Cloud Code models",
        authError: authError || undefined,
      };
    }

    // 2. Google AI Studio API Key flow
    if (token) {
      const testUrls = [
        `https://generativelanguage.googleapis.com/v1beta/models?key=${token}`,
        `https://generativelanguage.googleapis.com/v1/models?key=${token}`,
      ];

      for (const url of testUrls) {
        try {
          const res = await fetch(url, {
            method: "GET",
            headers: {
              Accept: "application/json",
              ...(context.customHeaders || {}),
            },
            signal: AbortSignal.timeout(timeoutMs),
          });

          if (res.ok || res.status === 200) {
            const payload: any = await res.json();
            const models = extractModelsFromPayload(payload, this.id);
            return {
              success: true,
              endpointUrl: url,
              models: models.length > 0 ? models : undefined,
              count: models.length,
            };
          }

          if (res.status === 400 || res.status === 401 || res.status === 403) {
            let errText = "Invalid Google AI Studio API key";
            try {
              const errPayload: any = await res.json();
              if (errPayload?.error?.message) errText = errPayload.error.message;
            } catch {}
            return {
              success: false,
              error: `Authentication failed (HTTP ${res.status}): ${errText}`,
              authError: errText,
            };
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return {
            success: false,
            error: `Failed to connect to Google Gemini: ${msg}`,
          };
        }
      }
    }

    // Fall back to default BaseProvider probe
    return super.probeModels(context);
  }
}

export default GeminiProvider;
