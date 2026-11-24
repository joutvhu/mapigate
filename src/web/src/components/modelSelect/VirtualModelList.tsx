import React, { useRef, useState, useEffect, useCallback } from "react";

export interface VirtualRange {
  startIndex: number;
  endIndex: number;
  offsetTop: number;
  totalHeight: number;
}

export function computeVirtualRange(
  scrollTop: number,
  viewportHeight: number,
  totalCount: number,
  itemHeight: number,
  overscan = 5
): VirtualRange {
  const totalHeight = totalCount * itemHeight;
  if (totalCount === 0 || itemHeight <= 0) {
    return { startIndex: 0, endIndex: -1, offsetTop: 0, totalHeight: 0 };
  }

  const effectiveViewport = viewportHeight > 0 ? viewportHeight : itemHeight * 8;
  const rawStart = Math.floor(Math.max(0, scrollTop) / itemHeight);
  const visibleCount = Math.ceil(effectiveViewport / itemHeight);
  const startIndex = Math.max(0, rawStart - overscan);
  const endIndex = Math.min(totalCount - 1, rawStart + visibleCount + overscan);

  return {
    startIndex,
    endIndex,
    offsetTop: startIndex * itemHeight,
    totalHeight,
  };
}

export interface VirtualModelListProps<T> {
  items: T[];
  itemHeight: number;
  overscan?: number;
  scrollKey: string;
  getKey: (item: T) => string;
  renderItem: (item: T, index: number) => React.ReactNode;
  className?: string;
}

export function VirtualModelList<T>({
  items,
  itemHeight,
  overscan = 5,
  scrollKey,
  getKey,
  renderItem,
  className = "",
}: VirtualModelListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollTopRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const [viewportHeight, setViewportHeight] = useState(480);
  const [range, setRange] = useState(() =>
    computeVirtualRange(0, 480, items.length, itemHeight, overscan)
  );

  // Measure container height via ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateHeight = () => {
      const h = el.clientHeight;
      if (h > 0) {
        setViewportHeight((prev) => (prev === h ? prev : h));
      }
    };

    updateHeight();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(updateHeight);
      ro.observe(el);
      return () => ro.disconnect();
    }
  }, []);

  // Reset scroll position ONLY when scope/filter changes (never on model selection)
  useEffect(() => {
    const el = containerRef.current;
    scrollTopRef.current = 0;
    if (el) {
      el.scrollTop = 0;
    }
    setRange(computeVirtualRange(0, viewportHeight, items.length, itemHeight, overscan));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollKey]);

  // Recompute range when items count or viewport height changes, preserving current scrollTop
  useEffect(() => {
    const next = computeVirtualRange(
      scrollTopRef.current,
      viewportHeight,
      items.length,
      itemHeight,
      overscan
    );
    setRange((prev) =>
      prev.startIndex === next.startIndex &&
      prev.endIndex === next.endIndex &&
      prev.totalHeight === next.totalHeight
        ? prev
        : next
    );
  }, [items.length, viewportHeight, itemHeight, overscan]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      scrollTopRef.current = e.currentTarget.scrollTop;
      if (rafRef.current !== null) return;

      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const next = computeVirtualRange(
          scrollTopRef.current,
          viewportHeight,
          items.length,
          itemHeight,
          overscan
        );
        setRange((prev) =>
          prev.startIndex === next.startIndex &&
          prev.endIndex === next.endIndex &&
          prev.totalHeight === next.totalHeight
            ? prev
            : next
        );
      });
    },
    [viewportHeight, items.length, itemHeight, overscan]
  );

  const visibleSlice =
    range.endIndex >= range.startIndex
      ? items.slice(range.startIndex, range.endIndex + 1)
      : [];

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className={`overflow-y-auto overscroll-contain ${className}`}
    >
      <div className="relative w-full" style={{ height: `${range.totalHeight}px` }}>
        <div
          className="absolute inset-x-0 top-0"
          style={{ transform: `translate3d(0, ${range.offsetTop}px, 0)` }}
        >
          {visibleSlice.map((item, localIdx) => {
            const index = range.startIndex + localIdx;
            return (
              <div
                key={getKey(item)}
                style={{ height: `${itemHeight}px` }}
                className="pb-1.5 box-border"
              >
                {renderItem(item, index)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
