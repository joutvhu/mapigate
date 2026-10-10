import React, { useState } from "react";
import { SEED_QUOTA_ACCOUNTS, type AccountQuotaCard } from "../constants/mockData";

export const QuotaTab: React.FC = () => {
  const [accounts, setAccounts] = useState(SEED_QUOTA_ACCOUNTS);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const toggleAccount = (id: string) => {
    setAccounts(accounts.map((a) => (a.id === id ? { ...a, isActive: !a.isActive } : a)));
  };

  const turnOffEmpty = () => {
    setAccounts(
      accounts.map((a) => {
        const hasZero = a.quotas.some((q) => q.percent === 0);
        return hasZero ? { ...a, isActive: false } : a;
      })
    );
  };

  const turnOnAvailable = () => {
    setAccounts(
      accounts.map((a) => {
        const hasAvailable = a.quotas.some((q) => q.percent > 0);
        return hasAvailable ? { ...a, isActive: true } : a;
      })
    );
  };

  const getBarColor = (percent: number) => {
    if (percent === 0) return "bg-red-500";
    if (percent < 50) return "bg-amber-500";
    return "bg-emerald-400";
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16 animate-rt-fade-in">
      {/* Top Controls Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs p-4 rounded-2xl bg-[#0F1420]/70 border border-[#1E293B]">
        <div className="flex flex-wrap items-center gap-2">
          <select className="bg-[#0A0D14] border border-[#1E293B] text-slate-200 rounded-xl px-3 py-1.5 focus:outline-none focus:border-blue-500">
            <option>All providers</option>
            <option>Antigravity</option>
            <option>GitHub Copilot</option>
          </select>

          <select className="bg-[#0A0D14] border border-[#1E293B] text-slate-200 rounded-xl px-3 py-1.5 focus:outline-none focus:border-blue-500">
            <option>All accounts</option>
          </select>

          <select className="bg-[#0A0D14] border border-[#1E293B] text-slate-200 rounded-xl px-3 py-1.5 focus:outline-none focus:border-blue-500">
            <option>Expiring first</option>
            <option>Highest available</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={turnOffEmpty}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors cursor-pointer font-medium"
          >
            <span className="material-symbols-outlined text-[15px]">block</span>
            Turn off Empty
          </button>

          <button
            onClick={turnOnAvailable}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors cursor-pointer font-medium"
          >
            <span className="material-symbols-outlined text-[15px]">check_circle</span>
            Turn on Available
          </button>

          <label className="flex items-center gap-1.5 text-slate-400 cursor-pointer ml-1 select-none">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="accent-blue-600 rounded"
            />
            Autorefresh
          </label>

          <button
            onClick={() => alert("Refreshed all sliding window quotas.")}
            className="p-1.5 rounded-xl border border-[#1E293B] bg-[#0A0D14] text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">refresh</span>
          </button>
        </div>
      </div>

      {/* Grid of Quota Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {accounts.map((card, idx) => (
          <div
            key={card.id}
            className={`rt-card stagger-item space-y-4 p-5 ${
              !card.isActive ? "opacity-60" : ""
            }`}
            style={{ animationDelay: `${idx * 45}ms` }}
          >
            {/* Account Card Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="size-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center p-2 shrink-0">
                  <img src={card.providerIcon} alt={card.provider} className="size-full object-contain" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-bold text-white truncate">{card.provider}</h4>
                  <p className="text-[11px] text-blue-400 truncate font-mono">{card.accountName}</p>
                </div>
              </div>

              {/* Actions & Switch */}
              <div className="flex items-center gap-2">
                <button className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/5 transition-colors">
                  <span className="material-symbols-outlined text-[16px]">edit</span>
                </button>
                <button className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/5 transition-colors">
                  <span className="material-symbols-outlined text-[16px]">refresh</span>
                </button>
                <label className="relative inline-flex items-center cursor-pointer ml-1">
                  <input
                    type="checkbox"
                    checked={card.isActive}
                    onChange={() => toggleAccount(card.id)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-[#1E293B] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
                </label>
              </div>
            </div>

            {/* Quota Progress Bars */}
            <div className="space-y-3 pt-1 border-t border-[#1E293B]">
              <span className="text-[10px] font-bold text-slate-500 tracking-wider uppercase">
                {card.quotas.length} RATE WINDOWS & QUOTAS
              </span>

              {card.quotas.map((q, qIdx) => (
                <div key={qIdx} className="space-y-1.5 text-[11px]">
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="flex items-center gap-2 font-medium">
                      <span className={`size-1.5 rounded-full ${getBarColor(q.percent)}`} />
                      {q.label}
                    </span>
                    <div className="flex items-center gap-2 font-mono text-[10.5px]">
                      {q.used && <span className="text-slate-500">{q.used}</span>}
                      <span className={q.percent === 0 ? "text-red-400 font-bold" : "text-emerald-400 font-bold"}>
                        {q.percent}%
                      </span>
                      <span className="text-slate-400">{q.resetIn}</span>
                    </div>
                  </div>

                  {/* Glowing progress track */}
                  <div className="h-2 w-full bg-[#0A0D14] rounded-full overflow-hidden p-0.5 border border-[#1E293B]">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${getBarColor(q.percent)}`}
                      style={{ width: `${q.percent}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
