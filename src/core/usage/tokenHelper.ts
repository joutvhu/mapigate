import { ProviderRepository } from "../../storage/repositories/providerRepo.js";
import {
  ANTIGRAVITY_CLIENT_ID,
  ANTIGRAVITY_CLIENT_SECRET,
  GOOGLE_OAUTH_CLIENT_ID,
  GOOGLE_OAUTH_CLIENT_SECRET,
  CLAUDE_CLIENT_ID,
  CODEX_CLIENT_ID,
  CODEX_TOKEN_URL,
} from "../../server/routes/apiOAuth.js";
import {
  refreshCopilotToken,
  normalizeExpiryMs,
} from "../auth/copilotToken.js";

export interface ResolvedCredentials {
  accessToken: string;
  refreshToken?: string;
  apiKey?: string;
  expiresAt?: number;
  email?: string;
  providerSpecificData: Record<string, any>;
}

/**
 * Extracts and normalizes credentials from an account's rawApiKey and providerSpecificData
 */
export function extractCredentials(
  rawApiKey: string,
  providerSpecificData?: Record<string, any>
): ResolvedCredentials {
  const psd = providerSpecificData || {};
  let accessToken = "";
  let refreshToken = psd.refreshToken || "";
  let expiresAt = typeof psd.expiresAt === "number" ? psd.expiresAt : undefined;
  let email = psd.email || "";
  let apiKey = "";

  const trimmedKey = rawApiKey?.trim() || "";

  if (trimmedKey.startsWith("{") && trimmedKey.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmedKey);
      accessToken = parsed.accessToken || parsed.access_token || "";
      if (parsed.refreshToken || parsed.refresh_token) {
        refreshToken = parsed.refreshToken || parsed.refresh_token;
      }
      if (parsed.expiresAt) {
        expiresAt = Number(parsed.expiresAt);
      }
      if (parsed.email) {
        email = parsed.email;
      }
      if (parsed.apiKey || parsed.api_key) {
        apiKey = parsed.apiKey || parsed.api_key;
      }
    } catch {
      accessToken = trimmedKey;
      apiKey = trimmedKey;
    }
  } else {
    accessToken = trimmedKey;
    apiKey = trimmedKey;
  }

  // If specific copilotToken exists in PSD, use it as active accessToken / apiKey
  if (psd.copilotToken) {
    accessToken = psd.copilotToken;
    apiKey = psd.copilotToken;
  } else {
    // Fallback to PSD if token wasn't in rawApiKey
    if (!accessToken && psd.accessToken) {
      accessToken = psd.accessToken;
    }
    if (!apiKey && psd.apiKey) {
      apiKey = psd.apiKey;
    }
  }
  if (expiresAt === undefined && typeof psd.copilotTokenExpiresAt === "number") {
    expiresAt = normalizeExpiryMs(psd.copilotTokenExpiresAt) || undefined;
  }

  return {
    accessToken,
    refreshToken: refreshToken || undefined,
    apiKey: apiKey || undefined,
    expiresAt,
    email: email || undefined,
    providerSpecificData: psd,
  };
}

/**
 * Checks if a token is expired with a 60-second safety window.
 * Normalizes seconds timestamp (< 1e12) if needed.
 */
export function isTokenExpired(expiresAt?: number): boolean {
  if (!expiresAt || !Number.isFinite(expiresAt)) return false;
  const expiresAtMs = expiresAt < 1e12 ? expiresAt * 1000 : expiresAt;
  return Date.now() > expiresAtMs - 60_000;
}

/**
 * Attempts to refresh expired OAuth credentials and persist them back to SQLite
 */
