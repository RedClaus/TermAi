/**
 * GhosttyService - Manages ghostty-web WASM initialization
 * 
 * ghostty-web requires async WASM initialization before creating terminals.
 * This service handles the initialization once and provides a way to check status.
 */

import { init } from 'ghostty-web';

let initialized = false;
let initPromise: Promise<void> | null = null;

/**
 * Initialize ghostty-web WASM module.
 * Safe to call multiple times - will only initialize once.
 */
export async function initGhostty(): Promise<void> {
  if (initialized) {
    return;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = init()
    .then(() => {
      initialized = true;
      console.log('[GhosttyService] WASM initialized successfully');
    })
    .catch((error) => {
      initPromise = null;
      console.error('[GhosttyService] Failed to initialize WASM:', error);
      throw error;
    });

  return initPromise;
}

/**
 * Check if ghostty-web is initialized.
 */
export function isGhosttyInitialized(): boolean {
  return initialized;
}

/**
 * Get the initialization promise (for awaiting in components).
 */
export function getInitPromise(): Promise<void> | null {
  return initPromise;
}
