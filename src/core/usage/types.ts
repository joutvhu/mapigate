import type { ProviderAccount } from "../../shared/types/index.js";

export interface NormalizedQuotaItem {
  label: string;
  used: number;
  total: number;
  remainingPercentage: number;
  resetAt: number | null;
  resetInText: string;
  unlimited: boolean;
  recurring?: boolean;
}

export interface AccountQuotaResult {
  accountId: string;
  providerId: string;
  accountName: string;
  plan: string;
  isActive: boolean;
  quotas: NormalizedQuotaItem[];
  lastFetchedAt: number;
  error?: string;
  message?: string;
  providerSpecificData?: Record<string, any>;
}

export interface ProviderUsageContext {
  providerId: string;
  account: ProviderAccount & {
    rawApiKey: string;
    githubAccessToken?: string;
    projectId?: string;
  };
  force?: boolean;
  proxyUrl?: string;
}

export interface RawQuotaBucket {
  used?: number;
  total?: number;
  remaining?: number;
  remainingPercentage?: number;
  resetAt?: string | number | Date | null;
  unlimited?: boolean;
  displayName?: string;
  recurring?: boolean;
}

export interface RawProviderQuotaResult {
  plan?: string;
  quotas?: Record<string, RawQuotaBucket>;
  message?: string;
  error?: string;
}
