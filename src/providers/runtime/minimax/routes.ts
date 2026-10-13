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

export async function requestMinimaxDeviceCode(params?: DeviceCodeParams): Promise<DeviceCodeResult> {
  const pId = (params?.provider || "minimax-code").toLowerCase();
  const url =
    pId === "minimax-code" || pId === "minimax"
      ? "https://account.minimax.io/oauth2/device/code"
      : "https://account.minimax.cn/oauth2/device/code";

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
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`MiniMax device code failed (${resp.status}): ${errText}`);
  }

  const data: any = await resp.json();
  const pollByUser = !data.device_code;
  return {
    device_code: data.device_code || data.user_code,
    user_code: data.user_code,
    verification_uri: data.verification_uri,
    verification_uri_complete: data.verification_uri_complete || data.verification_uri,
    expires_in: data.expires_in || 300,
    interval: data.interval || 5,
    _minimaxPollByUser: pollByUser,
  };
}

export async function pollMinimaxDeviceCode(params: DevicePollParams): Promise<DevicePollResult> {
  const deviceCode = params.deviceCode || params.device_code;
  if (!deviceCode) return { ok: false, error: "Missing device_code" };

  const pId = (params.provider || "minimax-code").toLowerCase();
  const tokenUrl =
    pId === "minimax-code" || pId === "minimax"
      ? "https://account.minimax.io/oauth2/token"
      : "https://account.minimax.cn/oauth2/token";

  const fields: Record<string, string> = {
    grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    client_id: "mcode-public",
  };

  if (params.extraData?._minimaxPollByUser) {
    fields.user_code = deviceCode;
  } else {
    fields.device_code = deviceCode;
  }

  if (params.codeVerifier || params.extraData?.codeVerifier) {
    fields.code_verifier = params.codeVerifier || params.extraData?.codeVerifier;
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
    ProviderRepository.ensureProviderExists("minimax");
    const accountId = `acc_${crypto.randomUUID().slice(0, 8)}`;
    const accountName = "MiniMax Code User";

    ProviderRepository.addAccount({
      id: accountId,
      providerId: "minimax",
      name: accountName,
      rawApiKey: data.access_token,
      providerSpecificData: {
        authMethod: "device_code",
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
        providerId: "minimax",
      },
    };
  }

  return { ok: false, error: "no_access_token" };
}

export const minimaxOAuthHandler: ProviderOAuthHandler = {
  id: "minimax",
  deviceCode: requestMinimaxDeviceCode,
  poll: pollMinimaxDeviceCode,
};

export function registerRoutes(_router?: Router): void {
  OAuthHandlerRegistry.register("minimax", minimaxOAuthHandler);
  OAuthHandlerRegistry.register("minimax-code", minimaxOAuthHandler);
  OAuthHandlerRegistry.register("minimax-code-global", minimaxOAuthHandler);
}
