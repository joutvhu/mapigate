import type { Router } from "express";
import { OAuthHandlerRegistry } from "../../core/oauthRegistry.js";
import type {
  ProviderOAuthHandler,
  DeviceCodeParams,
  DeviceCodeResult,
} from "../../core/oauthTypes.js";

export async function requestMinimaxDeviceCode(params?: DeviceCodeParams): Promise<DeviceCodeResult> {
  const pId = (params?.provider || "minimax-code").toLowerCase();
  const url =
    pId === "minimax-code"
      ? "https://account.minimax.io/oauth2/device/code"
      : "https://account.minimax.cn/oauth2/device/code";

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({ client_id: "mcode-public" }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`MiniMax device code failed (${resp.status}): ${errText}`);
  }

  const data: any = await resp.json();
  return {
    device_code: data.device_code,
    user_code: data.user_code,
    verification_uri: data.verification_uri,
    verification_uri_complete: data.verification_uri_complete || data.verification_uri,
    expires_in: data.expires_in || 300,
    interval: data.interval || 5,
  };
}

export const minimaxOAuthHandler: ProviderOAuthHandler = {
  id: "minimax",
  deviceCode: requestMinimaxDeviceCode,
};

export function registerRoutes(_router?: Router): void {
  OAuthHandlerRegistry.register("minimax", minimaxOAuthHandler);
}
