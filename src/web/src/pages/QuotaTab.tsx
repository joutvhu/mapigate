import React, { useState, useEffect, useCallback, useMemo } from "react";
import type { AccountQuotaResult } from "../../core/usage/types.js";
import { ProviderLimitCard } from "../components/quota/ProviderLimitCard.js";
import {
  QuotaToolbar,
  type QuotaSortMode,
  type AccountStatusFilter,
} from "../components/quota/QuotaToolbar.js";
import { EditAccountModal, type EditAccountData } from "../components/EditAccountModal.js";
import { ConfirmModal } from "../components/ConfirmModal.js";

const AUTO_REFRESH_INTERVAL_SEC = 60;
const LOCAL_STORAGE_QUOTA_KEY = "mapigate_cached_quota_accounts";
const LOCAL_STORAGE_SORT_KEY = "mapigate_quota_sort_mode";

export interface QuotaTabProps {
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
}

export const QuotaTab: React.FC<QuotaTabProps> = ({
  searchQuery: externalSearchQuery,
  onSearchQueryChange: externalOnSearchQueryChange,
}) => {
  const [internalSearchQuery, setInternalSearchQuery] = useState("");
  const searchQuery = externalSearchQuery !== undefined ? externalSearchQuery : internalSearchQuery;
  const onSearchQueryChange = externalOnSearchQueryChange || setInternalSearchQuery;

  // Initialize from localStorage for instantaneous 0ms display on entry
  const [accounts, setAccounts] = useState<AccountQuotaResult[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_QUOTA_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {}
    return [];
  });
  const [loading, setLoading] = useState<boolean>(() => accounts.length === 0);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState("all");
  const [statusFilter, setStatusFilter] = useState<AccountStatusFilter>("all");
  const [sortMode, setSortMode] = useState<QuotaSortMode>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_SORT_KEY);
      if (
        saved === "fixed" ||
        saved === "expiring-first" ||
        saved === "quota-asc" ||
        saved === "quota-desc"
      ) {
        return saved as QuotaSortMode;
      }
    } catch {}
    return "fixed";
  });
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [countdown, setCountdown] = useState(AUTO_REFRESH_INTERVAL_SEC);

  const [editingAccount, setEditingAccount] = useState<EditAccountData | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    variant?: "danger" | "emerald" | "primary";
    confirmText?: string;
    onConfirm: () => void;
  } | null>(null);

  // Fetch all accounts and quotas
  const fetchAllQuotas = useCallback(async (force = false) => {
    try {
      if (force) {
        setRefreshingAll(true);
      }
      const url = force ? "/api/quota?force=true" : "/api/quota";
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data: AccountQuotaResult[] = await res.json();
      setAccounts(data);
      try {
        localStorage.setItem(LOCAL_STORAGE_QUOTA_KEY, JSON.stringify(data));
      } catch {}
    } catch (err: any) {
      console.error("[QuotaTab] Failed to fetch quotas:", err);
    } finally {
      setLoading(false);
      setRefreshingAll(false);
    }
  }, []);

  // Initial load: show cached results immediately, then revalidate in background
  useEffect(() => {
    fetchAllQuotas(false).then(() => {
      // Revalidate in background to fetch fresh quotas without showing empty state
      fetchAllQuotas(true);
    });
  }, [fetchAllQuotas]);

  // Auto-refresh countdown effect (respects Page Visibility API)
  useEffect(() => {
    if (!autoRefresh) return;

    const timer = setInterval(() => {
      // Pause countdown when tab is hidden to save network/CPU
      if (document.hidden) return;

      setCountdown((prev) => {
        if (prev <= 1) {
          fetchAllQuotas(false);
          return AUTO_REFRESH_INTERVAL_SEC;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [autoRefresh, fetchAllQuotas]);

  // Manual refresh all accounts
  const handleRefreshAll = async () => {
    setRefreshingAll(true);
    setCountdown(AUTO_REFRESH_INTERVAL_SEC);
    await fetchAllQuotas(true);
  };

  // Single account refresh
  const handleRefreshAccount = async (accountId: string) => {
    try {
      const res = await fetch(`/api/quota/${accountId}`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const updated: AccountQuotaResult = await res.json();
      setAccounts((prev) =>
        prev.map((acc) =>
          acc.accountId === accountId
            ? {
                ...acc,
                ...updated,
                sortOrder: acc.sortOrder ?? updated.sortOrder,
                createdAt: acc.createdAt ?? updated.createdAt,
              }
            : acc
        )
      );
    } catch (err: any) {
      console.error(`[QuotaTab] Failed to refresh account ${accountId}:`, err);
    }
  };

  // Single account toggle
  const handleToggleAccount = async (accountId: string, isActive: boolean) => {
    // Optimistic UI update
    setAccounts((prev) =>
      prev.map((acc) => (acc.accountId === accountId ? { ...acc, isActive } : acc))
    );

    try {
      const res = await fetch(`/api/quota/accounts/${accountId}/toggle`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) {
        // Revert on failure
        setAccounts((prev) =>
          prev.map((acc) => (acc.accountId === accountId ? { ...acc, isActive: !isActive } : acc))
        );
      }
    } catch (err) {
      setAccounts((prev) =>
        prev.map((acc) => (acc.accountId === accountId ? { ...acc, isActive: !isActive } : acc))
      );
    }
  };

  // Save edited account details
  const handleSaveAccount = async (updates: {
    name: string;
    apiKey?: string;
    isActive: boolean;
    providerSpecificData?: Record<string, any>;
  }) => {
    if (!editingAccount) return;

    const res = await fetch(`/api/quota/accounts/${editingAccount.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Failed to update account.");
    }

    const { account: updatedAccount } = await res.json();
    if (updatedAccount) {
      setAccounts((prev) =>
        prev.map((acc) => (acc.accountId === editingAccount.id ? updatedAccount : acc))
      );
    } else {
      await fetchAllQuotas(true);
    }
  };

  // Batch action: Turn off Empty
  const handleTurnOffEmpty = () => {
    const emptyAccounts = accounts.filter(
      (acc) =>
        acc.isActive &&
        acc.quotas.length > 0 &&
        acc.quotas.some((q) => !q.unlimited && q.remainingPercentage === 0)
    );

    if (emptyAccounts.length === 0) {
      alert("No active accounts with depleted (0%) quota found.");
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: "Turn off Depleted Accounts",
      message: `Are you sure you want to turn off ${emptyAccounts.length} account(s) with 0% quota? This will prevent upstream 429 rate limit errors.`,
      variant: "danger",
      confirmText: `Turn off (${emptyAccounts.length})`,
      onConfirm: async () => {
        const ids = emptyAccounts.map((a) => a.accountId);
        // Optimistic UI update
        setAccounts((prev) =>
          prev.map((a) => (ids.includes(a.accountId) ? { ...a, isActive: false } : a))
        );
        setConfirmModal(null);

        try {
          await fetch("/api/quota/toggle-batch", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ accountIds: ids, isActive: false }),
          });
        } catch (err) {
          console.error("[QuotaTab] Failed to turn off depleted accounts:", err);
        }
      },
    });
  };

  // Batch action: Turn on Available
  const handleTurnOnAvailable = () => {
    const availableAccounts = accounts.filter(
      (acc) =>
        !acc.isActive &&
        acc.quotas.length > 0 &&
        acc.quotas.every((q) => q.unlimited || q.remainingPercentage > 0)
    );

    if (availableAccounts.length === 0) {
      alert("No inactive accounts with available (>0%) quota found.");
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: "Turn on Available Accounts",
      message: `Activate ${availableAccounts.length} account(s) that have recovered capacity?`,
      variant: "emerald",
      confirmText: `Turn on (${availableAccounts.length})`,
      onConfirm: async () => {
        const ids = availableAccounts.map((a) => a.accountId);
        setAccounts((prev) =>
          prev.map((a) => (ids.includes(a.accountId) ? { ...a, isActive: true } : a))
        );
        setConfirmModal(null);

        try {
          await fetch("/api/quota/toggle-batch", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ accountIds: ids, isActive: true }),
          });
        } catch (err) {
          console.error("[QuotaTab] Failed to turn on available accounts:", err);
        }
      },
    });
  };

  // Distinct list of providers for dropdown
  const uniqueProviders = useMemo(() => {
    const set = new Set<string>();
    accounts.forEach((a) => {
      if (a.providerId) set.add(a.providerId.toLowerCase());
    });
    return Array.from(set).sort();
  }, [accounts]);

  // Filtered & Sorted accounts
  const visibleAccounts = useMemo(() => {
    let list = [...accounts];

    // 1. Provider Filter
    if (selectedProvider !== "all") {
      list = list.filter(
        (a) => a.providerId.toLowerCase() === selectedProvider.toLowerCase()
      );
    }

    // 2. Status Filter
    if (statusFilter === "active") {
      list = list.filter((a) => a.isActive);
    } else if (statusFilter === "inactive") {
      list = list.filter((a) => !a.isActive);
    }

    // 3. Search Query Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (a) =>
          a.accountName.toLowerCase().includes(q) ||
          a.providerId.toLowerCase().includes(q) ||
          a.accountId.toLowerCase().includes(q)
      );
    }

    // 4. Sorting
    if (sortMode === "fixed") {
      list.sort((a, b) => {
        const pDiff = a.providerId.localeCompare(b.providerId);
        if (pDiff !== 0) return pDiff;
        const sDiff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
        if (sDiff !== 0) return sDiff;
        if (a.createdAt && b.createdAt && a.createdAt !== b.createdAt) {
          return a.createdAt - b.createdAt;
        }
        const nDiff = a.accountName.localeCompare(b.accountName);
        if (nDiff !== 0) return nDiff;
        return a.accountId.localeCompare(b.accountId);
      });
    } else if (sortMode === "expiring-first") {
      const getEarliestExpiry = (acc: AccountQuotaResult): number => {
        const timestamps = acc.quotas
          .map((q) => q.resetAt)
          .filter((t): t is number => typeof t === "number" && t > 0);
        return timestamps.length > 0 ? Math.min(...timestamps) : Number.POSITIVE_INFINITY;
      };

      list.sort((a, b) => {
        const diff = getEarliestExpiry(a) - getEarliestExpiry(b);
        if (diff !== 0) return diff;
        const pDiff = a.providerId.localeCompare(b.providerId);
        if (pDiff !== 0) return pDiff;
        const sDiff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
        if (sDiff !== 0) return sDiff;
        if (a.createdAt && b.createdAt && a.createdAt !== b.createdAt) {
          return a.createdAt - b.createdAt;
        }
        const nDiff = a.accountName.localeCompare(b.accountName);
        if (nDiff !== 0) return nDiff;
        return a.accountId.localeCompare(b.accountId);
      });
    } else if (sortMode === "quota-asc") {
      const getMinPercentage = (acc: AccountQuotaResult): number => {
        if (acc.quotas.length === 0) return Number.POSITIVE_INFINITY;
        return Math.min(...acc.quotas.map((q) => q.remainingPercentage));
      };

      list.sort((a, b) => {
        const diff = getMinPercentage(a) - getMinPercentage(b);
        if (diff !== 0) return diff;
        const pDiff = a.providerId.localeCompare(b.providerId);
        if (pDiff !== 0) return pDiff;
        const sDiff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
        if (sDiff !== 0) return sDiff;
        if (a.createdAt && b.createdAt && a.createdAt !== b.createdAt) {
          return a.createdAt - b.createdAt;
        }
        const nDiff = a.accountName.localeCompare(b.accountName);
        if (nDiff !== 0) return nDiff;
        return a.accountId.localeCompare(b.accountId);
      });
    } else if (sortMode === "quota-desc") {
      const getMaxPercentage = (acc: AccountQuotaResult): number => {
        if (acc.quotas.length === 0) return Number.NEGATIVE_INFINITY;
        return Math.max(...acc.quotas.map((q) => q.remainingPercentage));
      };

      list.sort((a, b) => {
        const diff = getMaxPercentage(b) - getMaxPercentage(a);
        if (diff !== 0) return diff;
        const pDiff = a.providerId.localeCompare(b.providerId);
        if (pDiff !== 0) return pDiff;
        const sDiff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
        if (sDiff !== 0) return sDiff;
        if (a.createdAt && b.createdAt && a.createdAt !== b.createdAt) {
          return a.createdAt - b.createdAt;
        }
        const nDiff = a.accountName.localeCompare(b.accountName);
        if (nDiff !== 0) return nDiff;
        return a.accountId.localeCompare(b.accountId);
      });
    }

    return list;
  }, [accounts, selectedProvider, statusFilter, sortMode, searchQuery]);

  // Divide into 2 groups: with quota data (top) and without quota data (bottom)
  const { accountsWithData, accountsWithoutData } = useMemo(() => {
    const withData: AccountQuotaResult[] = [];
    const withoutData: AccountQuotaResult[] = [];

    for (const acc of visibleAccounts) {
      if (
        (Array.isArray(acc.quotas) && acc.quotas.length > 0) ||
        Boolean(acc.error)
      ) {
        withData.push(acc);
      } else {
        withoutData.push(acc);
      }
    }

    return { accountsWithData: withData, accountsWithoutData: withoutData };
  }, [visibleAccounts]);

  const handleSelectSortMode = (mode: QuotaSortMode) => {
    setSortMode(mode);
    try {
      localStorage.setItem(LOCAL_STORAGE_SORT_KEY, mode);
    } catch {}
  };

  return (
    <div className="space-y-6 w-full px-2 sm:px-4 pb-16 animate-rt-fade-in">
      {/* Top Controls Toolbar */}
      <QuotaToolbar
        providers={uniqueProviders}
        selectedProvider={selectedProvider}
        onSelectProvider={setSelectedProvider}
        statusFilter={statusFilter}
        onSelectStatusFilter={setStatusFilter}
        sortMode={sortMode}
        onSelectSortMode={handleSelectSortMode}
        searchQuery={searchQuery}
        onSearchQueryChange={onSearchQueryChange}
        autoRefresh={autoRefresh}
        onToggleAutoRefresh={setAutoRefresh}
        countdownSeconds={countdown}
        isRefreshingAll={refreshingAll}
        onRefreshAll={handleRefreshAll}
        onTurnOffEmpty={handleTurnOffEmpty}
        onTurnOnAvailable={handleTurnOnAvailable}
      />

      {/* Grid of Quota Cards */}
      {loading ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(400px,1fr))] gap-4 w-full">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="bg-[#0F1420]/80 border border-[#1E293B] rounded-2xl p-5 space-y-4 animate-pulse shadow-lg"
            >
              <div className="flex items-center gap-3">
                <div className="size-10 bg-slate-800 rounded-xl" />
                <div className="space-y-2 flex-1">
                  <div className="h-4 bg-slate-800 rounded w-1/2" />
                  <div className="h-3 bg-slate-800 rounded w-3/4" />
                </div>
              </div>
              <div className="space-y-3 pt-2">
                <div className="h-3 bg-slate-800 rounded w-full" />
                <div className="h-2 bg-slate-800 rounded-full w-full" />
                <div className="h-3 bg-slate-800 rounded w-5/6" />
                <div className="h-2 bg-slate-800 rounded-full w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : visibleAccounts.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-[#0F1420]/50 border border-[#1E293B] text-slate-400 space-y-3">
          <span className="material-symbols-outlined text-[36px] text-slate-500">
            account_balance_wallet
          </span>
          <div className="text-sm font-medium text-slate-300">No matching accounts found</div>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {accounts.length === 0
              ? "Connect provider accounts in the Providers tab to track real-time quota."
              : "Try adjusting your provider, status, or search filters above."}
          </p>
        </div>
      ) : (
        <div className="space-y-8 w-full">
          {/* Group 1: Accounts with Quota Data */}
          {accountsWithData.length > 0 && (
            <div className="space-y-3">
              {accountsWithoutData.length > 0 && (
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                  <span className="size-2 rounded-full bg-emerald-400" />
                  <span>Accounts With Quota ({accountsWithData.length})</span>
                </div>
              )}
              <div className="grid grid-cols-[repeat(auto-fill,minmax(400px,1fr))] gap-4 w-full">
                {accountsWithData.map((account) => (
                  <ProviderLimitCard
                    key={account.accountId}
                    account={account}
                    onRefresh={handleRefreshAccount}
                    onEdit={(acc) =>
                      setEditingAccount({
                        id: acc.accountId,
                        providerId: acc.providerId,
                        name: acc.accountName,
                        isActive: acc.isActive,
                        providerSpecificData: acc.providerSpecificData,
                      })
                    }
                    onToggle={handleToggleAccount}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Group 2: Accounts without Quota Data (Placed below) */}
          {accountsWithoutData.length > 0 && (
            <div
              className={`space-y-3 ${
                accountsWithData.length > 0 ? "pt-6 border-t border-[#1E293B]/70" : ""
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
                  <span className="size-2 rounded-full bg-slate-500" />
                  <span>Accounts Without Quota Data ({accountsWithoutData.length})</span>
                </div>
                <span className="text-[11px] text-slate-500 font-mono">
                  No active quota or unsupported metrics
                </span>
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(400px,1fr))] gap-4 w-full">
                {accountsWithoutData.map((account) => (
                  <ProviderLimitCard
                    key={account.accountId}
                    account={account}
                    onRefresh={handleRefreshAccount}
                    onEdit={(acc) =>
                      setEditingAccount({
                        id: acc.accountId,
                        providerId: acc.providerId,
                        name: acc.accountName,
                        isActive: acc.isActive,
                        providerSpecificData: acc.providerSpecificData,
                      })
                    }
                    onToggle={handleToggleAccount}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Edit Account Modal (Mounted via React Portal to document.body) */}
      <EditAccountModal
        isOpen={Boolean(editingAccount)}
        account={editingAccount}
        onClose={() => setEditingAccount(null)}
        onSave={handleSaveAccount}
      />

      {/* Confirmation Modal (Mounted via React Portal to document.body) */}
      {confirmModal && (
        <ConfirmModal
          isOpen={confirmModal.isOpen}
          title={confirmModal.title}
          message={confirmModal.message}
          variant={confirmModal.variant}
          confirmText={confirmModal.confirmText}
          onConfirm={confirmModal.onConfirm}
          onCancel={() => setConfirmModal(null)}
        />
      )}
    </div>
  );
};
