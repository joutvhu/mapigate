import { stripModelContextMarker, RuleEngine } from "../../core/router/ruleEngine.js";
import { LoadBalancer } from "../../core/router/loadBalancer.js";
import { ModelRepository } from "../../storage/repositories/modelRepo.js";
import { ProviderRepository } from "../../storage/repositories/providerRepo.js";
import { logger, LogSymbol } from "../../shared/logger.js";

export function tryFailover(
  providerId: string,
  account: any,
  status: number,
  cooldownMs: number,
  triedAccountIds: Set<string>,
  targetModel: string,
  reqTag: string,
  isCustom = false,
  prefixHash?: string,
  sessionId?: string
): boolean {
  const next = LoadBalancer.pickAccount(providerId, {
    excludeAccountIds: triedAccountIds,
    targetModel,
    prefixHash,
    sessionId,
  });
  if (next) {
    const suffix = isCustom ? " in custom provider" : "";
    logger.line(
      reqTag,
      LogSymbol.FAILOVER,
      `Account '${account.name || account.id}' hit ${status} (rate-limit/quota)${suffix} · failing over to '${next.name || next.id}' (cooldown: ${cooldownMs}ms)`
    );
    return true;
  }
  return false;
}

export function extractSessionId(req?: any, body?: any): string | undefined {
  const headerSessionId =
    req?.headers?.["x-session-id"] ||
    req?.headers?.["session-id"] ||
    req?.headers?.["x-amp-thread-id"];
  if (typeof headerSessionId === "string" && headerSessionId.trim()) {
    return headerSessionId.trim();
  }

  const clientBodyId =
    body?.metadata?.["kiro:conversation_id"] ||
    body?.metadata?.["kiro:root_conversation_id"] ||
    body?.conversationState?.conversationId ||
    body?.conversationId ||
    body?.conversation_id ||
    body?.sessionId ||
    body?.session_id ||
    body?._clientSessionId;
  if (typeof clientBodyId === "string" && clientBodyId.trim()) {
    return clientBodyId.trim();
  }

  return undefined;
}

export function resolveTargetModelAndProvider(modelStr: string): {
  targetModel: string;
  providerId?: string;
  targetTag?: string;
  is1mContext: boolean;
} {
  const { model: cleanModelStr, is1mContext } = stripModelContextMarker(modelStr);
  const effective = cleanModelStr || modelStr;
  let targetModel = effective;
  let providerId: string | undefined;
  let targetTag: string | undefined;

  if (effective.includes("/")) {
    const slash = effective.indexOf("/");
    const rawProvider = effective.slice(0, slash);
    targetModel = effective.slice(slash + 1);

    // Parse provider[tag] syntax, e.g. claude[pro] -> provider: claude, tag: pro
    const tagMatch = rawProvider.match(/^([^\[\]]+)\[([^\[\]]+)\]$/);
    if (tagMatch) {
      providerId = tagMatch[1];
      targetTag = tagMatch[2];
    } else {
      providerId = rawProvider;
    }
  } else {
    const rules = ModelRepository.getAllRules();
    const resolved = new RuleEngine(rules).resolveModel(effective);
    targetModel = resolved.model;
    providerId = resolved.rule?.targetProviderId;
  }

  const cleanTarget = stripModelContextMarker(targetModel).model;
  if (cleanTarget) targetModel = cleanTarget;
  if (!providerId) {
    const activeProviders = ProviderRepository.getAllProviders().filter((p) => p.isActive);
    const targetLower = targetModel.toLowerCase();

    // 1. Try finding an active provider that explicitly lists this model in provider.models
    const exactMatch = activeProviders.find((p) =>
      Array.isArray(p.models) && p.models.some((m) => m.toLowerCase() === targetLower)
    );
    if (exactMatch) {
      providerId = exactMatch.id;
    }

    // 2. Try matching by well-known model prefix patterns to active providers
    if (!providerId) {
      const isClaude = targetLower.startsWith("claude");
      const isOpenAi =
        targetLower.startsWith("gpt-") ||
        targetLower.startsWith("o1") ||
        targetLower.startsWith("o3") ||
        targetLower.startsWith("o4") ||
        targetLower.startsWith("chatgpt") ||
        targetLower.startsWith("text-embedding");
      const isGemini = targetLower.startsWith("gemini");
      const isDeepseek = targetLower.startsWith("deepseek");
      const isGrok = targetLower.startsWith("grok");
      const isQwen = targetLower.startsWith("qwen");

      if (isClaude) {
        providerId = activeProviders.find((p) => p.id === "claude" || p.id === "anthropic" || p.format === "claude")?.id;
      } else if (isOpenAi) {
        providerId = activeProviders.find((p) => p.id === "openai" || p.id === "codex")?.id;
      } else if (isGemini) {
        providerId = activeProviders.find((p) => p.id === "gemini" || p.id === "gemini-cli" || p.id === "antigravity")?.id;
      } else if (isDeepseek) {
        providerId = activeProviders.find((p) => p.id === "deepseek")?.id;
      } else if (isGrok) {
        providerId = activeProviders.find((p) => p.id === "grok" || p.id === "grok-cli")?.id;
      } else if (isQwen) {
        providerId = activeProviders.find((p) => p.id === "alibaba" || p.id === "dashscope")?.id;
      }
    }

    // 3. Fallback to first active provider
    if (!providerId) {
      providerId = activeProviders[0]?.id;
    }
  }
  return { targetModel, providerId, targetTag, is1mContext: Boolean(is1mContext) };
}
