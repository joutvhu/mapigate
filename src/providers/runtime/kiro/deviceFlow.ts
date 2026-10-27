import crypto from "node:crypto";
import { ProviderRepository } from "../../../storage/repositories/providerRepo.js";

const DEFAULT_REGION = "us-east-1";
const DEFAULT_START_URL = "https://view.awsapps.com/start";

export interface KiroDeviceCodeResult {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
  extraData: {
    _clientId: string;
    _clientSecret: string;
    _region: string;
    _authMethod: string;
    _startUrl: string;
    _name?: string;
  };
}

export async function requestKiroDeviceCode(options?: {
  region?: string;
  startUrl?: string;
  authMethod?: string;
  name?: string;
}): Promise<KiroDeviceCodeResult> {
  const region = (options?.region || DEFAULT_REGION).trim();
  const startUrl = (options?.startUrl || DEFAULT_START_URL).trim();
  const authMethod = options?.authMethod === "idc" ? "idc" : "builder-id";
  const name = options?.name?.trim();

  const registerClientUrl = `https://oidc.${region}.amazonaws.com/client/register`;
  const deviceAuthUrl = `https://oidc.${region}.amazonaws.com/device_authorization`;

  // Step 1: Register client with AWS SSO OIDC
  const registerPayload: any = {
    clientName: "kiro-oauth-client",
    clientType: "public",
    scopes: [
      "codewhisperer:completions",
      "codewhisperer:analysis",
      "codewhisperer:conversations",
    ],
    grantTypes: [
      "urn:ietf:params:oauth:grant-type:device_code",
      "refresh_token",
    ],
  };

  // Only attach default issuerUrl for standard Builder ID flow.
  // For custom enterprise IDC tenants (e.g. https://d-tenant.awsapps.com/start),
  // sending a foreign issuerUrl causes AWS OIDC registration rejection.
  if (authMethod !== "idc" && (!options?.startUrl || options.startUrl.trim() === DEFAULT_START_URL)) {
    registerPayload.issuerUrl = "https://identitycenter.amazonaws.com/ssoins-722374e8c3c8e6c6";
  }

  const regRes = await fetch(registerClientUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(registerPayload),
  });

  if (!regRes.ok) {
    const errorText = await regRes.text();
    throw new Error(`AWS SSO Client registration failed: ${errorText}`);
  }

  const clientInfo: any = await regRes.json();

  // Step 2: Request device authorization
  const devRes = await fetch(deviceAuthUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      clientId: clientInfo.clientId,
      clientSecret: clientInfo.clientSecret,
      startUrl,
    }),
  });

  if (!devRes.ok) {
    const errorText = await devRes.text();
    throw new Error(`AWS SSO Device authorization failed: ${errorText}`);
  }

  const deviceData: any = await devRes.json();

  return {
    device_code: deviceData.deviceCode,
    user_code: deviceData.userCode,
    verification_uri: deviceData.verificationUri,
    verification_uri_complete: deviceData.verificationUriComplete || deviceData.verificationUri,
    expires_in: deviceData.expiresIn || 600,
    interval: deviceData.interval || 5,
    extraData: {
      _clientId: clientInfo.clientId,
      _clientSecret: clientInfo.clientSecret,
      _region: region,
      _authMethod: authMethod,
      _startUrl: startUrl,
      _name: name || undefined,
    },
  };
}

export async function pollKiroDeviceToken(params: {
  deviceCode: string;
  extraData?: Record<string, any>;
}): Promise<{
  ok: boolean;
  success?: boolean;
  pending?: boolean;
  account?: { id: string; name: string; providerId: string };
  error?: string;
}> {
  const extra = params.extraData || {};
  const region = extra._region || DEFAULT_REGION;
  const tokenUrl = `https://oidc.${region}.amazonaws.com/token`;

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      clientId: extra._clientId,
      clientSecret: extra._clientSecret,
      deviceCode: params.deviceCode,
      grantType: "urn:ietf:params:oauth:grant-type:device_code",
    }),
  });

  const data: any = await res.json().catch(() => ({}));

  if (!res.ok || data.error) {
    const isPending = data.error === "authorization_pending" || data.error === "slow_down";
    return {
      ok: false,
      pending: isPending,
      error: data.error_description || data.error || "Authorization pending",
    };
  }

  if (data.accessToken) {
    const authMethod = extra._authMethod || (extra._clientId ? "idc" : "builder-id");
    const defaultName = authMethod === "idc" ? "Kiro Enterprise (IDC)" : "Kiro AWS Builder ID";
    const accountName = extra._name?.trim() || defaultName;
    const accountId = `acc_${crypto.randomUUID().slice(0, 8)}`;

    ProviderRepository.ensureProviderExists("kiro");
    ProviderRepository.addAccount({
      id: accountId,
      providerId: "kiro",
      name: accountName,
      rawApiKey: data.refreshToken || data.accessToken,
      providerSpecificData: {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken || null,
        clientId: extra._clientId || null,
        clientSecret: extra._clientSecret || null,
        region,
        authMethod,
        startUrl: extra._startUrl,
        expiresAt: data.expiresIn ? Date.now() + Number(data.expiresIn) * 1000 : undefined,
      },
    });

    return {
      ok: true,
      success: true,
      account: {
        id: accountId,
        name: accountName,
        providerId: "kiro",
      },
    };
  }

  return { ok: false, error: "No access token in response" };
}
