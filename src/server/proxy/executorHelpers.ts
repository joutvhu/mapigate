import { stripModelContextMarker, RuleEngine } from "../../core/router/ruleEngine.js";
import { stripModelEffortSuffix } from "../../core/thinking/effortResolver.js";
import { LoadBalancer } from "../../core/router/loadBalancer.js";
import { ComboRepository } from "../../storage/repositories/comboRepo.js";
import { ModelRepository } from "../../storage/repositories/modelRepo.js";
import { ProviderRepository } from "../../storage/repositories/providerRepo.js";
import { PROVIDER_REGISTRY, getRegistryProvider } from "../../shared/constants/providerRegistry.js";
import { logger, LogSymbol } from "../../shared/logger.js";
import { normalizeModelCompareKey } from "../../shared/utils/modelUtils.js";

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
  sessionId?: string,
  targetTag?: string
): boolean {
  const next = LoadBalancer.pickAccount(providerId, {
    excludeAccountIds: triedAccountIds,
    targetModel,
    targetTag,
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

/**
 * Extracts a stable snapshot of messages before Token Saver/compression touches them.
 */
export function findActiveComboForModel(
  resolvedModel: string,
  combos = ComboRepository.getAllCombos()
): { combo: ReturnType<typeof ComboRepository.getAllCombos>[number]; effort?: string } | undefined {
  const isComboCandidate = !resolvedModel.includes("/") || resolvedModel.startsWith("combo/");
  if (!isComboCandidate) return undefined;

  const comboLookup = resolvedModel.startsWith("combo/") ? resolvedModel.slice(6) : resolvedModel;
  const matchByNameOrId = (lookup: string) =>
    combos.find(
      (c) =>
        c.isActive &&
        (c.name.toLowerCase() === lookup.toLowerCase() || c.id.toLowerCase() === lookup.toLowerCase())
    );

  const exact = matchByNameOrId(comboLookup);
  if (exact) return { combo: exact };

  const stripped = stripModelEffortSuffix(comboLookup);
  if (stripped.effort && stripped.model) {
    const byBase = matchByNameOrId(stripped.model);
    if (byBase) return { combo: byBase, effort: stripped.effort };
  }

  return undefined;
}

export function extractSessionIdentityMessages(messages: any[]): any[] {
  if (!Array.isArray(messages) || messages.length === 0) return [];
  const out = messages.slice();
  const firstUserIdx = out.findIndex((m) => m?.role === "user");
  if (firstUserIdx !== -1) {
    const firstUser = out[firstUserIdx];
    const text =
      typeof firstUser.content === "string"
        ? firstUser.content
        : Array.isArray(firstUser.content)
        ? JSON.stringify(firstUser.content)
        : String(firstUser.content ?? "");
    out[firstUserIdx] = { ...firstUser, content: text };
  }
  return out;
}

export function detectClientToolId(
  req?: { headers?: Record<string, any>; path?: string },
  clientFormat?: "openai" | "anthropic" | "responses"
): string {
  const explicitTool = String(req?.headers?.["x-client-tool"] || "").toLowerCase().trim();
  if (explicitTool) return explicitTool;

  const ua = String(req?.headers?.["user-agent"] || "").toLowerCase();
  if (ua.includes("claude-code") || ua.includes("claude_cli") || ua.includes("@anthropic-ai/claude-code")) {
    return "claude";
  }
  if (ua.includes("cursor")) return "cursor";
  if (ua.includes("cline")) return "cline";
  if (ua.includes("opencode")) return "opencode";
  if (ua.includes("codex")) return "codex";
  if (ua.includes("droid")) return "droid";
  if (ua.includes("openclaw")) return "openclaw";
  if (ua.includes("continue")) return "continue";
  if (ua.includes("roo") || ua.includes("roocode")) return "roo";
  if (ua.includes("copilot")) return "copilot";
  if (ua.includes("kiro")) return "kiro";
  if (ua.includes("antigravity")) return "antigravity";
  if (clientFormat === "anthropic" || (typeof req?.path === "string" && req.path.includes("/messages"))) {
    return "claude";
  }
  return "";
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

function isKnownProviderOrAlias(pName: string): boolean {
  if (!pName) return false;
  const pLower = pName.toLowerCase().trim();
  if (PROVIDER_REGISTRY[pLower] || getRegistryProvider(pLower)) return true;
  const dbProv = ProviderRepository.getProviderById(pLower);
  if (dbProv) return true;
  return false;
}

export function resolveTargetModelAndProvider(modelStr: string): {
  targetModel: string;
  targetEffort?: string;
  providerId?: string;
  targetTag?: string;
  is1mContext: boolean;
} {
  const { model: cleanModelStr, is1mContext } = stripModelContextMarker(modelStr);
  const effortStripped = stripModelEffortSuffix(cleanModelStr || modelStr);
  const effective = effortStripped.model || cleanModelStr || modelStr;
  let targetEffort = effortStripped.effort;
  let targetModel = effective;
  let providerId: string | undefined;
  let targetTag: string | undefined;

  if (effective.includes("/")) {
    const slash = effective.indexOf("/");
    const rawProvider = effective.slice(0, slash);
    const candidateModel = effective.slice(slash + 1);

    // Parse provider[tag] syntax, e.g. claude[pro] -> provider: claude, tag: pro
    let candidateProviderId = rawProvider;
    let candidateTag: string | undefined;
    const tagMatch = rawProvider.match(/^([^[\]]+)\[([^[\]]+)\]$/);
    if (tagMatch) {
      candidateProviderId = tagMatch[1];
      candidateTag = tagMatch[2];
    }

    // Only treat the prefix as a provider if candidateProviderId matches a known registered or DB provider
    if (isKnownProviderOrAlias(candidateProviderId)) {
      providerId = candidateProviderId;
      targetTag = candidateTag;
      targetModel = candidateModel;
    } else {
      // The slash is part of the model name itself (e.g. "coarena/gpt-6-luna", "z-ai/glm-5.3-flash")
      targetModel = effective;
      providerId = undefined;
    }
  } else {
    const rules = ModelRepository.getAllRules();
    const resolved = new RuleEngine(rules).resolveModel(effective);
    targetModel = resolved.model;
    providerId = resolved.rule?.targetProviderId;
  }

  const cleanTarget = stripModelContextMarker(targetModel).model;
  if (cleanTarget) targetModel = cleanTarget;
  const targetEffortStripped = stripModelEffortSuffix(targetModel);
  if (targetEffortStripped.effort) {
    targetEffort = targetEffortStripped.effort;
    targetModel = targetEffortStripped.model;
  }
  if (!providerId) {
    const activeProviders = ProviderRepository.getAllProviders().filter((p) => p.isActive);
    const targetLower = targetModel.toLowerCase();

    // 1. Try finding an active provider that explicitly lists this model in provider.models
    const exactMatch = activeProviders.find((p) =>
      Array.isArray(p.models) && p.models.some((m) => m.toLowerCase() === targetLower)
    );
    if (exactMatch) {
      providerId = exactMatch.id;
    } else {
      const targetCompareKey = normalizeModelCompareKey(targetLower);
      const normalizedMatch = activeProviders.find((p) =>
        Array.isArray(p.models) && p.models.some((m) => normalizeModelCompareKey(m) === targetCompareKey)
      );
      if (normalizedMatch) {
        providerId = normalizedMatch.id;
        const canonical = normalizedMatch.models?.find((m) => normalizeModelCompareKey(m) === targetCompareKey);
        if (canonical) {
          targetModel = canonical;
        }
      }
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

  // Canonical targetModel resolution for known provider (Strict exact first, then dot/dash canonical)
  if (providerId) {
    const prov = ProviderRepository.getProviderById(providerId);
    if (prov && Array.isArray(prov.models) && prov.models.length > 0) {
      const hasExact = prov.models.some((m) => m.toLowerCase() === targetModel.toLowerCase());
      if (!hasExact) {
        const targetCompareKey = normalizeModelCompareKey(targetModel);
        const canonical = prov.models.find((m) => normalizeModelCompareKey(m) === targetCompareKey);
        if (canonical) {
          targetModel = canonical;
        }
      }
    }
  }

  return {
    targetModel,
    ...(targetEffort ? { targetEffort } : {}),
    providerId,
    targetTag,
    is1mContext: Boolean(is1mContext),
  };
}
