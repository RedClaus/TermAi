/**
 * useAutoRunMachine Hook
 * 
 * Encapsulates the auto-run state machine logic including:
 * - Task tracking (steps, timing, summary)
 * - Stall detection and recovery
 * - Loop prevention
 * - Command processing and execution flow
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { emit } from "../events";
import {
  extractSingleCommand,
  isWriteFileBlock,
} from "../utils/commandValidator";
import type { TaskStep, TaskSummary } from "../components/AI/TaskCompletionSummary";
import type { ModelSpec } from "../data/models";

// =============================================
// Constants
// =============================================
export const MAX_AUTO_STEPS = 10;
export const MAX_STALLS_BEFORE_ASK = 2;

// =============================================
// Types
// =============================================
export type StopReason = "user" | "complete" | "error" | "limit";

export interface Message {
  role: "user" | "ai" | "system";
  content: string;
}

export interface AutoRunConfig {
  sessionId?: string | undefined;
  currentCwd: string;
  selectedModelId: string;
  models: ModelSpec[];
  isLiteMode: boolean;
}

export interface SafetyCheckCallbacks {
  getCommandImpact: (command: string) => string | null;
  requestSafetyConfirmation: (opts: { 
    command: string; 
    sessionId: string | undefined; 
    impact: string 
  }) => void;
}

// =============================================
// Utility Functions (exported for reuse)
// =============================================

/**
 * Detect if output indicates an application started successfully
 */
export const APP_SUCCESS_INDICATORS = [
  /please select/i,
  /choose.*option/i,
  /menu:/i,
  /available.*options/i,
  /welcome to/i,
  /server.*running/i,
  /listening on/i,
  /started.*successfully/i,
  /ready.*http/i,
  /application.*started/i,
  /press.*to.*exit/i,
  /enter.*to.*continue/i,
  /waiting for input/i,
  /╔.*╗/,
  /═{3,}/,
];

/**
 * Detect server start patterns in commands
 */
export const SERVER_PATTERNS = /npm\s+(start|run\s+dev)|python.*main|node\s+|yarn\s+(start|dev)|flask\s+run|uvicorn|gunicorn/i;

/**
 * Extract port from command or output
 */
export function extractPort(text: string): number | undefined {
  const match = text.match(/(?:port|PORT|localhost:|127\.0\.0\.1:|0\.0\.0\.0:)\s*(\d{4,5})/i);
  return match ? parseInt(match[1], 10) : undefined;
}

/**
 * Build task summary from steps
 */
export function buildTaskSummary(
  steps: TaskStep[],
  startTime: number | null,
  reason: StopReason,
  narrative?: string
): TaskSummary {
  const endTime = Date.now();
  const successfulSteps = steps.filter((s) => s.exitCode === 0).length;
  const failedSteps = steps.filter((s) => s.exitCode !== 0).length;

  const recentSteps = steps.slice(-3);
  const lastServerCommand = recentSteps.find(
    (s) => SERVER_PATTERNS.test(s.command) && s.exitCode === 0
  );

  const appPort = extractPort(
    recentSteps.map((s) => s.output || s.command).join(" ")
  );

  const finalMessages: Record<StopReason, string> = {
    complete: "Task completed successfully!",
    limit: "Stopped: Maximum steps reached",
    error: "Stopped due to errors",
    user: "Stopped by user",
  };

  return {
    totalSteps: steps.length,
    successfulSteps,
    failedSteps,
    steps,
    startTime: startTime || endTime,
    endTime,
    appStatus: lastServerCommand
      ? "running"
      : failedSteps > successfulSteps
        ? "error"
        : "stopped",
    appPort,
    finalMessage: finalMessages[reason],
    narrative,
  };
}

/**
 * Format command output message for the AI
 */
export function formatOutputMessage(
  command: string,
  output: string,
  exitCode: number,
  isAutoRun: boolean
): string {
  let msg = `> Executed: \`${command}\` (Exit: ${exitCode})\n\nOutput:\n\`\`\`\n${output.substring(0, 1000)}${output.length > 1000 ? "..." : ""}\n\`\`\``;

  if (isAutoRun && exitCode !== 0) {
    msg += `\n\nCommand Failed (Exit Code: ${exitCode}).\n\nAUTO-RECOVERY INITIATED:\n1. Review your last plan.\n2. Identify which step failed.\n3. Backtrack to the state before this step.\n4. Propose a DIFFERENT command to achieve the same goal. Do NOT repeat the failed command.`;
  }

  if (isAutoRun && exitCode === 0) {
    const looksLikeAppStarted = APP_SUCCESS_INDICATORS.some((pattern) =>
      pattern.test(output)
    );
    if (looksLikeAppStarted) {
      msg += `\n\n**APPLICATION STARTED SUCCESSFULLY** - The output shows the application is running and displaying a UI/menu. If this was the user's goal (to run/start the app), you should output your Mission Report and say "Task Complete". Do NOT run additional commands unless the user asked for something beyond just starting the app.`;
    }
  }

  return msg;
}

