import type { ProviderUsageContext, RawProviderQuotaResult } from "../types.js";
import { getAntigravityUsage } from "./antigravity.js";
import { getGeminiUsage } from "./gemini.js";
import { getClaudeUsage } from "./claude.js";
import { getCodexUsage } from "./codex.js";
import { getGitHubUsage } from "./github.js";
import { getKiroUsage } from "./kiro.js";
import { getDeepseekUsage } from "./deepseek.js";
import { getGrokUsage } from "./grok.js";
import { getMiniMaxUsage } from "./minimax.js";
import { getQoderUsage } from "./qoder.js";
import { getGlmUsage } from "./glm.js";

export async function fetchRawQuotaForProvider(
  context: ProviderUsageContext
): Promise<RawProviderQuotaResult> {
  const pId = context.providerId.toLowerCase();
  const { account, force } = context;
  const token = account.rawApiKey;
  const psd = {
    ...account.providerSpecificData,
    ...(account.githubAccessToken ? { githubAccessToken: account.githubAccessToken } : {}),
    ...(account.projectId ? { projectId: account.projectId } : {}),
  };

  switch (pId) {
    case "antigravity":
      return await getAntigravityUsage(token, psd, { force });

    case "gemini":
    case "gemini-cli":
      return await getGeminiUsage(token, psd);

    case "claude":
      return await getClaudeUsage(token, { force });

    case "codex":
      return await getCodexUsage(token, psd);

    case "github":
      return await getGitHubUsage(psd.githubAccessToken || token, psd);

    case "kiro":
      return await getKiroUsage(token, psd);

    case "deepseek":
      return await getDeepseekUsage(token);

    case "grok":
    case "grok-cli":
      return await getGrokUsage(token, psd);

    case "minimax":
    case "minimax-cn":
      return await getMiniMaxUsage(token, pId);

    case "qoder":
    case "qoder-cn":
      return await getQoderUsage(token, pId);

    case "glm":
    case "glm-cn":
      return await getGlmUsage(token, pId);

    default:
      return {
        plan: "Standard",
        message: `Quota tracking is not supported for provider '${context.providerId}'.`,
      };
  }
}
