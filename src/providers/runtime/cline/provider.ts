import { OpenAiCompatibleProvider } from "../../core/base/openAiProvider.js";
import type { ProviderRequestContext, ProviderProbeContext, ProviderProbeResult } from "../../core/types.js";
import { metadata } from "./metadata.js";

export function getClineAccessToken(token: string): string {
  if (typeof token !== "string") return "";
  const trimmed = token.trim();
  if (!trimmed) return "";
  if (trimmed.toLowerCase().startsWith("workos:")) return trimmed;
  const isWorkOsJwt = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(trimmed);
  return isWorkOsJwt ? `workos:${trimmed}` : trimmed;
}

export class ClineProvider extends OpenAiCompatibleProvider {
  public override readonly id = metadata.id;
  public override readonly name = metadata.name;
  public override readonly defaultFormat = metadata.format || "openai";

  public override async buildHeaders(context: ProviderRequestContext): Promise<Record<string, string>> {
    const headers = await super.buildHeaders(context);
    const rawApiKey = context.account?.rawApiKey || "";
    if (rawApiKey) {
      const accessToken = getClineAccessToken(rawApiKey);
      if (accessToken) {
        headers["Authorization"] = `Bearer ${accessToken}`;
      }
    }
    headers["X-Title"] = "Cline";
    headers["HTTP-Referer"] = "https://cline.bot";
    return headers;
  }

  public override async probeModels(context: ProviderProbeContext): Promise<ProviderProbeResult | null> {
    let token = (context.apiKey || context.account?.rawApiKey || "").trim();
    if (token.startsWith("{") && token.endsWith("}")) {
      try {
        const parsed = JSON.parse(token);
        token = parsed.accessToken || parsed.access_token || parsed.token || parsed.apiKey || token;
      } catch {}
    }

    if (!token) {
      return {
        success: false,
        error: "Cline access token or ClinePass API key is required (starts with clp_... or sign in via OAuth).",
      };
    }

    const accessToken = getClineAccessToken(token);
    const timeoutMs = context.timeoutMs || 8000;
    const url = "https://api.cline.bot/api/v1/users/me";

    const reqHeaders: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      "HTTP-Referer": "https://cline.bot",
      "X-Title": "Cline",
      Accept: "application/json",
      ...(context.customHeaders || {}),
    };

    try {
      const res = await fetch(url, {
        method: "GET",
        headers: reqHeaders,
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (res.ok || res.status === 200) {
        return {
          success: true,
          endpointUrl: url,
          models: metadata.models.map((m) => ({ id: m.id, name: m.name, contextLength: m.contextLength })),
          count: metadata.models.length,
        };
      }

      if (res.status === 401 || res.status === 403) {
        return {
          success: false,
          error: `Authentication failed (HTTP ${res.status}): Invalid Cline credentials`,
          authError: "Invalid credentials",
        };
      }

      const errText = await res.text().catch(() => "");
      return {
        success: false,
        error: `Endpoint ${url} returned HTTP ${res.status}: ${errText.slice(0, 100)}`,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `Failed to connect to Cline API: ${msg}`,
      };
    }
  }
}

export default ClineProvider;
