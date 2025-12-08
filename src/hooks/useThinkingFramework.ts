/**
 * useThinkingFramework - Thinking Frameworks Frontend Hook
 *
 * Manages thinking framework selection, execution, and state for structured
 * problem-solving approaches. Supports 12 cognitive reasoning frameworks.
 *
 * Features:
 * - Framework selection based on user message and context
 * - Real-time execution state tracking
 * - Step-by-step progress updates via events
 * - Pause/resume framework execution
 * - Execution history
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { config } from "../config";
import { useTermAiEvent, useTermAiEmit } from "./useTermAiEvent";
import type {
  FrameworkType,
  FrameworkState,
  FrameworkResult,
  FrameworkMatch,
  ThinkingStep,
  FrameworkInfo,
} from "../types/frameworks";
import type {
  ThinkingStartedPayload,
  ThinkingStepPayload,
  ThinkingPhasePayload,
  ThinkingCompletePayload,
  ThinkingErrorPayload,
  ThinkingPausedPayload,
  ThinkingResumedPayload,
} from "../events/types";

// ===========================================
// Types
// ===========================================

export interface UseThinkingFrameworkOptions {
  sessionId: string;
  enabled?: boolean;
  autoSelectFramework?: boolean;
}

export interface UseThinkingFrameworkResult {
  // State
  state: FrameworkState | null;
  isActive: boolean;
  isPaused: boolean;
  currentPhase: string | null;
  steps: ThinkingStep[];
  recommendations: FrameworkMatch[];
  availableFrameworks: FrameworkInfo[];
  lastError: string | null;

  // Actions
  selectFramework: (message: string, intent?: string, context?: object) => Promise<FrameworkMatch[]>;
  startFramework: (framework: FrameworkType, problem: string, context?: object) => Promise<FrameworkState | null>;
  addStep: (step: Partial<ThinkingStep>) => Promise<ThinkingStep | null>;
  pauseFramework: () => Promise<FrameworkState | null>;
  resumeFramework: () => Promise<FrameworkState | null>;
  completeFramework: (result: FrameworkResult) => Promise<FrameworkResult | null>;
  getHistory: (limit?: number) => Promise<FrameworkResult[]>;
  refreshState: () => Promise<void>;
  fetchAvailableFrameworks: () => Promise<void>;

  // Helpers
  getPhaseIndex: () => number;
  getTotalPhases: () => number;
  getProgress: () => number;
}

// ===========================================
// Hook Implementation
// ===========================================

export function useThinkingFramework(
  options: UseThinkingFrameworkOptions
): UseThinkingFrameworkResult {
  const { sessionId, enabled = true, autoSelectFramework: _autoSelectFramework = false } = options;

  // State
  const [state, setState] = useState<FrameworkState | null>(null);
  const [recommendations, setRecommendations] = useState<FrameworkMatch[]>([]);
  const [availableFrameworks, setAvailableFrameworks] = useState<FrameworkInfo[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);

  // Refs
  const mountedRef = useRef(true);
  const emit = useTermAiEmit();

  // ===========================================
  // API Calls
  // ===========================================

  const selectFramework = useCallback(
    async (
      message: string,
      intent?: string,
      context?: object
    ): Promise<FrameworkMatch[]> => {
      if (!enabled) return [];

      try {
        const response = await fetch(config.getApiUrl("/api/frameworks/select"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, intent, context }),
        });

        if (!response.ok) {
          throw new Error(`Failed to select framework: ${response.statusText}`);
        }

        const data = await response.json();

        if (mountedRef.current) {
          setRecommendations(data.matches || []);
        }

        return data.matches || [];
      } catch (error) {
        console.error("[useThinkingFramework] Error selecting framework:", error);
        setLastError(error instanceof Error ? error.message : "Unknown error");
        return [];
      }
    },
    [enabled]
  );

  const startFramework = useCallback(
    async (
      framework: FrameworkType,
      problem: string,
      context?: object
    ): Promise<FrameworkState | null> => {
      if (!enabled || !sessionId) return null;

      try {
        const response = await fetch(config.getApiUrl("/api/frameworks/execute"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, framework, problem, context }),
        });

        if (!response.ok) {
          throw new Error(`Failed to start framework: ${response.statusText}`);
        }

        const data = await response.json();

        if (mountedRef.current) {
          setState(data.state);
          setLastError(null);
        }

        // Emit event for other components
        emit("termai-thinking-started", {
          sessionId,
          framework,
          problem,
        } as ThinkingStartedPayload);

        return data.state;
      } catch (error) {
        console.error("[useThinkingFramework] Error starting framework:", error);
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        setLastError(errorMsg);

        emit("termai-thinking-error", {
          sessionId,
          error: errorMsg,
          framework,
        } as ThinkingErrorPayload);

        return null;
      }
    },
    [enabled, sessionId, emit]
  );

  const addStep = useCallback(
    async (step: Partial<ThinkingStep>): Promise<ThinkingStep | null> => {
      if (!enabled || !sessionId) return null;

      try {
        const response = await fetch(
          config.getApiUrl(`/api/frameworks/step/${sessionId}`),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(step),
          }
        );

        if (!response.ok) {
          throw new Error(`Failed to add step: ${response.statusText}`);
        }

        const data = await response.json();

        if (mountedRef.current) {
          setState(data.state);
        }

        // Emit step event
        emit("termai-thinking-step", {
          sessionId,
          step: data.step,
        } as ThinkingStepPayload);

        // Emit phase change if applicable
        if (step.phase && state?.phase !== step.phase) {
          emit("termai-thinking-phase", {
            sessionId,
            framework: state?.framework || data.state.framework,
            phase: step.phase,
            previousPhase: state?.phase,
          } as ThinkingPhasePayload);
        }

        return data.step;
      } catch (error) {
        console.error("[useThinkingFramework] Error adding step:", error);
        return null;
      }
    },
    [enabled, sessionId, state, emit]
  );

  const pauseFramework = useCallback(async (): Promise<FrameworkState | null> => {
    if (!enabled || !sessionId) return null;

    try {
      const response = await fetch(
        config.getApiUrl(`/api/frameworks/pause/${sessionId}`),
        { method: "POST" }
      );

      if (!response.ok) {
        throw new Error(`Failed to pause framework: ${response.statusText}`);
      }

      const data = await response.json();

      if (mountedRef.current) {
        setState(data.state);
      }

      emit("termai-thinking-paused", {
        sessionId,
        framework: data.state.framework,
        phase: data.state.phase,
      } as ThinkingPausedPayload);

      return data.state;
    } catch (error) {
      console.error("[useThinkingFramework] Error pausing framework:", error);
      return null;
    }
  }, [enabled, sessionId, emit]);

  const resumeFramework = useCallback(async (): Promise<FrameworkState | null> => {
    if (!enabled || !sessionId) return null;

    try {
      const response = await fetch(
        config.getApiUrl(`/api/frameworks/resume/${sessionId}`),
        { method: "POST" }
      );

      if (!response.ok) {
        throw new Error(`Failed to resume framework: ${response.statusText}`);
      }

      const data = await response.json();

      if (mountedRef.current) {
        setState(data.state);
      }

      emit("termai-thinking-resumed", {
        sessionId,
        framework: data.state.framework,
        phase: data.state.phase,
      } as ThinkingResumedPayload);

      return data.state;
    } catch (error) {
      console.error("[useThinkingFramework] Error resuming framework:", error);
      return null;
    }
  }, [enabled, sessionId, emit]);

  const completeFramework = useCallback(
    async (result: FrameworkResult): Promise<FrameworkResult | null> => {
      if (!enabled || !sessionId) return null;

      try {
        const response = await fetch(
          config.getApiUrl(`/api/frameworks/complete/${sessionId}`),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ result }),
          }
        );

        if (!response.ok) {
          throw new Error(`Failed to complete framework: ${response.statusText}`);
        }

        const data = await response.json();

        if (mountedRef.current) {
          setState(null); // Clear state after completion
        }

        emit("termai-thinking-complete", {
          sessionId,
          result: data.result,
        } as ThinkingCompletePayload);

        return data.result;
      } catch (error) {
        console.error("[useThinkingFramework] Error completing framework:", error);
        return null;
      }
    },
    [enabled, sessionId, emit]
  );

  const getHistory = useCallback(
    async (limit = 10): Promise<FrameworkResult[]> => {
      if (!enabled || !sessionId) return [];

      try {
        const response = await fetch(
          config.getApiUrl(`/api/frameworks/history/${sessionId}?limit=${limit}`)
        );

        if (!response.ok) {
          throw new Error(`Failed to get history: ${response.statusText}`);
        }

        const data = await response.json();
        return data.history || [];
      } catch (error) {
        console.error("[useThinkingFramework] Error getting history:", error);
        return [];
      }
    },
    [enabled, sessionId]
  );

  const refreshState = useCallback(async (): Promise<void> => {
    if (!enabled || !sessionId) return;

    try {
      const response = await fetch(
        config.getApiUrl(`/api/frameworks/state/${sessionId}`)
      );

      if (!response.ok) {
        throw new Error(`Failed to refresh state: ${response.statusText}`);
      }

      const data = await response.json();

      if (mountedRef.current) {
        setState(data.state);
      }
    } catch (error) {
      console.error("[useThinkingFramework] Error refreshing state:", error);
    }
  }, [enabled, sessionId]);

  const fetchAvailableFrameworks = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(config.getApiUrl("/api/frameworks/available"));

      if (!response.ok) {
        throw new Error(`Failed to fetch frameworks: ${response.statusText}`);
      }

      const data = await response.json();

      if (mountedRef.current && data.definitions) {
        // Convert definitions object to array of FrameworkInfo
        const frameworks = Object.values(data.definitions) as FrameworkInfo[];
        setAvailableFrameworks(frameworks);
      }
    } catch (error) {
      console.error("[useThinkingFramework] Error fetching frameworks:", error);
    }
  }, []);

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

  // Fetch available frameworks on mount
  useEffect(() => {
    if (enabled) {
      fetchAvailableFrameworks();
    }
  }, [enabled, fetchAvailableFrameworks]);

  // Refresh state on session change
  useEffect(() => {
    if (enabled && sessionId) {
      refreshState();
    }
  }, [enabled, sessionId, refreshState]);

  // Listen for external thinking events
  useTermAiEvent(
    "termai-thinking-step",
    useCallback(
      (payload: ThinkingStepPayload) => {
        if (payload.sessionId === sessionId) {
          refreshState();
        }
      },
      [sessionId, refreshState]
    )
  );

  useTermAiEvent(
    "termai-thinking-complete",
    useCallback(
      (payload: ThinkingCompletePayload) => {
        if (payload.sessionId === sessionId) {
          setState(null);
        }
      },
      [sessionId]
    )
  );

  useTermAiEvent(
    "termai-thinking-error",
    useCallback(
      (payload: ThinkingErrorPayload) => {
        if (payload.sessionId === sessionId) {
          setLastError(payload.error);
        }
      },
      [sessionId]
    )
  );

  // ===========================================
  // Computed Values & Helpers
  // ===========================================

  const isActive = state?.status === "active";
  const isPaused = state?.status === "paused";
  const currentPhase = state?.phase || null;
  const steps = state?.steps || [];

  const getPhaseIndex = useCallback((): number => {
    if (!state || !currentPhase) return 0;
    const framework = availableFrameworks.find((f) => f.type === state.framework);
    if (!framework) return 0;
    const index = framework.phases.findIndex((p) => p.name.toLowerCase() === currentPhase.toLowerCase());
    return index >= 0 ? index : 0;
  }, [state, currentPhase, availableFrameworks]);

  const getTotalPhases = useCallback((): number => {
    if (!state) return 0;
    const framework = availableFrameworks.find((f) => f.type === state.framework);
    return framework?.phases.length || 0;
  }, [state, availableFrameworks]);

  const getProgress = useCallback((): number => {
    const total = getTotalPhases();
    if (total === 0) return 0;
    return (getPhaseIndex() + 1) / total;
  }, [getPhaseIndex, getTotalPhases]);

  return {
    // State
    state,
    isActive,
    isPaused,
    currentPhase,
    steps,
    recommendations,
    availableFrameworks,
    lastError,

    // Actions
    selectFramework,
    startFramework,
    addStep,
    pauseFramework,
    resumeFramework,
    completeFramework,
    getHistory,
    refreshState,
    fetchAvailableFrameworks,

    // Helpers
    getPhaseIndex,
    getTotalPhases,
    getProgress,
  };
}

// ===========================================
// Framework Display Utilities
// ===========================================

/**
 * Get the color for a framework type
 */
