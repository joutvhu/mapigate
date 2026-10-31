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
  OAuthRefreshTokenParams,
  OAuthRefreshTokenResult,
} from "../../core/oauthTypes.js";

const GROK_CLIENT_ID =
  process.env.MAPIGATE_GROK_CLIENT_ID || "b1a00492-073a-47ea-816f-4c329264a828";
const GROK_DEVICE_CODE_URL = "https://auth.x.ai/oauth2/device/code";
const GROK_TOKEN_URL = "https://auth.x.ai/oauth2/token";
const GROK_UA = "grok-pager/1.0.44 grok-shell/1.0.44 (linux; x86_64)";
const GROK_SCOPE =
  "openid profile email offline_access grok-cli:access api:access conversations:read conversations:write";

export const grokOAuthHandler: ProviderOAuthHandler = {
  id: "grok",

  async deviceCode(params?: DeviceCodeParams): Promise<DeviceCodeResult> {
    const provider = params?.provider || "grok";
    const body = new URLSearchParams({
      client_id: GROK_CLIENT_ID,
      scope: GROK_SCOPE,
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
      provider,
      _provider: provider,
      device_code: data.device_code,
      user_code: data.user_code,
      verification_uri: data.verification_uri || data.verification_url || "https://accounts.x.ai/oauth2/device",
      verification_uri_complete:
        data.verification_uri_complete ||
        (data.verification_uri ? `${data.verification_uri}?user_code=${data.user_code}` : "https://accounts.x.ai/oauth2/device"),
      expires_in: data.expires_in || 1800,
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
            "x-grok-client-version": "1.0.44",
          },
        });
        if (uRes.ok) {
          const u: any = await uRes.json();
          email = u.email;
          accountName = [u.firstName, u.lastName].filter(Boolean).join(" ") || email || accountName;
        }
      } catch {}

      const rawProvider = (
        params.provider ||
        params.providerId ||
        params.extraData?.provider ||
        params.extraData?._provider ||
        ""
      ).toLowerCase();
      const targetProviderId =
        (rawProvider === "grok-cli" || rawProvider === "supergrok" || rawProvider === "grok-build" || rawProvider === "gcli")
          ? "grok-cli"
          : "grok";

      ProviderRepository.ensureProviderExists(targetProviderId);
      const accountId = `acc_${crypto.randomUUID().slice(0, 8)}`;

      ProviderRepository.addAccount({
        id: accountId,
        providerId: targetProviderId,
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
          providerId: targetProviderId,
        },
      };
    }

    return { ok: false, error: "no_access_token" };
  },

  async exchange(params: OAuthExchangeParams): Promise<OAuthExchangeResult> {
    const raw = String(params.code || "").trim();
    if (!raw) return { success: false, error: "Token is required" };

    let accountName = "Grok User";
    let email: string | undefined;

    if (raw.startsWith("eyJ")) {
      try {
        const uRes = await fetch("https://cli-chat-proxy.grok.com/v1/user", {
          headers: {
            Authorization: `Bearer ${raw}`,
            Accept: "application/json",
            "User-Agent": GROK_UA,
            "x-xai-token-auth": "xai-grok-cli",
            "x-grok-client-version": "1.0.44",
          },
        });
        if (uRes.ok) {
          const u: any = await uRes.json();
          email = u.email;
          accountName = [u.firstName, u.lastName].filter(Boolean).join(" ") || email || accountName;
        }
      } catch {}
    }

    const rawProvider = (
      params.provider ||
      (params as any).providerId ||
      ""
    ).toLowerCase();
    const targetProviderId =
      (rawProvider === "grok-cli" || rawProvider === "supergrok" || rawProvider === "grok-build" || rawProvider === "gcli")
        ? "grok-cli"
        : "grok";

    ProviderRepository.ensureProviderExists(targetProviderId);
    const accountId = `acc_${crypto.randomUUID().slice(0, 8)}`;

    ProviderRepository.addAccount({
      id: accountId,
      providerId: targetProviderId,
      name: accountName,
      rawApiKey: raw,
      providerSpecificData: {
        authMethod: raw.startsWith("eyJ") ? "oauth_token" : "apikey",
        email,
      },
    });

    return {
      success: true,
      account: {
        id: accountId,
        name: accountName,
        providerId: targetProviderId,
      },
    };
  },

  async refreshToken(params: OAuthRefreshTokenParams): Promise<OAuthRefreshTokenResult | null> {
    const token = params.refreshToken;
    if (!token) return null;
    const res = await fetch(GROK_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: GROK_CLIENT_ID,
        refresh_token: token,
      }),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || token,
      expiresIn: Number(data.expires_in) || 1800,
    };
  },
};

export function registerRoutes(_router?: Router): void {
  OAuthHandlerRegistry.register("grok", grokOAuthHandler);
  OAuthHandlerRegistry.register("grok-cli", grokOAuthHandler);
  OAuthHandlerRegistry.register("supergrok", grokOAuthHandler);
  OAuthHandlerRegistry.register("xai", grokOAuthHandler);
}
