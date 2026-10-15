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
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#07090E] p-4 animate-rt-fade-in select-none">
      {/* Background ambient lighting */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[25%] left-1/2 -translate-x-1/2 w-[650px] h-[450px] bg-gradient-to-b from-blue-600/15 via-indigo-600/10 to-transparent blur-[140px] rounded-full" />
        <div className="absolute -bottom-[20%] left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-blue-500/5 blur-[120px] rounded-full" />
      </div>

      <div className="w-full max-w-sm relative z-10 space-y-6">
        {/* Brand Header: Logo + App Name */}
        <div className="flex flex-col items-center justify-center text-center space-y-3">
          <div className="relative group">
            {/* Ambient glow behind logo */}
            <div className="absolute -inset-1 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-2xl blur-md opacity-40 group-hover:opacity-75 transition-opacity" />
            <div className="relative size-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/30 border border-blue-400/30">
              <span className="material-symbols-outlined text-[24px]">graph_5</span>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-white font-sans">
                Mapigate
              </h1>
              <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 font-mono">
                AI
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 font-medium">
              Ultra-lightweight Local AI Gateway
            </p>
          </div>
        </div>

        {/* Lock Box Card */}
        <div className="bg-[#0D111A]/90 backdrop-blur-xl border border-slate-800/80 shadow-2xl shadow-black/60 rounded-2xl p-6 sm:p-7 text-center space-y-5 border-t-blue-500/50">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800/60">
            <div className="flex items-center gap-2 text-left">
              <div className="size-8 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center">
                <span className="material-symbols-outlined text-[18px]">lock</span>
              </div>
              <div>
                <h2 className="text-xs font-semibold text-white tracking-tight">
                  Dashboard Locked
                </h2>
                <p className="text-[11px] text-slate-400">
                  Authentication required
                </p>
              </div>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800/80 text-slate-300 border border-slate-700/50">
              v1.0
            </span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative text-left">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-slate-500">
                key
              </span>
              <input
                ref={inputRef}
                type={showPassword ? "text" : "password"}
                placeholder="Enter master password..."
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                disabled={isSubmitting}
                className="w-full bg-[#07090E] border border-slate-800 rounded-xl pl-9 pr-10 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all font-mono"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                aria-label={showPassword ? "Hide password" : "Show password"}
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
              className="w-full rt-btn rt-btn--primary text-xs py-2.5 px-4 flex items-center justify-center gap-2 cursor-pointer font-semibold shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
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
