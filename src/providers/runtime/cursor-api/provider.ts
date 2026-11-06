import { OpenAiCompatibleProvider } from "../../core/base/openAiProvider.js";
import type {
  ProviderRequestContext,
  ProviderProbeContext,
  ProviderProbeResult,
} from "../../core/types.js";
import { metadata } from "./metadata.js";
import { buildCursorApiAuthHeaders, CURSOR_API_MODELS_PATH } from "./auth.js";
import { extractModelsFromPayload } from "../../../core/scanner/payloadExtractor.js";

export class CursorApiProvider extends OpenAiCompatibleProvider {
  public override readonly id = metadata.id;
  public override readonly name = metadata.name;
  public override readonly defaultFormat = metadata.format || "openai";

  public override async buildHeaders(
    context: ProviderRequestContext
  ): Promise<Record<string, string>> {
    const rawKey = (context.account?.rawApiKey || "").trim();

    const outgoingHeaders: Record<string, string> = {
      ...buildCursorApiAuthHeaders(rawKey),
      ...(context.provider?.customHeaders || {}),
    };

    this.applyAnthropicClientHeaders(outgoingHeaders, context);
    return outgoingHeaders;
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
    const probeUrl = `${metadata.baseUrl}${CURSOR_API_MODELS_PATH}`;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(probeUrl, {
        headers: buildCursorApiAuthHeaders(rawKey),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.ok) {
        const data = (await res.json()) as any;
        const scanned = extractModelsFromPayload(data, this.id);
        const resolvedModels = scanned.length ? scanned : metadata.models;
        return {
          success: true,
          endpointUrl: probeUrl,
          models: resolvedModels.map((m) => ({
            id: m.id,
            name: m.name || m.id,
            contextLength: m.contextLength || 200000,
          })),
          count: resolvedModels.length,
        };
      }

      if (res.status === 401) {
        return {
          success: false,
          error: "Authentication failed (HTTP 401): Invalid Cursor API key",
          authError: "Authentication failed (HTTP 401): Invalid Cursor API key",
        };
      }

      if (res.status === 403) {
        return {
          success: false,
          error: "Access denied (HTTP 403): Cursor Cloud Agents API requires a Pro/Business plan. Free accounts are not authorized.",
          authError: "Access denied (HTTP 403): Cursor Cloud Agents API requires a Pro/Business plan. Free accounts are not authorized.",
        };
      }

      return {
        success: false,
        error: `Endpoint ${probeUrl} returned HTTP ${res.status}: ${res.statusText}`,
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Failed to connect to ${probeUrl}: ${err.message || String(err)}`,
      };
    }
  }
}

export default CursorApiProvider;
