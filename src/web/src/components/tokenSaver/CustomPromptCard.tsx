import React, { useState, useEffect } from "react";

interface CustomPromptCardProps {
  enabled: boolean;
  prompt: string;
  onToggle: (enabled: boolean) => void;
  onSavePrompt: (prompt: string) => void;
  disabled?: boolean;
}

export const CustomPromptCard: React.FC<CustomPromptCardProps> = ({
  enabled,
  prompt,
  onToggle,
  onSavePrompt,
  disabled,
}) => {
  const [localPrompt, setLocalPrompt] = useState(prompt);

  useEffect(() => {
    setLocalPrompt(prompt);
  }, [prompt]);

  const handleBlur = () => {
    if (localPrompt !== prompt) {
      onSavePrompt(localPrompt);
    }
  };

  return (
    <div className={`rt-card p-6 space-y-4 transition-opacity ${enabled ? "opacity-100" : "opacity-75"}`}>
      {/* Header & Toggle */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-emerald-400 text-[22px]">edit_note</span>
            <h3 className="text-base font-bold text-white">Custom System Prompt</h3>
            <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
              System Injection
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Appends your own house rules, coding style, or instructions to every request across all providers and models.
          </p>
        </div>

        <label className="relative inline-flex items-center cursor-pointer shrink-0">
          <input
            type="checkbox"
            checked={enabled}
            disabled={disabled}
            onChange={(e) => onToggle(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-[#1E293B] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500" />
        </label>
      </div>

      {enabled && (
        <div className="space-y-2 pt-2 border-t border-[#1E293B]">
          <label className="block text-xs font-semibold text-slate-300">
            Prompt Instructions
          </label>
          <textarea
            value={localPrompt}
            onChange={(e) => setLocalPrompt(e.target.value)}
            onBlur={handleBlur}
            disabled={disabled}
            rows={4}
            placeholder="e.g. Always prefer editing existing files over creating new ones. Do not add mock tests without asking."
            className="w-full rounded-xl border border-[#1E293B] bg-[#0A0D14] p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 transition-colors font-mono"
          />
          <p className="text-[11px] text-slate-500">
            Injected safely into system/instructions for OpenAI, Anthropic, Gemini, Kiro, and Responses. An empty prompt injects nothing.
          </p>
        </div>
      )}
    </div>
  );
};
