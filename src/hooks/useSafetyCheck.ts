/**
 * useSafetyCheck Hook
 * Handles command safety checks and dangerous command detection
 * Supports "Allow All" for low-risk commands in a session
 */
import { useState, useCallback, useRef } from "react";
import type {
  PendingSafetyCommand,
  SafetyCheckResult,
  SafetyRule,
  Message,
  RiskLevel,
} from "../types";
import { emit } from "../events";

// Safety rules for detecting dangerous or noteworthy commands
const SAFETY_RULES: SafetyRule[] = [
  // === CRITICAL RISKS ===
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
    pattern: /(?:^|\s|;|&)(mkfs)/,
    risk: "critical",
    description: "Formats a filesystem. All data on target will be lost.",
  },
  {
    pattern: /(?:^|\s|;|&)(:(){ :|:& };:)/,
    risk: "critical",
    description: "Fork bomb. Will crash the system.",
  },
  {
    pattern: />\s*\/dev\/(sda|hda|nvme)/,
    risk: "critical",
    description: "Writes directly to disk device. Data loss likely.",
  },

  // === HIGH RISKS ===
  {
    pattern: /(?:^|\s|;|&)(rm\s+)(?:-[a-zA-Z]*r[a-zA-Z]*\s+)?/,
    risk: "high",
    description: "Deletes files/directories recursively. Permanent data loss.",
  },
  {
    pattern: /(?:^|\s|;|&)(dd)/,
    risk: "high",
    description: "Low-level data copy. Can overwrite disks/partitions.",
  },
  {
    pattern: /(?:^|\s|;|&)(curl|wget).*\|\s*(sh|bash)/,
    risk: "high",
    description: "Downloads and executes remote script. Security risk.",
  },

  // === MEDIUM RISKS ===
  {
    pattern: /(?:^|\s|;|&)(rm\s+)/,
    risk: "medium",
    description: "Deletes files permanently.",
  },
  {
    pattern: /(?:^|\s|;|&)(sudo)/,
    risk: "medium",
    description: "Runs with superuser privileges. Can modify system files.",
  },
  {
    pattern: /(?:^|\s|;|&)(chmod\s+777)/,
    risk: "medium",
    description: "Sets overly permissive file permissions.",
  },

  // === LOW RISKS (Installation commands - can be auto-allowed) ===
  {
    pattern: /(?:^|\s|;|&)(pip3?\s+install)/,
    risk: "low",
    description:
      "Installs Python package(s). This will modify your Python environment.",
  },
  {
    pattern: /(?:^|\s|;|&)(npm\s+install|npm\s+i\s)/,
    risk: "low",
    description:
      "Installs Node.js package(s). This will modify your node_modules.",
  },
  {
    pattern: /(?:^|\s|;|&)(yarn\s+add)/,
    risk: "low",
    description: "Installs Node.js package(s) via Yarn.",
  },
  {
    pattern: /(?:^|\s|;|&)(apt\s+install|apt-get\s+install)/,
    risk: "low",
    description:
      "Installs system package(s). Requires sudo and modifies system.",
  },
  {
    pattern: /(?:^|\s|;|&)(brew\s+install)/,
    risk: "low",
    description: "Installs package(s) via Homebrew.",
  },
  {
    pattern: /(?:^|\s|;|&)(cargo\s+install)/,
    risk: "low",
    description: "Installs Rust package(s).",
  },
  {
    pattern: /(?:^|\s|;|&)(gem\s+install)/,
    risk: "low",
    description: "Installs Ruby gem(s).",
  },
  {
    pattern: /(?:^|\s|;|&)(go\s+install)/,
    risk: "low",
    description: "Installs Go package(s).",
  },
];

interface UseSafetyCheckConfig {
  sessionId?: string | undefined;
  onMessagesUpdate: (updater: (prev: Message[]) => Message[]) => void;
  onStatusChange: (status: string | null) => void;
  onAutoRunCountIncrement: () => void;
}

export interface PendingSafetyCommandExtended extends PendingSafetyCommand {
  risk?: RiskLevel | undefined;
  allowAllOption?: boolean | undefined;
}

interface UseSafetyCheckReturn {
  showSafetyConfirm: boolean;
  pendingSafetyCommand: PendingSafetyCommandExtended | null;
  checkCommand: (command: string) => SafetyCheckResult;
  getCommandImpact: (command: string) => string | null;
  requestSafetyConfirmation: (command: PendingSafetyCommand) => void;
  handleSafetyConfirm: (confirmed: boolean, allowAll?: boolean) => void;
  dismissSafetyDialog: () => void;
  isRiskAllowed: (risk: RiskLevel) => boolean;
  resetAllowedRisks: () => void;
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
    useState<PendingSafetyCommandExtended | null>(null);

  // Track which risk levels have been "allowed all" for this session
  const allowedRisksRef = useRef<Set<RiskLevel>>(new Set());

  /**
   * Check if a risk level has been allowed for all commands
   */
  const isRiskAllowed = useCallback((risk: RiskLevel): boolean => {
    return allowedRisksRef.current.has(risk);
  }, []);

  /**
   * Reset all allowed risks (e.g., when starting a new session)
   */
  const resetAllowedRisks = useCallback(() => {
    allowedRisksRef.current.clear();
  }, []);

  /**
   * Check a command against safety rules and return the result
   */
  const checkCommand = useCallback((command: string): SafetyCheckResult => {
    for (const rule of SAFETY_RULES) {
      if (rule.pattern.test(command)) {
        // If this risk level has been "allowed all", skip the check
        if (allowedRisksRef.current.has(rule.risk)) {
          continue;
        }
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
   * Get the impact description for a command (returns null if safe or allowed)
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
      // Get the risk level for this command
      const result = checkCommand(command.command);

      // If already allowed, just run it
      if (!result.isDangerous) {
        emit("termai-run-command", {
          command: command.command,
          sessionId,
        });
        onAutoRunCountIncrement();
        return;
      }

      setPendingSafetyCommand({
        ...command,
        risk: result.risk,
        // Only show "Allow All" for low-risk commands
        allowAllOption: result.risk === "low",
      });
      setShowSafetyConfirm(true);
    },
    [checkCommand, sessionId, onAutoRunCountIncrement],
  );

  /**
   * Handle user's response to the safety confirmation dialog
   */
  const handleSafetyConfirm = useCallback(
    (confirmed: boolean, allowAll = false) => {
      if (confirmed && pendingSafetyCommand) {
        // If "Allow All" was selected, add this risk level to allowed set
        if (allowAll && pendingSafetyCommand.risk) {
          allowedRisksRef.current.add(pendingSafetyCommand.risk);
          onMessagesUpdate((prev) => [
            ...prev,
            {
              role: "system",
              content: `✓ Auto-approved all "${pendingSafetyCommand.risk}" risk commands for this session.`,
            },
          ]);
        }

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
    isRiskAllowed,
    resetAllowedRisks,
  };
}

// Export the safety rules for external use
export { SAFETY_RULES };
export type { SafetyRule };
