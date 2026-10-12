import { ProviderRepository } from "../../storage/repositories/providerRepo.js";

export const COPILOT_INTERNAL_TOKEN_URL = "https://api.github.com/copilot_internal/v2/token";
export const GITHUB_OAUTH_TOKEN_URL = "https://github.com/login/oauth/access_token";
export const GITHUB_COPILOT_CLIENT_ID = "Iv1.REDACTED_GITHUB_CLIENT_ID";

/**
 * Default buffer before expiration to consider Copilot token expired (5 minutes)
 */
export const COPILOT_TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;

export interface CopilotTokenResponse {
  token: string;
  expires_at: number; // Unix timestamp in seconds
  refresh_in?: number;
  sku?: string;
  endpoints?: Record<string, string>;
}

export interface CopilotRefreshResult {
  copilotToken: string;
  copilotTokenExpiresAt: number;
  githubAccessToken?: string;
  refreshToken?: string;
}

/**
 * Normalizes expiration timestamp to milliseconds.
 * GitHub returns expires_at in seconds (< 1e12).
 */
export function normalizeExpiryMs(expiresAt?: number | null): number | null {
  if (expiresAt === undefined || expiresAt === null || !Number.isFinite(expiresAt) || expiresAt <= 0) {
    return null;
  }
  return expiresAt < 1e12 ? expiresAt * 1000 : expiresAt;
}

/**
 * Checks if a Copilot token is expired or within the expiration buffer (default 5 minutes).
 */
export function isCopilotTokenExpiring(
  expiresAt?: number | null,
  bufferMs: number = COPILOT_TOKEN_EXPIRY_BUFFER_MS
): boolean {
  const expiresAtMs = normalizeExpiryMs(expiresAt);
  if (expiresAtMs === null) {
    return true; // Missing or zero expiration -> consider expired/needed
  }
  return Date.now() >= expiresAtMs - bufferMs;
}

/**
 * Fetches a fresh Copilot internal token from GitHub using a GitHub OAuth / PAT token.
 */
export async function fetchCopilotInternalToken(
  githubAccessToken: string,
  fetchFn: typeof fetch = globalThis.fetch
): Promise<{ token: string; expiresAt: number } | null> {
  const cleanToken = githubAccessToken.trim();
  if (!cleanToken) return null;

  const authHeader =
    cleanToken.startsWith("token ") || cleanToken.startsWith("Bearer ")
      ? cleanToken
      : `Bearer ${cleanToken}`;

  try {
    const res = await fetchFn(COPILOT_INTERNAL_TOKEN_URL, {
      headers: {
        Authorization: authHeader,
        Accept: "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "GitHubCopilotChat/0.26.7",
        "Editor-Version": "vscode/1.100.0",
        "Editor-Plugin-Version": "copilot-chat/0.26.7",
      },
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn(`[CopilotToken] Token fetch failed with status ${res.status}: ${errText}`);
      return null;
    }

    const data: any = await res.json();
    if (!data || !data.token) {
      console.warn("[CopilotToken] Response missing token field");
      return null;
    }

    return {
      token: data.token,
      expiresAt: Number(data.expires_at) || 0,
    };
  } catch (err) {
    console.warn("[CopilotToken] Error fetching copilot token:", err);
    return null;
  }
}

/**
 * Refreshes GitHub OAuth access token using a refresh token.
 */
export async function refreshGitHubOAuthToken(
  refreshToken: string,
  clientId = GITHUB_COPILOT_CLIENT_ID,
  clientSecret?: string,
  fetchFn: typeof fetch = globalThis.fetch
): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number } | null> {
  if (!refreshToken) return null;
  try {
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
    });
    if (clientSecret) {
      params.set("client_secret", clientSecret);
    }

    const res = await fetchFn(GITHUB_OAUTH_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: params,
    });

    if (!res.ok) {
      return null;
    }

    const data: any = await res.json().catch(() => ({}));
    if (!data.access_token) return null;

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresIn: Number(data.expires_in) || 28800,
    };
  } catch (err) {
    console.warn("[CopilotToken] Error refreshing GitHub OAuth token:", err);
    return null;
  }
}

/**
 * Refreshes Copilot token if expired or within 5 minutes of expiration.
 * Can also refresh the parent GitHub OAuth token if a refresh_token is present.
 */
