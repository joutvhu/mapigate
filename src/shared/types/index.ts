export type AIFormat = "openai" | "anthropic" | "gemini";

export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  format: AIFormat;
  isActive: boolean;
  priority: number;
  models: string[];
  customHeaders?: Record<string, string>;
  proxyUrl?: string;
  thinkingMode?: string;
  strategy?: string | null;
  stickyLimit?: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface ProviderAccount {
  id: string;
  providerId: string;
  name: string;
  apiKeyEncrypted: string;
  isActive: boolean;
  rateLimitHits: number;
  lastUsedAt?: number;
}

export interface ModelMappingRule {
  id: string;
  alias: string;                  // e.g. "claude-3-7-sonnet"
  targetModel: string;            // e.g. "deepseek-r1" or "claude-3-7-sonnet-20250219"
  targetProviderId: string;
  fallbackRules: string[];        // Array of fallback rule IDs or target models
  isDefault: boolean;
}

export interface RequestUsageLog {
  id: string;
  timestamp: number;
  clientTool: string;             // e.g. "claude-code", "cursor", "cline"
  requestedModel: string;
  actualModel: string;
  providerId: string;
  promptTokens: number;
  completionTokens: number;
  tokensSavedByRtk: number;
  durationMs: number;
  status: "success" | "error" | "rate_limited";
  errorMessage?: string;
}

export interface TokenStatsSummary {
  totalRequests: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokensSaved: number;
  estimatedCostSavedUsd: number;
}
