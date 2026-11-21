import React from "react";
import { Select } from "./Select.js";

export interface FreeTierComboConfigBarProps {
  comboName: string;
  onComboNameChange: (val: string) => void;
  strategy: "round-robin" | "fallback" | "fusion" | "lkgp" | "p2c";
  onStrategyChange: (val: "round-robin" | "fallback" | "fusion" | "lkgp" | "p2c") => void;
}

export const FreeTierComboConfigBar: React.FC<FreeTierComboConfigBarProps> = ({
  comboName,
  onComboNameChange,
  strategy,
  onStrategyChange,
}) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-[#0A0D14] border border-[#1E293B] shrink-0">
      <div>
        <label className="block text-xs font-semibold text-slate-300 mb-1.5">
          Combo Identifier <span className="text-rose-400">*</span>
        </label>
        <input
          type="text"
          value={comboName}
          onChange={(e) => onComboNameChange(e.target.value)}
          placeholder="e.g. free-fallback"
          className="w-full px-3 py-2 bg-[#0F1420] border border-[#1E293B] rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-300 mb-1.5">
          Routing Strategy
        </label>
        <Select
          value={strategy}
          onChange={(val) => onStrategyChange(val as any)}
          options={[
            { value: "fallback", label: "Fallback (try free models in order)" },
            { value: "round-robin", label: "Round Robin (distribute across free tiers)" },
            { value: "lkgp", label: "LKGP (Last Known Good Provider)" },
            { value: "fusion", label: "Fusion (parallel multi-model panel)" },
            { value: "p2c", label: "P2C (Power of Two Choices)" },
          ]}
          className="w-full"
        />
      </div>
    </div>
  );
};
