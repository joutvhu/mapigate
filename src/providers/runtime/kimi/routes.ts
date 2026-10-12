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
} from "../../core/oauthTypes.js";

export const KIMI_CLIENT_ID = "REDACTED_KIMI_CLIENT_ID";
export const KIMI_DEVICE_CODE_URL = "https://auth.kimi.com/api/oauth/device_authorization";
export const KIMI_TOKEN_URL = "https://auth.kimi.com/api/oauth/token";
export const KIMI_AUTHORIZE_DEVICE_URL = "https://www.kimi.com/code/authorize_device";

export async function requestKimiDeviceCode(_params?: DeviceCodeParams): Promise<DeviceCodeResult> {
  const resp = await fetch(KIMI_DEVICE_CODE_URL, {
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
    verification_uri: data.verification_uri || KIMI_AUTHORIZE_DEVICE_URL,
    verification_uri_complete:
      data.verification_uri_complete || `${KIMI_AUTHORIZE_DEVICE_URL}?user_code=${data.user_code}`,
    expires_in: data.expires_in || 300,
    interval: data.interval || 5,
  };
}

export async function pollKimiToken(params: DevicePollParams): Promise<DevicePollResult> {
  const deviceCode = params.deviceCode || params.device_code;
  if (!deviceCode) {
    return { ok: false, error: "Missing device_code" };
  }

  const resp = await fetch(KIMI_TOKEN_URL, {
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
};

export function registerRoutes(_router?: Router): void {
  OAuthHandlerRegistry.register("kimi", kimiOAuthHandler);
}