/**
 * Check if a command looks like coding (file writing)
 */
export function isCodingCommand(command: string): boolean {
  return (
    command.startsWith("echo") ||
    command.startsWith("cat") ||
    command.startsWith("printf") ||
    command.includes(">")
  );
}

/**
 * Process an AI response to extract and execute commands
 * Returns info about what was found/done
 */
export function processResponseForCommand(
  response: string,
  config: AutoRunConfig,
  safetyCallbacks: SafetyCheckCallbacks,
  callbacks: {
    setAgentStatus: (status: string | null) => void;
    onCommandFound: (command: string) => void;
    onTaskComplete: (narrative: string) => void;
    onNeedsUserInput: () => void;
    onStall: (stallCount: number) => void;
  },
  currentStallCount: number
): { foundCommand: boolean; newStallCount: number } {
  const codeBlockRegex = /```(?:bash|sh|shell|zsh)?\n([\s\S]*?)\n```/g;
  let match;
  let foundCommand = false;

  while ((match = codeBlockRegex.exec(response)) !== null) {
    const blockContent = match[1];

    if (isWriteFileBlock(response, match.index)) {
      continue;
    }

    const nextCommand = extractSingleCommand(blockContent);
    if (!nextCommand) continue;

    foundCommand = true;
    const impact = safetyCallbacks.getCommandImpact(nextCommand);

    if (impact) {
      safetyCallbacks.requestSafetyConfirmation({
        command: nextCommand,
        sessionId: config.sessionId,
        impact,
      });
      callbacks.setAgentStatus("Waiting for safety confirmation...");
      return { foundCommand: true, newStallCount: 0 };
    }

    // Execute the command
    emit("termai-run-command", { command: nextCommand, sessionId: config.sessionId });
    callbacks.setAgentStatus(
      isCodingCommand(nextCommand)
        ? `Coding: ${nextCommand}`
        : `Terminal: ${nextCommand}`
    );
    callbacks.onCommandFound(nextCommand);
    return { foundCommand: true, newStallCount: 0 };
  }

  // No command found - check completion or stall
  if (!foundCommand) {
    if (response.toLowerCase().includes("task complete")) {
      let narrative = "";
      const reportMatch = response.match(/Mission Report:([\s\S]*?)Task Complete/i);
      if (reportMatch) {
        narrative = reportMatch[1].trim();
      } else {
        narrative = response.replace(/task complete/i, "").trim();
      }
      callbacks.onTaskComplete(narrative);
      return { foundCommand: false, newStallCount: 0 };
    }

    if (
      response.includes("[ASK_USER]") ||
      response.includes("[WAIT]") ||
      response.includes("[NEED_HELP]")
    ) {
      callbacks.setAgentStatus("Waiting for your input...");
      callbacks.onNeedsUserInput();
      return { foundCommand: false, newStallCount: 0 };
    }

    // Stall detected
    const newStallCount = currentStallCount + 1;
    callbacks.onStall(newStallCount);
    return { foundCommand: false, newStallCount };
  }

  // Handle [NEW_TAB] directive
  if (response.includes("[NEW_TAB]")) {
    emit("termai-new-tab");
    callbacks.setAgentStatus("Opening new tab...");
  }

  return { foundCommand: true, newStallCount: 0 };
}

/**
 * Check for response loop (AI repeating itself)
 */
export function detectResponseLoop(messages: Message[]): boolean {
  if (messages.length <= 4) return false;
  
  const lastAiMsg = messages[messages.length - 1];
  const prevAiMsg = messages[messages.length - 3];
  
  return (
    lastAiMsg.role === "ai" &&
    prevAiMsg?.role === "ai" &&
    lastAiMsg.content === prevAiMsg.content
  );
}

// =============================================
// Main Hook
// =============================================

interface UseAutoRunMachineProps {
  sessionId?: string | undefined;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setAgentStatus: (status: string | null) => void;
  analyzeAndLearn: (messages: Message[], context: string, provider: string) => void;
}

