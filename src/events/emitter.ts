/**
 * Typed Event Emitter
 * Provides type-safe event emission and listening
 */

import type {
  TermAiEvents,
  TermAiEventName,
  TermAiEventPayload,
} from "./types";

/**
 * Emit a typed event
 */
export function emit<T extends TermAiEventName>(
  event: T,
  ...args: TermAiEventPayload<T> extends void ? [] : [TermAiEventPayload<T>]
): void {
  const payload = args[0];
  const customEvent = new CustomEvent(event, {
    detail: payload,
  });
  window.dispatchEvent(customEvent);
}

/**
 * Listen for a typed event
 * Returns a cleanup function
 */
export function on<T extends TermAiEventName>(
  event: T,
  handler: TermAiEventPayload<T> extends void
    ? () => void
    : (payload: TermAiEventPayload<T>) => void,
): () => void {
  const wrappedHandler = (e: CustomEvent<TermAiEventPayload<T>>) => {
    if (e.detail !== undefined) {
      (handler as (payload: TermAiEventPayload<T>) => void)(e.detail);
    } else {
      (handler as () => void)();
    }
  };

  window.addEventListener(event, wrappedHandler as EventListener);

  return () => {
    window.removeEventListener(event, wrappedHandler as EventListener);
  };
}

/**
 * Listen for a typed event once
 * Automatically removes listener after first call
 */
export function once<T extends TermAiEventName>(
  event: T,
  handler: TermAiEventPayload<T> extends void
    ? () => void
    : (payload: TermAiEventPayload<T>) => void,
): () => void {
  const cleanup = on(event, ((...args: unknown[]) => {
    cleanup();
    (handler as (...args: unknown[]) => void)(...args);
  }) as typeof handler);

  return cleanup;
}

/**
 * Type-safe event listener for use with addEventListener
 * Eliminates need for 'as any' casts
 */
export function createEventHandler<T extends TermAiEventName>(
  handler: TermAiEventPayload<T> extends void
    ? () => void
    : (payload: TermAiEventPayload<T>) => void,
): (e: CustomEvent<TermAiEventPayload<T>>) => void {
  return (e: CustomEvent<TermAiEventPayload<T>>) => {
    if (e.detail !== undefined) {
      (handler as (payload: TermAiEventPayload<T>) => void)(e.detail);
    } else {
      (handler as () => void)();
    }
  };
}
