import type { GatewayLogMetadata } from "../../../../shared/types/logging.js";
import { Cpu, Zap } from "lucide-react";

interface TokenEconomicsPanelProps {
  tokens: NonNullable<GatewayLogMetadata["tokens"]>;
}

export const TokenEconomicsPanel: React.FC<TokenEconomicsPanelProps> = ({ tokens }) => {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
        <Cpu className="size-3.5 text-blue-400" /> Token Economics
      </h4>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="p-3 rounded-lg bg-[#0A0E18] border border-[#1E293B]">
          <span className="text-[11px] text-slate-400">Prompt Tokens</span>
          <p className="text-sm font-bold font-mono text-blue-400">
            {tokens.prompt.toLocaleString()}
          </p>
        </div>
        <div className="p-3 rounded-lg bg-[#0A0E18] border border-[#1E293B]">
          <span className="text-[11px] text-slate-400">Cached Tokens (↻)</span>
          <p className="text-sm font-bold font-mono text-cyan-400">
            {(tokens.cached || 0).toLocaleString()}
          </p>
        </div>
        <div className="p-3 rounded-lg bg-[#0A0E18] border border-[#1E293B]">
          <span className="text-[11px] text-slate-400">Output Tokens</span>
          <p className="text-sm font-bold font-mono text-emerald-400">
            {tokens.completion.toLocaleString()}
          </p>
        </div>
        <div className="p-3 rounded-lg bg-[#0A0E18] border border-[#1E293B]">
          <span className="text-[11px] text-slate-400">Tokens Saved</span>
          <p className="text-sm font-bold font-mono text-amber-400 flex items-center gap-1">
            <Zap className="size-3" />
            {(tokens.savedByRtk || 0).toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
};
