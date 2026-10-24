import { AnthropicCompatibleProvider } from "../../core/base/anthropicProvider.js";
import type { ProviderProbeContext, ProviderProbeResult } from "../../core/types.js";
import { metadata } from "./metadata.js";
import { checkBinaryInstalled } from "../../core/base/baseProvider.js";

export class DevinProvider extends AnthropicCompatibleProvider {
  public override readonly id = metadata.id;
  public override readonly name = metadata.name;
  public override readonly defaultFormat = metadata.format || "claude";

  public override async probeModels(context: ProviderProbeContext): Promise<ProviderProbeResult | null> {
    const token = (context.apiKey || context.account?.rawApiKey || "").trim();
    const timeoutMs = context.timeoutMs || 8000;

    // 1. If user provided a token (PAT or API Key), probe Devin Cloud API (v3/self or v1/sessions)
    if (token && token !== "public" && token !== "none") {
      const headers: Record<string, string> = {
        Authorization: token.startsWith("Bearer ") ? token : `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(context.customHeaders || {}),
      };

      // Probe PAT endpoint: GET https://api.devin.ai/v3/self
      try {
        const res = await fetch("https://api.devin.ai/v3/self", {
          method: "GET",
          headers,
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (res.ok || res.status === 200) {
          return {
            success: true,
            endpointUrl: "https://api.devin.ai/v3/self",
            models: metadata.models.map((m) => ({ id: m.id, name: m.name, contextLength: m.contextLength })),
            count: metadata.models.length,
          };
        }

        // If 403 on v3/self, might be legacy API key: try probe v1/sessions
        if (res.status === 403 || res.status === 404) {
          const sessionRes = await fetch("https://api.devin.ai/v1/sessions", {
            method: "GET",
            headers,
            signal: AbortSignal.timeout(timeoutMs),
          });

          if (sessionRes.ok || sessionRes.status === 200) {
            return {
              success: true,
              endpointUrl: "https://api.devin.ai/v1/sessions",
              models: metadata.models.map((m) => ({ id: m.id, name: m.name, contextLength: m.contextLength })),
              count: metadata.models.length,
            };
          }
        }

        if (res.status === 401 || res.status === 403) {
          let errText = "Invalid Devin API key or PAT";
          try {
            const errData: any = await res.json();
            if (errData?.detail) errText = errData.detail;
          } catch {}
          return {
            success: false,
            error: `Authentication failed (HTTP ${res.status}): ${errText}`,
            authError: errText,
          };
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: `Failed to connect to Devin API: ${msg}`,
        };
      }
    }

    // 2. Local CLI stdio bridge probe
    const isInstalled = await checkBinaryInstalled("devin");
    if (isInstalled) {
      return {
        success: true,
        endpointUrl: "devin://acp/stdio",
        models: metadata.models.map((m) => ({ id: m.id, name: m.name, contextLength: m.contextLength })),
        count: metadata.models.length,
      };
    }

    return {
      success: false,
      error: `Devin API key (PAT) not configured, and local "devin" CLI binary not found. Please add a Devin PAT (from app.devin.ai/settings/keys) or install Devin CLI.`,
    };
  }
}

export default DevinProvider;