export function useAutoRunMachine({
  sessionId,
  messages,
  setMessages,
  setAgentStatus,
  analyzeAndLearn,
}: UseAutoRunMachineProps) {
  // =============================================
  // State
  // =============================================
  const [isAutoRun, setIsAutoRun] = useState(false);
  const [autoRunCount, setAutoRunCount] = useState(0);
  const [consecutiveStalls, setConsecutiveStalls] = useState(0);
  const [taskSteps, setTaskSteps] = useState<TaskStep[]>([]);
  const [taskStartTime, setTaskStartTime] = useState<number | null>(null);
  const [taskSummary, setTaskSummary] = useState<TaskSummary | null>(null);
  const [runningCommandId, setRunningCommandId] = useState<string | null>(null);

  // Refs for stable callback references
  const analyzeAndLearnRef = useRef(analyzeAndLearn);
  const messagesRef = useRef(messages);
  analyzeAndLearnRef.current = analyzeAndLearn;
  messagesRef.current = messages;

  // =============================================
  // Stop Auto-Run
  // =============================================
  const stopAutoRun = useCallback(
    (reason: StopReason = "user", narrative?: string) => {
      if (!isAutoRun && !taskStartTime) return;

      const summary = buildTaskSummary(taskSteps, taskStartTime, reason, narrative);
      setTaskSummary(summary);
      setIsAutoRun(false);
      setAutoRunCount(0);
      setConsecutiveStalls(0);
      setAgentStatus(null);

      // Trigger skill learning on successful completion
      const shouldLearn = reason === "complete" || summary.successfulSteps > 0;
      const currentMessages = messagesRef.current;
      console.log("[AutoRunMachine] stopAutoRun:", {
        reason,
        successfulSteps: summary.successfulSteps,
        shouldLearn,
        messageCount: currentMessages.length,
      });

      if (shouldLearn && currentMessages.length >= 3) {
        console.log("[AutoRunMachine] Triggering skill learning...");
        setTimeout(() => {
          const providerType = localStorage.getItem("termai_provider") || "gemini";
          analyzeAndLearnRef.current(currentMessages, "", providerType);
        }, 1000);
      }

      if (runningCommandId) {
        emit("termai-cancel-command", {
          commandId: runningCommandId,
          sessionId,
        });
        setRunningCommandId(null);
      }
    },
    [isAutoRun, taskStartTime, taskSteps, runningCommandId, sessionId, setAgentStatus]
  );

  // =============================================
  // Toggle Auto-Run
  // =============================================
  const toggleAutoRun = useCallback(() => {
    const enabling = !isAutoRun;
    setIsAutoRun(enabling);
    if (enabling) {
      setTaskStartTime(Date.now());
      setTaskSteps([]);
      setTaskSummary(null);
      setConsecutiveStalls(0);
      setAgentStatus("Auto-run enabled");
    } else {
      setAutoRunCount(0);
      setAgentStatus("Auto-run disabled");
    }
    setTimeout(() => setAgentStatus(null), 2000);
  }, [isAutoRun, setAgentStatus]);

  // =============================================
  // Dismiss Summary
  // =============================================
  const dismissSummary = useCallback(() => {
    setTaskSummary(null);
    setTaskSteps([]);
    setTaskStartTime(null);
  }, []);

  // =============================================
  // Add Task Step
  // =============================================
  const addTaskStep = useCallback((step: TaskStep) => {
    setTaskSteps((prev) => [...prev, step]);
  }, []);

  // =============================================
  // Loop Prevention Effect
  // =============================================
  // Use refs to avoid dependency on callback functions
  const setMessagesRef = useRef(setMessages);
  const setAgentStatusRef = useRef(setAgentStatus);
  setMessagesRef.current = setMessages;
  setAgentStatusRef.current = setAgentStatus;

  useEffect(() => {
    if (isAutoRun && detectResponseLoop(messages)) {
      setMessagesRef.current((prev) => [
        ...prev,
        {
          role: "system",
          content:
            "Loop Detected: You are repeating the same command/response. Auto-Run stopped.",
        },
      ]);
      setIsAutoRun(false);
      setAgentStatusRef.current("Loop detected. Stopped.");
    }
  }, [messages, isAutoRun]);

  // =============================================
  // Return Hook Interface
  // =============================================
  return {
    // State
    isAutoRun,
    autoRunCount,
    consecutiveStalls,
    taskSteps,
    taskStartTime,
    taskSummary,
    runningCommandId,

    // Actions
    toggleAutoRun,
    stopAutoRun,
    dismissSummary,
    addTaskStep,
    setRunningCommandId,
    setConsecutiveStalls,
    incrementAutoRunCount: () => setAutoRunCount((prev) => prev + 1),

    // Setters for external control
    setIsAutoRun,
  };
}
