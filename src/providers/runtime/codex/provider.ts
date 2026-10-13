import { OpenAiCompatibleProvider } from "../../core/base/openAiProvider.js";
import type { ProviderRequestContext } from "../../core/types.js";
import type { ProviderUsageContext, RawProviderQuotaResult } from "../../../core/usage/types.js";
import { getCodexUsage } from "./quota.js";
import {
  sanitizeCodexTools,
  convertSystemToDeveloperRole,
  stripStoredItemReferences,
} from "./schemaSanitizer.js";

export class CodexProvider extends OpenAiCompatibleProvider {
  public override readonly id = "codex";
  public override readonly name = "OpenAI Codex";
  public override readonly defaultFormat = "openai";

  public override supportsQuota(): boolean {
    return true;
  }

  public async fetchQuota(context: ProviderUsageContext): Promise<RawProviderQuotaResult> {
    return await getCodexUsage(context.account.rawApiKey, context.account.providerSpecificData);
  }

  public override transformRequestBody(context: ProviderRequestContext): any {
    const body = super.transformRequestBody(context);
    if (body && typeof body === "object") {
      sanitizeCodexTools(body);
      convertSystemToDeveloperRole(body);
      stripStoredItemReferences(body);
    }
    return body;
  }
}

export default CodexProvider;
