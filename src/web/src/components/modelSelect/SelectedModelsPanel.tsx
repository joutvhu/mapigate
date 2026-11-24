import React from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CapacityBadges } from "../CapacityBadges.js";
import type { ModelCapabilities } from "../../../../core/capabilities/index.js";

interface SortableModelItemProps {
  id: string;
  index: number;
  caps?: ModelCapabilities | null;
  onRemove: (id: string) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  isFirst: boolean;
  isLast: boolean;
}

const SortableModelItem = React.memo<SortableModelItemProps>(
  ({ id, index, caps, onRemove, onMoveUp, onMoveDown, isFirst, isLast }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
      id,
    });

    const style: React.CSSProperties = {
      transform: CSS.Transform.toString(transform),
      transition,
      zIndex: isDragging ? 50 : undefined,
      opacity: isDragging ? 0.65 : 1,
    };

    return (
      <div
        ref={setNodeRef}
        style={style}
        className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl border bg-[#0A0D14] transition-colors duration-75 ${
          isDragging
            ? "border-blue-500 shadow-lg shadow-blue-500/10 bg-blue-950/40"
            : "border-[#1E293B] hover:border-slate-700"
        }`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-slate-500 hover:text-slate-300 p-0.5 rounded touch-none shrink-0"
            title="Drag to reorder priority"
          >
            <span className="material-symbols-outlined text-[15px]">drag_indicator</span>
          </button>
          <span
            className={`size-5 rounded-md border text-[10px] font-mono font-bold flex items-center justify-center shrink-0 ${
              index === 0
                ? "bg-blue-500/20 border-blue-500/40 text-blue-300"
                : "bg-[#141B2D] border-[#1E293B] text-slate-400"
            }`}
          >
            {index + 1}
          </span>
          <div className="min-w-0 flex-1">
            <span className="font-mono text-xs text-white truncate block" title={id}>
              {id}
            </span>
            <CapacityBadges caps={caps} model={caps ? undefined : id} size="xs" className="mt-0.5" />
          </div>
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={() => onMoveUp(index)}
            disabled={isFirst}
            className="p-1 text-slate-400 hover:text-white disabled:opacity-20 disabled:hover:text-slate-400 cursor-pointer"
            title="Move up"
          >
            <span className="material-symbols-outlined text-[14px]">arrow_upward</span>
          </button>
          <button
            type="button"
            onClick={() => onMoveDown(index)}
            disabled={isLast}
            className="p-1 text-slate-400 hover:text-white disabled:opacity-20 disabled:hover:text-slate-400 cursor-pointer"
            title="Move down"
          >
            <span className="material-symbols-outlined text-[14px]">arrow_downward</span>
          </button>
          <button
            type="button"
            onClick={() => onRemove(id)}
            className="p-1 text-slate-400 hover:text-rose-400 cursor-pointer"
            title="Remove"
          >
            <span className="material-symbols-outlined text-[14px]">close</span>
          </button>
        </div>
      </div>
    );
  }
);
SortableModelItem.displayName = "SortableModelItem";

export interface SelectedModelsPanelProps {
  selectedModels: string[];
  capsMap: Map<string, ModelCapabilities>;
  onClearAll: () => void;
  onRemoveModel: (val: string) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onDragEnd: (event: DragEndEvent) => void;
  className?: string;
}

export const SelectedModelsPanel: React.FC<SelectedModelsPanelProps> = React.memo(
  ({
    selectedModels,
    capsMap,
    onClearAll,
    onRemoveModel,
    onMoveUp,
    onMoveDown,
    onDragEnd,
    className = "",
  }) => {
    const sensors = useSensors(
      useSensor(PointerSensor, {
        activationConstraint: { distance: 4 },
      }),
      useSensor(KeyboardSensor, {
        coordinateGetter: sortableKeyboardCoordinates,
      })
    );

    return (
      <div className={`flex flex-col min-h-0 p-3.5 space-y-2.5 bg-[#0A0D14]/45 overflow-hidden ${className}`}>
        <div className="flex items-center justify-between pb-2 border-b border-[#1E293B] shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-blue-400 text-[18px]">
              format_list_numbered
            </span>
            <span className="text-xs font-bold text-white">
              Priority Order ({selectedModels.length})
            </span>
          </div>
          {selectedModels.length > 0 && (
            <button
              type="button"
              onClick={onClearAll}
              className="text-[11px] text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
            >
              Clear all
            </button>
          )}
        </div>

        <p className="text-[11px] text-slate-400 leading-snug shrink-0">
          1 = primary, 2+ = backup fallbacks. Drag or use arrows to reorder.
        </p>

        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
          {selectedModels.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs border border-dashed border-[#1E293B] rounded-2xl p-4">
              No models selected yet. Click any model in the catalog to add it here.
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={onDragEnd}
            >
              <SortableContext items={selectedModels} strategy={verticalListSortingStrategy}>
                <div className="space-y-1.5">
                  {selectedModels.map((modelId, index) => (
                    <SortableModelItem
                      key={modelId}
                      id={modelId}
                      index={index}
                      caps={capsMap.get(modelId)}
                      onRemove={onRemoveModel}
                      onMoveUp={onMoveUp}
                      onMoveDown={onMoveDown}
                      isFirst={index === 0}
                      isLast={index === selectedModels.length - 1}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>
    );
  }
);
SelectedModelsPanel.displayName = "SelectedModelsPanel";
