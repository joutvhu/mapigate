import crypto from "node:crypto";
import { ProviderRepository } from "../../../storage/repositories/providerRepo.js";
import type {
  ProviderOAuthHandler,
  DeviceCodeParams,
  DeviceCodeResult,
  DevicePollParams,
  DevicePollResult,
} from "../../core/oauthTypes.js";

export async function requestGlmDeviceCode(_params?: DeviceCodeParams): Promise<DeviceCodeResult> {
  const pollToken = crypto.randomBytes(32).toString("hex");
  const resp = await fetch("https://zcode.z.ai/api/v1/oauth/cli/init", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${pollToken}`,
    },
    body: JSON.stringify({ provider: "zai" }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`ZCode OAuth init failed: ${errText}`);
  }

  const payload: any = await resp.json();
  const data = payload.data || {};

  return {
    device_code: data.flow_id,
    user_code: data.flow_id,
    verification_uri: data.authorize_url,
    verification_uri_complete: data.authorize_url,
    expires_in: 300,
    interval: data.poll_interval_sec || 3,
    _zcodePollToken: pollToken,
  };
}

export async function pollGlmToken(params: DevicePollParams): Promise<DevicePollResult> {
  const deviceCode = params.deviceCode || params.device_code;
  if (!deviceCode) {
    return { ok: false, error: "Missing device_code" };
  }

  const pollToken = params.extraData?._zcodePollToken;
  if (!pollToken) {
    return { ok: false, error: "access_denied", error_description: "Missing poll token" };
  }

  const resp = await fetch(`https://zcode.z.ai/api/v1/oauth/cli/poll/${encodeURIComponent(deviceCode)}`, {
    headers: { Authorization: `Bearer ${pollToken}` },
  });

  const data: any = await resp.json().catch(() => ({}));
  if (data.status === "ready" && (data.accessToken || data.token)) {
    const token = data.accessToken || data.token;
    const accountId = `acc_${crypto.randomUUID().slice(0, 8)}`;
    const accountName = data.user?.email || data.user?.name || "Z.AI GLM Account";

    ProviderRepository.ensureProviderExists("glm");

    ProviderRepository.addAccount({
      id: accountId,
      providerId: "glm",
      name: accountName,
      rawApiKey: token,
      providerSpecificData: {
        authMethod: "oauth",
        user: data.user,
      },
    });

    return {
      ok: true,
      success: true,
      account: { id: accountId, name: accountName, providerId: "glm" },
    };
  }

  return { ok: false, error: "authorization_pending" };
}

export const glmOAuthHandler: ProviderOAuthHandler = {
  id: "glm",
  deviceCode: requestGlmDeviceCode,
  poll: pollGlmToken,
};
