import type { ModelCapabilities } from "../../../../core/capabilities/index.js";

export interface ModelOption {
  id: string;
  value: string;
  name: string;
  providerId: string;
  providerName: string;
  caps: ModelCapabilities;
  contextLength?: number;
  kind?: string;
  isCustom?: boolean;
  searchTarget: string;
  normalizedSearchTarget: string;
}

export interface ModelSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  initialSelectedModels?: string[];
  onConfirm?: (models: string[]) => void;
  multiSelect?: boolean;
  filterModality?: "vision" | "audio" | "pdf" | "thinking" | null;
  // 9router-style props
  onSelect?: (model: ModelOption) => void;
  onDeselect?: (model: ModelOption) => void;
  selectedModel?: string;
  activeProviders?: Array<{
    id?: string;
    provider?: string;
    name?: string;
    accountsCount?: number;
    [key: string]: unknown;
  }>;
  modelAliases?: Record<string, string>;
  kindFilter?: string | null;
  capFilter?: "vision" | "audio" | "pdf" | "thinking" | string | null;
  addedModelValues?: string[];
  closeOnSelect?: boolean;
  excludeModelIds?: string[];
  allowCombos?: boolean;
}

export interface ComboSummary {
  id: string;
  name: string;
  models: string[];
  strategy?: "round-robin" | "fallback" | "fusion" | "lkgp" | "p2c" | string;
  isActive?: boolean;
  caps?: ModelCapabilities | null;
}

export interface ProviderSidebarItem {
  providerId: string;
  providerName: string;
  color?: string;
  iconBg?: string;
  image?: string;
  modelCount: number;
  selectedCount: number;
  isConnected: boolean;
}

export function formatContextLength(len?: number): string | null {
  if (!len || len <= 0) return null;
  if (len >= 1000000) {
    const m = (len / 1000000).toFixed(len % 1000000 === 0 ? 0 : 1);
    return `${m}M ctx`;
  }
  if (len >= 1000) {
    const k = Math.round(len / 1000);
    return `${k}K ctx`;
  }
  return `${len} ctx`;
}

export function createModelOption(
  id: string,
  value: string,
  name: string,
  providerId: string,
  providerName: string,
  caps: ModelCapabilities,
  contextLength?: number,
  kind = "llm",
  isCustom = false
): ModelOption {
  const searchTarget = `${name} ${id} ${value} ${providerName} ${providerId}`.toLowerCase();
  const normalizedSearchTarget = searchTarget.replace(/[-_./]/g, " ");
  return {
    id,
    value,
    name,
    providerId,
    providerName,
    caps,
    contextLength,
    kind,
    isCustom,
    searchTarget,
    normalizedSearchTarget,
  };
}
