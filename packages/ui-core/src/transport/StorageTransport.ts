/**
 * StorageTransport - Unified storage abstraction for Electron and Web
 *
 * Automatically detects the runtime environment and uses:
 * - Electron: window.electron.invoke('storage:*') for persistent storage
 * - Web: localStorage with 'termai_' prefix
 */

// Type guard to check if we're running in Electron
function isElectron(): boolean {
  return typeof window !== 'undefined' &&
         'electron' in window &&
         typeof (window as any).electron?.invoke === 'function';
}

export class StorageTransport {
  private readonly prefix = 'termai_';
  private readonly isElectronEnv: boolean;

  constructor() {
    this.isElectronEnv = isElectron();
  }

  /**
   * Get a value from storage
   * @param key Storage key
   * @param defaultValue Optional default value if key doesn't exist
   * @returns The stored value or default value
   */
  async get<T>(key: string, defaultValue?: T): Promise<T | undefined> {
    try {
      if (this.isElectronEnv) {
        return await this.getElectron<T>(key, defaultValue);
      } else {
        return this.getWeb<T>(key, defaultValue);
      }
    } catch (error) {
      console.error(`[StorageTransport] Error getting key "${key}":`, error);
      return defaultValue;
    }
  }

  /**
   * Set a value in storage
   * @param key Storage key
   * @param value Value to store
   */
  async set<T>(key: string, value: T): Promise<void> {
    try {
      if (this.isElectronEnv) {
        await this.setElectron(key, value);
      } else {
        this.setWeb(key, value);
      }
    } catch (error) {
      console.error(`[StorageTransport] Error setting key "${key}":`, error);
      throw error;
    }
  }

  /**
   * Remove a value from storage
   * @param key Storage key to remove
   */
  async remove(key: string): Promise<void> {
    try {
      if (this.isElectronEnv) {
        await this.removeElectron(key);
      } else {
        this.removeWeb(key);
      }
    } catch (error) {
      console.error(`[StorageTransport] Error removing key "${key}":`, error);
      throw error;
    }
  }

  /**
   * Check if a key exists in storage
   * @param key Storage key to check
   * @returns True if key exists
   */
  async has(key: string): Promise<boolean> {
    try {
      if (this.isElectronEnv) {
        return await this.hasElectron(key);
      } else {
        return this.hasWeb(key);
      }
    } catch (error) {
      console.error(`[StorageTransport] Error checking key "${key}":`, error);
      return false;
    }
  }

  /**
   * Clear all storage (be careful!)
   */
  async clear(): Promise<void> {
    try {
      if (this.isElectronEnv) {
        await this.clearElectron();
      } else {
        this.clearWeb();
      }
    } catch (error) {
      console.error('[StorageTransport] Error clearing storage:', error);
      throw error;
    }
  }

  // ===== Electron Methods =====

  private async getElectron<T>(key: string, defaultValue?: T): Promise<T | undefined> {
    const result = await (window as any).electron.invoke('storage:get', key);
    return result !== undefined ? result : defaultValue;
  }

  private async setElectron<T>(key: string, value: T): Promise<void> {
    await (window as any).electron.invoke('storage:set', key, value);
  }

  private async removeElectron(key: string): Promise<void> {
    await (window as any).electron.invoke('storage:remove', key);
  }

  private async hasElectron(key: string): Promise<boolean> {
    const result = await (window as any).electron.invoke('storage:has', key);
    return Boolean(result);
  }

  private async clearElectron(): Promise<void> {
    await (window as any).electron.invoke('storage:clear');
  }

  // ===== Web (localStorage) Methods =====

  private getWeb<T>(key: string, defaultValue?: T): T | undefined {
    const prefixedKey = this.prefix + key;
    const item = localStorage.getItem(prefixedKey);

    if (item === null) {
      return defaultValue;
    }

    try {
      return JSON.parse(item) as T;
    } catch (error) {
      console.warn(`[StorageTransport] Failed to parse JSON for key "${key}", returning raw value`);
      return item as unknown as T;
    }
  }

  private setWeb<T>(key: string, value: T): void {
    const prefixedKey = this.prefix + key;
    const serialized = JSON.stringify(value);
    localStorage.setItem(prefixedKey, serialized);
  }

  private removeWeb(key: string): void {
    const prefixedKey = this.prefix + key;
    localStorage.removeItem(prefixedKey);
  }

  private hasWeb(key: string): boolean {
    const prefixedKey = this.prefix + key;
    return localStorage.getItem(prefixedKey) !== null;
  }

  private clearWeb(): void {
    // Only clear keys with our prefix to avoid affecting other apps
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(this.prefix)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
  }
}
