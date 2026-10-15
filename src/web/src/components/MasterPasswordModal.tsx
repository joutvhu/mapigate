import React, { useState } from "react";
import { PortalModal } from "./PortalModal";
import { AuthService } from "../services/authService";
import { useAuth } from "../hooks/useAuth";

export type MasterPasswordModalMode = "setup" | "change" | "remove" | null;

interface MasterPasswordModalProps {
  mode: MasterPasswordModalMode;
  onClose: () => void;
  onSuccess?: () => void;
}

export const MasterPasswordModal: React.FC<MasterPasswordModalProps> = ({
  mode,
  onClose,
  onSuccess,
}) => {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const checkAuth = useAuth((s) => s.checkAuth);

  if (!mode) return null;

  const resetForm = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setShowCurrent(false);
    setShowNew(false);
    setErrorMsg(null);
    setIsSubmitting(false);
  };

  const handleClose = () => {
    if (isSubmitting) return;
    resetForm();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (mode === "setup" || mode === "change") {
      if (!newPassword || newPassword.length < 4) {
        setErrorMsg("New password must be at least 4 characters long");
        return;
      }
      if (newPassword !== confirmPassword) {
        setErrorMsg("Passwords do not match");
        return;
      }
    }

    if ((mode === "change" || mode === "remove") && !currentPassword) {
      setErrorMsg("Current password is required");
      return;
    }

    setIsSubmitting(true);

    try {
      if (mode === "setup") {
        const res = await AuthService.setup(newPassword);
        if (!res.success) {
          setErrorMsg(res.error || "Failed to setup master password");
          setIsSubmitting(false);
          return;
        }
      } else if (mode === "change") {
        const res = await AuthService.changePassword(currentPassword, newPassword);
        if (!res.success) {
          setErrorMsg(res.error || "Failed to change master password");
          setIsSubmitting(false);
          return;
        }
      } else if (mode === "remove") {
        const res = await AuthService.removePassword(currentPassword);
        if (!res.success) {
          setErrorMsg(res.error || "Failed to remove master password");
          setIsSubmitting(false);
          return;
        }
      }

      await checkAuth();
      resetForm();
      onClose();
      onSuccess?.();
    } catch (err: any) {
      setErrorMsg(err.message || "An unexpected error occurred");
      setIsSubmitting(false);
    }
  };

  return (
    <PortalModal isOpen={Boolean(mode)} onClose={handleClose} maxWidthClass="max-w-md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div
            className={`size-10 rounded-xl flex items-center justify-center shrink-0 border ${
              mode === "remove"
                ? "bg-rose-500/10 border-rose-500/30 text-rose-400"
                : "bg-blue-500/10 border-blue-500/30 text-blue-400"
            }`}
          >
            <span className="material-symbols-outlined text-[22px]">
              {mode === "remove" ? "lock_open" : mode === "change" ? "key" : "lock"}
            </span>
          </div>
          <div>
            <h4 className="text-sm font-bold text-white">
              {mode === "setup"
                ? "Set Master Password"
                : mode === "change"
                ? "Change Master Password"
                : "Remove Master Password"}
            </h4>
            <p className="text-xs text-slate-400">
              {mode === "setup"
                ? "Protect Mapigate dashboard and management APIs"
                : mode === "change"
                ? "Update your existing dashboard password"
                : "Disable authentication requirement"}
            </p>
          </div>
        </div>

        {/* Informational Notice */}
        {mode === "remove" ? (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 leading-relaxed space-y-1">
            <p className="font-semibold">Warning: Disabling Master Password</p>
            <p className="text-[11px] text-rose-200/80">
              Anyone with access to this machine or network will be able to view and manage your AI providers, API keys, and configurations without logging in.
            </p>
          </div>
        ) : (
          <div className="p-3 rounded-xl bg-[#0A0D14] border border-[#1E293B] text-xs text-slate-300 leading-relaxed space-y-1">
            <p className="text-slate-400 text-[11px]">
              AI coding assistant proxy routes (<code className="text-blue-400 font-mono">/v1/*</code>) remain completely untouched and unauthenticated. Only web dashboard management is protected.
            </p>
          </div>
        )}

        {/* Inputs */}
        <div className="space-y-3 pt-1">
          {(mode === "change" || mode === "remove") && (
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-300">
                Current Master Password
              </label>
              <div className="relative">
                <input
                  type={showCurrent ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => {
                    setCurrentPassword(e.target.value);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  placeholder="Enter current password..."
                  required
                  className="w-full bg-[#0A0D14] border border-[#1E293B] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-all font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[15px]">
                    {showCurrent ? "visibility_off" : "visibility"}
                  </span>
                </button>
              </div>
            </div>
          )}

          {(mode === "setup" || mode === "change") && (
            <>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-300">
                  {mode === "setup" ? "Master Password" : "New Master Password"}
                </label>
                <div className="relative">
                  <input
                    type={showNew ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value);
                      if (errorMsg) setErrorMsg(null);
                    }}
                    placeholder="At least 4 characters..."
                    required
                    minLength={4}
                    className="w-full bg-[#0A0D14] border border-[#1E293B] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-all font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew(!showNew)}
                    tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[15px]">
                      {showNew ? "visibility_off" : "visibility"}
                    </span>
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-300">
                  Confirm {mode === "setup" ? "Password" : "New Password"}
                </label>
                <input
                  type={showNew ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  placeholder="Re-enter password..."
                  required
                  className="w-full bg-[#0A0D14] border border-[#1E293B] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-all font-mono"
                />
              </div>
            </>
          )}
        </div>

        {/* Error message */}
        {errorMsg && (
          <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 flex items-center gap-2">
            <span className="material-symbols-outlined text-[15px] shrink-0 text-rose-400">
              error
            </span>
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="rt-btn rt-btn--secondary text-xs py-2 px-4 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className={`text-xs py-2 px-4 flex items-center gap-1.5 cursor-pointer font-semibold rounded-xl ${
              mode === "remove"
                ? "rt-btn rt-btn--danger"
                : "rt-btn rt-btn--primary"
            }`}
          >
            {isSubmitting ? (
              <>
                <span className="material-symbols-outlined text-[15px] animate-spin">
                  progress_activity
                </span>
                Processing...
              </>
            ) : mode === "setup" ? (
              <>
                <span className="material-symbols-outlined text-[15px]">lock</span>
                Set Password
              </>
            ) : mode === "change" ? (
              <>
                <span className="material-symbols-outlined text-[15px]">check</span>
                Save Changes
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[15px]">lock_open</span>
                Remove Protection
              </>
            )}
          </button>
        </div>
      </form>
    </PortalModal>
  );
};
