/**
 * useAutoRun Hook
 * Manages auto-run mode state and command execution loop
 * Includes stuck detection and user intervention requests
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { LLMManager } from "../services/LLMManager";
import { FileSystemService } from "../services/FileSystemService";
import { buildSystemPrompt } from "../utils/promptBuilder";
import type { Message, PendingSafetyCommand } from "../types";
import { emit } from "../events";

const MAX_AUTO_STEPS = 10;
const MAX_CONSECUTIVE_FAILURES = 3;
const MAX_SIMILAR_COMMANDS = 3;
const STUCK_DETECTION_WINDOW = 5; // Look at last N commands

interface AutoRunConfig {
  sessionId?: string;
  currentCwd: string;
  apiKey: string;
  selectedModelId: string;
  messages: Message[];
  onMessagesUpdate: (updater: (prev: Message[]) => Message[]) => void;
  onStatusChange: (status: string | null) => void;
  onSafetyCheck: (command: PendingSafetyCommand) => void;
  getCommandImpact: (cmd: string) => string | null;
}

interface CommandHistory {
  command: string;
  exitCode: number;
  timestamp: number;
  errorPattern?: string | undefined;
}

interface StuckDetectionResult {
  isStuck: boolean;
  reason: string;
  suggestions: string[];
  failedCommands: string[];
}

interface AutoRunState {
  isAutoRun: boolean;
  autoRunCount: number;
  isLoading: boolean;
  runningCommandId: string | null;
  isStuck: boolean;
  stuckReason: string | null;
}

interface AutoRunActions {
  toggleAutoRun: () => void;
  setIsAutoRun: (value: boolean) => void;
  resetAutoRunCount: () => void;
  handleCommandFinished: (data: {
    command: string;
    output: string;
    exitCode: number;
    sessionId?: string;
  }) => Promise<void>;
  handleCommandStarted: (data: {
    commandId: string;
    command: string;
    sessionId?: string;
  }) => void;
  processAIResponse: (response: string) => Promise<void>;
  clearStuckState: () => void;
}

/**
 * Extract error pattern from command output
 */
function extractErrorPattern(output: string): string | undefined {
  const patterns = [
    /Address already in use/i,
    /EADDRINUSE/i,
    /Permission denied/i,
    /command not found/i,
    /No such file or directory/i,
    /Connection refused/i,
    /timeout/i,
    /ModuleNotFoundError/i,
    /ImportError/i,
    /SyntaxError/i,
  ];

  for (const pattern of patterns) {
    if (pattern.test(output)) {
      return pattern.source;
    }
  }
  return undefined;
}

/**
 * Detect if the AI is stuck in a loop
 */
function detectStuckState(history: CommandHistory[]): StuckDetectionResult {
  const recent = history.slice(-STUCK_DETECTION_WINDOW);

  if (recent.length < 2) {
    return { isStuck: false, reason: "", suggestions: [], failedCommands: [] };
  }

  // Check for consecutive failures
  const consecutiveFailures = recent.filter((h) => h.exitCode !== 0);
  if (consecutiveFailures.length >= MAX_CONSECUTIVE_FAILURES) {
    const failedCommands = consecutiveFailures.map((h) => h.command);
    const errorPatterns = [
      ...new Set(
        consecutiveFailures.map((h) => h.errorPattern).filter(Boolean),
      ),
    ];

    return {
      isStuck: true,
      reason: `${consecutiveFailures.length} consecutive command failures detected`,
      suggestions: generateSuggestions(
        errorPatterns as string[],
        failedCommands,
      ),
      failedCommands,
    };
  }

  // Check for repeated similar commands
  const commandGroups = new Map<string, string[]>();
  for (const h of recent) {
    const base = h.command.trim().split(/\s+/)[0];
    const existing = commandGroups.get(base) || [];
    existing.push(h.command);
    commandGroups.set(base, existing);
  }

  for (const [base, commands] of commandGroups) {
    if (commands.length >= MAX_SIMILAR_COMMANDS) {
      return {
        isStuck: true,
        reason: `Repeated attempts with similar "${base}" commands`,
        suggestions: [
          "Try a completely different approach",
          "Check if prerequisites are missing",
          "Verify the environment is correctly set up",
        ],
        failedCommands: commands,
      };
    }
  }

  // Check for same error pattern recurring
  const errorPatterns = recent.map((h) => h.errorPattern).filter(Boolean);
  const patternCounts = new Map<string, number>();
  for (const pattern of errorPatterns) {
    patternCounts.set(pattern!, (patternCounts.get(pattern!) || 0) + 1);
  }

  for (const [pattern, count] of patternCounts) {
    if (count >= MAX_CONSECUTIVE_FAILURES) {
      return {
        isStuck: true,
        reason: `Same error "${pattern}" occurring repeatedly`,
        suggestions: generateSuggestions(
          [pattern],
          recent.map((h) => h.command),
        ),
        failedCommands: recent
          .filter((h) => h.errorPattern === pattern)
          .map((h) => h.command),
      };
    }
  }

  return { isStuck: false, reason: "", suggestions: [], failedCommands: [] };
}

