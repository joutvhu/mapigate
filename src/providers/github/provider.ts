import { OpenAiCompatibleProvider } from "../base/openAiProvider.js";
import type { ProviderRequestContext } from "../types.js";
import type { ProviderUsageContext, RawProviderQuotaResult } from "../../core/usage/types.js";
import { getGitHubUsage } from "./quota.js";
import { ensureFreshCopilotCredentials } from "./auth.js";

export class GitHubProvider extends OpenAiCompatibleProvider {
  public override readonly id = "github";
  public override readonly name = "GitHub Copilot";
  public override readonly defaultFormat = "openai";

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
