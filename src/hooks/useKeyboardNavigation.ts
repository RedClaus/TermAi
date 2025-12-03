/**
 * useKeyboardNavigation Hook
 * Provides keyboard navigation for lists and menus
 */
import { useState, useCallback, useEffect, useRef } from "react";

interface UseKeyboardNavigationOptions<T> {
  items: T[];
  onSelect?: (item: T, index: number) => void;
  onEscape?: () => void;
  loop?: boolean;
  orientation?: "vertical" | "horizontal";
  enabled?: boolean;
}

interface UseKeyboardNavigationReturn {
  activeIndex: number;
  setActiveIndex: (index: number) => void;
  handleKeyDown: (event: React.KeyboardEvent) => void;
  reset: () => void;
}

export function useKeyboardNavigation<T>({
  items,
  onSelect,
  onEscape,
  loop = true,
  orientation = "vertical",
  enabled = true,
}: UseKeyboardNavigationOptions<T>): UseKeyboardNavigationReturn {
  const [activeIndex, setActiveIndex] = useState(-1);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const reset = useCallback(() => {
    setActiveIndex(-1);
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (!enabled || items.length === 0) return;

      const isVertical = orientation === "vertical";
      const prevKey = isVertical ? "ArrowUp" : "ArrowLeft";
      const nextKey = isVertical ? "ArrowDown" : "ArrowRight";

      switch (event.key) {
        case prevKey: {
          event.preventDefault();
          setActiveIndex((prev) => {
            if (prev <= 0) {
              return loop ? items.length - 1 : 0;
            }
            return prev - 1;
          });
          break;
        }
        case nextKey: {
          event.preventDefault();
          setActiveIndex((prev) => {
            if (prev >= items.length - 1) {
              return loop ? 0 : items.length - 1;
            }
            return prev + 1;
          });
          break;
        }
        case "Home": {
          event.preventDefault();
          setActiveIndex(0);
          break;
        }
        case "End": {
          event.preventDefault();
          setActiveIndex(items.length - 1);
          break;
        }
        case "Enter":
        case " ": {
          event.preventDefault();
          if (activeIndex >= 0 && activeIndex < items.length) {
            onSelect?.(items[activeIndex], activeIndex);
          }
          break;
        }
        case "Escape": {
          event.preventDefault();
          reset();
          onEscape?.();
          break;
        }
      }
    },
    [enabled, items, orientation, loop, activeIndex, onSelect, onEscape, reset],
  );

  // Reset when items change significantly
  useEffect(() => {
    if (activeIndex >= items.length) {
      setActiveIndex(items.length > 0 ? items.length - 1 : -1);
    }
  }, [items.length, activeIndex]);

  return {
    activeIndex,
    setActiveIndex,
    handleKeyDown,
    reset,
  };
}

/**
 * Hook for global keyboard shortcuts
 */
export function useGlobalShortcut(
  key: string,
  callback: () => void,
  modifiers: {
    ctrl?: boolean;
    alt?: boolean;
    shift?: boolean;
    meta?: boolean;
  } = {},
): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const matchesKey = event.key.toLowerCase() === key.toLowerCase();
      const matchesCtrl = modifiers.ctrl ? event.ctrlKey : !event.ctrlKey;
      const matchesAlt = modifiers.alt ? event.altKey : !event.altKey;
      const matchesShift = modifiers.shift ? event.shiftKey : !event.shiftKey;
      const matchesMeta = modifiers.meta ? event.metaKey : !event.metaKey;

      if (
        matchesKey &&
        matchesCtrl &&
        matchesAlt &&
        matchesShift &&
        matchesMeta
      ) {
        event.preventDefault();
        callbackRef.current();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [key, modifiers.ctrl, modifiers.alt, modifiers.shift, modifiers.meta]);
}

/**
 * Hook for focus trap within a container
 */
export function useFocusTrap(
  containerRef: React.RefObject<HTMLElement | null>,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled || !containerRef.current) return;

    const container = containerRef.current;
    const focusableElements = container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );

    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;

      if (event.shiftKey) {
        if (document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    };

    container.addEventListener("keydown", handleKeyDown);
    firstElement.focus();

    return () => container.removeEventListener("keydown", handleKeyDown);
  }, [containerRef, enabled]);
}
