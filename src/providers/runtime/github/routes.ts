import crypto from "node:crypto";
import type { Router } from "express";
import { ProviderRepository } from "../../../storage/repositories/providerRepo.js";
import { OAuthHandlerRegistry } from "../../core/oauthRegistry.js";
import type {
  ProviderOAuthHandler,
  DeviceCodeParams,
  DeviceCodeResult,
  DevicePollParams,
  DevicePollResult,
  OAuthRefreshTokenParams,
  OAuthRefreshTokenResult,
} from "../../core/oauthTypes.js";
import { refreshCopilotToken, normalizeExpiryMs } from "../../../core/auth/copilotToken.js";

import { GITHUB_COPILOT_CLIENT_ID } from "./auth.js";

export async function requestCopilotDeviceCode(_params?: DeviceCodeParams): Promise<DeviceCodeResult> {
  const response = await fetch("https://github.com/login/device/code", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      client_id: GITHUB_COPILOT_CLIENT_ID,
      scope: "read:user",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub device code error: ${errorText}`);
  }

  const data = (await response.json()) as DeviceCodeResult;
  return data;
}

export async function pollCopilotToken(params: DevicePollParams): Promise<DevicePollResult> {
  const deviceCode = params.deviceCode || params.device_code;
  if (!deviceCode) {
    return { ok: false, error: "Missing device_code" };
  }

  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      client_id: GITHUB_COPILOT_CLIENT_ID,
      device_code: deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    }),
  });

  const data: any = await response.json().catch(() => ({}));
  if (data.error) {
    if (data.error === "authorization_pending" || data.error === "slow_down") {
      return { ok: false, error: data.error };
    }
    return { ok: false, error: data.error, error_description: data.error_description };
  }

  if (data.access_token) {
    let copilotToken = "";
    let copilotTokenExpiresAt = 0;
    let accountName = "GitHub Copilot User";

    try {
      const copilotRes = await fetch("https://api.github.com/copilot_internal/v2/token", {
        headers: {
          Authorization: `Bearer ${data.access_token}`,
          Accept: "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "GithubCopilot/1.155.0",
        },
      });
      if (copilotRes.ok) {
        const cpData: any = await copilotRes.json();
        copilotToken = cpData.token || "";
        copilotTokenExpiresAt = cpData.expires_at || 0;
      }
    } catch {}

    try {
      const userRes = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${data.access_token}`,
          Accept: "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "GithubCopilot/1.155.0",
        },
      });
      if (userRes.ok) {
        const uData: any = await userRes.json();
        accountName = uData.login || uData.name || accountName;
      }
    } catch {}

    ProviderRepository.ensureProviderExists("github");
    const accountId = `acc_${crypto.randomUUID().slice(0, 8)}`;

    ProviderRepository.addAccount({
      id: accountId,
      providerId: "github",
      name: accountName,
      rawApiKey: data.access_token,
      providerSpecificData: {
        copilotToken,
        copilotTokenExpiresAt,
        githubAccessToken: data.access_token,
        refreshToken: data.refresh_token,
      },
    });

    return {
      ok: true,
      success: true,
      account: { id: accountId, name: accountName, providerId: "github" },
    };
  }

  return { ok: false, error: "authorization_pending" };
}

export async function importGithubToken(params: {
  token: string;
  name?: string;
}): Promise<{ success: boolean; id?: string; name?: string; error?: string }> {
  if (!params.token || typeof params.token !== "string") {
    return { success: false, error: "Token is required" };
  }

  const cleanToken = params.token.trim();
  let copilotToken = cleanToken;
  let copilotTokenExpiresAt = 0;
  let accountName = params.name || "GitHub Copilot Key";

  try {
    const cpRes = await fetch("https://api.github.com/copilot_internal/v2/token", {
      headers: {
        Authorization: `Bearer ${cleanToken}`,
        Accept: "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "GithubCopilot/1.155.0",
      },
    });
    if (cpRes.ok) {
      const cpData: any = await cpRes.json();
      if (cpData.token) {
        copilotToken = cpData.token;
        copilotTokenExpiresAt = cpData.expires_at || 0;
      }
    }
  } catch {}

  ProviderRepository.ensureProviderExists("github");
  const accountId = `acc_${crypto.randomUUID().slice(0, 8)}`;

  ProviderRepository.addAccount({
    id: accountId,
    providerId: "github",
    name: accountName,
    rawApiKey: cleanToken,
    providerSpecificData: {
      copilotToken,
      copilotTokenExpiresAt,
    },
  });

  return { success: true, id: accountId, name: accountName };
}

export const githubOAuthHandler: ProviderOAuthHandler = {
  id: "github",
  deviceCode: requestCopilotDeviceCode,
  poll: pollCopilotToken,
  importAccount: importGithubToken,

  async refreshToken(params: OAuthRefreshTokenParams): Promise<OAuthRefreshTokenResult | null> {
    const psd = params.providerSpecificData || {};
    const refreshed = await refreshCopilotToken({
      githubAccessToken: psd.githubAccessToken,
      rawApiKey: params.rawApiKey,
      refreshToken: params.refreshToken,
      copilotToken: psd.copilotToken,
      copilotTokenExpiresAt: psd.copilotTokenExpiresAt,
    });
    if (!refreshed?.copilotToken) return null;
    const ghToken = refreshed.githubAccessToken || psd.githubAccessToken;
    const newExpiresAt = normalizeExpiryMs(refreshed.copilotTokenExpiresAt) || undefined;
    return {
      accessToken: refreshed.copilotToken,
      rawApiKey: params.rawApiKey || refreshed.copilotToken,
      expiresAt: newExpiresAt,
      refreshToken: refreshed.refreshToken || params.refreshToken,
      providerSpecificData: {
        ...psd,
        copilotToken: refreshed.copilotToken,
        copilotTokenExpiresAt: refreshed.copilotTokenExpiresAt,
        ...(ghToken ? { githubAccessToken: ghToken } : {}),
        ...(refreshed.refreshToken ? { refreshToken: refreshed.refreshToken } : {}),
      },
    };
  },
};

export function registerRoutes(router: Router): void {
  OAuthHandlerRegistry.register("github", githubOAuthHandler);

  router.post("/github/device-code", async (_req, res) => {
    try {
      res.json(await githubOAuthHandler.deviceCode!());
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to initiate GitHub device code" });
    }
  });

  router.post("/github/poll", async (req, res) => {
    const { device_code } = req.body;
    if (!device_code) return res.status(400).json({ error: "Missing device_code" });
    try {
      res.json(await githubOAuthHandler.poll!({ device_code, deviceCode: device_code }));
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to poll GitHub token" });
    }
  });

  router.post("/github/token", async (req, res) => {
    const { token, name } = req.body;
    if (!token || typeof token !== "string") return res.status(400).json({ error: "Token is required" });
    try {
      const result = await githubOAuthHandler.importAccount!({ token, name });
      if (!result.success) return res.status(400).json({ error: result.error || "Token is required" });
      res.json({ success: true, id: result.id, name: result.name });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to import GitHub token" });
    }
  });
}
