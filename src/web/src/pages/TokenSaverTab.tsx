import React, { useState, useEffect, useCallback } from "react";
import { type TokenSaverSettings, DEFAULT_TOKEN_SAVER_SETTINGS } from "../components/tokenSaver/types.js";
import { RtkCard } from "../components/tokenSaver/RtkCard.js";
import { CavemanCard } from "../components/tokenSaver/CavemanCard.js";
import { PonytailCard } from "../components/tokenSaver/PonytailCard.js";

function parseSettings(data: any): TokenSaverSettings {
  return {
    rtkEnabled: Boolean(data?.rtkEnabled),
    cavemanEnabled: Boolean(data?.cavemanEnabled),
    cavemanLevel: data?.cavemanLevel || "lite",
    ponytailEnabled: Boolean(data?.ponytailEnabled),
    ponytailLevel: data?.ponytailLevel || "lite",
  };
}

export const TokenSaverTab: React.FC = () => {
  const [settings, setSettings] = useState<TokenSaverSettings>(DEFAULT_TOKEN_SAVER_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedBadge, setSavedBadge] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/settings/token-saver");
      if (!res.ok) throw new Error("Failed to load token saver configuration");
      const data = await res.json();
      setSettings(parseSettings(data));
    } catch (err: any) {
      setError(err?.message || "Could not connect to settings API");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleUpdate = async (partial: Partial<TokenSaverSettings>) => {
    const previous = { ...settings };
    setSettings((prev) => ({ ...prev, ...partial }));
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/settings/token-saver", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partial),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to persist token saver settings");
      }

      const updated = await res.json();
      setSettings(parseSettings(updated));
      setSavedBadge(true);
      setTimeout(() => setSavedBadge(false), 2500);
    } catch (err: any) {
      setError(err?.message || "Failed to save settings");
      setSettings(previous); // Rollback
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="w-full px-2 sm:px-4 py-8 space-y-4 animate-rt-fade-in">
        <div className="rt-card p-6 h-32 animate-pulse bg-[#0F1420]" />
        <div className="rt-card p-6 h-48 animate-pulse bg-[#0F1420]" />
        <div className="rt-card p-6 h-48 animate-pulse bg-[#0F1420]" />
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full px-2 sm:px-4 pb-16 animate-rt-fade-in">
      {/* Top Header & Auto-Save Status */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="material-symbols-outlined text-[24px] text-cyan-400">savings</span>
            Token Saver Engine &amp; Prompt Optimizers
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Reduce input and output token consumption across coding agents (Claude Code, Cursor, Cline, OpenCode, Codex).
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          {saving && (
            <span className="flex items-center gap-1.5 text-cyan-400 font-medium">
              <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
              Saving changes...
            </span>
          )}
          {savedBadge && !saving && (
            <span className="flex items-center gap-1.5 text-emerald-400 font-medium animate-rt-fade-in">
              <span className="material-symbols-outlined text-[16px]">check_circle</span>
              All changes saved
            </span>
          )}
          {error && (
            <span className="flex items-center gap-1.5 text-rose-400 font-medium">
              <span className="material-symbols-outlined text-[16px]">error</span>
              {error}
            </span>
          )}
        </div>
      </div>

      {error && !saving && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between gap-3 text-xs text-rose-300">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-rose-400 text-[18px]">warning</span>
            <span>{error}</span>
          </div>
          <button onClick={loadSettings} className="rt-btn text-xs py-1 px-3 border border-rose-500/30 text-rose-300 hover:bg-rose-500/20">
            Retry
          </button>
        </div>
      )}

      {/* Overview Status Pills */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3.5 rounded-xl bg-[#0A0D14] border border-[#1E293B] flex items-center justify-between">
          <div>
            <div className="text-[11px] text-slate-400 font-medium">Input Tool Trimming</div>
            <div className="text-xs font-bold text-white mt-0.5">RTK Tool Optimizer</div>
          </div>
          <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
            settings.rtkEnabled ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30" : "bg-slate-800 text-slate-500"
          }`}>
            {settings.rtkEnabled ? "Active" : "Off"}
          </span>
        </div>

        <div className="p-3.5 rounded-xl bg-[#0A0D14] border border-[#1E293B] flex items-center justify-between">
          <div>
            <div className="text-[11px] text-slate-400 font-medium">Output Fluff Removal</div>
            <div className="text-xs font-bold text-white mt-0.5">Caveman ({settings.cavemanLevel})</div>
          </div>
          <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
            settings.cavemanEnabled ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" : "bg-slate-800 text-slate-500"
          }`}>
            {settings.cavemanEnabled ? "Active" : "Off"}
          </span>
        </div>

        <div className="p-3.5 rounded-xl bg-[#0A0D14] border border-[#1E293B] flex items-center justify-between">
          <div>
            <div className="text-[11px] text-slate-400 font-medium">Simplicity Bias Persona</div>
            <div className="text-xs font-bold text-white mt-0.5">Ponytail ({settings.ponytailLevel})</div>
          </div>
          <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
            settings.ponytailEnabled ? "bg-purple-500/20 text-purple-300 border border-purple-500/30" : "bg-slate-800 text-slate-500"
          }`}>
            {settings.ponytailEnabled ? "Active" : "Off"}
          </span>
        </div>
      </div>

      <RtkCard enabled={settings.rtkEnabled} disabled={saving} onToggle={(val) => handleUpdate({ rtkEnabled: val })} />
      <CavemanCard
        enabled={settings.cavemanEnabled}
        level={settings.cavemanLevel}
        disabled={saving}
        onToggle={(val) => handleUpdate({ cavemanEnabled: val })}
        onSelectLevel={(val) => handleUpdate({ cavemanLevel: val })}
      />
      <PonytailCard
        enabled={settings.ponytailEnabled}
        level={settings.ponytailLevel}
        disabled={saving}
        onToggle={(val) => handleUpdate({ ponytailEnabled: val })}
        onSelectLevel={(val) => handleUpdate({ ponytailLevel: val })}
      />
    </div>
  );
};
