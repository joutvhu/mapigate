import type { LogToolSnippet } from "../../../../shared/types/logging.js";
import { Wrench } from "lucide-react";

interface ToolCallsPanelProps {
  tools: LogToolSnippet[];
}

export const ToolCallsPanel: React.FC<ToolCallsPanelProps> = ({ tools }) => {
  if (!tools || tools.length === 0) return null;

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
        <Wrench className="size-3.5 text-purple-400" /> Tool Calls ({tools.length})
      </h4>
      <div className="space-y-2">
        {tools.map((t, idx) => (
          <div
            key={idx}
            className="p-3 rounded-lg bg-[#0A0E18] border border-[#1E293B] flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="p-1 rounded bg-purple-500/20 text-purple-300">
                <Wrench className="size-3.5" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-bold text-white font-mono truncate">
                  {t.name}
                </p>
                <p className="text-[11px] text-slate-400 font-mono truncate">
                  {t.summary}
                </p>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300 uppercase">
              {t.type}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
