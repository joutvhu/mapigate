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
  is1mContext: boolean;
} {
  const { model: cleanModelStr, is1mContext } = stripModelContextMarker(modelStr);
  const effective = cleanModelStr || modelStr;
  let targetModel = effective;
  let providerId: string | undefined;

  if (effective.includes("/")) {
    const slash = effective.indexOf("/");
    providerId = effective.slice(0, slash);
    targetModel = effective.slice(slash + 1);
  } else {
    const rules = ModelRepository.getAllRules();
    const resolved = new RuleEngine(rules).resolveModel(effective);
    targetModel = resolved.model;
    providerId = resolved.rule?.targetProviderId;
  }

  const cleanTarget = stripModelContextMarker(targetModel).model;
  if (cleanTarget) targetModel = cleanTarget;
  if (!providerId) {
    providerId = ProviderRepository.getAllProviders().find((p) => p.isActive)?.id;
  }
  return { targetModel, providerId, is1mContext: Boolean(is1mContext) };
}
