import React, { useMemo, useState } from "react";
import type { ActiveRequestItem } from "../../../../shared/types/index.js";
import { Network } from "lucide-react";
import { ToolIcon } from "../ui/ToolIcon.js";
import {
  getProviderMeta,
  type ProviderTopologyMeta,
} from "./providerTopologyHelper.js";

export { getProviderMeta };
export type { ProviderTopologyMeta };

const KAME_PARTICLE_COUNT = 5;

interface ProviderTopologyProps {
  providers?: string[];
  activeRequests?: ActiveRequestItem[];
}

export const ProviderTopology: React.FC<ProviderTopologyProps> = ({
  providers = [],
  activeRequests = [],
}) => {
  const [focusedProvider, setFocusedProvider] = useState<string | null>(null);

  // Filter out empty or placeholder/unknown names
  const displayProviders = useMemo(() => {
    const rawList = [...providers];
    for (const req of activeRequests) {
      if (req.provider) rawList.push(req.provider);
    }
    return Array.from(new Set(rawList)).filter((p) => {
      if (!p) return false;
      const lower = p.toLowerCase().trim();
      return lower !== "unknown" && lower !== "null" && lower !== "undefined";
    });
  }, [providers, activeRequests]);

  // Only actual ongoing streaming/processing requests activate the animated laser beam
  const activeProviderSet = useMemo(() => {
    const set = new Set<string>();
    for (const req of activeRequests) {
      if (req.provider) {
        const raw = req.provider.toLowerCase();
        set.add(raw);
        const meta = getProviderMeta(raw);
        set.add(meta.id.toLowerCase());
      }
    }
    return set;
  }, [activeRequests]);

  // Center coordinate of our normalized 800x440 SVG canvas
  const centerX = 400;
  const centerY = 220;

  // Calculate layout of satellite nodes
  const layoutData = useMemo(() => {
    const count = displayProviders.length;
    if (count === 0) return { items: [] };

    // Elliptical distribution radius
    const rx = Math.min(300, 160 + count * 15);
    const ry = Math.min(150, 90 + count * 8);

    const items = displayProviders.map((provId, index) => {
      const meta = getProviderMeta(provId);
      const isProvActive =
        activeProviderSet.has(provId.toLowerCase()) ||
        activeProviderSet.has(meta.id.toLowerCase());
      const isProvFocused = focusedProvider?.toLowerCase() === provId.toLowerCase() ||
        focusedProvider?.toLowerCase() === meta.id.toLowerCase();

      // Distribute evenly around 360 degrees starting from -90 deg (top)
      const angle = -Math.PI / 2 + (2 * Math.PI * index) / count;
      const px = centerX + rx * Math.cos(angle);
      const py = centerY + ry * Math.sin(angle);

      // Smooth flowing Bézier curve:
      // Control points extend vertically from Gateway (up/down) and horizontally into Provider nodes (left/right)
      // This produces the signature flowing circuit-board / neural cable wave curve.
      const isTopOrBottom = Math.abs(Math.sin(angle)) > 0.35;
      const verticalDirection = py < centerY ? -1 : 1;
      const horizontalDirection = px < centerX ? -1 : 1;

      // Start by flowing vertically or with strong curve out of gateway
      const cp1X = isTopOrBottom ? centerX : centerX + (px - centerX) * 0.5;
      const cp1Y = isTopOrBottom ? centerY + verticalDirection * Math.min(ry * 0.7, 75) : centerY;

      // Enter smoothly into the provider node horizontally
      const cp2X = px - horizontalDirection * Math.min(rx * 0.45, 60);
      const cp2Y = py;

      const pathData = `M ${centerX} ${centerY} C ${cp1X.toFixed(1)} ${cp1Y.toFixed(1)}, ${cp2X.toFixed(1)} ${cp2Y.toFixed(1)}, ${px.toFixed(1)} ${py.toFixed(1)}`;

      return {
        id: provId,
        meta,
        isActive: isProvActive,
        isFocused: isProvFocused,
        px,
        py,
        pathData,
      };
    });

    return { items };
  }, [displayProviders, activeProviderSet, focusedProvider]);

  const activeCount = activeRequests.length;
  const isRouterPowering = activeCount > 0;

  return (
    <div className="bg-[#0E1320] border border-[#1E293B] rounded-xl p-4 sm:p-5 flex flex-col shadow-xs w-full">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Network className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm sm:text-base font-bold text-white">
            Active Routing Topology
          </h3>
          <span className="text-xs text-slate-500">(Real-time Mesh)</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 text-slate-400">
            <span className="w-2 h-2 rounded-full bg-slate-600" />
            <span>Idle</span>
          </div>
          <div className="flex items-center gap-1.5 text-cyan-400 font-semibold">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
            <span>Active Stream</span>
          </div>
        </div>
      </div>

      {/* Main Canvas Container */}
      <div className="relative h-72 sm:h-80 w-full rounded-lg overflow-hidden bg-[#070A11] border border-[#162032] flex items-center justify-center">
        {displayProviders.length === 0 ? (
          <div className="text-center p-6 text-slate-500 text-xs sm:text-sm">
            <Network className="w-8 h-8 text-slate-600 mx-auto mb-2 opacity-60" />
            <p>No upstream provider traffic recorded yet</p>
          </div>
        ) : (
          <div className="relative w-full h-full select-none">
            {/* SVG Background Layer for Curved Bézier Links & Flowing Plasma */}
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              viewBox="0 0 800 440"
              preserveAspectRatio="xMidYMid meet"
            >
              <defs>
                <filter id="plasma-glow" x="-30%" y="-30%" width="160%" height="160%">
                  <feGaussianBlur stdDeviation="3.5" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>

              {layoutData.items.map((item) => {
                if (!item.isActive) {
                  return (
                    <path
                      key={`edge-${item.id}`}
                      d={item.pathData}
                      fill="none"
                      stroke="#1E293B"
                      strokeWidth="1.5"
                      strokeDasharray="4 5"
                      strokeLinecap="round"
                    />
                  );
                }

                return (
                  <g key={`edge-active-${item.id}`}>
                    {/* Glowing outer aura */}
                    <path
                      d={item.pathData}
                      fill="none"
                      stroke="#22d3ee"
                      strokeWidth="6"
                      strokeOpacity="0.25"
                      strokeLinecap="round"
                      filter="url(#plasma-glow)"
                    />
                    {/* Main energetic beam */}
                    <path
                      d={item.pathData}
                      fill="none"
                      stroke="#38bdf8"
                      strokeWidth="2.5"
                      strokeOpacity="0.85"
                      strokeLinecap="round"
                    />
                    {/* Hot intense core */}
                    <path
                      d={item.pathData}
                      fill="none"
                      stroke="#ffffff"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                    />
                    {/* Flowing electric energy orbs */}
                    {Array.from({ length: KAME_PARTICLE_COUNT }, (_, i) => (
                      <circle
                        key={`orb-${item.id}-${i}`}
                        r={i % 2 === 0 ? 3.5 : 2}
                        fill={i % 2 === 0 ? "#22d3ee" : "#ffffff"}
                        opacity="0.9"
                      >
                        <animateMotion
                          dur={`${0.8 + i * 0.15}s`}
                          repeatCount="indefinite"
                          path={item.pathData}
                          begin={`${i * 0.12}s`}
                        />
                      </circle>
                    ))}
                  </g>
                );
              })}
            </svg>

            {/* HTML Layer: Center Gateway & Satellite Provider Cards */}
            <div className="absolute inset-0 pointer-events-none">
              <svg
                className="w-full h-full"
                viewBox="0 0 800 440"
                preserveAspectRatio="xMidYMid meet"
              >
                {/* 1. Center Gateway Node (Fixed at Exact Center 400, 220) */}
                <foreignObject
                  x={centerX - 80}
                  y={centerY - 26}
                  width="160"
                  height="54"
                  className="overflow-visible pointer-events-auto"
                >
                  <div
                    className={`flex items-center justify-center gap-2.5 px-3.5 py-2.5 rounded-2xl border-2 transition-all duration-300 select-none ${
                      isRouterPowering
                        ? "border-cyan-400 bg-gradient-to-br from-blue-900/80 via-cyan-900/50 to-blue-950 shadow-[0_0_24px_rgba(34,211,238,0.5)]"
                        : "border-blue-500/40 bg-[#0A0E18] shadow-lg"
                    }`}
                  >
                    <ToolIcon
                      src="/favicon.svg"
                      name="Mapigate"
                      color="#38BDF8"
                      size="sm"
                      fallback={
                        <span className="material-symbols-outlined text-[18px] text-cyan-400">
                          graph_5
                        </span>
                      }
                      className={
                        isRouterPowering
                          ? "shadow-[0_0_14px_rgba(34,211,238,0.7)] border-cyan-400"
                          : ""
                      }
                    />
                    <div>
                      <div className="text-xs font-black tracking-wide text-white">
                        MAPIGATE
                      </div>
                      <div className="text-[9px] text-slate-400 font-mono">Gateway</div>
                    </div>
                    {activeCount > 0 && (
                      <span className="ml-1 px-1.5 py-0.5 rounded-full bg-cyan-400 text-black text-[10px] font-black animate-pulse">
                        {activeCount}
                      </span>
                    )}
                  </div>
                </foreignObject>

                {/* 2. Satellite Provider Nodes */}
                {layoutData.items.map((item) => (
                  <foreignObject
                    key={`node-${item.id}`}
                    x={item.px - 75}
                    y={item.py - 22}
                    width="150"
                    height="44"
                    className="overflow-visible pointer-events-auto"
                  >
                    <div
                      onClick={() =>
                        setFocusedProvider((curr) =>
                          curr === item.id ? null : item.id
                        )
                      }
                      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border-2 transition-all duration-300 cursor-pointer select-none bg-[#0B0F19] ${
                        item.isActive
                          ? "shadow-[0_0_18px_rgba(56,189,248,0.4)]"
                          : item.isFocused
                          ? "border-blue-500/70 bg-[#0F1626]"
                          : "border-[#1E293B] hover:border-slate-500"
                      }`}
                      style={{
                        borderColor: item.isActive
                          ? item.meta.color
                          : item.isFocused
                          ? "#3B82F6"
                          : undefined,
                      }}
                    >
                      <ToolIcon
                        src={item.meta.image}
                        name={item.meta.name}
                        color={item.meta.color}
                        iconBg={item.meta.iconBg}
                        size="sm"
                      />

                      <div className="min-w-0 flex-1 truncate">
                        <span
                          className="text-xs font-bold block truncate"
                          style={{
                            color: item.isActive
                              ? item.meta.color
                              : item.isFocused
                              ? "#93C5FD"
                              : "#E2E8F0",
                          }}
                          title={item.meta.name}
                        >
                          {item.meta.name}
                        </span>
                        <span className="text-[9px] text-slate-500 font-mono block">
                          Upstream
                        </span>
                      </div>

                      {item.isActive && (
                        <span className="relative flex h-2 w-2 ml-auto shrink-0">
                          <span
                            className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                            style={{ backgroundColor: item.meta.color }}
                          />
                          <span
                            className="relative inline-flex rounded-full h-2 w-2"
                            style={{ backgroundColor: item.meta.color }}
                          />
                        </span>
                      )}
                    </div>
                  </foreignObject>
                ))}
              </svg>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
