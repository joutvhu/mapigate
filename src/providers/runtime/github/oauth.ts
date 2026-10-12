import crypto from "node:crypto";
import { ProviderRepository } from "../../../storage/repositories/providerRepo.js";
import type {
  ProviderOAuthHandler,
  DeviceCodeParams,
  DeviceCodeResult,
  DevicePollParams,
  DevicePollResult,
} from "../../core/oauthTypes.js";

export const GITHUB_COPILOT_CLIENT_ID = "Iv1.REDACTED_GITHUB_CLIENT_ID";

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
};
