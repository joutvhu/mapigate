import React, { useState, useEffect, useMemo } from "react";
import { PortalModal } from "./PortalModal";

export interface CommunityCatalogItem {
  id: string;
  name: string;
  baseUrl: string;
  format: "openai" | "claude" | string;
  category: string;
  authType: string;
  website?: string;
  notice?: string;
  models?: Array<{ id: string; name?: string; isDefault?: boolean }>;
}

export interface CommunityCatalogModalProps {
  isOpen: boolean;
  existingProviderIds: string[];
  onClose: () => void;
  onImportSuccess: (providerId: string) => void;
}

export const CommunityCatalogModal: React.FC<CommunityCatalogModalProps> = ({
  isOpen,
  existingProviderIds,
  onClose,
  onImportSuccess,
}) => {
  const [catalog, setCatalog] = useState<CommunityCatalogItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  // Selected item for import modal
  const [importingItem, setImportingItem] = useState<CommunityCatalogItem | null>(null);
  const [customBaseUrl, setCustomBaseUrl] = useState("");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [accountNameInput, setAccountNameInput] = useState("Default Account");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setIsLoading(true);
    fetch("/api/providers/community-catalog")
      .then((res) => res.json())
      .then((data) => {
        if (data && Array.isArray(data.catalog)) {
          setCatalog(data.catalog);
        }
      })
      .catch((err) => {
        console.error("Failed to load community catalog:", err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [isOpen]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const item of catalog) {
      if (item.category) set.add(item.category);
    }
    return ["all", ...Array.from(set).sort()];
  }, [catalog]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return catalog.filter((item) => {
      if (selectedCategory !== "all" && item.category !== selectedCategory) {
        return false;
      }
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q) ||
        item.baseUrl.toLowerCase().includes(q) ||
        item.models?.some((m) => m.id.toLowerCase().includes(q))
      );
    });
  }, [catalog, searchQuery, selectedCategory]);

  const handleOpenImport = (item: CommunityCatalogItem) => {
    setImportingItem(item);
    setCustomBaseUrl(item.baseUrl || "https://api.openai.com");
    setApiKeyInput("");
    setAccountNameInput("Default Account");
    setErrorMsg(null);
  };

  const handleConfirmImport = async () => {
    if (!importingItem) return;
    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/providers/community-catalog/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: importingItem.id,
          customBaseUrl: customBaseUrl.trim(),
          apiKey: apiKeyInput.trim() || undefined,
          accountName: accountNameInput.trim() || "Default Account",
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to import provider");
      }

      onImportSuccess(importingItem.id);
      setImportingItem(null);
    } catch (err: any) {
      setErrorMsg(err.message || "Import failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <PortalModal isOpen={isOpen} onClose={onClose}>
      <div className="relative w-full max-w-4xl bg-[#0B0F19] border border-[#1E293B] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="p-6 border-b border-[#1E293B] bg-[#0F1420]/70 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <span className="material-symbols-outlined text-[22px]">explore</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">Community Providers Catalog (P3)</h2>
                <span className="px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[11px] font-mono">
                  {catalog.length} Available
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Browse on-demand multi-gateways, token resellers, and community inference proxies. Import directly into active providers.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Filters & Search */}
        <div className="p-4 border-b border-[#1E293B] bg-[#0A0D14]/80 flex flex-wrap items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[240px]">
            <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-500 text-[18px]">search</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search community provider by name, ID, endpoint..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-[#0F1420] border border-[#1E293B] rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/60 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-2.5 text-slate-500 hover:text-white text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Category Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium capitalize transition-colors cursor-pointer ${
                  selectedCategory === cat
                    ? "bg-blue-600 text-white shadow-xs"
                    : "bg-[#0F1420] text-slate-400 border border-[#1E293B] hover:text-white"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Content List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 min-h-[300px]">
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center text-slate-500 text-xs gap-3">
              <span className="material-symbols-outlined animate-spin text-[28px] text-blue-400">sync</span>
              <span>Loading community catalog...</span>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="py-16 text-center text-slate-500 text-xs flex flex-col items-center justify-center gap-2">
              <span className="material-symbols-outlined text-[32px] text-slate-600">search_off</span>
              <span>No community providers match your filter query.</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredItems.map((item) => {
                const isImported = existingProviderIds.includes(item.id);
                return (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-xl bg-[#0F1420]/80 border border-[#1E293B] hover:border-slate-700 transition-all flex flex-col justify-between gap-3 group"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-xs text-white">{item.name}</span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#1E293B] text-slate-400 font-mono">
                              {item.id}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono truncate max-w-[280px] mt-1" title={item.baseUrl || "Custom Base URL required"}>
                            {item.baseUrl || <span className="italic text-amber-500/80">Requires custom URL</span>}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono uppercase font-semibold ${
                              item.format === "claude"
                                ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            }`}
                          >
                            {item.format}
                          </span>
                        </div>
                      </div>

                      {/* Models summary or website */}
                      <div className="flex items-center gap-3 mt-3 text-[11px] text-slate-400">
                        {item.models && item.models.length > 0 && (
                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-[13px] text-slate-500">memory</span>
                            {item.models.length} preset models
                          </span>
                        )}
                        {item.website && (
                          <a
                            href={item.website}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1 text-blue-400/80 hover:text-blue-300 transition-colors"
                          >
                            <span className="material-symbols-outlined text-[13px]">open_in_new</span>
                            Docs
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Action */}
                    <div className="pt-2 border-t border-[#1E293B]/60 flex items-center justify-between">
                      <span className="text-[10px] text-slate-500 capitalize">{item.category}</span>
                      {isImported ? (
                        <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-medium px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                          <span className="material-symbols-outlined text-[13px]">check_circle</span>
                          Active
                        </span>
                      ) : (
                        <button
                          onClick={() => handleOpenImport(item)}
                          className="flex items-center gap-1 px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-semibold transition-colors cursor-pointer shadow-xs"
                        >
                          <span className="material-symbols-outlined text-[13px]">download</span>
                          Import
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="p-3 border-t border-[#1E293B] bg-[#0A0D14] flex items-center justify-between text-xs text-slate-500">
          <span>Showing {filteredItems.length} of {catalog.length} community providers</span>
          <span className="flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px] text-blue-400">info</span>
            Imported providers are saved locally in SQLite and support load balancing.
          </span>
        </div>

        {/* Sub-modal: Import Provider Configuration */}
        {importingItem && (
          <div className="absolute inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-rt-fade-in">
            <div className="w-full max-w-md bg-[#0F1420] border border-[#1E293B] rounded-2xl p-5 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-[#1E293B] pb-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-blue-400 text-[18px]">add_task</span>
                  <h3 className="text-sm font-bold text-white">Import {importingItem.name}</h3>
                </div>
                <button
                  onClick={() => setImportingItem(null)}
                  className="text-slate-400 hover:text-white text-xs cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {errorMsg && (
                <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px]">error</span>
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Base URL</label>
                  <input
                    type="text"
                    value={customBaseUrl}
                    onChange={(e) => setCustomBaseUrl(e.target.value)}
                    placeholder="https://api.example.com/v1"
                    className="w-full px-3 py-2 bg-[#0A0D14] border border-[#1E293B] rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/60"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    API endpoint prefix where request completions will be routed.
                  </p>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Account Name</label>
                  <input
                    type="text"
                    value={accountNameInput}
                    onChange={(e) => setAccountNameInput(e.target.value)}
                    placeholder="Default Account"
                    className="w-full px-3 py-2 bg-[#0A0D14] border border-[#1E293B] rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/60"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">API Key (Optional)</label>
                  <input
                    type="password"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="sk-..."
                    className="w-full px-3 py-2 bg-[#0A0D14] border border-[#1E293B] rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/60"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Encrypted with AES-256-GCM hardware vault. You can also configure it later.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#1E293B]">
                <button
                  onClick={() => setImportingItem(null)}
                  disabled={isSubmitting}
                  className="px-3.5 py-1.5 rounded-xl border border-[#1E293B] text-slate-400 hover:text-white text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmImport}
                  disabled={isSubmitting || !customBaseUrl.trim()}
                  className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  {isSubmitting ? (
                    <>
                      <span className="material-symbols-outlined animate-spin text-[14px]">sync</span>
                      Importing...
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[14px]">check</span>
                      Save & Activate
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PortalModal>
  );
};
