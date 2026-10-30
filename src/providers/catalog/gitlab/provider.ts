import { OpenAiCompatibleProvider } from "../../core/base/openAiProvider.js";
import type { ProviderProbeContext, ProviderProbeResult } from "../../core/types.js";
import { metadata } from "./metadata.js";

export class GitlabProvider extends OpenAiCompatibleProvider {
  public override readonly id = metadata.id;
  public override readonly name = metadata.name;
  public override readonly defaultFormat = metadata.format || "openai";

  public override async probeModels(context: ProviderProbeContext): Promise<ProviderProbeResult | null> {
    const token = (context.account?.rawApiKey || context.apiKey || "").trim();
    if (!token) {
      return {
        success: false,
        error: "GitLab token or PAT is required.",
      };
    }

    const psd = ((context.account?.providerSpecificData || context.providerSpecificData || {}) as any);
    // Self-hosted instances pass their own origin; the default chat URL is not a valid base for /api/v4/user.
    const configured = String(psd.baseUrl || "").trim();
    const baseUrl = (configured || "https://gitlab.com").replace(/\/+$/, "");
    const timeoutMs = context.timeoutMs || 8000;
    const url = `${baseUrl}/api/v4/user`;

    try {
      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          "Private-Token": token,
          ...(context.customHeaders || {}),
        },
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
          error: `Authentication failed (HTTP ${res.status}): Invalid or expired GitLab token/PAT`,
          authError: "Invalid or expired GitLab token/PAT",
        };
      }

      const errText = await res.text().catch(() => "");
      return {
        success: false,
        error: `Endpoint returned HTTP ${res.status}: ${errText.slice(0, 100)}`,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `Failed to connect to GitLab: ${msg}`,
      };
    }
  }
}

export default GitlabProvider;