/**
 * Generate helpful suggestions based on error patterns
 */
function generateSuggestions(
  errorPatterns: string[],
  _failedCommands: string[],
): string[] {
  const suggestions: string[] = [];

  for (const pattern of errorPatterns) {
    if (/address.*in.*use|EADDRINUSE/i.test(pattern)) {
      suggestions.push(
        "A process is blocking the port. Would you like me to find and kill it?",
      );
      suggestions.push("Should I try a different port number?");
    }
    if (/permission.*denied/i.test(pattern)) {
      suggestions.push(
        "This requires elevated permissions. Should I use sudo?",
      );
      suggestions.push(
        "Check if the file/directory permissions need to be changed",
      );
    }
    if (/command.*not.*found/i.test(pattern)) {
      suggestions.push(
        "The required tool may not be installed. Should I install it?",
      );
      suggestions.push("Check if the tool is in your PATH");
    }
    if (/module.*not.*found|import.*error/i.test(pattern)) {
      suggestions.push(
        "Missing Python dependency. Should I install it with pip?",
      );
      suggestions.push("Are you in the correct virtual environment?");
    }
    if (/no.*such.*file/i.test(pattern)) {
      suggestions.push(
        "The file or directory doesn't exist. Should I create it?",
      );
      suggestions.push("Verify the path is correct");
    }
    if (/connection.*refused/i.test(pattern)) {
      suggestions.push("The service might not be running. Should I start it?");
      suggestions.push("Check if the service is configured correctly");
    }
    if (/timeout/i.test(pattern)) {
      suggestions.push(
        "The operation timed out. Should I try with a longer timeout?",
      );
      suggestions.push("The service might be overloaded or unresponsive");
    }
  }

  // Default suggestions if no specific patterns matched
  if (suggestions.length === 0) {
    suggestions.push("Would you like to try a different approach?");
    suggestions.push(
      "Can you provide more context about what you're trying to achieve?",
    );
    suggestions.push("Should I investigate the environment setup?");
  }

  return [...new Set(suggestions)]; // Remove duplicates
}

