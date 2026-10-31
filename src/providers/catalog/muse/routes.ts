import crypto from "node:crypto";
import type { Router } from "express";
import { OAuthHandlerRegistry } from "../../core/oauthRegistry.js";
import { ProviderRepository } from "../../../storage/repositories/providerRepo.js";
import type {
  ProviderOAuthHandler,
  DeviceCodeParams,
  DeviceCodeResult,
  DevicePollParams,
  DevicePollResult,
  OAuthExchangeParams,
  OAuthExchangeResult,
} from "../../core/oauthTypes.js";

const MUSE_CLIENT_ID = "1031625952748946";
const MUSE_DEVICE_CODE_URL = "https://auth.meta.com/oidc/device/authorization/";
const MUSE_TOKEN_URL = "https://auth.meta.com/oidc/device/token/";
const MUSE_KEY_URL = "https://api.meta.ai/muse-code/key";
const API_VERSION = "1.0.0";

export async function requestMuseDeviceCode(_params?: DeviceCodeParams): Promise<DeviceCodeResult> {
  const res = await fetch(MUSE_DEVICE_CODE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "x-api-version": API_VERSION,
    },
    body: new URLSearchParams({ client_id: MUSE_CLIENT_ID }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Muse Code device code request failed (${res.status}): ${err}`);
  }

  const data: any = await res.json();
  return {
    device_code: data.device_code,
    user_code: data.user_code,
    verification_uri: data.verification_uri || "https://auth.meta.com/oauth/device/",
    verification_uri_complete:
      data.verification_uri_complete ||
      (data.user_code ? `https://auth.meta.com/oauth/device/?code=${data.user_code}` : "https://auth.meta.com/oauth/device/"),
    expires_in: data.expires_in || 600,
    interval: data.interval || 5,
  };
}

export async function pollMuseToken(params: DevicePollParams): Promise<DevicePollResult> {
  const deviceCode = params.deviceCode || params.device_code;
  if (!deviceCode) return { ok: false, error: "Missing device_code" };

  const res = await fetch(MUSE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "x-api-version": API_VERSION,
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      device_code: deviceCode,
      client_id: MUSE_CLIENT_ID,
    }),
  });

  let data: any = {};
  try {
    data = await res.json();
  } catch {
    return { ok: false, error: "invalid_response" };
  }

  if (data.error === "authorization_pending" || data.error === "slow_down") {
    return { ok: false, error: "authorization_pending" };
  }

  if (!res.ok || data.error) {
    return { ok: false, error: data.error || `HTTP ${res.status}`, error_description: data.error_description };
  }

  if (data.access_token) {
    // Mint the Muse Model API key
    let keyRes: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        keyRes = await fetch(MUSE_KEY_URL, {
          method: "POST",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${data.access_token}`,
            "Content-Type": "application/json",
            "x-api-version": API_VERSION,
          },
          body: JSON.stringify({ onboard: true }),
        });
        if (keyRes.status !== 429 && keyRes.status < 500) break;
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      } catch {}
    }

    if (!keyRes || !keyRes.ok) {
      const errText = keyRes ? await keyRes.text().catch(() => "") : "";
      let msg = "Failed to mint Muse Code subscription API key";
      try {
        const parsed = JSON.parse(errText);
        if (parsed.title || parsed.detail) msg = [parsed.title, parsed.detail].filter(Boolean).join(": ");
        if (parsed.action_url) msg += ` - ${parsed.action_url}`;
      } catch {}
      return { ok: false, error: "key_mint_failed", error_description: msg };
    }

    const payload: any = await keyRes.json().catch(() => ({}));
    if (payload.is_subs_active === false) {
      return { ok: false, error: "subscription_inactive", error_description: "Muse Code subscription is inactive. Please activate it on muse.ai first." };
    }

    const apiKey = payload.api_key;
    if (!apiKey) {
      const actionUrl = payload.action_url || payload.require_payment_action_url;
      return { ok: false, error: "subscription_required", error_description: `Muse Code subscription required${actionUrl ? `: ${actionUrl}` : ""}` };
    }

    const accountName = "Muse (Meta Model API) Account";
    ProviderRepository.ensureProviderExists("muse");
    const accountId = `acc_${crypto.randomUUID().slice(0, 8)}`;

    ProviderRepository.addAccount({
      id: accountId,
      providerId: "muse",
      name: accountName,
      rawApiKey: apiKey,
      providerSpecificData: {
        authMethod: "device_code",
      },
    });

    return {
      ok: true,
      success: true,
      account: {
        id: accountId,
        name: accountName,
        providerId: "muse",
      },
    };
  }

  return { ok: false, error: "no_access_token" };
}

export const museOAuthHandler: ProviderOAuthHandler = {
  id: "muse",
  deviceCode: requestMuseDeviceCode,
  poll: pollMuseToken,

  async exchange(params: OAuthExchangeParams): Promise<OAuthExchangeResult> {
    const raw = String(params.code || "").trim();
    if (!raw) return { success: false, error: "API key or token is required" };

    ProviderRepository.ensureProviderExists("muse");
    const accountId = `acc_${crypto.randomUUID().slice(0, 8)}`;
    const accountName = "Muse Model API Key";

    ProviderRepository.addAccount({
      id: accountId,
      providerId: "muse",
      name: accountName,
      rawApiKey: raw,
      providerSpecificData: {
        authMethod: "apikey",
      },
    });

    return {
      success: true,
      account: {
        id: accountId,
        name: accountName,
        providerId: "muse",
      },
    };
  },
};

export function registerRoutes(_router?: Router): void {
  OAuthHandlerRegistry.register("muse", museOAuthHandler);
  OAuthHandlerRegistry.register("muse-ai", museOAuthHandler);
  OAuthHandlerRegistry.register("meta-model-api", museOAuthHandler);
  OAuthHandlerRegistry.register("muse-code", museOAuthHandler);
}
