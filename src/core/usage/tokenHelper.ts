import { ProviderRepository } from "../../storage/repositories/providerRepo.js";
import { OAuthHandlerRegistry } from "../../providers/core/oauthRegistry.js";
import { normalizeExpiryMs } from "../auth/copilotToken.js";

export interface ResolvedCredentials {
  accessToken: string;
  refreshToken?: string;
  apiKey?: string;
  expiresAt?: number;
  email?: string;
  githubAccessToken?: string;
  projectId?: string;
  copilotToken?: string;
  copilotTokenExpiresAt?: number;
  providerSpecificData: Record<string, any>;
}

/**
 * Extracts and normalizes credentials from an account's rawApiKey and providerSpecificData
 */
export function extractCredentials(
  rawApiKey: string,
  providerSpecificData?: Record<string, any>,
  providerId?: string
): ResolvedCredentials {
  const psd: Record<string, any> = { ...(providerSpecificData || {}) };
  const pId = (providerId || psd.providerId || psd.provider || "").toLowerCase();
  let accessToken = "";
  let refreshToken = psd.refreshToken || "";
  let expiresAt =
    typeof psd.expiresAt === "number"
      ? psd.expiresAt
      : typeof psd.tokenExpiresAt === "number"
      ? psd.tokenExpiresAt
      : undefined;
  let email = psd.email || "";
  let apiKey = "";
  let githubAccessToken = psd.githubAccessToken || "";
  let projectId = psd.projectId || "";

  const trimmedKey = rawApiKey?.trim() || "";

  if (pId === "zed") {
    // Zed v2 native-app access token is an encrypted JSON struct: {"version":2,"id":"client_token_...","token":"..."}.
    // Zed API server requires this exact JSON string as the token in `Authorization: <userId> <jsonToken>`.
    return {
      accessToken: trimmedKey,
      apiKey: trimmedKey,
      refreshToken,
      expiresAt,
      email,
      githubAccessToken: "",
      projectId: "",
      providerSpecificData: psd,
    };
  }

  if (trimmedKey.startsWith("{") && trimmedKey.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmedKey);
      accessToken = parsed.accessToken || parsed.access_token || parsed.token || "";
      if (parsed.refreshToken || parsed.refresh_token) {
        refreshToken = parsed.refreshToken || parsed.refresh_token;
      }
      if (parsed.expiresAt || parsed.expires_at) {
        expiresAt = Number(parsed.expiresAt || parsed.expires_at);
      } else if (parsed.expiresIn || parsed.expires_in) {
        expiresAt = Date.now() + Number(parsed.expiresIn || parsed.expires_in) * 1000;
      }
      if (parsed.email) {
        email = parsed.email;
      }
      if (parsed.apiKey || parsed.api_key || parsed.key) {
        apiKey = parsed.apiKey || parsed.api_key || parsed.key;
      }
      if (parsed.githubAccessToken || parsed.github_access_token) {
        githubAccessToken = parsed.githubAccessToken || parsed.github_access_token;
      }
      if (parsed.projectId || parsed.project_id) {
        projectId = parsed.projectId || parsed.project_id;
      }
      if (parsed.copilotToken || parsed.copilot_token) {
        psd.copilotToken = parsed.copilotToken || parsed.copilot_token;
      }
      if (parsed.copilotTokenExpiresAt || parsed.copilot_token_expires_at) {
        psd.copilotTokenExpiresAt = parsed.copilotTokenExpiresAt || parsed.copilot_token_expires_at;
      }
    } catch {
      accessToken = trimmedKey;
      apiKey = trimmedKey;
    }
  } else {
    accessToken = trimmedKey;
    apiKey = trimmedKey;
  }

  // Preserve githubAccessToken if present in rawApiKey or parsed JSON
  if (!githubAccessToken) {
    if (
      accessToken.startsWith("gho_") ||
      accessToken.startsWith("ghu_") ||
      accessToken.startsWith("ghp_") ||
      accessToken.startsWith("github_pat_") ||
      ((pId === "github" || pId === "copilot") && accessToken && !accessToken.startsWith("tid="))
    ) {
      githubAccessToken = accessToken;
    } else if (
      trimmedKey.startsWith("gho_") ||
      trimmedKey.startsWith("ghu_") ||
      trimmedKey.startsWith("ghp_") ||
      trimmedKey.startsWith("github_pat_")
    ) {
      githubAccessToken = trimmedKey;
    } else if (
      !trimmedKey.startsWith("{") &&
      !trimmedKey.startsWith("tid=") &&
      !trimmedKey.startsWith("token ") &&
      (pId === "github" || pId === "copilot")
    ) {
      // If copilotToken is in PSD, trimmedKey was the original OAuth token
      if (psd.copilotToken && trimmedKey !== psd.copilotToken) {
        githubAccessToken = trimmedKey;
      }
    }
  }

  if (!githubAccessToken && psd.githubAccessToken) {
    githubAccessToken = psd.githubAccessToken;
  }

  if (githubAccessToken && !psd.githubAccessToken) {
    psd.githubAccessToken = githubAccessToken;
  }

  // Kiro: if accessToken starts with "aor" (AWS OIDC refresh token), treat it as refreshToken
  if (pId === "kiro") {
    if (accessToken.startsWith("aor")) {
      if (!refreshToken) refreshToken = accessToken;
      accessToken = psd.accessToken || "";
    }
    if (trimmedKey.startsWith("aor") && !refreshToken) {
      refreshToken = trimmedKey;
    }
  }

  // If specific copilotToken exists in PSD, use it as active accessToken / apiKey for chat calls
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

  if (githubAccessToken && !psd.githubAccessToken) {
    psd.githubAccessToken = githubAccessToken;
  }
  if (projectId && !psd.projectId) {
    psd.projectId = projectId;
  }

  return {
    accessToken,
    refreshToken: refreshToken || undefined,
    apiKey: apiKey || undefined,
    expiresAt,
    email: email || undefined,
    githubAccessToken: githubAccessToken || undefined,
    projectId: projectId || undefined,
    copilotToken: psd.copilotToken || undefined,
    copilotTokenExpiresAt: typeof psd.copilotTokenExpiresAt === "number" ? psd.copilotTokenExpiresAt : undefined,
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
 * Delegates provider-specific token refresh to each provider's own OAuthHandler.
 */
export async function ensureFreshCredentials(
  accountId: string,
  providerId: string,
  rawApiKey: string,
  providerSpecificData?: Record<string, any>,
  forceRefresh = false
): Promise<ResolvedCredentials> {
  const creds = extractCredentials(rawApiKey, providerSpecificData, providerId);
  const pId = providerId.toLowerCase();

  const isKiroPlaceholder = pId === "kiro" && creds.accessToken?.startsWith("aor");

  // If not force refresh, not expired, and valid access token is present, return as is
  if (!forceRefresh && !isTokenExpired(creds.expiresAt) && creds.accessToken && !isKiroPlaceholder) {
    return creds;
  }

  // Look up provider's own registered OAuth handler
  const handler = OAuthHandlerRegistry.get(pId);
  if (typeof handler?.refreshToken !== "function") {
    return creds;
  }

  try {
    const refreshed = await handler.refreshToken({
      refreshToken: creds.refreshToken || "",
      rawApiKey,
      providerSpecificData: creds.providerSpecificData,
      providerId: pId,
      accountId,
      forceRefresh,
    });

    if (refreshed?.accessToken) {
      const expiresInSec = refreshed.expiresIn || 3600;
      const newExpiresAt = refreshed.expiresAt || (Date.now() + expiresInSec * 1000);
      const newRefreshToken = refreshed.refreshToken || creds.refreshToken;

      const updatedPsd = {
        ...creds.providerSpecificData,
        ...(refreshed.providerSpecificData || {}),
        refreshToken: newRefreshToken,
        expiresAt: newExpiresAt,
        tokenExpiresAt: newExpiresAt,
      };

      let newRawApiKey = refreshed.rawApiKey || refreshed.accessToken;
      if (!refreshed.rawApiKey && rawApiKey.trim().startsWith("{")) {
        try {
          const existingJson = JSON.parse(rawApiKey);
          newRawApiKey = JSON.stringify({
            ...existingJson,
            accessToken: refreshed.accessToken,
            refreshToken: newRefreshToken,
            expiresAt: newExpiresAt,
          });
        } catch {
          newRawApiKey = JSON.stringify({
            accessToken: refreshed.accessToken,
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
        accessToken: refreshed.accessToken,
        apiKey: refreshed.accessToken,
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
