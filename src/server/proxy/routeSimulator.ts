import { ToolMappingRepository, type ModelMappingResolution } from "../../storage/repositories/toolMappingRepo.js";
import { ComboRepository } from "../../storage/repositories/comboRepo.js";
import { ProviderRepository } from "../../storage/repositories/providerRepo.js";
import { AccountModelRepository } from "../../storage/repositories/accountModelRepo.js";
import { resolveTargetModelAndProvider } from "./executorHelpers.js";
import { stripModelContextMarker } from "../../core/router/ruleEngine.js";
import { normalizeModelCompareKey } from "../../shared/utils/modelUtils.js";
import { PROVIDER_REGISTRY, getRegistryProvider } from "../../shared/constants/providerRegistry.js";

export interface ComboCandidateStatus {
  candidate: string;
  providerId: string;
  targetModel: string;
  targetTag?: string;
  hasActiveAccount: boolean;
  activeAccountsCount: number;
  isNoAuth: boolean;
  isModelRecognized: boolean;
}

export interface RouteSimulationResult {
  incomingModel: string;
  cleanModel: string;
  is1mContext: boolean;
  effectiveModel: string;
  isCombo: boolean;
  comboName?: string;
  comboModels?: string[];
  comboCandidatesStatus?: ComboCandidateStatus[];
  readyCandidatesCount?: number;
  matchedRule: "tool" | "global" | "any" | "none";
  matchedToolId?: string;
  targetProviderId: string;
  baseProviderId: string;
  targetTag?: string;
  targetModel: string;
  isModelRecognized: boolean;
  isFallback: boolean;
  hasActiveAccount: boolean;
  activeAccountsCount: number;
  isNoAuth: boolean;
}

export function checkProviderReadiness(
  providerId: string,
  targetTag?: string
): {
  accounts: any[];
  activeAccounts: any[];
  hasActiveAccount: boolean;
  activeAccountsCount: number;
  isNoAuth: boolean;
} {
  const reg = PROVIDER_REGISTRY[providerId] || getRegistryProvider(providerId);
  const isNoAuth = Boolean(
    reg?.noAuth ||
      reg?.requiresApiKey === false ||
      reg?.authType === "none" ||
      providerId === "opencode" ||
      providerId === "oc"
  );

  const candidates = new Set<string>([providerId]);
  if (reg?.alias) candidates.add(reg.alias);
  if (Array.isArray(reg?.aliases)) {
    for (const a of reg.aliases) candidates.add(a);
  }

  const allAccounts: any[] = [];
  for (const cid of candidates) {
    const accs = ProviderRepository.getAccountsByProvider(cid);
    allAccounts.push(...accs);
  }

  let activeAccounts = allAccounts.filter((a) => a.isActive);
  if (targetTag) {
    const tagLower = targetTag.toLowerCase();
    activeAccounts = activeAccounts.filter(
      (a) => (a.tag || a.providerSpecificData?.tag)?.trim().toLowerCase() === tagLower
    );
  }

  const hasActiveAccount = activeAccounts.length > 0 || isNoAuth;
  const activeAccountsCount = isNoAuth && activeAccounts.length === 0 ? 1 : activeAccounts.length;

  return {
    accounts: allAccounts,
    activeAccounts,
    hasActiveAccount,
    activeAccountsCount,
    isNoAuth,
  };
}

export function checkModelRecognized(
  providerId: string,
  targetModel: string,
  accounts: any[]
): boolean {
  const reg = PROVIDER_REGISTRY[providerId] || getRegistryProvider(providerId);
  const dbProv = ProviderRepository.getProviderById(providerId);
  const allModels: any[] = [
    ...(Array.isArray(dbProv?.models) ? dbProv!.models : []),
    ...(Array.isArray(reg?.models) ? reg!.models : []),
  ];

  const activeAccIds = accounts.filter((a) => a.isActive).map((a) => a.id);
  if (activeAccIds.length > 0) {
    const scanned = AccountModelRepository.getModelsForAccounts(activeAccIds);
    allModels.push(...scanned);
  }

  const targetCompareKey = normalizeModelCompareKey(targetModel);
  return allModels.some((m: any) => {
    const id = typeof m === "string" ? m : m?.id;
    return (
      id &&
      (id.toLowerCase() === targetModel.toLowerCase() ||
        normalizeModelCompareKey(id) === targetCompareKey)
    );
  });
}

