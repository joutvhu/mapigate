import React, { useState, useEffect } from "react";
import { PortalModal } from "./PortalModal";

interface CursorAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const CursorAuthModal: React.FC<CursorAuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [accessToken, setAccessToken] = useState("");
  const [machineId, setMachineId] = useState("");
  const [accountName, setAccountName] = useState("");
  const [autoDetecting, setAutoDetecting] = useState(false);
  const [autoDetected, setAutoDetected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    runAutoDetect();
  }, [isOpen]);

  const runAutoDetect = async () => {
    setAutoDetecting(true);
    setAutoDetected(false);
    setError(null);

    try {
      const res = await fetch("/api/oauth/cursor/auto-import");
      const data = await res.json();
      if (data.found) {
        setAccessToken(data.accessToken || "");
        setMachineId(data.machineId || "");
        setAutoDetected(true);
      } else {
        setError(data.error || "Could not auto-detect token from local Cursor database");
      }
    } catch (err: any) {
      setError(err.message || "Failed to auto-detect Cursor tokens");
    } finally {
      setAutoDetecting(false);
    }
  };

  const handleSave = async () => {
    if (!accessToken.trim()) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/oauth/cursor/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken: accessToken.trim(),
          machineId: machineId.trim() || undefined,
          name: accountName.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to import Cursor connection");
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || "Could not save Cursor account");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <PortalModal isOpen={isOpen} onClose={onClose} maxWidthClass="max-w-lg">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#1E293B]">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-[#0D1322] border border-[#1E293B] p-1.5 flex items-center justify-center">
              <img src="/providers/cursor.png" alt="Cursor" className="size-full object-contain" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Connect Cursor IDE</h3>
              <p className="text-xs text-slate-400">Import session token from local Cursor database</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {autoDetecting ? (
          <div className="py-8 text-center text-slate-400 space-y-2 text-xs">
            <span className="material-symbols-outlined text-3xl text-blue-400 animate-spin">
              progress_activity
            </span>
            <p className="font-semibold text-white">Scanning Cursor IDE state.vscdb...</p>
            <p className="text-slate-500">Checking local Application Support / AppData</p>
          </div>
        ) : (
          <div className="space-y-3.5 text-xs">
            {autoDetected && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">check_circle</span>
                <span>Session token auto-detected from Cursor IDE successfully!</span>
              </div>
            )}

            <div>
              <label className="block text-slate-300 font-medium mb-1">Account Label</label>
              <input
                type="text"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="Cursor Desktop Account"
                className="w-full bg-[#0A0D14] border border-[#1E293B] rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Access Token</label>
              <input
                type="password"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder="Paste Cursor access token or auto-detect"
                className="w-full bg-[#0A0D14] border border-[#1E293B] rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Machine ID</label>
              <input
                type="text"
                value={machineId}
                onChange={(e) => setMachineId(e.target.value)}
                placeholder="desktop-cursor-client"
                className="w-full bg-[#0A0D14] border border-[#1E293B] rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>

            {error && (
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
                {error}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                onClick={runAutoDetect}
                type="button"
                className="rt-btn rt-btn--secondary"
              >
                <span className="material-symbols-outlined text-[15px]">refresh</span>
                Re-detect
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !accessToken.trim()}
                className="flex-1 rt-btn rt-btn--primary disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Connection"}
              </button>
            </div>
          </div>
        )}
      </div>
    </PortalModal>
  );
};
