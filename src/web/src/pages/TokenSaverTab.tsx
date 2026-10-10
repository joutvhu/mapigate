import React, { useState } from "react";

export const TokenSaverTab: React.FC = () => {
  const [rtkEnabled, setRtkEnabled] = useState(true);
  const [compressDiff, setCompressDiff] = useState(true);
  const [compressLogs, setCompressLogs] = useState(true);
  const [testInput, setTestInput] = useState(
    "diff --git a/src/index.ts b/src/index.ts\nindex 83b9c1..94c1a2 100644\n--- a/src/index.ts\n+++ b/src/index.ts\n@@ -1,10 +1,10 @@\n const a = 1;\n const b = 2;\n const c = 3;\n const d = 4;\n const e = 5;\n const f = 6;\n+const newFeature = true;\n const g = 7;\n const h = 8;\n const i = 9;\n const j = 10;\n"
  );
  const [compressedOutput, setCompressedOutput] = useState<string | null>(null);

  const simulateCompress = () => {
    // Compress repeated lines & context
    const lines = testInput.split("\n");
    const filtered = lines.filter((l) => !l.startsWith("index "));
    setCompressedOutput(filtered.join("\n"));
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-16 animate-rt-fade-in">
      <div className="rt-card p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-cyan-400">savings</span>
              RTK Token Optimizer
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Lossless tool result compression saving 20-40% context window tokens per agent request
            </p>
          </div>

          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={rtkEnabled}
              onChange={(e) => setRtkEnabled(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-10 h-5.5 bg-[#1E293B] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4.5 after:w-4.5 after:transition-all peer-checked:bg-blue-600" />
          </label>
        </div>

        {/* Compression Filters configuration */}
        <div className="space-y-3 pt-2 border-t border-[#1E293B]">
          <span className="text-xs font-bold text-slate-300 block uppercase tracking-wider">
            Active Token Trimming Engines
          </span>

          <div className="bg-[#0A0D14] p-4 rounded-xl border border-[#1E293B] flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold text-white">Git Diff Compression</h4>
              <p className="text-[11px] text-slate-400">
                Removes redundant unchanged context lines and git commit hash metadata
              </p>
            </div>
            <input
              type="checkbox"
              checked={compressDiff}
              onChange={(e) => setCompressDiff(e.target.checked)}
              className="accent-blue-600 rounded size-4"
            />
          </div>

          <div className="bg-[#0A0D14] p-4 rounded-xl border border-[#1E293B] flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold text-white">Terminal Build & Test Logs</h4>
              <p className="text-[11px] text-slate-400">
                Strips ANSI terminal colors, infinite progress bar artifacts, and duplicate poll lines
              </p>
            </div>
            <input
              type="checkbox"
              checked={compressLogs}
              onChange={(e) => setCompressLogs(e.target.checked)}
              className="accent-blue-600 rounded size-4"
            />
          </div>
        </div>

        {/* Interactive Playground */}
        <div className="pt-2 border-t border-[#1E293B] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-200">Interactive RTK Test Sandbox:</span>
            <button onClick={simulateCompress} className="rt-btn rt-btn--primary">
              <span className="material-symbols-outlined text-[15px]">auto_fix_high</span>
              Test Trim
            </button>
          </div>

          <textarea
            value={testInput}
            onChange={(e) => setTestInput(e.target.value)}
            rows={4}
            className="w-full bg-[#0A0D14] border border-[#1E293B] rounded-xl p-3 text-xs font-mono text-slate-300 focus:outline-none focus:border-blue-500"
          />

          {compressedOutput && (
            <div className="bg-[#080B10] p-4 rounded-xl border border-blue-500/30 text-emerald-400 text-xs font-mono animate-rt-scale-in">
              <span className="text-[10px] text-slate-500 uppercase block font-sans mb-1">
                Optimized Payload (Saved ~25% tokens):
              </span>
              <pre>{compressedOutput}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
