import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../hooks/useAuth";

export const LockScreen: React.FC = () => {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const login = useAuth((s) => s.login);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMsg(null);

    const res = await login(password);
    if (!res.success) {
      setErrorMsg(res.error || "Incorrect master password");
      setIsSubmitting(false);
      inputRef.current?.select();
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#0A0D14] p-4 animate-rt-fade-in select-none">
      {/* Background ambient lighting */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-blue-600/10 blur-[120px] rounded-full" />
      </div>

      <div className="w-full max-w-sm relative z-10 space-y-6">
        {/* Lock Box Card */}
        <div className="bg-[#0F1420] border border-[#1E293B] shadow-2xl rounded-2xl p-7 text-center space-y-5 border-t-blue-500/40">
          {/* Lock Icon */}
          <div className="size-14 mx-auto rounded-2xl bg-blue-500/10 border border-blue-500/30 text-blue-400 flex items-center justify-center shadow-inner">
            <span className="material-symbols-outlined text-[28px]">lock</span>
          </div>

          <div className="space-y-1.5">
            <h2 className="text-base font-bold text-white tracking-tight flex items-center justify-center gap-1.5">
              Dashboard Locked
            </h2>
            <p className="text-xs text-slate-400">
              Enter your Master Password to access Mapigate management
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 pt-1">
            <div className="relative text-left">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-slate-500">
                key
              </span>
              <input
                ref={inputRef}
                type={showPassword ? "text" : "password"}
                placeholder="Master password..."
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                disabled={isSubmitting}
                className="w-full bg-[#0A0D14] border border-[#1E293B] rounded-xl pl-9 pr-10 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-all font-mono"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">
                  {showPassword ? "visibility_off" : "visibility"}
                </span>
              </button>
            </div>

            {errorMsg && (
              <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 flex items-center gap-2 text-left animate-rt-scale-in">
                <span className="material-symbols-outlined text-[16px] shrink-0 text-rose-400">
                  error
                </span>
                <span className="truncate">{errorMsg}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting || !password.trim()}
              className="w-full rt-btn rt-btn--primary text-xs py-2.5 px-4 flex items-center justify-center gap-2 cursor-pointer font-semibold shadow-lg shadow-blue-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <span className="material-symbols-outlined text-[16px] animate-spin">
                    progress_activity
                  </span>
                  Verifying...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[16px]">lock_open</span>
                  Unlock Dashboard
                </>
              )}
            </button>
          </form>
        </div>

        {/* 100% Local-First Badge Footer */}
        <div className="flex items-center justify-center gap-1.5 text-slate-500 text-[11px]">
          <span className="material-symbols-outlined text-[14px] text-blue-400">
            verified_user
          </span>
          <span>100% Local-First · Coding assistants proxy unaffected</span>
        </div>
      </div>
    </div>
  );
};
