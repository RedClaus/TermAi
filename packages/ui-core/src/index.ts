/**
 * @termai/ui-core
 *
 * Universal Bridge + Design Tokens for TermAI.
 * Provides environment-agnostic APIs that work in both Electron and Web.
 */

// Re-export hooks
export { useSystem, SystemProvider } from './hooks/useSystem.js';

// Re-export transport layer
export { EventTransport } from './transport/EventTransport.js';
export { ApiTransport } from './transport/ApiTransport.js';
export { StorageTransport } from './transport/StorageTransport.js';

// Re-export types
export type {
  SystemContext,
  TransportType,
  PTYSession,
  PTYSpawnOptions,
  PTYResizeOptions,
  TermAIEventMap,
  TermAIEventName,
} from '@termai/shared-types';
