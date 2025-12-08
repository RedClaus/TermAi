/**
 * useSmartContext - RAPID Framework Frontend Hook
 *
 * Manages context gathering and intent classification for smarter AI responses.
 * Part of the RAPID (Reduce AI Prompt Iteration Depth) framework.
 *
 * Features:
 * - Automatic context gathering on session start
 * - Command recording for error tracking
 * - Intent classification for user messages
 * - Response strategy generation
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { config } from "../config";
import { useTermAiEvent } from "./useTermAiEvent";
import type { CommandFinishedPayload } from "../events/types";

// ===========================================
// Types
// ===========================================

export interface ContextSummaryItem {
  type: "env" | "project" | "runtime" | "git" | "error" | "commands";
  label: string;
  value: string;
}

export interface ContextSummary {
  items: ContextSummaryItem[];
  completeness: number;
  gatherTime: number;
}

export interface ContextGap {
  field: string;
  importance: "required" | "helpful";
  question: string;
}

export interface IntentClassification {
  category: string;
  confidence: number;
  signals: string[];
  gaps: ContextGap[];
  requirements?: {
    required: string[];
    helpful: string[];
    optional: string[];
  };
}

export interface ResponseStrategy {
  approach: "direct" | "assumed" | "ask";
  confidence: number;
  originalConfidence: number;
  assumptions: Array<{ field: string; assumption: string; question: string }>;
  gaps: ContextGap[];
  allGaps: ContextGap[];
  assumedFields: string[];
}

export interface StrategyData {
  strategy: ResponseStrategy;
  intent: IntentClassification;
  context: ContextSummary;
  systemPrompt: string;
}

export interface UseSmartContextOptions {
  sessionId: string;
  cwd: string;
  enabled?: boolean;
  autoGather?: boolean;
  gatherOnCommandFinish?: boolean;
}

export interface UseSmartContextResult {
  // State
  context: ContextSummary | null;
  isGathering: boolean;
  lastError: unknown | null;

  // Actions
  gatherContext: () => Promise<ContextSummary | null>;
  recordCommand: (
    command: string,
    result: { exitCode: number; output: string; duration?: number }
  ) => Promise<void>;
  classifyIntent: (message: string) => Promise<IntentClassification | null>;
  getStrategy: (message: string) => Promise<StrategyData | null>;
  clearContext: () => Promise<void>;

  // Helpers
  hasRecentError: boolean;
  contextCompleteness: number;
}

// ===========================================
// Hook Implementation
// ===========================================

export function useSmartContext(
  options: UseSmartContextOptions
): UseSmartContextResult {
  const {
    sessionId,
    cwd,
    enabled = true,
    autoGather = true,
    gatherOnCommandFinish = true,
  } = options;

  // State
  const [context, setContext] = useState<ContextSummary | null>(null);
  const [isGathering, setIsGathering] = useState(false);
  const [lastError, setLastError] = useState<unknown | null>(null);

  // Refs for stable callbacks
  const gatheringRef = useRef(false);
  const mountedRef = useRef(true);

  // ===========================================
  // API Calls
  // ===========================================

  const gatherContext = useCallback(async (): Promise<ContextSummary | null> => {
    if (!enabled || !sessionId || gatheringRef.current) {
      return context;
    }

    gatheringRef.current = true;
    setIsGathering(true);
    setLastError(null);

    try {
      const response = await fetch(config.getApiUrl("/api/context/gather"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, cwd }),
      });

      if (!response.ok) {
        throw new Error(`Failed to gather context: ${response.statusText}`);
      }

      const data = await response.json();

      if (mountedRef.current) {
        setContext(data.summary);
      }

      return data.summary;
    } catch (error) {
      console.error("[useSmartContext] Error gathering context:", error);
      if (mountedRef.current) {
        setLastError(error);
      }
      return null;
    } finally {
      gatheringRef.current = false;
      if (mountedRef.current) {
        setIsGathering(false);
      }
    }
  }, [enabled, sessionId, cwd, context]);

  const recordCommand = useCallback(
    async (
      command: string,
      result: { exitCode: number; output: string; duration?: number }
    ): Promise<void> => {
      if (!enabled || !sessionId) return;

      try {
        await fetch(config.getApiUrl("/api/context/record-command"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            command,
            cwd,
            result,
          }),
        });

        // Trigger context refresh after recording (but don't wait)
        if (gatherOnCommandFinish) {
          gatherContext();
        }
      } catch (error) {
        console.error("[useSmartContext] Error recording command:", error);
      }
    },
    [enabled, sessionId, cwd, gatherOnCommandFinish, gatherContext]
  );

  const classifyIntent = useCallback(
    async (message: string): Promise<IntentClassification | null> => {
      if (!enabled || !sessionId) return null;

      try {
        const response = await fetch(config.getApiUrl("/api/context/classify"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, message, cwd }),
        });

        if (!response.ok) {
          throw new Error(`Failed to classify intent: ${response.statusText}`);
        }

        const data = await response.json();
        return data.intent;
      } catch (error) {
        console.error("[useSmartContext] Error classifying intent:", error);
        return null;
      }
    },
    [enabled, sessionId, cwd]
  );

  const getStrategy = useCallback(
    async (message: string): Promise<StrategyData | null> => {
      if (!enabled || !sessionId) return null;

      try {
        const response = await fetch(config.getApiUrl("/api/context/strategy"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, message, cwd }),
        });

        if (!response.ok) {
          throw new Error(`Failed to get strategy: ${response.statusText}`);
        }

        const data = await response.json();
        return {
          strategy: data.strategy,
          intent: data.intent,
          context: data.context,
          systemPrompt: data.systemPrompt,
        };
      } catch (error) {
        console.error("[useSmartContext] Error getting strategy:", error);
        return null;
      }
    },
    [enabled, sessionId, cwd]
  );

  const clearContext = useCallback(async (): Promise<void> => {
    if (!sessionId) return;

    try {
      await fetch(config.getApiUrl(`/api/context/session/${sessionId}`), {
        method: "DELETE",
      });

      if (mountedRef.current) {
        setContext(null);
      }
    } catch (error) {
      console.error("[useSmartContext] Error clearing context:", error);
    }
  }, [sessionId]);

  // ===========================================
  // Effects
  // ===========================================

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Auto-gather on mount and when session/cwd changes
  useEffect(() => {
    if (autoGather && enabled && sessionId) {
      gatherContext();
    }
  }, [autoGather, enabled, sessionId, cwd]); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for command-finished events to record commands
  useTermAiEvent(
    "termai-command-finished",
    useCallback(
      (payload: CommandFinishedPayload) => {
        if (!gatherOnCommandFinish || !enabled) return;

        const { sessionId: eventSessionId, command, output, exitCode } = payload;

        // Only record for our session
        if (eventSessionId === sessionId && command) {
          recordCommand(command, {
            exitCode: exitCode ?? 0,
            output: output ?? "",
          });
        }
      },
      [sessionId, enabled, gatherOnCommandFinish, recordCommand]
    )
  );

  // ===========================================
  // Computed Values
  // ===========================================

  const hasRecentError = context?.items?.some((item) => item.type === "error") ?? false;
  const contextCompleteness = context?.completeness ?? 0;

  return {
    // State
    context,
    isGathering,
    lastError,

    // Actions
    gatherContext,
    recordCommand,
    classifyIntent,
    getStrategy,
    clearContext,

    // Helpers
    hasRecentError,
    contextCompleteness,
  };
}

// ===========================================
// Context Display Hook
// ===========================================

/**
 * useContextDisplay - Format context for UI display
 */
export function useContextDisplay(context: ContextSummary | null) {
  if (!context) {
    return {
      chips: [],
      tooltip: "Context not gathered",
      color: "gray",
    };
  }

  const chips = context.items.map((item) => ({
    label: item.label,
    value: item.value,
    type: item.type,
    color: getChipColor(item.type),
  }));

  const completenessPercent = Math.round(context.completeness * 100);
  const tooltip = `Context completeness: ${completenessPercent}%\nGather time: ${context.gatherTime}ms`;

  const color =
    context.completeness >= 0.7
      ? "green"
      : context.completeness >= 0.4
        ? "yellow"
        : "red";

  return { chips, tooltip, color };
}

function getChipColor(
  type: ContextSummaryItem["type"]
): "blue" | "green" | "purple" | "orange" | "red" | "gray" {
  switch (type) {
    case "env":
      return "blue";
    case "project":
      return "green";
    case "runtime":
      return "purple";
    case "git":
      return "orange";
    case "error":
      return "red";
    case "commands":
      return "gray";
    default:
      return "gray";
  }
}
