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

const USER_AGENT = "CLI/2.63.2 CodeBuddy/2.63.2";

export const codebuddyOAuthHandler: ProviderOAuthHandler = {
  id: "codebuddy",

  async deviceCode(params?: DeviceCodeParams): Promise<DeviceCodeResult> {
    const region = params?.region || params?.extraData?.region;
    const isCn = region === "cn";
    const stateUrl = isCn
      ? "https://copilot.tencent.com/v2/plugin/auth/state"
      : "https://www.codebuddy.ai/v2/plugin/auth/state";
    const domain = isCn ? "copilot.tencent.com" : "www.codebuddy.ai";

    const res = await fetch(`${stateUrl}?platform=CLI`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": USER_AGENT,
        "X-Requested-With": "XMLHttpRequest",
        "X-Domain": domain,
        "X-No-Authorization": "true",
        "X-No-User-Id": "true",
        "X-Product": "SaaS",
      },
      body: "{}",
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`CodeBuddy state request failed (${res.status}): ${err}`);
    }

    const data: any = await res.json();
    if (data.code !== 0 || !data.data?.state || !data.data?.authUrl) {
      throw new Error(`CodeBuddy state error: ${data.msg || "missing state/authUrl"}`);
    }

    return {
      device_code: data.data.state,
      user_code: data.data.state.slice(0, 8),
      verification_uri: data.data.authUrl,
      verification_uri_complete: data.data.authUrl,
      expires_in: 300,
      interval: 5,
    };
  },

  async poll(params: DevicePollParams): Promise<DevicePollResult> {
    const deviceCode = params.deviceCode || params.device_code;
    if (!deviceCode) return { ok: false, error: "Missing device_code" };

    const region = params.region || params.extraData?.region;
    const isCn = region === "cn";
    const tokenUrl = isCn
      ? "https://copilot.tencent.com/v2/plugin/auth/token"
      : "https://www.codebuddy.ai/v2/plugin/auth/token";
    const domain = isCn ? "copilot.tencent.com" : "www.codebuddy.ai";

    const res = await fetch(`${tokenUrl}?state=${encodeURIComponent(deviceCode)}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
        "X-Requested-With": "XMLHttpRequest",
        "X-Domain": domain,
        "X-No-Authorization": "true",
        "X-No-User-Id": "true",
        "X-Product": "SaaS",
      },
    });

    if (!res.ok) return { ok: false, error: "request_failed" };

    const data: any = await res.json().catch(() => ({}));
    if (data.code === 11217) {
      return { ok: false, error: "authorization_pending" };
    }

    if (data.code === 0 && data.data?.accessToken) {
      const accessToken = data.data.accessToken;
      const refreshToken = data.data.refreshToken || "";
      const expiresIn = data.data.expiresIn || 86400;

      ProviderRepository.ensureProviderExists("codebuddy");
      const accountId = `acc_${crypto.randomUUID().slice(0, 8)}`;
      const accountName = isCn ? "CodeBuddy CN User" : "CodeBuddy User";

      ProviderRepository.addAccount({
        id: accountId,
        providerId: "codebuddy",
        name: accountName,
        rawApiKey: accessToken,
        providerSpecificData: {
          authMethod: "oauth",
          refreshToken,
          tokenExpiresAt: Date.now() + expiresIn * 1000,
          region: isCn ? "cn" : "intl",
        },
      });

      return {
        ok: true,
        success: true,
        account: {
          id: accountId,
          name: accountName,
          providerId: "codebuddy",
        },
      };
    }

    return { ok: false, error: data.msg || "unknown_error" };
  },
};

export function registerRoutes(_router?: Router): void {
  OAuthHandlerRegistry.register("codebuddy", codebuddyOAuthHandler);
  OAuthHandlerRegistry.register("codebuddy-cn", codebuddyOAuthHandler);
  OAuthHandlerRegistry.register("codebuddy-intl", codebuddyOAuthHandler);
}
