import { fetchWithDnsBypass } from "../../../shared/utils/dnsResolver.js";

/**
 * Cursor Cloud Agents API Official Authentication
 * Reference: https://cursor.com/docs/cloud-agent/api/endpoints
 * Reference: https://cursor.com/docs/api#authentication
 */

export const CURSOR_API_BASE_URL = "https://api.cursor.com";
export const CURSOR_API_KEY_PREFIX = "crsr_";
export const CURSOR_API_VERIFY_PATH = "/v1/me";
export const CURSOR_API_MODELS_PATH = "/v1/models";

export const VERIFY_TIMEOUT_MS = 10_000;

export interface CursorApiMeResponse {
  apiKeyName?: string;
  userId?: number;
  userEmail?: string;
  userFirstName?: string;
  userLastName?: string;
  createdAt?: string;
}

export class CursorApiAuthError extends Error {
  public readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "CursorApiAuthError";
    this.status = status;
  }
}

export function isCursorApiKey(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && (
    value.startsWith(CURSOR_API_KEY_PREFIX) ||
    value.startsWith("key_") ||
    value.length >= 20
  );
}

/**
 * Builds HTTP headers for Cursor Cloud Agents API.
 * Cursor accepts both Bearer and Basic authentication.
 */
export function buildCursorApiAuthHeaders(apiKey: string): Record<string, string> {
  const cleanKey = apiKey.trim();
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(cleanKey ? { Authorization: `Bearer ${cleanKey}` } : {}),
  };
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface VerifyCursorApiKeyOptions {
  fetchImpl?: FetchLike;
  baseUrl?: string;
  signal?: AbortSignal;
}

/**
 * Verifies an API key against Cursor's GET /v1/me endpoint.
 */
export async function verifyCursorApiKey(
  apiKey: string,
  options: VerifyCursorApiKeyOptions = {}
): Promise<CursorApiMeResponse> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) {
    throw new CursorApiAuthError("Cursor API key is required", 400);
  }

  const baseUrl = (options.baseUrl || CURSOR_API_BASE_URL).replace(/\/+$/, "");
  const url = `${baseUrl}${CURSOR_API_VERIFY_PATH}`;
  const fetchImpl = options.fetchImpl ?? (fetchWithDnsBypass as any);
  const signal = options.signal ?? AbortSignal.timeout(VERIFY_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: buildCursorApiAuthHeaders(cleanKey),
      signal,
    });
  } catch (err: any) {
    throw new CursorApiAuthError(
      `Failed to connect to Cursor Cloud API: ${err?.message || "network error"}`,
      502
    );
  }

  if (response.status === 401) {
    throw new CursorApiAuthError("Authentication failed: Invalid Cursor API key", 401);
  }

  if (response.status === 403) {
    throw new CursorApiAuthError(
      "Access denied (HTTP 403): Cursor Cloud Agents API requires an eligible paid plan (Pro/Business/Enterprise)",
      403
    );
  }

  if (!response.ok) {
    throw new CursorApiAuthError(
      `Cursor Cloud API returned HTTP ${response.status}: ${response.statusText}`,
      response.status
    );
  }

  try {
    return (await response.json()) as CursorApiMeResponse;
  } catch {
    throw new CursorApiAuthError("Cursor Cloud API returned non-JSON response", 502);
  }
}
