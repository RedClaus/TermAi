/**
 * EventTransport
 *
 * Abstracts event handling between Electron IPC and browser CustomEvents.
 * Automatically detects the runtime environment and uses the appropriate mechanism.
 */

import type { TermAIEventMap, TermAIEventName } from '@termai/shared-types';

/**
 * Type for event callback functions
 */
type EventCallback<K extends TermAIEventName> = (data: TermAIEventMap[K]) => void;

/**
 * Electron Event API interface (when running in Electron)
 */
interface ElectronEventAPI {
  on: (event: string, callback: (data: unknown) => void) => void;
  off: (event: string, callback: (data: unknown) => void) => void;
  emit: (event: string, data: unknown) => void;
}

/**
 * EventTransport class
 *
 * Provides a unified API for event handling that works in both
 * Electron (using IPC) and Web (using CustomEvents) environments.
 */
export class EventTransport {
  private readonly isElectron: boolean;
  private readonly electronAPI?: ElectronEventAPI;
  private readonly listenerMap: Map<string, Map<(data: unknown) => void, EventListener>>;

  constructor() {
    // Detect if running in Electron
    this.isElectron = typeof window !== 'undefined' &&
                      (typeof (window as any).electron !== 'undefined' ||
                       typeof (window as any).electronAPI !== 'undefined');

    // Get the electron event API if available
    this.electronAPI = this.isElectron
      ? ((window as any).electron || (window as any).electronAPI)
      : undefined;
    this.listenerMap = new Map();

    // Bind methods to preserve 'this' context
    this.on = this.on.bind(this);
    this.off = this.off.bind(this);
    this.emit = this.emit.bind(this);
    this.once = this.once.bind(this);
  }

  /**
   * Subscribe to an event
   *
   * @param event - The event name
   * @param callback - The callback function to invoke when the event is emitted
   */
  on<K extends TermAIEventName>(event: K, callback: EventCallback<K>): void {
    if (this.isElectron && this.electronAPI) {
      // Use Electron IPC
      this.electronAPI.on(event, callback as (data: unknown) => void);
    } else {
      // Use browser CustomEvent
      const eventName = `termai-${event}`;
      const wrappedCallback = ((e: CustomEvent) => {
        callback(e.detail as TermAIEventMap[K]);
      }) as EventListener;

      // Track listener and its wrapper for cleanup
      if (!this.listenerMap.has(eventName)) {
        this.listenerMap.set(eventName, new Map());
      }
      this.listenerMap.get(eventName)!.set(callback as (data: unknown) => void, wrappedCallback);

      // Add event listener
      window.addEventListener(eventName, wrappedCallback);
    }
  }

  /**
   * Unsubscribe from an event
   *
   * @param event - The event name
   * @param callback - The callback function to remove
   */
  off<K extends TermAIEventName>(event: K, callback: EventCallback<K>): void {
    if (this.isElectron && this.electronAPI) {
      // Use Electron IPC
      this.electronAPI.off(event, callback as (data: unknown) => void);
    } else {
      // Use browser CustomEvent
      const eventName = `termai-${event}`;
      const listeners = this.listenerMap.get(eventName);

      if (listeners) {
        const wrappedCallback = listeners.get(callback as (data: unknown) => void);
        if (wrappedCallback) {
          // Remove event listener using the stored wrapped callback
          window.removeEventListener(eventName, wrappedCallback);

          // Remove from tracking map
          listeners.delete(callback as (data: unknown) => void);
          if (listeners.size === 0) {
            this.listenerMap.delete(eventName);
          }
        }
      }
    }
  }

  /**
   * Emit an event
   *
   * @param event - The event name
   * @param data - The event data/payload
   */
  emit<K extends TermAIEventName>(event: K, data: TermAIEventMap[K]): void {
    if (this.isElectron && this.electronAPI) {
      // Use Electron IPC
      this.electronAPI.emit(event, data);
    } else {
      // Use browser CustomEvent
      const eventName = `termai-${event}`;
      const customEvent = new CustomEvent(eventName, {
        detail: data,
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(customEvent);
    }
  }

  /**
   * Subscribe to an event for a single invocation
   *
   * The callback will be automatically unsubscribed after being called once.
   *
   * @param event - The event name
   * @param callback - The callback function to invoke when the event is emitted
   */
  once<K extends TermAIEventName>(event: K, callback: EventCallback<K>): void {
    const onceCallback: EventCallback<K> = (data: TermAIEventMap[K]) => {
      this.off(event, onceCallback);
      callback(data);
    };

    this.on(event, onceCallback);
  }

  /**
   * Clean up all event listeners
   *
   * Useful for component unmounting or cleanup operations.
   */
  destroy(): void {
    if (!this.isElectron) {
      // Clean up all tracked listeners in web environment
      const entries = Array.from(this.listenerMap.entries());
      for (const [eventName, listeners] of entries) {
        const listenerArray = Array.from(listeners.values());
        for (const wrappedCallback of listenerArray) {
          window.removeEventListener(eventName, wrappedCallback);
        }
      }
      this.listenerMap.clear();
    }
  }

  /**
   * Check if running in Electron environment
   */
  get isInElectron(): boolean {
    return this.isElectron;
  }

  /**
   * Get the transport type
   */
  get transportType(): 'electron' | 'web' {
    return this.isElectron ? 'electron' : 'web';
  }
}
