/**
 * useSafetyCheck Hook
 * Handles command safety checks and dangerous command detection
 */
import { useState, useCallback } from "react";
import {
  PendingSafetyCommand,
  SafetyCheckResult,
  SafetyRule,
  RiskLevel,
} from "../types";
import { emit } from "../events";
import { Message } from "../types";

// Safety rules for detecting dangerous commands
const SAFETY_RULES: SafetyRule[] = [
  {
    pattern: /(?:^|\s|;|&)(rm\s+)(?:-[a-zA-Z]*r[a-zA-Z]*\s+)?\//,
    risk: "critical",
    description:
      "CRITICAL: Recursively deletes from root. System destruction likely.",
  },
  {
    pattern: /(?:^|\s|;|&)(rm\s+)(?:-[a-zA-Z]*r[a-zA-Z]*\s+)?~/,
    risk: "critical",
    description:
      "CRITICAL: Recursively deletes home directory. Data loss likely.",
  },
  {
    pattern: /(?:^|\s|;|&)(rm\s+)(?:-[a-zA-Z]*r[a-zA-Z]*\s+)?/,
    risk: "high",
    description: "Deletes files/directories recursively. Permanent data loss.",
  },
  {
    pattern: /(?:^|\s|;|&)(rm\s+)/,
    risk: "medium",
    description: "Deletes files permanently.",
  },
  {
    pattern: /(?:^|\s|;|&)(mkfs)/,
    risk: "critical",
    description: "Formats a filesystem. All data on target will be lost.",
  },
  {
    pattern: /(?:^|\s|;|&)(dd)/,
    risk: "high",
    description: "Low-level data copy. Can overwrite disks/partitions.",
  },
  {
    pattern: /(?:^|\s|;|&)(sudo)/,
    risk: "medium",
    description: "Runs with superuser privileges. Can modify system files.",
  },
  {
    pattern: /(?:^|\s|;|&)(:(){ :|:& };:)/,
    risk: "critical",
    description: "Fork bomb. Will crash the system.",
  },
  {
    pattern: /(?:^|\s|;|&)(chmod\s+777)/,
    risk: "medium",
    description: "Sets overly permissive file permissions.",
  },
  {
    pattern: /(?:^|\s|;|&)(curl|wget).*\|\s*(sh|bash)/,
    risk: "high",
    description: "Downloads and executes remote script. Security risk.",
  },
  {
    pattern: />\s*\/dev\/(sda|hda|nvme)/,
    risk: "critical",
    description: "Writes directly to disk device. Data loss likely.",
  },
];

interface UseSafetyCheckConfig {
  sessionId?: string;
  onMessagesUpdate: (updater: (prev: Message[]) => Message[]) => void;
  onStatusChange: (status: string | null) => void;
  onAutoRunCountIncrement: () => void;
}

interface UseSafetyCheckReturn {
  showSafetyConfirm: boolean;
  pendingSafetyCommand: PendingSafetyCommand | null;
  checkCommand: (command: string) => SafetyCheckResult;
  getCommandImpact: (command: string) => string | null;
  requestSafetyConfirmation: (command: PendingSafetyCommand) => void;
  handleSafetyConfirm: (confirmed: boolean) => void;
  dismissSafetyDialog: () => void;
}

export function useSafetyCheck(
  config: UseSafetyCheckConfig,
): UseSafetyCheckReturn {
  const {
    sessionId,
    onMessagesUpdate,
    onStatusChange,
    onAutoRunCountIncrement,
  } = config;

  const [showSafetyConfirm, setShowSafetyConfirm] = useState(false);
  const [pendingSafetyCommand, setPendingSafetyCommand] =
    useState<PendingSafetyCommand | null>(null);

  /**
   * Check a command against safety rules and return the result
   */
  const checkCommand = useCallback((command: string): SafetyCheckResult => {
    for (const rule of SAFETY_RULES) {
      if (rule.pattern.test(command)) {
        return {
          isDangerous: true,
          impact: rule.description,
          risk: rule.risk,
        };
      }
    }
    return { isDangerous: false, impact: null };
  }, []);

  /**
   * Get the impact description for a command (returns null if safe)
   */
  const getCommandImpact = useCallback(
    (command: string): string | null => {
      const result = checkCommand(command);
      return result.impact;
    },
    [checkCommand],
  );

  /**
   * Request user confirmation for a potentially dangerous command
   */
  const requestSafetyConfirmation = useCallback(
    (command: PendingSafetyCommand) => {
      setPendingSafetyCommand(command);
      setShowSafetyConfirm(true);
    },
    [],
  );

  /**
   * Handle user's response to the safety confirmation dialog
   */
  const handleSafetyConfirm = useCallback(
    (confirmed: boolean) => {
      if (confirmed && pendingSafetyCommand) {
        // User approved - run the command
        emit("termai-run-command", {
          command: pendingSafetyCommand.command,
          sessionId,
        });

        const cmd = pendingSafetyCommand.command;
        const isCoding =
          cmd.startsWith("echo") ||
          cmd.startsWith("cat") ||
          cmd.startsWith("printf") ||
          cmd.includes(">");

        onStatusChange(isCoding ? `Coding: ${cmd}` : `Terminal: ${cmd}`);
        onAutoRunCountIncrement();
      } else {
        // User cancelled
        onMessagesUpdate((prev) => [
          ...prev,
          {
            role: "system",
            content: "Command cancelled by user safety check.",
          },
        ]);
        onStatusChange("Command cancelled.");
      }

      setShowSafetyConfirm(false);
      setPendingSafetyCommand(null);
    },
    [
      pendingSafetyCommand,
      sessionId,
      onMessagesUpdate,
      onStatusChange,
      onAutoRunCountIncrement,
    ],
  );

  /**
   * Dismiss the safety dialog without taking action
   */
  const dismissSafetyDialog = useCallback(() => {
    setShowSafetyConfirm(false);
    setPendingSafetyCommand(null);
  }, []);

  return {
    showSafetyConfirm,
    pendingSafetyCommand,
    checkCommand,
    getCommandImpact,
    requestSafetyConfirmation,
    handleSafetyConfirm,
    dismissSafetyDialog,
  };
}

// Export the safety rules for external use
export { SAFETY_RULES };
export type { SafetyRule };
