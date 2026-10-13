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
} from "../../core/oauthTypes.js";

const GROK_CLIENT_ID = "xai-grok-cli";
const GROK_DEVICE_CODE_URL = "https://auth.x.ai/oauth2/device/code";
const GROK_TOKEN_URL = "https://auth.x.ai/oauth2/token";
const GROK_UA = "xai-grok-cli/0.1.0";

export const grokOAuthHandler: ProviderOAuthHandler = {
  id: "grok",

  async deviceCode(_params?: DeviceCodeParams): Promise<DeviceCodeResult> {
    const body = new URLSearchParams({
      client_id: GROK_CLIENT_ID,
      scope: "all",
      referrer: "grok-build",
    });

    const res = await fetch(GROK_DEVICE_CODE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        "User-Agent": GROK_UA,
      },
      body,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Grok CLI device code request failed (${res.status}): ${err}`);
    }

    const data: any = await res.json();
    return {
      device_code: data.device_code,
      user_code: data.user_code,
      verification_uri: data.verification_uri || data.verification_url,
      verification_uri_complete: data.verification_uri_complete || data.verification_uri,
      expires_in: data.expires_in || 300,
      interval: data.interval || 5,
    };
  },

  async poll(params: DevicePollParams): Promise<DevicePollResult> {
    const deviceCode = params.deviceCode || params.device_code;
    if (!deviceCode) return { ok: false, error: "Missing device_code" };

    const res = await fetch(GROK_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        "User-Agent": GROK_UA,
      },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code: deviceCode,
        client_id: GROK_CLIENT_ID,
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
      let accountName = "Grok User";
      let email: string | undefined;

      try {
        const uRes = await fetch("https://cli-chat-proxy.grok.com/v1/user", {
          headers: {
            Authorization: `Bearer ${data.access_token}`,
            Accept: "application/json",
            "User-Agent": GROK_UA,
            "x-xai-token-auth": "xai-grok-cli",
          },
        });
        if (uRes.ok) {
          const u: any = await uRes.json();
          email = u.email;
          accountName = [u.firstName, u.lastName].filter(Boolean).join(" ") || email || accountName;
        }
      } catch {}

      ProviderRepository.ensureProviderExists("grok");
      const accountId = `acc_${crypto.randomUUID().slice(0, 8)}`;

      ProviderRepository.addAccount({
        id: accountId,
        providerId: "grok",
        name: accountName,
        rawApiKey: data.access_token,
        providerSpecificData: {
          authMethod: "device_code",
          email,
          refreshToken: data.refresh_token,
          tokenExpiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
        },
      });

      return {
        ok: true,
        success: true,
        account: {
          id: accountId,
          name: accountName,
          providerId: "grok",
        },
      };
    }

    return { ok: false, error: "no_access_token" };
  },
};

export function registerRoutes(_router?: Router): void {
  OAuthHandlerRegistry.register("grok", grokOAuthHandler);
  OAuthHandlerRegistry.register("grok-cli", grokOAuthHandler);
}
