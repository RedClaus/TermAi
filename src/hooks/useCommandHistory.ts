/**
 * useCommandHistory Hook
 * Manages command history with up/down arrow navigation
 */
import { useState, useCallback, useEffect, useRef } from "react";

const HISTORY_KEY = "termai_command_history";
const MAX_HISTORY = 100;

interface UseCommandHistoryOptions {
  sessionId?: string | undefined;
  maxHistory?: number | undefined;
}

interface UseCommandHistoryReturn {
  history: string[];
  historyIndex: number;
  addToHistory: (command: string) => void;
  navigateUp: () => string | null;
  navigateDown: () => string | null;
  resetNavigation: () => void;
  clearHistory: () => void;
  searchHistory: (query: string) => string[];
}

export function useCommandHistory(
  options: UseCommandHistoryOptions = {},
): UseCommandHistoryReturn {
  const { sessionId, maxHistory = MAX_HISTORY } = options;

  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const currentInputRef = useRef<string>("");

  // Get storage key
  const getStorageKey = useCallback(() => {
    return sessionId ? `${HISTORY_KEY}_${sessionId}` : HISTORY_KEY;
  }, [sessionId]);

  // Load history from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(getStorageKey());
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setHistory(parsed);
        }
      } catch {
        // Invalid JSON, ignore
      }
    }
  }, [getStorageKey]);

  // Save history to localStorage
  const saveHistory = useCallback(
    (newHistory: string[]) => {
      localStorage.setItem(getStorageKey(), JSON.stringify(newHistory));
    },
    [getStorageKey],
  );

  // Add command to history
  const addToHistory = useCallback(
    (command: string) => {
      const trimmed = command.trim();
      if (!trimmed) return;

      setHistory((prev) => {
        // Don't add duplicates of the last command
        if (prev[0] === trimmed) return prev;

        // Remove any existing duplicate
        const filtered = prev.filter((cmd) => cmd !== trimmed);

        // Add to front and limit size
        const newHistory = [trimmed, ...filtered].slice(0, maxHistory);
        saveHistory(newHistory);
        return newHistory;
      });

      // Reset navigation
      setHistoryIndex(-1);
      currentInputRef.current = "";
    },
    [maxHistory, saveHistory],
  );

  // Navigate up in history (older commands)
  const navigateUp = useCallback((): string | null => {
    if (history.length === 0) return null;

    const newIndex = historyIndex + 1;
    if (newIndex >= history.length) return null;

    setHistoryIndex(newIndex);
    return history[newIndex];
  }, [history, historyIndex]);

  // Navigate down in history (newer commands)
  const navigateDown = useCallback((): string | null => {
    if (historyIndex <= 0) {
      setHistoryIndex(-1);
      return currentInputRef.current || "";
    }

    const newIndex = historyIndex - 1;
    setHistoryIndex(newIndex);
    return history[newIndex];
  }, [history, historyIndex]);

  // Reset navigation (called when user types)
  const resetNavigation = useCallback(() => {
    setHistoryIndex(-1);
  }, []);

  // Clear all history
  const clearHistory = useCallback(() => {
    setHistory([]);
    setHistoryIndex(-1);
    localStorage.removeItem(getStorageKey());
  }, [getStorageKey]);

  // Search history
  const searchHistory = useCallback(
    (query: string): string[] => {
      if (!query.trim()) return history.slice(0, 10);

      const lower = query.toLowerCase();
      return history
        .filter((cmd) => cmd.toLowerCase().includes(lower))
        .slice(0, 10);
    },
    [history],
  );

  return {
    history,
    historyIndex,
    addToHistory,
    navigateUp,
    navigateDown,
    resetNavigation,
    clearHistory,
    searchHistory,
  };
}
