import type { ProviderUsageContext, RawProviderQuotaResult } from "../types.js";
import { ProviderRegistry } from "../../providers/registry.js";

export async function fetchRawQuotaForProvider(
  context: ProviderUsageContext
): Promise<RawProviderQuotaResult> {
  const account = context.account;
  const mergedContext: ProviderUsageContext = {
    ...context,
    account: {
      ...account,
      providerSpecificData: {
        ...account.providerSpecificData,
        ...(account.githubAccessToken ? { githubAccessToken: account.githubAccessToken } : {}),
        ...(account.projectId ? { projectId: account.projectId } : {}),
      },
    },
  };

  const provider = ProviderRegistry.get(context.providerId);
  if (provider.supportsQuota() && provider.fetchQuota) {
    return await provider.fetchQuota(mergedContext);
  }

  return {
    plan: "Standard",
    message: `Quota tracking is not supported for provider '${context.providerId}'.`,
  };
}
