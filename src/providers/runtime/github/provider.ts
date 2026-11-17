import { OpenAiCompatibleProvider } from "../../core/base/openAiProvider.js";
import type { ProviderRequestContext } from "../../core/types.js";
import type { ProviderUsageContext, RawProviderQuotaResult } from "../../../core/usage/types.js";
import { getGitHubUsage } from "./quota.js";
import { ensureFreshCopilotCredentials } from "./auth.js";

function isCopilotTemperatureUnsupported(model?: string): boolean {
  if (!model) return false;
  const clean = model.replace(/^.*\//, "").trim().toLowerCase();
  const match = clean.match(/^gpt-(\d+)(?:\.(\d+))?/);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = match[2] !== undefined ? Number(match[2]) : 0;
  if (major >= 6) return true;
  if (major === 5 && minor >= 4) return true;
  return false;
}

export class GitHubProvider extends OpenAiCompatibleProvider {
  public override readonly id = "github";
  public override readonly name = "GitHub Copilot";
  public override readonly defaultFormat = "openai";

  public override transformRequestBody(context: ProviderRequestContext): any {
    const body = super.transformRequestBody(context);
    if (body && typeof body === "object" && "temperature" in body) {
      const model = body.model || context.targetModel;
      if (isCopilotTemperatureUnsupported(model)) {
        const next = { ...body };
        delete next.temperature;
        return next;
      }
    }
    return body;
  }

  public override supportsQuota(): boolean {
    return true;
  }

  public async fetchQuota(context: ProviderUsageContext): Promise<RawProviderQuotaResult> {
    return await getGitHubUsage(
      context.account.rawApiKey,
      context.account.providerSpecificData
    );
  }

  public override async buildHeaders(context: ProviderRequestContext): Promise<Record<string, string>> {
    let bearerToken = context.account?.rawApiKey || "";
    const psd = context.account?.providerSpecificData || {};

    if (context.account) {
      try {
        const fresh = await ensureFreshCopilotCredentials(context.account);
        if (fresh?.copilotToken) {
          bearerToken = fresh.copilotToken;
          psd.copilotToken = fresh.copilotToken;
          psd.copilotTokenExpiresAt = fresh.copilotTokenExpiresAt;
        }
      } catch (err: any) {
        console.warn("[GitHubProvider] Failed to ensure fresh Copilot credentials:", err.message);
      }
    } else if (psd.copilotToken) {
      bearerToken = psd.copilotToken;
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
      ...(context.provider?.customHeaders || {}),
    };
    this.applyAnthropicClientHeaders(headers, context);
    return headers;
  }
}

export default GitHubProvider;
