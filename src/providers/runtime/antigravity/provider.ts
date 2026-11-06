import { BaseProvider } from "../../core/base/baseProvider.js";
import type {
  ProviderRequestContext,
  SingleModelHandler,
  ModelCallResult,
  ProviderProbeContext,
  ProviderProbeResult,
} from "../../core/types.js";
import type { ProviderUsageContext, RawProviderQuotaResult } from "../../../core/usage/types.js";
import { getAntigravityUsage } from "./quota.js";
import { refreshGoogleOAuthToken } from "./routes.js";
import { executeAntigravity } from "./executor.js";
import { ProviderRepository } from "../../../storage/repositories/providerRepo.js";
import { logger, LogSymbol } from "../../../shared/logger.js";
import { getPublicDnsAgent } from "../../../shared/utils/dnsResolver.js";
import { fetch as undiciFetch } from "undici";
import { extractModelsFromPayload } from "../../../core/scanner/payloadExtractor.js";
import { metadata } from "./metadata.js";

export class AntigravityProvider extends BaseProvider {
  public readonly id = "antigravity";
  public readonly name = "Google Antigravity";
  public readonly defaultFormat = "openai";

  public override supportsQuota(): boolean {
    return true;
  }

  public async execute(
    context: ProviderRequestContext,
    _dispatchSingleModel: SingleModelHandler
  ): Promise<ModelCallResult> {
    return await executeAntigravity(context, this);
  }

  public async fetchQuota(context: ProviderUsageContext): Promise<RawProviderQuotaResult> {
    return await getAntigravityUsage(
      context.account.rawApiKey,
      context.account.providerSpecificData,
      { force: context.force }
    );
  }

  public async handleAuthRefresh(
    context: ProviderRequestContext,
    status: number
  ): Promise<boolean> {
    if (status !== 401 || !context.account) return false;

    const psd = context.account.providerSpecificData || {};
    let refreshToken = psd.refreshToken;
    let oauthJson: any = null;

    if (context.account.rawApiKey.startsWith("{") && context.account.rawApiKey.includes("accessToken")) {
      try {
        oauthJson = JSON.parse(context.account.rawApiKey);
        refreshToken = oauthJson.refreshToken || refreshToken;
      } catch {}
    }

    if (!refreshToken) return false;

    try {
      const refreshed = await refreshGoogleOAuthToken(refreshToken);
      if (refreshed?.accessToken) {
        logger.line(
          context.reqTag || "AUTH",
          LogSymbol.KEY,
          `Google OAuth token refreshed on 401 retry · ${this.id}/${context.targetModel}`
        );
        const now = Date.now();
        const updatedJson = {
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken || refreshToken,
          expiresAt: now + (refreshed.expiresIn || 3600) * 1000,
        };
        context.account.rawApiKey = refreshed.accessToken;
        ProviderRepository.updateAccount(context.account.id, {
          rawApiKey: JSON.stringify(updatedJson),
          providerSpecificData: {
            ...psd,
            refreshToken: updatedJson.refreshToken,
            expiresAt: updatedJson.expiresAt,
          },
        });
        return true;
      }
    } catch (err: any) {
      logger.warn(
        "ANTIGRAVITY",
        `Antigravity token refresh failed: ${err.message}`
      );
    }
    return false;
  }

  public override async probeModels(context: ProviderProbeContext): Promise<ProviderProbeResult | null> {
    const account = context.account;
    const psd = ((account?.providerSpecificData || context.providerSpecificData || {}) as any);

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

    const timeoutMs = context.timeoutMs || 6000;
    const projectId = psd.projectId || "aicode-consumers";

    const endpoints = [
      {
        url: "https://daily-cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels",
        body: JSON.stringify({ project: projectId }),
      },
      {
        url: "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist",
        body: JSON.stringify({ metadata: { ideType: 9, platform: 5, pluginType: 2 } }),
      },
    ];

    const reqHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "antigravity/hub/2.29.0 darwin/arm64",
      "X-Client-Name": "antigravity",
      "X-Client-Version": "2.29.0",
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
          if (!rToken && account?.rawApiKey?.startsWith("{")) {
            try {
              const parsed = JSON.parse(account.rawApiKey);
              rToken = parsed.refreshToken || parsed.refresh_token;
            } catch {}
          }
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
          lastError = `Endpoint ${ep.url} returned HTTP ${response.status}: ${response.statusText}`;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        lastError = `Failed to connect to ${ep.url}: ${msg}`;
      }
    }

    return {
      success: false,
      error: authError || lastError || "Failed to probe Antigravity models",
      authError: authError || undefined,
    };
  }
}

export default AntigravityProvider;