export function getFrameworkColor(framework: FrameworkType): string {
  const colors: Record<FrameworkType, string> = {
    ooda: "#3b82f6",
    five_whys: "#ef4444",
    bayesian: "#8b5cf6",
    chain_of_thought: "#10b981",
    pre_mortem: "#dc2626",
    first_principles: "#f59e0b",
    theory_of_constraints: "#06b6d4",
    scientific_method: "#14b8a6",
    divide_conquer: "#6366f1",
    feynman: "#ec4899",
    decide: "#a855f7",
    swiss_cheese: "#f97316",
  };
  return colors[framework] || "#6b7280";
}

/**
 * Get the icon for a framework type
 */
export function getFrameworkIcon(framework: FrameworkType): string {
  const icons: Record<FrameworkType, string> = {
    ooda: "🔄",
    five_whys: "❓",
    bayesian: "📊",
    chain_of_thought: "🔗",
    pre_mortem: "⚠️",
    first_principles: "🏛️",
    theory_of_constraints: "🎯",
    scientific_method: "🧪",
    divide_conquer: "✂️",
    feynman: "📚",
    decide: "⚖️",
    swiss_cheese: "🧀",
  };
  return icons[framework] || "🤔";
}

/**
 * Format a framework name for display
 */
export function formatFrameworkName(framework: FrameworkType): string {
  const names: Record<FrameworkType, string> = {
    ooda: "OODA Loop",
    five_whys: "Five Whys",
    bayesian: "Bayesian Reasoning",
    chain_of_thought: "Chain of Thought",
    pre_mortem: "Pre-mortem Analysis",
    first_principles: "First Principles",
    theory_of_constraints: "Theory of Constraints",
    scientific_method: "Scientific Method",
    divide_conquer: "Divide & Conquer",
    feynman: "Feynman Technique",
    decide: "DECIDE Framework",
    swiss_cheese: "Swiss Cheese Model",
  };
  return names[framework] || framework;
}
