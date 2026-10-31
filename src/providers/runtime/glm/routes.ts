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
import { metadata } from "./metadata.js";
import { isSuccessCode, resolveCodingPlanApiKey, type GlmOAuthConfig } from "./codingPlan.js";

const OAUTH = (metadata.oauth || {}) as Record<string, any>;
const PROVIDER_ID: string = OAUTH.providerId || "zai";
const CLI_INIT_URL: string = OAUTH.cliInitUrl;
const CLI_POLL_URL: string = OAUTH.cliPollUrl;
const PLAN_CONFIG: GlmOAuthConfig = {
  businessLoginUrl: OAUTH.businessLoginUrl,
  apiBaseUrl: OAUTH.apiBaseUrl,
  planApiKeyName: OAUTH.planApiKeyName,
};

// Absolute epoch (s or ms) -> seconds from now; null when absent or already past.
function relativeSeconds(expiresAt: unknown): number | null {
  const raw = Number(expiresAt);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  const ms = raw > 1e12 ? raw : raw * 1000;
  const seconds = Math.floor((ms - Date.now()) / 1000);
  return seconds > 0 ? seconds : null;
}

function denied(description: string): DevicePollResult {
  return { ok: false, error: "access_denied", error_description: description };
}

export async function requestGlmDeviceCode(_params?: DeviceCodeParams): Promise<DeviceCodeResult> {
  const pollToken = crypto.randomBytes(32).toString("hex");
  const resp = await fetch(CLI_INIT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${pollToken}` },
    body: JSON.stringify({ provider: PROVIDER_ID }),
  });

  if (!resp.ok) {
    throw new Error(`ZCode OAuth init failed: ${await resp.text()}`);
  }

  const payload: any = await resp.json();
  if (!isSuccessCode(payload.code) || !payload.data) {
    throw new Error(payload.msg || "ZCode OAuth init returned no data");
  }
  const data = payload.data;
  if (!data.flow_id || !data.authorize_url) {
    throw new Error("ZCode OAuth init response missing flow_id/authorize_url");
  }

  return {
    device_code: data.flow_id,
    user_code: data.flow_id,
    verification_uri: data.authorize_url,
    verification_uri_complete: data.authorize_url,
    expires_in: relativeSeconds(data.expires_at) ?? 300,
    interval: data.poll_interval_sec || 3,
    _zcodePollToken: pollToken,
  };
}

export async function pollGlmToken(params: DevicePollParams): Promise<DevicePollResult> {
  const deviceCode = params.deviceCode || params.device_code;
  if (!deviceCode) return denied("Missing device_code");

  const pollToken = params.extraData?._zcodePollToken;
  if (!pollToken) return denied("Missing ZCode poll token - restart the login flow");

  let resp: Response;
  try {
    resp = await fetch(`${CLI_POLL_URL}/${encodeURIComponent(deviceCode)}`, {
      headers: { Authorization: `Bearer ${pollToken}` },
    });
  } catch {
    // A dropped request must not end the login; the next poll retries.
    return { ok: false, error: "authorization_pending" };
  }
  if (!resp.ok) return denied(`ZCode poll failed (HTTP ${resp.status})`);

  const payload: any = await resp.json().catch(() => ({}));
  if (!isSuccessCode(payload.code)) return denied(payload.msg || "ZCode poll failed");

  // The poll response wraps its state in `data`: { code, data: { status, ... } }.
  const data = payload.data || {};
  if (data.status === "pending") return { ok: false, error: "authorization_pending" };
  if (data.status === "failed") return denied("ZCode authorization failed or was cancelled");
  if (data.status !== "ready") {
    return { ok: false, error: "authorization_pending", error_description: `Unknown status: ${data.status}` };
  }

  // The ready payload nests the Z.ai OAuth tokens under data[providerId].
  const providerData = data[PROVIDER_ID] || data[data.providerId] || {};
  const zaiAccessToken =
    providerData.access_token || providerData.accessToken || data.accessToken || data.access_token;
  if (!zaiAccessToken) return denied("ZCode poll response missing access token");

  let planApiKey: string;
  let businessToken: string;
  try {
    ({ planApiKey, businessToken } = await resolveCodingPlanApiKey(PLAN_CONFIG, zaiAccessToken));
  } catch (err: any) {
    return denied(err?.message || "Failed to create the Z.ai coding-plan API key");
  }

  const user = data.user || {};
  const accountId = `acc_${crypto.randomUUID().slice(0, 8)}`;
  const accountName = user.name || user.email || "Z.AI GLM Account";

  ProviderRepository.ensureProviderExists("glm");
  ProviderRepository.addAccount({
    id: accountId,
    providerId: "glm",
    name: accountName,
    rawApiKey: planApiKey,
    providerSpecificData: {
      authMethod: "cli_poll",
      email: user.email || undefined,
      username: user.name || undefined,
      userId: user.user_id || undefined,
      zcodeJwtToken: data.token || undefined,
      zaiBusinessToken: businessToken || undefined,
      zaiRefreshToken: providerData.refresh_token || providerData.refreshToken || undefined,
    },
  });

  return { ok: true, success: true, account: { id: accountId, name: accountName, providerId: "glm" } };
}

export const glmOAuthHandler: ProviderOAuthHandler = {
  id: "glm",
  deviceCode: requestGlmDeviceCode,
  poll: pollGlmToken,
};

export function registerRoutes(_router?: Router): void {
  OAuthHandlerRegistry.register("glm", glmOAuthHandler);
}
