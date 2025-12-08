/**
 * InitialCwdService
 * Fetches the initial working directory from the backend
 * 
 * When TermAI is launched via CLI (the `termai` command), the CLI captures
 * the directory where it was invoked and passes it to the server. This
 * service retrieves that directory so the terminal starts in the right place.
 */

import { config } from "../config";

export interface InitialCwdResponse {
  cwd: string;
  isCliLaunch: boolean;
}

// Cache the result to avoid repeated API calls
let cachedCwd: InitialCwdResponse | null = null;
let fetchPromise: Promise<InitialCwdResponse> | null = null;

export class InitialCwdService {
  /**
   * Fetch the initial CWD from the backend
   * Returns cached result if already fetched
   */
  static async getInitialCwd(): Promise<InitialCwdResponse> {
    // Return cached result
    if (cachedCwd) {
      return cachedCwd;
    }

    // Deduplicate concurrent requests
    if (fetchPromise) {
      return fetchPromise;
    }

    fetchPromise = this.fetchFromServer();
    
    try {
      cachedCwd = await fetchPromise;
      return cachedCwd;
    } finally {
      fetchPromise = null;
    }
  }

  /**
   * Make the actual API request
   */
  private static async fetchFromServer(): Promise<InitialCwdResponse> {
    try {
      const response = await fetch(`${config.apiUrl}/api/initial-cwd`);
      
      if (!response.ok) {
        console.warn("[InitialCwdService] Failed to fetch initial CWD:", response.status);
        return this.getDefaultCwd();
      }

      const data = await response.json();
      console.log("[InitialCwdService] Initial CWD:", data.cwd, "CLI Launch:", data.isCliLaunch);
      return data;
    } catch (error) {
      console.warn("[InitialCwdService] Error fetching initial CWD:", error);
      return this.getDefaultCwd();
    }
  }

  /**
   * Default CWD when backend is unavailable
   */
  private static getDefaultCwd(): InitialCwdResponse {
    return {
      cwd: "~",
      isCliLaunch: false,
    };
  }

  /**
   * Clear the cache (useful for testing or resetting)
   */
  static clearCache(): void {
    cachedCwd = null;
    fetchPromise = null;
  }

  /**
   * Check if we have a cached CWD
   */
  static hasCachedCwd(): boolean {
    return cachedCwd !== null;
  }

  /**
   * Get cached CWD synchronously (returns null if not cached)
   */
  static getCachedCwd(): InitialCwdResponse | null {
    return cachedCwd;
  }
}
