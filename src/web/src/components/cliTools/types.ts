export interface ToolMappingItem {
  toolId: string;
  sourceModel: string;
  targetModel: string;
  groupName?: string;
  isEnabled?: boolean;
  effortTargets?: Record<string, string>;
}

export interface SaveMappingOptions {
  groupName?: string | null;
  isEnabled?: boolean;
  effortTargets?: Record<string, string> | null;
}

export interface ComboCandidateStatus {
  candidate: string;
  providerId: string;
  targetModel: string;
  targetTag?: string;
  resolvedEffort?: string | null;
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
  matchedEffort?: string;
  resolvedEffort?: string | null;
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
