export type AIFormat = "openai" | "anthropic" | "gemini" | "claude" | string;
export type { ComboRecord, ComboConfig } from "../../storage/repositories/comboRepo.js";

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
  credentialForm?: string;
  noAuth?: boolean;
  authType?: "api-key" | "none" | "oauth" | string;
  requiresApiKey?: boolean;
  isLocal?: boolean;
  defaultBaseUrl?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ProviderAccount {
  id: string;
  providerId: string;
  name: string;
  tag?: string;
  apiKeyEncrypted: string;
  isActive: boolean;
  rateLimitHits: number;
  sortOrder?: number;
  lastUsedAt?: number;
  createdAt?: number;
  providerSpecificData?: Record<string, any>;
  cachedQuotas?: string;
  quotaFetchedAt?: number;
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
  cachedTokens?: number;
  cacheCreationTokens?: number;
  cost?: number;
  accountId?: string;
  accountName?: string;
  apiKeyId?: string;
  apiKeyName?: string;
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
  totalCachedTokens?: number;
  totalCost?: number;
}

export interface CounterBucket {
  requests: number;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  cost: number;
}

export interface ModelCounterBucket extends CounterBucket {
  rawModel?: string;
  provider?: string;
  lastUsed?: string | number;
}

export interface AccountCounterBucket extends CounterBucket {
  rawModel?: string;
  provider?: string;
  accountId?: string;
  accountName?: string;
  lastUsed?: string | number;
}

export interface ApiKeyCounterBucket extends CounterBucket {
  apiKeyId?: string;
  apiKeyName?: string;
  lastUsed?: string | number;
}

export interface ActiveRequestItem {
  model: string;
  provider: string;
  account?: string;
  count: number;
}

export interface RecentRequestItem {
  id?: string;
  timestamp: number | string;
  model: string;
  requestedModel?: string;
  provider: string;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  cost?: number;
  durationMs?: number;
  status: "success" | "error" | "rate_limited" | "ok";
}

export interface UsageStatsResult {
  totalRequests: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalCachedTokens: number;
  totalCost: number;
  totalTokensSaved: number;
  estimatedCostSavedUsd?: number;
  byProvider: Record<string, CounterBucket>;
  byModel: Record<string, ModelCounterBucket>;
  byAccount: Record<string, AccountCounterBucket>;
  byApiKey?: Record<string, ApiKeyCounterBucket>;
  activeRequests: ActiveRequestItem[];
  recentRequests: RecentRequestItem[];
  errorProvider?: string;
}

export interface ChartDataPoint {
  label: string;
  time?: string;
  tokens: number;
  requests: number;
  cost: number;
}

export interface RequestDetail {
  id: string;
  timestamp: string | number;
  provider?: string | null;
  model?: string | null;
  connectionId?: string | null;
  accountName?: string | null;
  clientTool?: string;
  status?: string | number | null;
  is1mContext?: boolean;
  contextMarker?: string | null;
  latency?: {
    totalMs?: number;
    ttftMs?: number;
  };
  tokens?: {
    promptTokens?: number;
    completionTokens?: number;
    cachedTokens?: number;
    cacheCreationTokens?: number;
    tokensSavedByRtk?: number;
  };
  cost?: number;
  request?: {
    headers?: Record<string, string>;
    body?: any;
    _truncated?: boolean;
    _originalSize?: number;
  };
  providerRequest?: {
    url?: string;
    headers?: Record<string, string>;
    body?: any;
    _truncated?: boolean;
    _originalSize?: number;
  };
  providerResponse?: {
    status?: number;
    headers?: Record<string, string>;
    body?: any;
    _truncated?: boolean;
    _originalSize?: number;
  };
  response?: {
    status?: number;
    headers?: Record<string, string>;
    body?: any;
    _truncated?: boolean;
    _originalSize?: number;
  };
  errorMessage?: string;
}

export interface RequestDetailFilter {
  page?: number;
  pageSize?: number;
  provider?: string;
  model?: string;
  status?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
}

export interface RequestDetailsListResponse {
  details: RequestDetail[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface ScannedModel {
  id: string;
  name?: string;
  description?: string;
  contextLength?: number;
  capabilities?: {
    vision?: boolean;
    reasoning?: boolean;
    audio?: boolean;
  };
  raw?: any;
}

export interface ScanModelsResult {
  success: boolean;
  endpointUrl?: string;
  models: ScannedModel[];
  count: number;
  error?: string;
  scannedAccounts?: { id: string; name: string }[];
  failedAccounts?: { id: string; name: string; error?: string }[];
  noAccountsConfigured?: boolean;
}

export interface ScanModelsOptions {
  providerId?: string;
  accountId?: string;
  baseUrl?: string;
  apiKey?: string;
  customHeaders?: Record<string, string>;
  format?: string;
  timeoutMs?: number;
  region?: string;
  providerSpecificData?: Record<string, any>;
}

export * from "./logging.js";

