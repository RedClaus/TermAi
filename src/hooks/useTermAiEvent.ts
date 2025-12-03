/**
 * useTermAiEvent Hook
 * Type-safe hook for listening to TermAI custom events
 */
import { useEffect, useCallback, useRef } from "react";
import type { TermAiEventName, TermAiEventPayload } from "../events/types";

/**
 * Hook for listening to a single TermAI event
 * Automatically handles cleanup on unmount
 */
export function useTermAiEvent<T extends TermAiEventName>(
  event: T,
  handler: TermAiEventPayload<T> extends void
    ? () => void
    : (payload: TermAiEventPayload<T>) => void,
  deps: React.DependencyList = [],
): void {
  // Use ref to always have latest handler without re-subscribing
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const eventHandler = (e: CustomEvent<TermAiEventPayload<T>>) => {
      const currentHandler = handlerRef.current;
      if (e.detail !== undefined) {
        (currentHandler as (payload: TermAiEventPayload<T>) => void)(e.detail);
      } else {
        (currentHandler as () => void)();
      }
    };

    window.addEventListener(event, eventHandler as EventListener);

    return () => {
      window.removeEventListener(event, eventHandler as EventListener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, ...deps]);
}

/**
 * Hook for listening to multiple TermAI events
 */
export function useTermAiEvents<T extends TermAiEventName>(
  events: Array<{
    event: T;
    handler: TermAiEventPayload<T> extends void
      ? () => void
      : (payload: TermAiEventPayload<T>) => void;
  }>,
  deps: React.DependencyList = [],
): void {
  const eventsRef = useRef(events);
  eventsRef.current = events;

  useEffect(() => {
    const cleanups: Array<() => void> = [];

    for (const { event, handler } of eventsRef.current) {
      const eventHandler = (e: CustomEvent) => {
        if (e.detail !== undefined) {
          (handler as (payload: unknown) => void)(e.detail);
        } else {
          (handler as () => void)();
        }
      };

      window.addEventListener(event, eventHandler as EventListener);
      cleanups.push(() => {
        window.removeEventListener(event, eventHandler as EventListener);
      });
    }

    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/**
 * Hook that returns a type-safe emit function
 */
export function useTermAiEmit() {
  const emitEvent = useCallback(
    <T extends TermAiEventName>(
      event: T,
      ...args: TermAiEventPayload<T> extends void ? [] : [TermAiEventPayload<T>]
    ): void => {
      const payload = args[0];
      const customEvent = new CustomEvent(event, {
        detail: payload,
      });
      window.dispatchEvent(customEvent);
    },
    [],
  );

  return emitEvent;
}
