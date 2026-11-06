import { OpenAiCompatibleProvider } from "../../core/base/openAiProvider.js";
import type {
  ProviderRequestContext,
  SingleModelHandler,
  ModelCallResult,
  ProviderProbeContext,
  ProviderProbeResult,
} from "../../core/types.js";
import { metadata } from "./metadata.js";
import {
  isCursorApiKey,
  resolveCursorSessionToken,
  invalidateCursorSessionToken,
} from "./auth.js";
import { executeCursor } from "../cursor/executor.js";
import { extractModelsFromPayload } from "../../../core/scanner/payloadExtractor.js";

export class CursorApiProvider extends OpenAiCompatibleProvider {
  public override readonly id = metadata.id;
  public override readonly name = metadata.name;
  public override readonly defaultFormat = metadata.format || "openai";

  public async execute(
    context: ProviderRequestContext,
    _dispatchSingleModel: SingleModelHandler
  ): Promise<ModelCallResult> {
    const rawKey = context.account?.rawApiKey || (context.account as any)?.apiKey || "";
    let cleanToken = rawKey;

    if (isCursorApiKey(rawKey)) {
      const session = await resolveCursorSessionToken(rawKey);
      cleanToken = session.accessToken;
    }

    const modifiedContext: ProviderRequestContext = {
      ...context,
      account: context.account
        ? {
            ...context.account,
            rawApiKey: cleanToken,
          }
        : undefined,
    };

    return executeCursor(modifiedContext);
  }

  public override async probeModels(
    context: ProviderProbeContext
  ): Promise<ProviderProbeResult | null> {
    const rawKey = (context.account?.rawApiKey || context.apiKey || "").trim();
    if (!rawKey) {
      return {
        success: false,
        error: "Cursor API key is required (crsr_...).",
      };
    }

    const timeoutMs = context.timeoutMs || 10_000;

    // 1. Probe Cursor Cloud Agent API v1 models endpoint directly
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch("https://api.cursor.com/v1/models", {
        headers: {
          Authorization: `Bearer ${rawKey}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.ok) {
        const data = (await res.json()) as any;
        const scanned = extractModelsFromPayload(data, this.id);
        const resolvedModels = scanned.length ? scanned : metadata.models;
        return {
          success: true,
          endpointUrl: "https://api.cursor.com/v1/models",
          models: resolvedModels.map((m) => ({
            id: m.id,
            name: m.name || m.id,
            contextLength: m.contextLength || 200000,
          })),
          count: resolvedModels.length,
        };
      }

      if (res.status === 401 || res.status === 403) {
        return {
          success: false,
          error: `Cursor API key verification failed (HTTP ${res.status}): Invalid or unauthorized API key`,
          authError: `Authentication failed (HTTP ${res.status}): Invalid or unauthorized Cursor API key`,
        };
      }
    } catch {
      // Fallback to token exchange if network or non-auth issue
    }

    // 2. Fallback: try exchanging user API key for session token on api2.cursor.sh
    if (isCursorApiKey(rawKey)) {
      try {
        const session = await resolveCursorSessionToken(rawKey);
        if (session.accessToken) {
          return {
            success: true,
            endpointUrl: "https://api2.cursor.sh/auth/exchange_user_api_key",
            models: metadata.models.map((m) => ({
              id: m.id,
              name: m.name || m.id,
              contextLength: m.contextLength || 200000,
            })),
            count: metadata.models.length,
          };
        }
      } catch (err: any) {
        const status = err?.status;
        const isAuthError = status === 401 || status === 403;
        return {
          success: false,
          error: `Cursor API key exchange failed: ${err.message || String(err)}`,
          authError: isAuthError
            ? `Authentication failed (HTTP ${status}): Invalid or revoked Cursor API key`
            : undefined,
        };
      }
    }

    return {
      success: false,
      error: "Authentication failed: Invalid Cursor API key",
      authError: "Authentication failed: Invalid Cursor API key",
    };
  }

  public override async buildHeaders(
    context: ProviderRequestContext
  ): Promise<Record<string, string>> {
    const rawKey = context.account?.rawApiKey || "";
    let bearerToken = rawKey;

    if (isCursorApiKey(rawKey)) {
      const session = await resolveCursorSessionToken(rawKey);
      bearerToken = session.accessToken;
    }

    const outgoingHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
      ...(context.provider?.customHeaders || {}),
    };

    this.applyAnthropicClientHeaders(outgoingHeaders, context);
    return outgoingHeaders;
  }

  public async handleAuthRefresh(
    context: ProviderRequestContext,
    status: number
  ): Promise<boolean> {
    if (status !== 401 || !context.account?.rawApiKey) {
      return false;
    }

    const rawKey = context.account.rawApiKey;
    if (!isCursorApiKey(rawKey)) {
      return false;
    }

    try {
      invalidateCursorSessionToken(rawKey);
      await resolveCursorSessionToken(rawKey);
      return true;
    } catch {
      return false;
    }
  }
}

export default CursorApiProvider;
