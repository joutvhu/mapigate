import crypto from "node:crypto";
import { ProviderRepository } from "../../../storage/repositories/providerRepo.js";

const DEFAULT_REGION = "us-east-1";
const DEFAULT_EXPIRES_IN = 3600;

function normalizeString(value: any): string {
  return typeof value === "string" ? value.trim() : "";
}

export function decodeJwtPayload(jwt?: string): Record<string, any> | null {
  try {
    if (!jwt || typeof jwt !== "string") return null;
    const parts = jwt.split(".");
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padding = (4 - (base64.length % 4)) % 4;
    const jsonStr = Buffer.from(`${base64}${"=".repeat(padding)}`, "base64").toString("utf8");
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

export function normalizeScope(scopes: any): string {
  if (Array.isArray(scopes)) {
    return scopes.map(normalizeString).filter(Boolean).join(" ");
  }
  return normalizeString(scopes);
}

function resolveExpiresAt(input: any): number {
  const explicit = input.expired || input.expires_at || input.expiresAt;
  if (explicit) {
    const ms = new Date(explicit).getTime();
    if (Number.isFinite(ms)) return ms;
  }

  const expiresIn = Number(input.expires_in || input.expiresIn || 0);
  if (Number.isFinite(expiresIn) && expiresIn > 0) {
    return Date.now() + expiresIn * 1000;
  }

  const payload = decodeJwtPayload(input.access_token || input.accessToken);
  if (payload?.exp && typeof payload.exp === "number") {
    return payload.exp * 1000;
  }

  return Date.now() + DEFAULT_EXPIRES_IN * 1000;
}

export interface KiroExternalIdpAuthData {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  email?: string | null;
  clientId?: string;
  tokenEndpoint?: string;
  scope?: string;
  profileArn?: string;
  region: string;
  authMethod: string;
}

export function normalizeKiroExternalIdpAuth(rawAuth: any): KiroExternalIdpAuthData {
  let input = rawAuth;
  if (typeof input === "string") {
    try {
      input = JSON.parse(input);
    } catch {
      throw new Error("Invalid External IDP auth JSON");
    }
  }

  if (!input || typeof input !== "object") {
    throw new Error("External IDP auth JSON is required");
  }

  const accessToken = normalizeString(input.access_token || input.accessToken || input.token);
  const refreshToken = normalizeString(input.refresh_token || input.refreshToken);
  const clientId = normalizeString(input.client_id || input.clientId);
  const tokenEndpoint = normalizeString(input.token_endpoint || input.tokenEndpoint);
  const profileArn = normalizeString(input.profile_arn || input.profileArn);
  const region = normalizeString(input.region) || DEFAULT_REGION;
  const scope = normalizeScope(input.scopes || input.scope) || "https://service.codewhisperer.amazonaws.com/.default offline_access";

  if (!accessToken) {
    throw new Error("access_token is required in auth JSON");
  }

  const payload = decodeJwtPayload(accessToken);
  const email =
    input.email ||
    payload?.email ||
    payload?.preferred_username ||
    payload?.upn ||
    payload?.sub ||
    null;

  return {
    accessToken,
    refreshToken: refreshToken || undefined,
    expiresAt: resolveExpiresAt(input),
    email,
    clientId: clientId || undefined,
    tokenEndpoint: tokenEndpoint || undefined,
    profileArn: profileArn || undefined,
    scope,
    region,
    authMethod: "external_idp",
  };
}

export function importExternalIdpAccount(rawAuth: any, name?: string): {
  success: boolean;
  id?: string;
  name?: string;
  error?: string;
} {
  try {
    const data = normalizeKiroExternalIdpAuth(rawAuth);

    ProviderRepository.ensureProviderExists("kiro");
    const accountId = `acc_${crypto.randomUUID().slice(0, 8)}`;
    const accountName = name || (data.email ? `Kiro Education (${data.email})` : "Kiro Education (External IDP)");

    ProviderRepository.addAccount({
      id: accountId,
      providerId: "kiro",
      name: accountName,
      rawApiKey: data.accessToken,
      providerSpecificData: {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken || null,
        expiresAt: data.expiresAt,
        tokenExpiresAt: data.expiresAt,
        clientId: data.clientId || null,
        tokenEndpoint: data.tokenEndpoint || null,
        scope: data.scope,
        profileArn: data.profileArn || null,
        region: data.region,
        authMethod: "external_idp",
        provider: "CLIProxyAPI",
        email: data.email || null,
      },
    });

    return { success: true, id: accountId, name: accountName };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to import External IDP account" };
  }
}
