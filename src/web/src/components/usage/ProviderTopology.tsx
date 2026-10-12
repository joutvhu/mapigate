import React, { useMemo, useState } from "react";
import {
  ReactFlow,
  Handle,
  Position,
  BaseEdge,
  getBezierPath,
  type Node,
  type Edge,
  type EdgeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
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

interface RouterNodeData extends Record<string, unknown> {
  activeCount?: number;
}

interface ProviderNodeData extends Record<string, unknown> {
  label: string;
  color?: string;
  image?: string;
  iconBg?: string;
  active: boolean;
  onClick?: () => void;
}

// Custom Mapigate Central Gateway Node
function RouterNode({ data }: { data: RouterNodeData }) {
  const activeCount = data?.activeCount || 0;
  const isPowering = activeCount > 0;

  return (
    <div
      className={`relative flex items-center justify-center px-4 py-3 rounded-2xl border-2 transition-all duration-300 min-w-[140px] select-none ${
        isPowering
          ? "border-cyan-400 bg-gradient-to-br from-blue-900/60 via-cyan-900/40 to-blue-950/80 shadow-[0_0_24px_rgba(34,211,238,0.4)]"
          : "border-blue-500/40 bg-[#0A0E18] shadow-md"
      }`}
    >
      <Handle type="source" position={Position.Top} id="top" className="!bg-transparent !border-0 !w-0 !h-0" />
      <Handle type="source" position={Position.Bottom} id="bottom" className="!bg-transparent !border-0 !w-0 !h-0" />
      <Handle type="source" position={Position.Left} id="left" className="!bg-transparent !border-0 !w-0 !h-0" />
      <Handle type="source" position={Position.Right} id="right" className="!bg-transparent !border-0 !w-0 !h-0" />

      <div className="flex items-center gap-2.5">
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
            isPowering
              ? "shadow-[0_0_14px_rgba(34,211,238,0.7)] border-cyan-400"
              : ""
          }
        />
        <div>
          <div className="text-xs font-black tracking-wide text-white">MAPIGATE</div>
          <div className="text-[9px] text-slate-400 font-mono">Gateway</div>
        </div>
        {activeCount > 0 && (
          <span className="ml-1 px-1.5 py-0.5 rounded-full bg-cyan-400 text-black text-[10px] font-black animate-pulse">
            {activeCount}
          </span>
        )}
      </div>
    </div>
  );
}

