/**
 * VirtualList Component
 * Lightweight virtualized list for performance with large lists
 */
import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  memo,
  useMemo,
} from "react";
import styles from "./VirtualList.module.css";

interface VirtualListProps<T> {
  items: T[];
  itemHeight: number | ((index: number) => number);
  overscan?: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  className?: string;
  onEndReached?: () => void;
  endReachedThreshold?: number;
}

interface VirtualListState {
  scrollTop: number;
  containerHeight: number;
}

/**
 * Calculate which items should be visible
 */
function getVisibleRange(
  scrollTop: number,
  containerHeight: number,
  itemCount: number,
  getItemHeight: (index: number) => number,
  overscan: number,
): { start: number; end: number; offset: number } {
  let offset = 0;
  let start = 0;

  // Find start index
  for (let i = 0; i < itemCount; i++) {
    const height = getItemHeight(i);
    if (offset + height > scrollTop) {
      start = i;
      break;
    }
    offset += height;
  }

  // Find end index
  let visibleHeight = 0;
  let end = start;
  for (let i = start; i < itemCount; i++) {
    visibleHeight += getItemHeight(i);
    end = i;
    if (visibleHeight >= containerHeight) {
      break;
    }
  }

  // Apply overscan
  start = Math.max(0, start - overscan);
  end = Math.min(itemCount - 1, end + overscan);

  // Recalculate offset for new start
  offset = 0;
  for (let i = 0; i < start; i++) {
    offset += getItemHeight(i);
  }

  return { start, end, offset };
}

/**
 * Calculate total height of all items
 */
function getTotalHeight(
  itemCount: number,
  getItemHeight: (index: number) => number,
): number {
  let total = 0;
  for (let i = 0; i < itemCount; i++) {
    total += getItemHeight(i);
  }
  return total;
}

function VirtualListInner<T>({
  items,
  itemHeight,
  overscan = 3,
  renderItem,
  className,
  onEndReached,
  endReachedThreshold = 100,
}: VirtualListProps<T>): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<VirtualListState>({
    scrollTop: 0,
    containerHeight: 0,
  });

  const getItemHeight = useCallback(
    (index: number): number => {
      if (typeof itemHeight === "function") {
        return itemHeight(index);
      }
      return itemHeight;
    },
    [itemHeight],
  );

  // Handle scroll events
  const handleScroll = useCallback(() => {
    if (containerRef.current) {
      const { scrollTop, clientHeight, scrollHeight } = containerRef.current;
      setState({ scrollTop, containerHeight: clientHeight });

      // Check if we're near the end
      if (
        onEndReached &&
        scrollHeight - scrollTop - clientHeight < endReachedThreshold
      ) {
        onEndReached();
      }
    }
  }, [onEndReached, endReachedThreshold]);

  // Set up resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      setState((prev) => ({
        ...prev,
        containerHeight: container.clientHeight,
      }));
    });

    resizeObserver.observe(container);
    setState({ scrollTop: 0, containerHeight: container.clientHeight });

    return () => resizeObserver.disconnect();
  }, []);

  // Calculate visible items
  const { start, end, offset } = useMemo(() => {
    return getVisibleRange(
      state.scrollTop,
      state.containerHeight,
      items.length,
      getItemHeight,
      overscan,
    );
  }, [
    state.scrollTop,
    state.containerHeight,
    items.length,
    getItemHeight,
    overscan,
  ]);

  const totalHeight = useMemo(() => {
    return getTotalHeight(items.length, getItemHeight);
  }, [items.length, getItemHeight]);

  // Render visible items
  const visibleItems = useMemo(() => {
    const result: React.ReactNode[] = [];
    for (let i = start; i <= end && i < items.length; i++) {
      result.push(
        <div key={i} className={styles.item}>
          {renderItem(items[i], i)}
        </div>,
      );
    }
    return result;
  }, [items, start, end, renderItem]);

  return (
    <div
      ref={containerRef}
      className={`${styles.container} ${className ?? ""}`}
      onScroll={handleScroll}
    >
      <div className={styles.content} style={{ height: totalHeight }}>
        <div
          className={styles.items}
          style={{ transform: `translateY(${offset}px)` }}
        >
          {visibleItems}
        </div>
      </div>
    </div>
  );
}

export const VirtualList = memo(VirtualListInner) as typeof VirtualListInner;

/**
 * Hook for using virtual list with dynamic heights
 */
export function useVirtualList<T>(items: T[], estimatedItemHeight: number) {
  const [measuredHeights, setMeasuredHeights] = useState<Map<number, number>>(
    new Map(),
  );

  const getItemHeight = useCallback(
    (index: number): number => {
      return measuredHeights.get(index) ?? estimatedItemHeight;
    },
    [measuredHeights, estimatedItemHeight],
  );

  const measureItem = useCallback((index: number, height: number) => {
    setMeasuredHeights((prev) => {
      const next = new Map(prev);
      next.set(index, height);
      return next;
    });
  }, []);

  return { getItemHeight, measureItem };
}
