/**
 * useUIState Hook
 * 
 * Manages UI-related state for the AI chat interface including:
 * - Input text
 * - Loading states
 * - Dialog visibility
 * - Agent status messages
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { emit } from "../events";

// =============================================
// Types
// =============================================

export interface UIState {
  input: string;
  isLoading: boolean;
  agentStatus: string | null;
  showComplexConfirm: boolean;
  pendingComplexMessage: string;
}

export interface UIStateActions {
  setInput: (input: string) => void;
  setIsLoading: (loading: boolean) => void;
  setAgentStatus: (status: string | null) => void;
  showComplexDialog: (message: string) => void;
  hideComplexDialog: () => void;
  clearInput: () => void;
  setTemporaryStatus: (status: string, durationMs?: number) => void;
}

export interface UseUIStateOptions {
  sessionId?: string | undefined;
  /** Callback when loading state changes */
  onLoadingChange?: ((isLoading: boolean) => void) | undefined;
}

// =============================================
// Hook
// =============================================

export function useUIState(options: UseUIStateOptions = {}) {
  const { sessionId, onLoadingChange } = options;

  // =============================================
  // State
  // =============================================
  const [input, setInput] = useState("");
  const [isLoading, setIsLoadingState] = useState(false);
  const [agentStatus, setAgentStatus] = useState<string | null>(null);
  const [showComplexConfirm, setShowComplexConfirm] = useState(false);
  const [pendingComplexMessage, setPendingComplexMessage] = useState("");

  const statusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // =============================================
  // Loading State with Side Effects
  // =============================================
  const setIsLoading = useCallback(
    (loading: boolean) => {
      setIsLoadingState(loading);
      
      // Emit thinking state event
      emit("termai-ai-thinking", { isThinking: loading, sessionId });
      
      // Call optional callback
      onLoadingChange?.(loading);
    },
    [sessionId, onLoadingChange]
  );

  // =============================================
  // Complex Dialog Management
  // =============================================
  const showComplexDialog = useCallback((message: string) => {
    setPendingComplexMessage(message);
    setShowComplexConfirm(true);
  }, []);

  const hideComplexDialog = useCallback(() => {
    setShowComplexConfirm(false);
    setPendingComplexMessage("");
  }, []);

  // =============================================
  // Input Management
  // =============================================
  const clearInput = useCallback(() => {
    setInput("");
  }, []);

  // =============================================
  // Temporary Status Messages
  // =============================================
  const setTemporaryStatus = useCallback(
    (status: string, durationMs = 3000) => {
      // Clear any existing timeout
      if (statusTimeoutRef.current) {
        clearTimeout(statusTimeoutRef.current);
      }

      setAgentStatus(status);

      statusTimeoutRef.current = setTimeout(() => {
        setAgentStatus(null);
        statusTimeoutRef.current = null;
      }, durationMs);
    },
    []
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (statusTimeoutRef.current) {
        clearTimeout(statusTimeoutRef.current);
      }
    };
  }, []);

  // =============================================
  // Computed Properties
  // =============================================
  
  /**
   * Check if the AI needs user attention (waiting, stalled, etc.)
   */
  const needsAttention = 
    agentStatus?.toLowerCase().includes("waiting") ||
    agentStatus?.toLowerCase().includes("stalled") ||
    agentStatus?.toLowerCase().includes("input");

  // Emit needs-input event when attention state changes
  useEffect(() => {
    emit("termai-ai-needs-input", {
      needsInput: !!needsAttention,
      reason: agentStatus || undefined,
      sessionId,
    });
  }, [needsAttention, agentStatus, sessionId]);

  // =============================================
  // Return
  // =============================================
  return {
    // State
    input,
    isLoading,
    agentStatus,
    showComplexConfirm,
    pendingComplexMessage,
    needsAttention,

    // Actions
    setInput,
    setIsLoading,
    setAgentStatus,
    showComplexDialog,
    hideComplexDialog,
    clearInput,
    setTemporaryStatus,
  };
}

/**
 * Utility to check if a complex request dialog should be shown
 * (long message in an existing conversation)
 */
export function shouldShowComplexDialog(
  message: string,
  messagesCount: number,
  minMessageLength = 50,
  minMessages = 2
): boolean {
  return (
    messagesCount > minMessages &&
    message.length > minMessageLength
  );
}
