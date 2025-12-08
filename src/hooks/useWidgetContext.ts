/**
 * useWidgetContext Hook
 * Manages terminal context for AI awareness
 * Tracks CWD, git branch, recent outputs, and provides context to AI
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { WidgetContextService } from "../services/WidgetContextService";
import { useTermAiEvent } from "./useTermAiEvent";
import { emit } from "../events";
import type {
  CwdChangedPayload,
  CommandFinishedPayload,
  GitInfoPayload,
} from "../events/types";

interface UseWidgetContextOptions {
  sessionId?: string;
  autoFetchGit?: boolean; // Auto-fetch git info on CWD change
}

interface WidgetContextState {
  cwd: string;
  gitBranch: string | null;
  hasContext: boolean;
  commandCount: number;
}

/**
 * Hook to manage and provide widget context for AI
 */
export function useWidgetContext(options: UseWidgetContextOptions = {}) {
  const { sessionId = "default", autoFetchGit = true } = options;

  const [contextState, setContextState] = useState<WidgetContextState>({
    cwd: "~",
    gitBranch: null,
    hasContext: false,
    commandCount: 0,
  });

  const gitFetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCwdRef = useRef<string>("~");

  /**
   * Refresh context state from service
   */
  const refreshContextState = useCallback(() => {
    const summary = WidgetContextService.getContextSummary(sessionId);
    setContextState({
      cwd: summary.cwd,
      gitBranch: summary.gitBranch,
      hasContext: summary.hasRecentOutput,
      commandCount: summary.commandCount,
    });
  }, [sessionId]);

  /**
   * Fetch git branch for current directory
   * This runs a git command to get the current branch
   */
  const fetchGitBranch = useCallback(
    async (cwd: string) => {
      try {
        // Use the backend API to run git command
        const response = await fetch("/api/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            command: "git rev-parse --abbrev-ref HEAD 2>/dev/null || echo ''",
            cwd,
          }),
        });

        if (response.ok) {
          const result = await response.json();
          const branch = result.output?.trim() || null;

          if (branch && branch !== "") {
            WidgetContextService.updateGitInfo(sessionId, branch);
            emit("termai-git-info", { branch, sessionId });
            refreshContextState();
          } else {
            WidgetContextService.updateGitInfo(sessionId, null);
            refreshContextState();
          }
        } else {
          // API call failed - silently ignore
          WidgetContextService.updateGitInfo(sessionId, null);
        }
      } catch {
        // Not a git repo, API not available, or network error - silently ignore
        WidgetContextService.updateGitInfo(sessionId, null);
      }
    },
    [sessionId, refreshContextState]
  );

  /**
   * Handle CWD changes
   */
  useTermAiEvent(
    "termai-cwd-changed",
    (payload: CwdChangedPayload) => {
      if (payload.sessionId !== sessionId && payload.sessionId) return;

      const newCwd = payload.cwd;
      WidgetContextService.updateCwd(sessionId, newCwd);

      // Only fetch git if CWD actually changed
      if (autoFetchGit && newCwd !== lastCwdRef.current) {
        lastCwdRef.current = newCwd;

        // Debounce git fetch to avoid rapid calls during cd operations
        if (gitFetchTimeoutRef.current) {
          clearTimeout(gitFetchTimeoutRef.current);
        }
        gitFetchTimeoutRef.current = setTimeout(() => {
          fetchGitBranch(newCwd);
        }, 300);
      }

      refreshContextState();
    },
    [sessionId, autoFetchGit, fetchGitBranch, refreshContextState]
  );

  /**
   * Handle command finished - store output in context
   */
  useTermAiEvent(
    "termai-command-finished",
    (payload: CommandFinishedPayload) => {
      if (payload.sessionId !== sessionId && payload.sessionId) return;

      WidgetContextService.addCommandOutput(
        sessionId,
        payload.command,
        payload.output,
        payload.exitCode
      );

      // Emit context updated event
      emit("termai-context-updated", { sessionId });
      refreshContextState();
    },
    [sessionId, refreshContextState]
  );

  /**
   * Handle git info updates from external sources
   */
  useTermAiEvent(
    "termai-git-info",
    (payload: GitInfoPayload) => {
      if (payload.sessionId !== sessionId && payload.sessionId) return;
      WidgetContextService.updateGitInfo(sessionId, payload.branch, payload.status);
      refreshContextState();
    },
    [sessionId, refreshContextState]
  );

  /**
   * Get the full context string for AI prompt
   */
  const getContextString = useCallback(() => {
    return WidgetContextService.buildContextString(sessionId);
  }, [sessionId]);

  /**
   * Get raw context object
   */
  const getContext = useCallback(() => {
    return WidgetContextService.getContext(sessionId);
  }, [sessionId]);

  /**
   * Clear context for this session
   */
  const clearContext = useCallback(() => {
    WidgetContextService.clearContext(sessionId);
    refreshContextState();
  }, [sessionId, refreshContextState]);

  /**
   * Manually trigger git fetch
   */
  const refreshGitInfo = useCallback(() => {
    const ctx = WidgetContextService.getContext(sessionId);
    fetchGitBranch(ctx.cwd);
  }, [sessionId, fetchGitBranch]);

  // Initial fetch on mount
  useEffect(() => {
    try {
      refreshContextState();

      // Fetch git info for initial CWD (non-blocking)
      if (autoFetchGit) {
        const ctx = WidgetContextService.getContext(sessionId);
        // Use setTimeout to prevent blocking render
        setTimeout(() => {
          fetchGitBranch(ctx.cwd).catch(() => {
            // Silently ignore errors during initial git fetch
          });
        }, 100);
      }
    } catch (error) {
      console.error("[useWidgetContext] Error during initialization:", error);
    }

    return () => {
      if (gitFetchTimeoutRef.current) {
        clearTimeout(gitFetchTimeoutRef.current);
      }
    };
  }, [sessionId, autoFetchGit, fetchGitBranch, refreshContextState]);

  return {
    // State
    cwd: contextState.cwd,
    gitBranch: contextState.gitBranch,
    hasContext: contextState.hasContext,
    commandCount: contextState.commandCount,

    // Methods
    getContextString,
    getContext,
    clearContext,
    refreshGitInfo,
    refreshContextState,
  };
}

export default useWidgetContext;
