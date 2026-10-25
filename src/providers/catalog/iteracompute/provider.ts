import { OpenAiCompatibleProvider } from "../../core/base/openAiProvider.js";
import type { ProviderUsageContext, RawProviderQuotaResult } from "../../../core/usage/types.js";
import { getIteracomputeUsage } from "./quota.js";
import { metadata } from "./metadata.js";

export class IteracomputeProvider extends OpenAiCompatibleProvider {
  public override readonly id = metadata.id;
  public override readonly name = metadata.name;
  public override readonly defaultFormat = metadata.format || "openai";

  public override supportsQuota(): boolean {
    return true;
  }

  public async fetchQuota(context: ProviderUsageContext): Promise<RawProviderQuotaResult> {
    return await getIteracomputeUsage(context);
  }
}

export default IteracomputeProvider;
