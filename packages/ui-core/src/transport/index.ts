/**
 * Transport layer for TermAI
 *
 * Provides unified APIs that work across Electron (IPC) and Web (HTTP/CustomEvents)
 */

export { EventTransport } from './EventTransport';
export { ApiTransport } from './ApiTransport';
export { StorageTransport } from './StorageTransport';