export async function refreshCopilotToken(
  credentials: {
    githubAccessToken?: string;
    rawApiKey?: string;
    refreshToken?: string;
    copilotToken?: string;
    copilotTokenExpiresAt?: number;
  },
  options: { force?: boolean; bufferMs?: number; fetchFn?: typeof fetch } = {}
): Promise<CopilotRefreshResult | null> {
  const { force = false, bufferMs = COPILOT_TOKEN_EXPIRY_BUFFER_MS, fetchFn = globalThis.fetch } = options;

  // If not forced and copilot token is still valid (not within buffer), reuse existing
  if (
    !force &&
    credentials.copilotToken &&
    !isCopilotTokenExpiring(credentials.copilotTokenExpiresAt, bufferMs)
  ) {
    return {
      copilotToken: credentials.copilotToken,
      copilotTokenExpiresAt: credentials.copilotTokenExpiresAt || 0,
      githubAccessToken: credentials.githubAccessToken,
      refreshToken: credentials.refreshToken,
    };
  }

  // Resolve GitHub access token
  let ghAccessToken = credentials.githubAccessToken?.trim() || "";
  let refreshToken = credentials.refreshToken;

  if (!ghAccessToken && credentials.rawApiKey) {
    const raw = credentials.rawApiKey.trim();
    if (raw.startsWith("{") && raw.endsWith("}")) {
      try {
        const parsed = JSON.parse(raw);
        ghAccessToken =
          parsed.githubAccessToken || parsed.accessToken || parsed.access_token || "";
        if (!refreshToken) {
          refreshToken = parsed.refreshToken || parsed.refresh_token;
        }
      } catch {
        ghAccessToken = raw;
      }
    } else {
      ghAccessToken = raw;
    }
  }

  let cpResult: { token: string; expiresAt: number } | null = null;
  if (ghAccessToken) {
    cpResult = await fetchCopilotInternalToken(ghAccessToken, fetchFn);
  }

  // If initial token call failed and refresh token is available, attempt refreshing GitHub OAuth token first
  if (!cpResult && refreshToken) {
    const refreshedGh = await refreshGitHubOAuthToken(refreshToken, GITHUB_COPILOT_CLIENT_ID, undefined, fetchFn);
    if (refreshedGh?.accessToken) {
      ghAccessToken = refreshedGh.accessToken;
      if (refreshedGh.refreshToken) {
        refreshToken = refreshedGh.refreshToken;
      }
      cpResult = await fetchCopilotInternalToken(ghAccessToken, fetchFn);
    }
  }

  if (!cpResult) {
    return null;
  }

  return {
    copilotToken: cpResult.token,
    copilotTokenExpiresAt: cpResult.expiresAt,
    githubAccessToken: ghAccessToken || undefined,
    refreshToken: refreshToken || undefined,
  };
}

/**
 * Ensures account has fresh Copilot credentials in SQLite database.
 * If expired or expiring within buffer, refreshes and saves the updated tokens.
 */
export async function ensureFreshCopilotCredentials(
  account: {
    id: string;
    rawApiKey: string;
    providerSpecificData?: Record<string, any>;
  },
  options: { force?: boolean; bufferMs?: number; fetchFn?: typeof fetch } = {}
): Promise<{ copilotToken: string; copilotTokenExpiresAt: number } | null> {
  const psd = account.providerSpecificData || {};
  const currentCopilotToken = psd.copilotToken || "";
  const currentExpiresAt = psd.copilotTokenExpiresAt;

  if (
    !options.force &&
    currentCopilotToken &&
    !isCopilotTokenExpiring(currentExpiresAt, options.bufferMs)
  ) {
    return {
      copilotToken: currentCopilotToken,
      copilotTokenExpiresAt: currentExpiresAt || 0,
    };
  }

  const result = await refreshCopilotToken(
    {
      githubAccessToken: psd.githubAccessToken,
      rawApiKey: account.rawApiKey,
      refreshToken: psd.refreshToken,
      copilotToken: currentCopilotToken,
      copilotTokenExpiresAt: currentExpiresAt,
    },
    options
  );

  if (!result) {
    return currentCopilotToken
      ? { copilotToken: currentCopilotToken, copilotTokenExpiresAt: currentExpiresAt || 0 }
      : null;
  }

  const updatedPsd = {
    ...psd,
    copilotToken: result.copilotToken,
    copilotTokenExpiresAt: result.copilotTokenExpiresAt,
    ...(result.githubAccessToken ? { githubAccessToken: result.githubAccessToken } : {}),
    ...(result.refreshToken ? { refreshToken: result.refreshToken } : {}),
  };

  ProviderRepository.updateAccount(account.id, {
    providerSpecificData: updatedPsd,
  });

  return {
    copilotToken: result.copilotToken,
    copilotTokenExpiresAt: result.copilotTokenExpiresAt,
  };
}
