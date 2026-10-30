import React, { useState, useRef } from "react";
import { PortalModal } from "./PortalModal.js";

export const BackupCard: React.FC = () => {
  const [showExportModal, setShowExportModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  // Export state
  const [includeCredentials, setIncludeCredentials] = useState(false);
  const [exportPassword, setExportPassword] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Import state
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPassword, setImportPassword] = useState("");
  const [importMode, setImportMode] = useState<"merge" | "overwrite">("merge");
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleExport = async () => {
    setIsExporting(true);
    setExportError(null);
    try {
      const res = await fetch("/api/settings/backup/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          includeCredentials,
          password: exportPassword.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to generate backup");
      }

      const backupData = await res.json();
      const dateStr = new Date().toISOString().split("T")[0];
      const filename = `mapigate-backup-${dateStr}.json`;

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setShowExportModal(false);
      setExportPassword("");
    } catch (err: any) {
      setExportError(err.message || "Export failed");
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async () => {
    if (!importFile) return;
    setIsImporting(true);
    setImportError(null);
    setImportSuccess(null);

    try {
      const text = await importFile.text();
      let backupPayload: any;
      try {
        backupPayload = JSON.parse(text);
      } catch {
        throw new Error("Selected file is not valid JSON.");
      }

      const res = await fetch("/api/settings/backup/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          backup: backupPayload,
          password: importPassword.trim() || undefined,
          mode: importMode,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to restore backup");
      }

      setImportSuccess(
        `Restored ${data.restored.providersCount} providers, ${data.restored.accountsCount} accounts, ${data.restored.combosCount} combos, and ${data.restored.mappingsCount} model mappings!`
      );
      setImportFile(null);
      setImportPassword("");
      setTimeout(() => {
        setShowImportModal(false);
        setImportSuccess(null);
        window.location.reload();
      }, 2000);
    } catch (err: any) {
      setImportError(err.message || "Import failed");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="rt-card p-6 space-y-4 border border-[#1E293B]">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#1E293B]">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[20px]">settings_backup_restore</span>
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Configuration Backup & Migration</h3>
            <p className="text-xs text-slate-400">Export providers, combos, and model mappings to JSON or migrate to another machine</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              setExportError(null);
              setShowExportModal(true);
            }}
            className="rt-btn rt-btn--secondary text-xs py-2 px-4 flex items-center gap-2 cursor-pointer font-semibold"
          >
            <span className="material-symbols-outlined text-[16px]">file_download</span>
            Export Backup
          </button>
          <button
            type="button"
            onClick={() => {
              setImportError(null);
              setImportSuccess(null);
              setShowImportModal(true);
            }}
            className="rt-btn rt-btn--primary text-xs py-2 px-4 flex items-center gap-2 cursor-pointer font-semibold"
          >
            <span className="material-symbols-outlined text-[16px]">file_upload</span>
            Import Backup
          </button>
        </div>
      </div>

      <p className="text-xs text-slate-400 leading-relaxed">
        Backups include all your custom providers, multi-model combos, global model aliases, per-tool mappings, and engine preferences. If credentials are included, they are safely encrypted with your password using AES-256-GCM.
      </p>

      {/* Export Modal */}
      <PortalModal isOpen={showExportModal} onClose={() => !isExporting && setShowExportModal(false)} maxWidthClass="max-w-md">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[24px]">file_download</span>
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">Export Configuration Backup</h4>
              <p className="text-xs text-slate-400">Generate a portable JSON backup file</p>
            </div>
          </div>

          <div className="space-y-3 pt-1">
            <label className="flex items-start gap-2.5 cursor-pointer bg-[#0A0D14] p-3 rounded-xl border border-[#1E293B]">
              <input
                type="checkbox"
                checked={includeCredentials}
                onChange={(e) => setIncludeCredentials(e.target.checked)}
                className="mt-0.5 rounded border-slate-700 text-blue-600 focus:ring-0 cursor-pointer"
              />
              <div className="text-xs space-y-0.5">
                <span className="font-semibold text-white block">Include API Keys & Secrets</span>
                <span className="text-slate-400 text-[11px] block">
                  If unchecked, a zero-secrets template will be exported (safe for public sharing or team presets).
                </span>
              </div>
            </label>

            {includeCredentials && (
              <div className="space-y-1.5 animate-rt-fade-in">
                <label className="text-xs font-semibold text-slate-300 block">
                  Encryption Password (Recommended)
                </label>
                <input
                  type="password"
                  value={exportPassword}
                  onChange={(e) => setExportPassword(e.target.value)}
                  placeholder="Enter a password to encrypt credentials"
                  className="rt-input w-full text-xs py-2 px-3"
                />
                <span className="text-[11px] text-slate-500 block">
                  If set, API keys will be encrypted via AES-256-GCM and will require this password when importing.
                </span>
              </div>
            )}

            {exportError && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
                {exportError}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              onClick={() => setShowExportModal(false)}
              disabled={isExporting}
              className="rt-btn rt-btn--secondary text-xs py-2 px-4"
            >
              Cancel
            </button>
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="rt-btn rt-btn--primary text-xs py-2 px-4 flex items-center gap-1.5"
            >
              {isExporting ? "Generating..." : "Download JSON"}
            </button>
          </div>
        </div>
      </PortalModal>

      {/* Import Modal */}
      <PortalModal isOpen={showImportModal} onClose={() => !isImporting && setShowImportModal(false)} maxWidthClass="max-w-md">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-400 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[24px]">file_upload</span>
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">Import Configuration Backup</h4>
              <p className="text-xs text-slate-400">Restore or migrate settings from a JSON file</p>
            </div>
          </div>

          <div className="space-y-3 pt-1">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-[#1E293B] hover:border-blue-500/50 p-4 rounded-xl text-center cursor-pointer bg-[#0A0D14] space-y-1 transition-colors"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setImportFile(f);
                }}
              />
              <span className="material-symbols-outlined text-[28px] text-blue-400">upload_file</span>
              <p className="text-xs font-semibold text-white">
                {importFile ? importFile.name : "Click to select backup .json file"}
              </p>
              <p className="text-[11px] text-slate-500">
                {importFile ? `${(importFile.size / 1024).toFixed(1)} KB` : "Supports any Mapigate backup export"}
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 block">
                Decryption Password (If Encrypted)
              </label>
              <input
                type="password"
                value={importPassword}
                onChange={(e) => setImportPassword(e.target.value)}
                placeholder="Enter password if backup was encrypted"
                className="rt-input w-full text-xs py-2 px-3"
              />
            </div>

            <div className="flex items-center justify-between bg-[#0A0D14] p-3 rounded-xl border border-[#1E293B] text-xs">
              <span className="text-slate-400">Import Mode</span>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                  <input
                    type="radio"
                    name="importMode"
                    value="merge"
                    checked={importMode === "merge"}
                    onChange={() => setImportMode("merge")}
                    className="text-blue-600 focus:ring-0"
                  />
                  Merge
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                  <input
                    type="radio"
                    name="importMode"
                    value="overwrite"
                    checked={importMode === "overwrite"}
                    onChange={() => setImportMode("overwrite")}
                    className="text-blue-600 focus:ring-0"
                  />
                  Overwrite
                </label>
              </div>
            </div>

            {importError && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
                {importError}
              </div>
            )}

            {importSuccess && (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px]">check_circle</span>
                <span>{importSuccess}</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              onClick={() => setShowImportModal(false)}
              disabled={isImporting}
              className="rt-btn rt-btn--secondary text-xs py-2 px-4"
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={isImporting || !importFile}
              className="rt-btn rt-btn--primary text-xs py-2 px-4 flex items-center gap-1.5"
            >
              {isImporting ? "Restoring..." : "Restore Configuration"}
            </button>
          </div>
        </div>
      </PortalModal>
    </div>
  );
};