export function simulateModelRoute(
  rawModelInput: string,
  toolId?: string
): RouteSimulationResult {
  const model = (rawModelInput || "").trim();
  const stripped = stripModelContextMarker(model);
  const cleanModel = stripped.model || model;
  const is1mContext = Boolean(stripped.is1mContext);

  const tid = (toolId || "").trim().toLowerCase();
  const resolution: ModelMappingResolution = ToolMappingRepository.resolveModelMappingDetailed(
    tid || "unknown",
    cleanModel
  );

  const mapped = resolution.targetModel;
  const effectiveModel = mapped || cleanModel;

  const allCombos = ComboRepository.getAllCombos();
  const comboLookup = effectiveModel.startsWith("combo/") ? effectiveModel.slice(6) : effectiveModel;
  const isComboCandidate = !effectiveModel.includes("/") || effectiveModel.startsWith("combo/");
  const activeCombo = isComboCandidate
    ? allCombos.find(
        (c) =>
          c.isActive &&
          (c.name.toLowerCase() === comboLookup.toLowerCase() || c.id.toLowerCase() === comboLookup.toLowerCase())
      )
    : undefined;

  if (activeCombo) {
    const candidateModels = [...activeCombo.models];
    const candidateStatuses: ComboCandidateStatus[] = candidateModels.map((cand) => {
      const candResolved = resolveTargetModelAndProvider(cand);
      const candPId = candResolved.providerId || "unknown";
      const readiness = checkProviderReadiness(candPId, candResolved.targetTag);
      const recognized = checkModelRecognized(candPId, candResolved.targetModel, readiness.accounts);
      return {
        candidate: cand,
        providerId: candPId,
        targetModel: candResolved.targetModel,
        targetTag: candResolved.targetTag,
        hasActiveAccount: readiness.hasActiveAccount,
        activeAccountsCount: readiness.activeAccountsCount,
        isNoAuth: readiness.isNoAuth,
        isModelRecognized: recognized,
      };
    });

    const readyCandidates = candidateStatuses.filter((s) => s.hasActiveAccount);
    const totalActiveAccounts = candidateStatuses.reduce((sum, s) => sum + s.activeAccountsCount, 0);

    const primaryStatus = candidateStatuses[0];
    const primaryPId = primaryStatus?.providerId || "combo";
    const primaryTarget = primaryStatus?.targetModel || cleanModel;

    return {
      incomingModel: model,
      cleanModel,
      is1mContext,
      effectiveModel,
      isCombo: true,
      comboName: activeCombo.name,
      comboModels: candidateModels,
      comboCandidatesStatus: candidateStatuses,
      readyCandidatesCount: readyCandidates.length,
      matchedRule: resolution.ruleType,
      matchedToolId: resolution.matchedToolId,
      targetProviderId: "combo",
      baseProviderId: primaryPId,
      targetTag: primaryStatus?.targetTag,
      targetModel: primaryTarget,
      isModelRecognized: true,
      isFallback: false,
      hasActiveAccount: readyCandidates.length > 0,
      activeAccountsCount: totalActiveAccounts,
      isNoAuth: candidateStatuses.some((s) => s.isNoAuth),
    };
  }

  // Single model resolution
  const resolved = resolveTargetModelAndProvider(effectiveModel);
  const pId = resolved.providerId || "unknown";
  const readiness = checkProviderReadiness(pId, resolved.targetTag);
  const isModelRecognized = checkModelRecognized(pId, resolved.targetModel, readiness.accounts);
  const displayProvider = resolved.targetTag ? `${pId}[${resolved.targetTag}]` : pId;

  return {
    incomingModel: model,
    cleanModel,
    is1mContext,
    effectiveModel,
    isCombo: false,
    matchedRule: resolution.ruleType,
    matchedToolId: resolution.matchedToolId,
    targetProviderId: displayProvider,
    baseProviderId: pId,
    targetTag: resolved.targetTag,
    targetModel: resolved.targetModel,
    isModelRecognized,
    isFallback: !mapped && !isModelRecognized,
    hasActiveAccount: readiness.hasActiveAccount,
    activeAccountsCount: readiness.activeAccountsCount,
    isNoAuth: readiness.isNoAuth,
  };
}
