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
  OAuthExchangeParams,
  OAuthExchangeResult,
  OAuthRefreshTokenParams,
  OAuthRefreshTokenResult,
} from "../../core/oauthTypes.js";
import { resolvePublicCred } from "../../../shared/utils/publicCreds.js";

export const KIMI_CLIENT_ID = resolvePublicCred("kimi_client_id");
export const KIMI_DEVICE_CODE_URL = "https://auth.kimi.ai/api/oauth/device_authorization";
export const KIMI_TOKEN_URL = "https://auth.kimi.ai/api/oauth/token";
export const KIMI_AUTHORIZE_DEVICE_URL = "https://www.kimi.ai/code/authorize_device";

export async function requestKimiDeviceCode(params?: DeviceCodeParams): Promise<DeviceCodeResult> {
  const region = params?.region || params?.extraData?.region || "intl";
  const isCn = region === "cn" || (params?.provider || "").toLowerCase().includes("cn");
  const deviceAuthUrl = isCn
    ? "https://auth.kimi.com/api/oauth/device_authorization"
    : "https://auth.kimi.ai/api/oauth/device_authorization";
  const authorizeDeviceUrl = isCn
    ? "https://www.kimi.com/code/authorize_device"
    : "https://www.kimi.ai/code/authorize_device";

  const resp = await fetch(deviceAuthUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "User-Agent": "KimiCLI/1.0",
    },
    body: new URLSearchParams({ client_id: KIMI_CLIENT_ID }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Kimi device authorization failed: ${errText}`);
  }

  const data: any = await resp.json();
  return {
    device_code: data.device_code,
    user_code: data.user_code,
    verification_uri: data.verification_uri || authorizeDeviceUrl,
    verification_uri_complete:
      data.verification_uri_complete || `${authorizeDeviceUrl}?user_code=${data.user_code}`,
    expires_in: data.expires_in || 1800,
    interval: data.interval || 5,
    _region: isCn ? "cn" : "intl",
  };
}

export async function pollKimiToken(params: DevicePollParams): Promise<DevicePollResult> {
  const deviceCode = params.deviceCode || params.device_code;
  if (!deviceCode) {
    return { ok: false, error: "Missing device_code" };
  }

  const region = params.region || params.extraData?.region || params.extraData?._region || "intl";
  const isCn = region === "cn" || (params.provider || "").toLowerCase().includes("cn");
  const tokenUrl = isCn
    ? "https://auth.kimi.com/api/oauth/token"
    : "https://auth.kimi.ai/api/oauth/token";

  const resp = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      client_id: KIMI_CLIENT_ID,
      device_code: deviceCode,
    }),
  });

  const data: any = await resp.json().catch(() => ({}));
  if (data.error === "authorization_pending" || data.error === "slow_down") {
    return { ok: false, error: "authorization_pending" };
  }
  if (data.error) {
    return { ok: false, error: data.error, error_description: data.error_description };
  }

  if (data.access_token) {
    const accessToken = data.access_token;
    const accountId = `acc_${crypto.randomUUID().slice(0, 8)}`;
    const accountName = "Kimi Account";
    const storedToken = JSON.stringify({
      accessToken,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + (Number(data.expires_in) || 2592000) * 1000,
    });

    ProviderRepository.ensureProviderExists("kimi");

    ProviderRepository.addAccount({
      id: accountId,
      providerId: "kimi",
      name: accountName,
      rawApiKey: storedToken,
      providerSpecificData: {
        authMethod: "device_code",
        refreshToken: data.refresh_token,
      },
    });

    return { ok: true, success: true, account: { id: accountId, name: accountName, providerId: "kimi" } };
  }

  return { ok: false, error: "authorization_pending" };
}

export const kimiOAuthHandler: ProviderOAuthHandler = {
  id: "kimi",
  deviceCode: requestKimiDeviceCode,
  poll: pollKimiToken,

  async exchange(params: OAuthExchangeParams): Promise<OAuthExchangeResult> {
    const raw = String(params.code || "").trim();
    if (!raw) return { success: false, error: "Token is required" };

    let token = raw;
    let refreshToken = "";
    if (raw.startsWith("{") && raw.endsWith("}")) {
      try {
        const parsed = JSON.parse(raw);
        token = parsed.accessToken || parsed.access_token || parsed.token || parsed.apiKey || token;
        refreshToken = parsed.refreshToken || parsed.refresh_token || "";
      } catch {}
    }

    ProviderRepository.ensureProviderExists("kimi");
    const accountId = `acc_${crypto.randomUUID().slice(0, 8)}`;
    const accountName = token.startsWith("sk-") ? "Kimi Platform Key" : "Kimi Account";

    ProviderRepository.addAccount({
      id: accountId,
      providerId: "kimi",
      name: accountName,
      rawApiKey: raw,
      providerSpecificData: {
        authMethod: token.startsWith("sk-") ? "apikey" : "oauth",
        ...(refreshToken ? { refreshToken } : {}),
      },
    });

    return {
      success: true,
      account: {
        id: accountId,
        name: accountName,
        providerId: "kimi",
      },
    };
  },

  async refreshToken(params: OAuthRefreshTokenParams): Promise<OAuthRefreshTokenResult | null> {
    const token = params.refreshToken;
    if (!token) return null;
    const isCn = params.providerSpecificData?.region === "cn";
    const tokenUrl = isCn
      ? "https://auth.kimi.com/api/oauth/token"
      : "https://auth.kimi.ai/api/oauth/token";

    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: KIMI_CLIENT_ID,
        refresh_token: token,
      }),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || token,
      expiresIn: Number(data.expires_in) || 3600,
    };
  },
};

export function registerRoutes(_router?: Router): void {
  OAuthHandlerRegistry.register("kimi", kimiOAuthHandler);
  OAuthHandlerRegistry.register("kimi-coding", kimiOAuthHandler);
  OAuthHandlerRegistry.register("kmc", kimiOAuthHandler);
}
