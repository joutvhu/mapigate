import React, { useState, useEffect } from "react";
import { PortalModal } from "./PortalModal.js";

export interface EditAccountData {
  id: string;
  providerId: string;
  name: string;
  isActive: boolean;
  rawApiKey?: string;
}

export interface EditAccountModalProps {
  isOpen: boolean;
  account: EditAccountData | null;
  onClose: () => void;
  onSave: (updates: { name: string; apiKey?: string; isActive: boolean }) => Promise<void>;
}

export const EditAccountModal: React.FC<EditAccountModalProps> = ({
  isOpen,
  account,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (account) {
      setName(account.name || "");
      setApiKey("");
      setIsActive(Boolean(account.isActive));
      setError(null);
    }
  }, [account]);

  if (!account) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Account name is required.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSave({
        name: name.trim(),
        apiKey: apiKey.trim() ? apiKey.trim() : undefined,
        isActive,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to save account changes.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PortalModal isOpen={isOpen} onClose={onClose} maxWidthClass="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#1E293B]">
          <h3 className="text-base font-semibold text-slate-100 flex items-center gap-2">
            <span className="material-symbols-outlined text-blue-400 text-[20px]">manage_accounts</span>
            Edit Account
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-xl">
            {error}
          </div>
        )}

        <div className="space-y-3 text-xs">
          <div>
            <label className="block text-slate-400 mb-1">Provider</label>
            <input
              type="text"
              disabled
              value={account.providerId.toUpperCase()}
              className="w-full bg-[#141B2D] border border-[#1E293B] text-slate-400 px-3 py-2 rounded-xl cursor-not-allowed opacity-75 font-mono"
            />
          </div>

          <div>
            <label className="block text-slate-300 mb-1">Account Name / Email *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Work Account or user@example.com"
              className="w-full bg-[#0A0D14] border border-[#1E293B] text-slate-100 px-3 py-2 rounded-xl focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-slate-300 mb-1">
              Update API Key / Token <span className="text-slate-500 font-normal">(Leave blank to keep existing)</span>
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter new API key or OAuth token..."
              className="w-full bg-[#0A0D14] border border-[#1E293B] text-slate-100 px-3 py-2 rounded-xl focus:outline-none focus:border-blue-500 transition-colors font-mono"
            />
          </div>

          <div className="flex items-center justify-between p-3 bg-[#141B2D] border border-[#1E293B] rounded-xl">
            <div>
              <div className="font-medium text-slate-200">Active Status</div>
              <div className="text-[11px] text-slate-400">
                Inactive accounts are excluded from routing and quota polling.
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#1E293B]">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white bg-[#141B2D] border border-[#1E293B] rounded-xl transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
          >
            {saving ? (
              <>
                <span className="material-symbols-outlined text-[15px] animate-spin">progress_activity</span>
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </button>
        </div>
      </form>
    </PortalModal>
  );
};
