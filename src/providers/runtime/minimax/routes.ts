import crypto from "node:crypto";
import type { Router } from "express";
import { ProviderRepository } from "../../../storage/repositories/providerRepo.js";
import { OAuthHandlerRegistry } from "../../core/oauthRegistry.js";
import { generatePKCE } from "../../../shared/utils/pkce.js";
import type {
  ProviderOAuthHandler,
  DeviceCodeParams,
  DeviceCodeResult,
  DevicePollParams,
  DevicePollResult,
  OAuthRefreshTokenParams,
  OAuthRefreshTokenResult,
} from "../../core/oauthTypes.js";

const minimaxPendingVerifiers = new Map<string, string>();

export async function requestMinimaxDeviceCode(params?: DeviceCodeParams): Promise<DeviceCodeResult> {
  const pId = (params?.provider || "minimax-code").toLowerCase();
  const region = params?.region || params?.extraData?.region;
  const isCn = region === "cn";
  const url = isCn
    ? "https://account.minimax.cn/oauth2/device/code"
    : "https://account.minimax.io/oauth2/device/code";

  const { codeVerifier, codeChallenge } = generatePKCE();

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      client_id: "mcode-public",
      scope: "agent.default",
      audience: "agent-backend",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`MiniMax device code failed (${resp.status}): ${errText}`);
  }

  const data: any = await resp.json();
  const pollByUser = !data.device_code;
  const deviceKey = data.device_code || data.user_code;
  if (deviceKey) {
    minimaxPendingVerifiers.set(deviceKey, codeVerifier);
    if (data.user_code && data.user_code !== deviceKey) {
      minimaxPendingVerifiers.set(data.user_code, codeVerifier);
    }
  }

  return {
    device_code: deviceKey,
    user_code: data.user_code,
    verification_uri: data.verification_uri,
    verification_uri_complete: data.verification_uri_complete || data.verification_uri,
    expires_in: data.expires_in || 300,
    interval: data.interval || 5,
    codeVerifier,
    _minimaxPollByUser: pollByUser,
  };
}

export async function pollMinimaxDeviceCode(params: DevicePollParams): Promise<DevicePollResult> {
  const deviceCode = params.deviceCode || params.device_code;
  if (!deviceCode) return { ok: false, error: "Missing device_code" };

  const pId = (params.provider || "minimax-code").toLowerCase();
  const region = params.region || params.extraData?.region;
  const isCn = region === "cn";
  const tokenUrl = isCn
    ? "https://account.minimax.cn/oauth2/token"
    : "https://account.minimax.io/oauth2/token";

  const verifier =
    params.codeVerifier ||
    params.extraData?.codeVerifier ||
    minimaxPendingVerifiers.get(deviceCode) ||
    minimaxPendingVerifiers.get(params.extraData?.user_code || "");

  const fields: Record<string, string> = {
    grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    client_id: "mcode-public",
  };

  if (verifier) {
    fields.code_verifier = verifier;
  }

  if (params.extraData?._minimaxPollByUser) {
    fields.user_code = deviceCode;
  } else {
    fields.device_code = deviceCode;
  }

  const resp = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams(fields),
  });

  let data: any = {};
  try {
    data = await resp.json();
  } catch {
    return { ok: false, error: "invalid_response" };
  }

  const status = data?.status;
  if (status === "pending") return { ok: false, error: "authorization_pending" };
  if (status === "slow_down") return { ok: false, error: "slow_down" };
  if (status === "denied" || status === "access_denied") return { ok: false, error: "access_denied" };
  if (status === "expired" || status === "expired_token") return { ok: false, error: "expired_token" };

  if (data?.error) {
    if (data.error === "authorization_pending" || data.error === "slow_down") {
      return { ok: false, error: "authorization_pending" };
    }
    return { ok: false, error: data.error, error_description: data.error_description };
  }

  if (data?.access_token) {
    minimaxPendingVerifiers.delete(deviceCode);
    const targetProvider = pId === "minimax-code" ? "minimax-code" : "minimax";
    ProviderRepository.ensureProviderExists(targetProvider);
    const accountId = `acc_${crypto.randomUUID().slice(0, 8)}`;
    const accountName = "MiniMax Code User";

    ProviderRepository.addAccount({
      id: accountId,
      providerId: targetProvider,
      name: accountName,
      rawApiKey: data.access_token,
      providerSpecificData: {
        authMethod: "device_code",
        refreshToken: data.refresh_token,
        tokenExpiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
        expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
        region: isCn ? "cn" : "global",
      },
    });

    return {
      ok: true,
      success: true,
      account: {
        id: accountId,
        name: accountName,
        providerId: targetProvider,
      },
    };
  }

  return { ok: false, error: "no_access_token" };
}

export const minimaxOAuthHandler: ProviderOAuthHandler = {
  id: "minimax",
  deviceCode: requestMinimaxDeviceCode,
  poll: pollMinimaxDeviceCode,

  async refreshToken(params: OAuthRefreshTokenParams): Promise<OAuthRefreshTokenResult | null> {
    const token = params.refreshToken;
    if (!token) return null;
    const isCn = params.providerSpecificData?.region === "cn";
    const tokenUrl = isCn
      ? "https://account.minimax.cn/oauth2/token"
      : "https://account.minimax.io/oauth2/token";

    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: token,
        client_id: "mcode-public",
        scope: "agent.default",
        audience: "agent-backend",
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
  OAuthHandlerRegistry.register("minimax", minimaxOAuthHandler);
  OAuthHandlerRegistry.register("minimax-code", minimaxOAuthHandler);
  OAuthHandlerRegistry.register("minimax-code-global", minimaxOAuthHandler);
}