export async function ensureFreshCredentials(
  accountId: string,
  providerId: string,
  rawApiKey: string,
  providerSpecificData?: Record<string, any>
): Promise<ResolvedCredentials> {
  const creds = extractCredentials(rawApiKey, providerSpecificData);
  const pId = providerId.toLowerCase();

  // If not expired and access token is present, return as is
  if (!isTokenExpired(creds.expiresAt) && creds.accessToken) {
    return creds;
  }

  // 0. GitHub Copilot (uses githubAccessToken or rawApiKey to mint Copilot token)
  if (pId === "github") {
    try {
      const refreshed = await refreshCopilotToken({
        githubAccessToken: creds.providerSpecificData.githubAccessToken,
        rawApiKey,
        refreshToken: creds.refreshToken,
        copilotToken: creds.providerSpecificData.copilotToken,
        copilotTokenExpiresAt: creds.providerSpecificData.copilotTokenExpiresAt,
      });

      if (refreshed) {
        const updatedPsd = {
          ...creds.providerSpecificData,
          copilotToken: refreshed.copilotToken,
          copilotTokenExpiresAt: refreshed.copilotTokenExpiresAt,
          ...(refreshed.githubAccessToken ? { githubAccessToken: refreshed.githubAccessToken } : {}),
          ...(refreshed.refreshToken ? { refreshToken: refreshed.refreshToken } : {}),
        };

        ProviderRepository.updateAccount(accountId, {
          providerSpecificData: updatedPsd,
        });

        const newExpiresAt = normalizeExpiryMs(refreshed.copilotTokenExpiresAt) || undefined;
        return {
          ...creds,
          accessToken: refreshed.copilotToken,
          apiKey: refreshed.copilotToken,
          expiresAt: newExpiresAt,
          providerSpecificData: updatedPsd,
        };
      }
    } catch (err) {
      console.warn(`[QuotaService] Failed to auto-refresh Copilot token for account ${accountId}:`, err);
    }
    return creds;
  }

  if (!creds.refreshToken) {
    return creds;
  }

  try {
    let newAccessToken = "";
    let newRefreshToken = creds.refreshToken;
    let expiresInSec = 3600;

    // 1. Google Antigravity
    if (pId === "antigravity") {
      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: creds.refreshToken,
          client_id: ANTIGRAVITY_CLIENT_ID,
          client_secret: ANTIGRAVITY_CLIENT_SECRET,
        }),
      });
      if (res.ok) {
        const data: any = await res.json();
        newAccessToken = data.access_token;
        if (data.refresh_token) newRefreshToken = data.refresh_token;
        if (data.expires_in) expiresInSec = Number(data.expires_in);
      }
    }

    // 2. Gemini / Gemini CLI
    else if (pId === "gemini-cli" || pId === "gemini") {
      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: creds.refreshToken,
          client_id: GOOGLE_OAUTH_CLIENT_ID,
          client_secret: GOOGLE_OAUTH_CLIENT_SECRET,
        }),
      });
      if (res.ok) {
        const data: any = await res.json();
        newAccessToken = data.access_token;
        if (data.refresh_token) newRefreshToken = data.refresh_token;
        if (data.expires_in) expiresInSec = Number(data.expires_in);
      }
    }

    // 3. Claude Code
    else if (pId === "claude") {
      const res = await fetch("https://api.anthropic.com/v1/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: CLAUDE_CLIENT_ID,
          refresh_token: creds.refreshToken,
        }),
      });
      if (res.ok) {
        const data: any = await res.json();
        newAccessToken = data.access_token;
        if (data.refresh_token) newRefreshToken = data.refresh_token;
        if (data.expires_in) expiresInSec = Number(data.expires_in);
      }
    }

    // 4. OpenAI Codex
    else if (pId === "codex") {
      const res = await fetch(CODEX_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: CODEX_CLIENT_ID,
          refresh_token: creds.refreshToken,
        }),
      });
      if (res.ok) {
        const data: any = await res.json();
        newAccessToken = data.access_token;
        if (data.refresh_token) newRefreshToken = data.refresh_token;
        if (data.expires_in) expiresInSec = Number(data.expires_in);
      }
    }

    // 5. Kiro Code
    else if (pId === "kiro") {
      const tokenUrl = "https://prod.us-east-1.auth.desktop.kiro.dev/refreshToken";
      const clientId = creds.providerSpecificData.clientId;
      const clientSecret = creds.providerSpecificData.clientSecret;
      if (clientId && clientSecret) {
        const res = await fetch(tokenUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            refreshToken: creds.refreshToken,
            clientId,
            clientSecret,
          }),
        });
        if (res.ok) {
          const data: any = await res.json();
          newAccessToken = data.accessToken || data.access_token;
          if (data.refreshToken) newRefreshToken = data.refreshToken;
          if (data.expiresIn) expiresInSec = Number(data.expiresIn);
        }
      }
    }

    if (newAccessToken) {
      const newExpiresAt = Date.now() + expiresInSec * 1000;
      const updatedPsd = {
        ...creds.providerSpecificData,
        refreshToken: newRefreshToken,
        expiresAt: newExpiresAt,
      };

      let newRawApiKey = newAccessToken;
      if (rawApiKey.trim().startsWith("{")) {
        try {
          const existingJson = JSON.parse(rawApiKey);
          newRawApiKey = JSON.stringify({
            ...existingJson,
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
            expiresAt: newExpiresAt,
          });
        } catch {
          newRawApiKey = JSON.stringify({
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
            expiresAt: newExpiresAt,
          });
        }
      }

      // Persist refreshed credentials to DB
      ProviderRepository.updateAccount(accountId, {
        rawApiKey: newRawApiKey,
        providerSpecificData: updatedPsd,
      });

      return {
        ...creds,
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        expiresAt: newExpiresAt,
        providerSpecificData: updatedPsd,
      };
    }
  } catch (err) {
    console.warn(`[QuotaService] Failed to auto-refresh token for account ${accountId} (${providerId}):`, err);
  }

  return creds;
}
