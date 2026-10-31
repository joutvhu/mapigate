import { ProviderRepository } from "../../storage/repositories/providerRepo.js";
import {
  ANTIGRAVITY_CLIENT_ID,
  ANTIGRAVITY_CLIENT_SECRET,
} from "../../providers/runtime/antigravity/routes.js";
import {
  GOOGLE_OAUTH_CLIENT_ID,
  GOOGLE_OAUTH_CLIENT_SECRET,
} from "../../providers/runtime/gemini-cli/routes.js";
import { CLAUDE_CLIENT_ID } from "../../providers/runtime/claude/routes.js";
import {
  CODEX_CLIENT_ID,
  CODEX_TOKEN_URL,
} from "../../providers/runtime/codex/routes.js";
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

  // 0. GitHub Copilot (uses githubAccessToken or rawApiKey to mint Copilot token)
  if (pId === "github" || pId === "copilot") {
    try {
      const refreshed = await refreshCopilotToken({
        githubAccessToken: creds.githubAccessToken || creds.providerSpecificData.githubAccessToken,
        rawApiKey,
        refreshToken: creds.refreshToken,
        copilotToken: creds.providerSpecificData.copilotToken,
        copilotTokenExpiresAt: creds.providerSpecificData.copilotTokenExpiresAt,
      });

      if (refreshed) {
        const ghToken = refreshed.githubAccessToken || creds.githubAccessToken || creds.providerSpecificData.githubAccessToken;
        const updatedPsd = {
          ...creds.providerSpecificData,
          copilotToken: refreshed.copilotToken,
          copilotTokenExpiresAt: refreshed.copilotTokenExpiresAt,
          ...(ghToken ? { githubAccessToken: ghToken } : {}),
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
          githubAccessToken: ghToken || undefined,
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
    else if (pId === "kiro" && creds.refreshToken) {
      const clientId = creds.providerSpecificData.clientId;
      const clientSecret = creds.providerSpecificData.clientSecret;
      const authMethod = creds.providerSpecificData.authMethod || "builder-id";
      const region = creds.providerSpecificData.region || "us-east-1";

      if (authMethod === "external_idp" && creds.providerSpecificData.tokenEndpoint) {
        const tokenEndpoint = creds.providerSpecificData.tokenEndpoint;
        const scope = creds.providerSpecificData.scope || "https://service.codewhisperer.amazonaws.com/.default offline_access";

        const res = await fetch(tokenEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            client_id: clientId || "",
            refresh_token: creds.refreshToken,
            scope,
          }),
        });
        if (res.ok) {
          const data: any = await res.json();
          newAccessToken = data.access_token || data.accessToken;
          if (data.refresh_token) newRefreshToken = data.refresh_token;
          if (data.expires_in) expiresInSec = Number(data.expires_in);
        }
      } else if (clientId && clientSecret) {
        const isIDC = authMethod === "idc";
        const endpoint = isIDC && region
          ? `https://oidc.${region}.amazonaws.com/token`
          : "https://oidc.us-east-1.amazonaws.com/token";

        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            refreshToken: creds.refreshToken,
            clientId,
            clientSecret,
            grantType: "refresh_token",
          }),
        });
        if (res.ok) {
          const data: any = await res.json();
          newAccessToken = data.accessToken || data.access_token;
          if (data.refreshToken) newRefreshToken = data.refreshToken;
          if (data.expiresIn) expiresInSec = Number(data.expiresIn);
          if (data.profileArn && !creds.providerSpecificData.profileArn) {
            creds.providerSpecificData.profileArn = data.profileArn;
          }
        }
      } else {
        // Builder ID & Social Kiro accounts refresh via auth.desktop.kiro.dev
        const tokenUrl = "https://prod.us-east-1.auth.desktop.kiro.dev/refreshToken";
        const res = await fetch(tokenUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "User-Agent": "kiro-cli/1.0.0",
          },
          body: JSON.stringify({
            refreshToken: creds.refreshToken,
          }),
        });
        if (res.ok) {
          const data: any = await res.json();
          newAccessToken = data.accessToken || data.access_token;
          if (data.refreshToken) newRefreshToken = data.refreshToken;
          if (data.expiresIn) expiresInSec = Number(data.expiresIn);
          if (data.profileArn && !creds.providerSpecificData.profileArn) {
            creds.providerSpecificData.profileArn = data.profileArn;
          }
        }
      }
    }

    // 6. MiniMax Code (mcode)
    else if (
      (pId === "minimax-code" ||
        pId === "minimax-code-global" ||
        pId === "minimax" ||
        pId === "mm" ||
        pId === "mmg" ||
        pId === "mcode") &&
      creds.refreshToken
    ) {
      const isCn = creds.providerSpecificData?.region === "cn";
      const tokenUrl = isCn
        ? "https://account.minimax.cn/oauth2/token"
        : "https://account.minimax.io/oauth2/token";

      const res = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: creds.refreshToken,
          client_id: "mcode-public",
          scope: "agent.default",
          audience: "agent-backend",
        }),
      });
      if (res.ok) {
        const data: any = await res.json();
        newAccessToken = data.access_token;
        if (data.refresh_token) newRefreshToken = data.refresh_token;
        if (data.expires_in) expiresInSec = Number(data.expires_in);
      }
    }

    // 7. Kimi for Coding (kimi)
    else if (pId === "kimi" || pId === "kimi-coding" || pId === "kmc") {
      const isCn = creds.providerSpecificData?.region === "cn";
      const tokenUrl = isCn
        ? "https://auth.kimi.com/api/oauth/token"
        : "https://auth.kimi.ai/api/oauth/token";

      const res = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: "17e5f671-d194-4dfb-9706-5516cb48c098",
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

    // 8. Cline / ClinePass (WorkOS token endpoint)
    else if (pId === "cline" || pId === "clinepass") {
      const res = await fetch("https://api.workos.com/user_management/authenticate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          grant_type: "refresh_token",
          client_id: "client_01K3A541FN8TA3EPPHTD2325AR",
          refresh_token: creds.refreshToken,
        }),
      });
      if (res.ok) {
        const data: any = await res.json();
        newAccessToken = data.access_token;
        if (data.refresh_token) newRefreshToken = data.refresh_token;
        expiresInSec = 3600; // WorkOS access token lifetime ~ 1 hour
      }
    }

    // 9. xAI Grok / SuperGrok (grok, grok-cli)
    else if (pId === "grok" || pId === "grok-cli" || pId === "supergrok") {
      const res = await fetch("https://auth.x.ai/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: "b1a00492-073a-47ea-816f-4c329264a828",
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

    if (newAccessToken) {
      const newExpiresAt = Date.now() + expiresInSec * 1000;
      const updatedPsd = {
        ...creds.providerSpecificData,
        refreshToken: newRefreshToken,
        expiresAt: newExpiresAt,
        tokenExpiresAt: newExpiresAt,
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
