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
  prefixHash?: string
): boolean {
  const next = LoadBalancer.pickAccount(providerId, { excludeAccountIds: triedAccountIds, targetModel, prefixHash });
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