export function useAutoRun(
  config: AutoRunConfig,
): [AutoRunState, AutoRunActions] {
  const {
    sessionId,
    currentCwd,
    apiKey,
    selectedModelId,
    messages,
    onMessagesUpdate,
    onStatusChange,
    onSafetyCheck,
    getCommandImpact,
  } = config;

  const [isAutoRun, setIsAutoRun] = useState(false);
  const [autoRunCount, setAutoRunCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [runningCommandId, setRunningCommandId] = useState<string | null>(null);
  const [isStuck, setIsStuck] = useState(false);
  const [stuckReason, setStuckReason] = useState<string | null>(null);

  // Track command history for stuck detection
  const commandHistoryRef = useRef<CommandHistory[]>([]);

  // Use ref to track latest messages to avoid stale closure issues
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const clearStuckState = useCallback(() => {
    setIsStuck(false);
    setStuckReason(null);
    commandHistoryRef.current = [];
  }, []);

  const toggleAutoRun = useCallback(() => {
    setIsAutoRun((prev) => !prev);
    setAutoRunCount(0);
    clearStuckState();
  }, [clearStuckState]);

  const resetAutoRunCount = useCallback(() => {
    setAutoRunCount(0);
    clearStuckState();
  }, [clearStuckState]);

  const executeToolCommand = useCallback(
    async (
      tool: string,
      args: string,
      response: string,
      matchIndex: number,
      fullMatch: string,
    ) => {
      const path = args.trim();
      let output = "";
      let success = false;

      onStatusChange(`Executing Tool: ${tool}...`);

      try {
        switch (tool) {
          case "READ_FILE": {
            const content = await FileSystemService.readFile(path);
            output = `[TOOL_OUTPUT]\nFile: ${path}\nContent:\n\`\`\`\n${content}\n\`\`\``;
            success = true;
            break;
          }
          case "LIST_FILES": {
            const files = await FileSystemService.listFiles(path);
            output = `[TOOL_OUTPUT]\nDirectory: ${path}\nFiles:\n${files.map((f) => `${f.isDirectory ? "[DIR]" : "[FILE]"} ${f.name}`).join("\n")}`;
            success = true;
            break;
          }
          case "MKDIR": {
            await FileSystemService.createDirectory(path);
            output = `[TOOL_OUTPUT]\nDirectory created: ${path}`;
            success = true;
            break;
          }
          case "WRITE_FILE": {
            const codeBlockRegex = /```(?:\w+)?\n([\s\S]*?)\n```/;
            const afterTool = response.substring(matchIndex + fullMatch.length);
            const codeMatch = codeBlockRegex.exec(afterTool);
            if (codeMatch) {
              const fileContent = codeMatch[1];
              await FileSystemService.writeFile(path, fileContent);
              output = `[TOOL_OUTPUT]\nFile written: ${path}`;
              success = true;
            } else {
              output = `[TOOL_ERROR]\nNo content block found for WRITE_FILE: ${path}`;
            }
            break;
          }
        }
      } catch (err) {
        output = `[TOOL_ERROR]\n${tool} failed: ${(err as Error).message}`;
      }

      return { output, success };
    },
    [onStatusChange],
  );

  const requestUserInput = useCallback(
    (stuckResult: StuckDetectionResult) => {
      setIsStuck(true);
      setStuckReason(stuckResult.reason);

      const userInputRequest = `
🛑 **I Need Your Help**

I've been trying to complete this task but I'm running into repeated issues.

**Problem:** ${stuckResult.reason}

**Failed Commands:**
${stuckResult.failedCommands.map((cmd) => `- \`${cmd}\``).join("\n")}

**Possible Solutions:**
${stuckResult.suggestions.map((s, i) => `${i + 1}. ${s}`).join("\n")}

**Please help me by:**
- Telling me which approach to try
- Providing additional context about your setup
- Or manually running a command to fix the issue

Once you respond, I'll continue with your guidance.
`;

      onMessagesUpdate((prev) => [
        ...prev,
        { role: "ai", content: userInputRequest },
      ]);

      onStatusChange("Waiting for your input...");
      setIsLoading(false);
    },
    [onMessagesUpdate, onStatusChange],
  );

  const processAIResponse = useCallback(
    async (response: string) => {
      if (!isAutoRun) return;

      // Check for [WAIT] or [ASK_USER] signals from AI
      if (
        response.includes("[WAIT]") ||
        response.includes("[ASK_USER]") ||
        response.includes("[NEED_HELP]")
      ) {
        setIsStuck(true);
        setStuckReason("AI requested user input");
        onStatusChange("Waiting for your input...");
        return;
      }

      // --- Tool Execution Logic ---
      const toolRegex = /\[(READ_FILE|WRITE_FILE|LIST_FILES|MKDIR): (.*?)\]/g;
      let toolMatch;
      while ((toolMatch = toolRegex.exec(response)) !== null) {
        const [fullMatch, tool, args] = toolMatch;
        const { output } = await executeToolCommand(
          tool,
          args,
          response,
          toolMatch.index,
          fullMatch,
        );
        onMessagesUpdate((prev) => [
          ...prev,
          { role: "system", content: output },
        ]);
      }

      // --- Code Block Execution Logic ---
      const codeBlockRegex = /```(?:\w+)?\n([\s\S]*?)\n```/g;
      let match;

      while ((match = codeBlockRegex.exec(response)) !== null) {
        const nextCommand = match[1].trim();
        if (nextCommand) {
          const impact = getCommandImpact(nextCommand);
          if (impact) {
            onSafetyCheck({ command: nextCommand, sessionId, impact });
            onStatusChange("Waiting for safety confirmation...");
            return;
          }
          setAutoRunCount((prev) => prev + 1);
          emit("termai-run-command", { command: nextCommand, sessionId });

          setTimeout(() => {
            const isCoding =
              nextCommand.startsWith("echo") ||
              nextCommand.startsWith("cat") ||
              nextCommand.startsWith("printf") ||
              nextCommand.includes(">");
            onStatusChange(
              isCoding ? `Coding: ${nextCommand}` : `Terminal: ${nextCommand}`,
            );
          }, 1500);
          return;
        }
      }

      // Check for task completion
      if (response.toLowerCase().includes("task complete")) {
        setAutoRunCount(0);
        clearStuckState();
        onStatusChange(null);
      } else {
        // Stall detection
        onMessagesUpdate((prev) => [
          ...prev,
          {
            role: "system",
            content:
              "Auto-Run Stalled: No command found. Please explain why you stopped or ask for input.",
          },
        ]);
        onStatusChange("Stalled. Waiting for input...");
      }

      // Check for special commands
      if (response.includes("[NEW_TAB]")) {
        emit("termai-new-tab");
        onStatusChange("Opening new tab...");
      }

      if (response.includes("[CANCEL]") && runningCommandId) {
        emit("termai-cancel-command", {
          commandId: runningCommandId,
          sessionId,
        });
        onStatusChange("Cancelling command...");
        setRunningCommandId(null);
      }
    },
    [
      isAutoRun,
      sessionId,
      getCommandImpact,
      onSafetyCheck,
      onStatusChange,
      onMessagesUpdate,
      executeToolCommand,
      runningCommandId,
      clearStuckState,
    ],
  );

  const handleCommandFinished = useCallback(
    async (data: {
      command: string;
      output: string;
      exitCode: number;
      sessionId?: string;
    }) => {
      if (data.sessionId !== sessionId) return;

      const { command, output, exitCode } = data;
      setRunningCommandId(null);

      // Track command in history for stuck detection
      const errorPattern =
        exitCode !== 0 ? extractErrorPattern(output) : undefined;
      commandHistoryRef.current.push({
        command,
        exitCode,
        timestamp: Date.now(),
        errorPattern,
      });

      // Keep only recent history
      if (commandHistoryRef.current.length > 10) {
        commandHistoryRef.current = commandHistoryRef.current.slice(-10);
      }

      // Check for stuck state
      const stuckResult = detectStuckState(commandHistoryRef.current);
      if (stuckResult.isStuck) {
        requestUserInput(stuckResult);
        return;
      }

      // Add system output to chat
      let outputMsg = `> Executed: \`${command}\` (Exit: ${exitCode})\n\nOutput:\n\`\`\`\n${output.substring(0, 1000)}${output.length > 1000 ? "..." : ""}\n\`\`\``;

      // Intelligent Backtracking Trigger
      if (isAutoRun && exitCode !== 0) {
        outputMsg += `\n\n⚠️ **Command Failed (Exit Code: ${exitCode})**\n\n`;

        if (errorPattern) {
          outputMsg += `**Error Type:** ${errorPattern}\n\n`;
        }

        outputMsg += `**AUTO-RECOVERY PROTOCOL:**
1. Analyze why this command failed
2. Check if prerequisites are missing
3. If this is a recurring error, use [ASK_USER] to request help
4. Propose a DIFFERENT approach - do NOT repeat similar failed commands`;
      }

      onMessagesUpdate((prev) => [
        ...prev,
        { role: "system", content: outputMsg },
      ]);

      // If Auto-Run is on, feed back to LLM
      if (!isAutoRun) return;

      if (autoRunCount >= MAX_AUTO_STEPS) {
        onMessagesUpdate((prev) => [
          ...prev,
          {
            role: "system",
            content: "Auto-Run limit reached (10 steps). Stopping for safety.",
          },
        ]);
        setIsAutoRun(false);
        setAutoRunCount(0);
        clearStuckState();
        return;
      }

      setIsLoading(true);
      onStatusChange("Analyzing command output...");

      try {
        const providerType =
          localStorage.getItem("termai_provider") || "gemini";
        const llm = LLMManager.getProvider(
          providerType,
          apiKey,
          selectedModelId,
        );

        const currentMessages = messagesRef.current;
        const context =
          currentMessages.map((m) => `${m.role}: ${m.content}`).join("\n") +
          `\nSystem Output:\n${outputMsg}`;

        const systemPrompt = buildSystemPrompt({
          cwd: currentCwd,
          isAutoRun,
          os: "Linux", // TODO: detect actual OS
        });

        const response = await llm.chat(systemPrompt, context);

        onMessagesUpdate((prev) => [
          ...prev,
          { role: "ai", content: response },
        ]);
        await processAIResponse(response);
      } catch {
        onMessagesUpdate((prev) => [
          ...prev,
          { role: "ai", content: "Error in auto-run loop." },
        ]);
        onStatusChange("Error encountered.");
      } finally {
        setIsLoading(false);
      }
    },
    [
      sessionId,
      isAutoRun,
      autoRunCount,
      apiKey,
      selectedModelId,
      currentCwd,
      onMessagesUpdate,
      onStatusChange,
      processAIResponse,
      requestUserInput,
      clearStuckState,
    ],
  );

  const handleCommandStarted = useCallback(
    (data: { commandId: string; command: string; sessionId?: string }) => {
      if (data.sessionId !== sessionId) return;
      setRunningCommandId(data.commandId);
      // Clear stuck state when user manually runs a command
      if (isStuck) {
        clearStuckState();
      }
    },
    [sessionId, isStuck, clearStuckState],
  );

  // Reset stuck state when user sends a new message
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === "user" && isStuck) {
      clearStuckState();
    }
  }, [messages, isStuck, clearStuckState]);

  return [
    {
      isAutoRun,
      autoRunCount,
      isLoading,
      runningCommandId,
      isStuck,
      stuckReason,
    },
    {
      toggleAutoRun,
      setIsAutoRun,
      resetAutoRunCount,
      handleCommandFinished,
      handleCommandStarted,
      processAIResponse,
      clearStuckState,
    },
  ];
}