// Custom Satellite Provider Node
function ProviderNode({ data }: { data: ProviderNodeData }) {
  const { label, color, image, iconBg, active, onClick } = data;

  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border-2 transition-all duration-300 cursor-pointer select-none bg-[#0B0F19] ${
        active
          ? "shadow-[0_0_18px_rgba(56,189,248,0.35)]"
          : "border-[#1E293B] hover:border-slate-600"
      }`}
      style={{
        borderColor: active ? color : undefined,
        minWidth: "150px",
      }}
    >
      <Handle type="target" position={Position.Top} id="top" className="!bg-transparent !border-0 !w-0 !h-0" />
      <Handle type="target" position={Position.Bottom} id="bottom" className="!bg-transparent !border-0 !w-0 !h-0" />
      <Handle type="target" position={Position.Left} id="left" className="!bg-transparent !border-0 !w-0 !h-0" />
      <Handle type="target" position={Position.Right} id="right" className="!bg-transparent !border-0 !w-0 !h-0" />

      <ToolIcon
        src={image}
        name={label}
        color={color}
        iconBg={iconBg}
        size="sm"
      />

      <div className="truncate">
        <span
          className="text-xs font-bold block truncate"
          style={{ color: active ? color : "#E2E8F0" }}
        >
          {label}
        </span>
        <span className="text-[9px] text-slate-500 font-mono block">Upstream</span>
      </div>

      {active && (
        <span className="relative flex h-2 w-2 ml-auto shrink-0">
          <span
            className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
            style={{ backgroundColor: color }}
          />
          <span
            className="relative inline-flex rounded-full h-2 w-2"
            style={{ backgroundColor: color }}
          />
        </span>
      )}
    </div>
  );
}

// Electric beam edge when active, subtle dashed edge when idle
function TopologyEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  data,
}: EdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const active = Boolean(data?.active);

  if (!active) {
    return (
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: "#26354D",
          strokeWidth: 1.5,
          strokeDasharray: "4 4",
          ...style,
        }}
      />
    );
  }

  return (
    <g>
      {/* Outer Glow Halo */}
      <path
        d={edgePath}
        fill="none"
        stroke="#22d3ee"
        strokeWidth={7}
        strokeOpacity={0.25}
        strokeLinecap="round"
      />
      {/* Plasma beam */}
      <path
        d={edgePath}
        fill="none"
        stroke="#38bdf8"
        strokeWidth={3}
        strokeOpacity={0.8}
        strokeLinecap="round"
      />
      {/* Hot white core */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{ stroke: "#ffffff", strokeWidth: 1.5 }}
      />
      {/* Energy Orbs flowing along the path */}
      {Array.from({ length: KAME_PARTICLE_COUNT }, (_, i) => (
        <circle
          key={`${id}-p-${i}`}
          r={i % 2 === 0 ? 3.5 : 2}
          fill={i % 2 === 0 ? "#22d3ee" : "#ffffff"}
          opacity={0.9}
        >
          <animateMotion
            dur={`${0.8 + i * 0.15}s`}
            repeatCount="indefinite"
            path={edgePath}
            begin={`${i * 0.12}s`}
          />
        </circle>
      ))}
    </g>
  );
}

const nodeTypes = {
  router: RouterNode,
  provider: ProviderNode,
};

const edgeTypes = {
  topology: TopologyEdge,
};

interface ProviderTopologyProps {
  providers?: string[];
  activeRequests?: ActiveRequestItem[];
}

export const ProviderTopology: React.FC<ProviderTopologyProps> = ({
  providers = [],
  activeRequests = [],
}) => {
  const [focusedProvider, setFocusedProvider] = useState<string | null>(null);

  // Return empty list if no providers recorded
  const displayProviders = useMemo(() => {
    if (providers.length > 0) return Array.from(new Set(providers));
    return [];
  }, [providers]);

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
    if (focusedProvider) {
      const raw = focusedProvider.toLowerCase();
      set.add(raw);
      const meta = getProviderMeta(raw);
      set.add(meta.id.toLowerCase());
    }
    return set;
  }, [activeRequests, focusedProvider]);

  const { nodes, edges } = useMemo(() => {
    const count = displayProviders.length;
    if (count === 0) {
      return { nodes: [], edges: [] };
    }
    const rx = Math.max(260, (180 * count) / (2 * Math.PI));
    const ry = Math.max(160, rx * 0.55);

    const nodesList: Node[] = [
      {
        id: "router",
        type: "router",
        position: { x: 0, y: 0 },
        data: { activeCount: activeRequests.length },
        draggable: false,
      },
    ];

    const edgesList: Edge[] = [];

    displayProviders.forEach((provId, i) => {
      const meta = getProviderMeta(provId);
      const isProvActive =
        activeProviderSet.has(provId.toLowerCase()) ||
        activeProviderSet.has(meta.id.toLowerCase());
      const nodeId = `provider-${provId}`;

      // Distribute along ellipse around center
      const angle = -Math.PI / 2 + (2 * Math.PI * i) / count;
      const cx = rx * Math.cos(angle);
      const cy = ry * Math.sin(angle);

      // Determine handle directions
      let sourceHandle = "right";
      let targetHandle = "left";
      if (Math.abs(angle + Math.PI / 2) < Math.PI / 4) {
        sourceHandle = "top";
        targetHandle = "bottom";
      } else if (Math.abs(angle - Math.PI / 2) < Math.PI / 4) {
        sourceHandle = "bottom";
        targetHandle = "top";
      } else if (cx > 0) {
        sourceHandle = "right";
        targetHandle = "left";
      } else {
        sourceHandle = "left";
        targetHandle = "right";
      }

      nodesList.push({
        id: nodeId,
        type: "provider",
        position: { x: cx - 75, y: cy - 25 },
        data: {
          label: meta.name,
          color: meta.color,
          image: meta.image,
          iconBg: meta.iconBg,
          active: isProvActive,
          onClick: () => {
            setFocusedProvider((curr) => (curr === provId ? null : provId));
          },
        },
        draggable: false,
      });

      edgesList.push({
        id: `e-router-${nodeId}`,
        type: "topology",
        source: "router",
        sourceHandle,
        target: nodeId,
        targetHandle,
        data: { active: isProvActive },
      });
    });

    return { nodes: nodesList, edges: edgesList };
  }, [displayProviders, activeProviderSet, activeRequests.length]);

  return (
    <div className="bg-[#0E1320] border border-[#1E293B] rounded-xl p-4 sm:p-5 flex flex-col shadow-xs w-full">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Network className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm sm:text-base font-bold text-white">
            Active Routing Topology
          </h3>
          <span className="text-xs text-slate-500">
            (Real-time Mesh)
          </span>
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

      <div className="h-72 sm:h-80 w-full rounded-lg overflow-hidden bg-[#070A11] border border-[#162032] flex items-center justify-center">
        {displayProviders.length === 0 ? (
          <div className="text-center p-6 text-slate-500 text-xs sm:text-sm">
            <Network className="w-8 h-8 text-slate-600 mx-auto mb-2 opacity-60" />
            <p>No upstream provider traffic recorded yet</p>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            fitViewOptions={{ padding: 0.25 }}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            panOnDrag={false}
            zoomOnScroll={false}
            preventScrolling={false}
          />
        )}
      </div>
    </div>
  );
};
