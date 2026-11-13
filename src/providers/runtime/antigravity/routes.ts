import crypto from "node:crypto";
import type { Router } from "express";
import { fetchWithDnsBypass } from "../../../shared/utils/dnsResolver.js";
import { ProviderRepository } from "../../../storage/repositories/providerRepo.js";
import { OAuthHandlerRegistry } from "../../core/oauthRegistry.js";
import type {
  ProviderOAuthHandler,
  OAuthAuthorizeParams,
  OAuthAuthorizeResult,
  OAuthExchangeParams,
  OAuthExchangeResult,
  OAuthRefreshTokenParams,
  OAuthRefreshTokenResult,
} from "../../core/oauthTypes.js";
import { resolvePublicCred } from "../../../shared/utils/publicCreds.js";

export const ANTIGRAVITY_CLIENT_ID = resolvePublicCred("antigravity_client_id");
export const ANTIGRAVITY_CLIENT_SECRET = resolvePublicCred("antigravity_client_secret");
export const ANTIGRAVITY_SCOPES = [
  "https://www.googleapis.com/auth/cloud-platform",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/cclog",
  "https://www.googleapis.com/auth/experimentsandconfigs",
];

function getPlatformId(): number {
  if (process.platform === "win32") return 5;
  if (process.platform === "darwin") return process.arch === "arm64" ? 2 : 1;
  return process.arch === "arm64" ? 4 : 3;
}

export async function refreshGoogleOAuthToken(
  refreshToken: string,
  clientId = ANTIGRAVITY_CLIENT_ID,
  clientSecret = ANTIGRAVITY_CLIENT_SECRET
): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number } | null> {
  if (!refreshToken) return null;
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresIn: Number(data.expires_in) || 3600,
    };
  } catch {
    return null;
  }
}

export async function loadCodeAssist(accessToken: string): Promise<{ projectId: string; tierId: string }> {
  let projectId = "";
  let tierId = "legacy-tier";
  try {
    const res = await fetchWithDnsBypass("https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "User-Agent": "antigravity/hub/2.31.2 darwin/arm64",
        "x-request-source": "local",
      },
      body: JSON.stringify({ metadata: { ideType: 9, platform: getPlatformId(), pluginType: 2 } }),
    });
    if (res.ok) {
      const data: any = await res.json();
      projectId = data.cloudaicompanionProject?.id || (typeof data.cloudaicompanionProject === "string" ? data.cloudaicompanionProject : "");
      if (Array.isArray(data.allowedTiers)) {
        for (const tier of data.allowedTiers) {
          if (tier.isDefault && tier.id) {
            tierId = tier.id.trim();
            break;
          }
        }
      }
    }
  } catch {}
  return { projectId, tierId };
}

export function onboardUser(accessToken: string, tierId: string): void {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "User-Agent": "antigravity/hub/2.31.2 darwin/arm64",
    "x-request-source": "local",
  };
  (async () => {
    for (let i = 0; i < 10; i++) {
      try {
        const res = await fetchWithDnsBypass("https://cloudcode-pa.googleapis.com/v1internal:onboardUser", {
          method: "POST",
          headers,
          body: JSON.stringify({ tierId, metadata: { ideType: 9, platform: getPlatformId(), pluginType: 2 } }),
        });
        if (res.ok) {
          const data: any = await res.json();
          if (data.done === true) break;
        }
      } catch {
        break;
      }
      await new Promise((r) => setTimeout(r, 5000));
    }
  })().catch(() => {});
}

export const antigravityOAuthHandler: ProviderOAuthHandler = {
  id: "antigravity",

  authorize(params: OAuthAuthorizeParams): OAuthAuthorizeResult {
    const urlParams = new URLSearchParams({
      client_id: ANTIGRAVITY_CLIENT_ID,
      response_type: "code",
      redirect_uri: params.redirectUri,
      scope: ANTIGRAVITY_SCOPES.join(" "),
      state: params.state || "",
      access_type: "offline",
      prompt: "consent",
    });
    return {
      authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${urlParams.toString()}`,
      redirectUri: params.redirectUri,
      state: params.state,
      flowType: "authorization_code",
    };
  },

  async exchange(params: OAuthExchangeParams): Promise<OAuthExchangeResult> {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: ANTIGRAVITY_CLIENT_ID,
        client_secret: ANTIGRAVITY_CLIENT_SECRET,
        code: params.code,
        redirect_uri: params.redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      return { success: false, error: `Google OAuth exchange failed: ${errText}` };
    }

    const tokenData: any = await tokenRes.json();
    const accessToken = tokenData.access_token;
    if (!accessToken) return { success: false, error: "No access token received from Google" };

    let accountName = "Antigravity Google Account";
    try {
      const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo?alt=json", {
        headers: { Authorization: `Bearer ${accessToken}`, "x-request-source": "local" },
      });
      if (userRes.ok) {
        const userData: any = await userRes.json();
        if (userData.email) accountName = userData.email;
      }
    } catch {}

    const { projectId, tierId } = await loadCodeAssist(accessToken);
    if (projectId) onboardUser(accessToken, tierId);

    ProviderRepository.ensureProviderExists("antigravity");
    const accountId = `acc_${crypto.randomUUID().slice(0, 8)}`;
    const refreshToken = tokenData.refresh_token || undefined;
    const expiresIn = Number(tokenData.expires_in) || 3600;

    ProviderRepository.addAccount({
      id: accountId,
      providerId: "antigravity",
      name: accountName,
      rawApiKey: JSON.stringify({ accessToken, refreshToken, expiresAt: Date.now() + expiresIn * 1000, projectId: projectId || undefined }),
      providerSpecificData: {
        email: accountName,
        refreshToken,
        expiresAt: Date.now() + expiresIn * 1000,
        projectId: projectId || undefined,
        tierId: tierId || undefined,
      },
    });

    return { success: true, account: { id: accountId, name: accountName, providerId: "antigravity" } };
  },

  async refreshToken(params: OAuthRefreshTokenParams): Promise<OAuthRefreshTokenResult | null> {
    const refreshed = await refreshGoogleOAuthToken(params.refreshToken);
    if (!refreshed?.accessToken) return null;
    return {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      expiresIn: refreshed.expiresIn,
    };
  },
};

export function registerRoutes(_router?: Router): void {
  OAuthHandlerRegistry.register("antigravity", antigravityOAuthHandler);
}
