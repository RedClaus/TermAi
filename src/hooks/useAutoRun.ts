/**
 * useAutoRun Hook
 * Manages auto-run mode state and command execution loop
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { LLMManager } from "../services/LLMManager";
import { FileSystemService } from "../services/FileSystemService";
import { buildSystemPrompt } from "../utils/promptBuilder";
import { Message, PendingSafetyCommand } from "../types";
import { emit } from "../events";

const MAX_AUTO_STEPS = 10;

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

interface AutoRunState {
  isAutoRun: boolean;
  autoRunCount: number;
  isLoading: boolean;
  runningCommandId: string | null;
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

  // Use ref to track latest messages to avoid stale closure issues
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const toggleAutoRun = useCallback(() => {
    setIsAutoRun((prev) => !prev);
    setAutoRunCount(0);
  }, []);

  const resetAutoRunCount = useCallback(() => {
    setAutoRunCount(0);
  }, []);

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

  const processAIResponse = useCallback(
    async (response: string) => {
      if (!isAutoRun) return;

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
        emit("termai-new-tab", undefined);
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

      // Add system output to chat
      let outputMsg = `> Executed: \`${command}\` (Exit: ${exitCode})\n\nOutput:\n\`\`\`\n${output.substring(0, 1000)}${output.length > 1000 ? "..." : ""}\n\`\`\``;

      // Intelligent Backtracking Trigger
      if (isAutoRun && exitCode !== 0) {
        outputMsg += `\n\nCommand Failed (Exit Code: ${exitCode}).\n\nAUTO-RECOVERY INITIATED:\n1. Review your last plan.\n2. Identify which step failed.\n3. Backtrack to the state before this step.\n4. Propose a DIFFERENT command to achieve the same goal. Do NOT repeat the failed command.`;
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
          os: "macOS",
        });

        const response = await llm.chat(systemPrompt, context);

        onMessagesUpdate((prev) => [
          ...prev,
          { role: "ai", content: response },
        ]);
        await processAIResponse(response);
      } catch (error) {
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
    ],
  );

  const handleCommandStarted = useCallback(
    (data: { commandId: string; command: string; sessionId?: string }) => {
      if (data.sessionId !== sessionId) return;
      setRunningCommandId(data.commandId);
    },
    [sessionId],
  );

  // Loop Prevention: Check if the last AI message is identical to the one before the last system message
  useEffect(() => {
    if (isAutoRun && messages.length > 4) {
      const lastAiMsg = messages[messages.length - 1];
      const prevAiMsg = messages[messages.length - 3]; // AI -> System -> AI
      if (
        lastAiMsg.role === "ai" &&
        prevAiMsg?.role === "ai" &&
        lastAiMsg.content === prevAiMsg.content
      ) {
        onMessagesUpdate((prev) => [
          ...prev,
          {
            role: "system",
            content:
              "Loop Detected: You are repeating the same command/response. Auto-Run stopped.",
          },
        ]);
        setIsAutoRun(false);
        onStatusChange("Loop detected. Stopped.");
      }
    }
  }, [messages, isAutoRun, onMessagesUpdate, onStatusChange]);

  // Event listeners for command events
  useEffect(() => {
    const handleFinished = (e: Event) => {
      const customEvent = e as CustomEvent<{
        command: string;
        output: string;
        exitCode: number;
        sessionId?: string;
      }>;
      handleCommandFinished(customEvent.detail);
    };

    const handleStarted = (e: Event) => {
      const customEvent = e as CustomEvent<{
        commandId: string;
        command: string;
        sessionId?: string;
      }>;
      handleCommandStarted(customEvent.detail);
    };

    const handleAutoContinue = () => {
      if (isAutoRun) {
        emit("termai-auto-continue");
      }
    };

    window.addEventListener("termai-command-finished", handleFinished);
    window.addEventListener("termai-command-started", handleStarted);
    window.addEventListener("termai-auto-continue", handleAutoContinue);

    return () => {
      window.removeEventListener("termai-command-finished", handleFinished);
      window.removeEventListener("termai-command-started", handleStarted);
      window.removeEventListener("termai-auto-continue", handleAutoContinue);
    };
  }, [handleCommandFinished, handleCommandStarted, isAutoRun]);

  const state: AutoRunState = {
    isAutoRun,
    autoRunCount,
    isLoading,
    runningCommandId,
  };

  const actions: AutoRunActions = {
    toggleAutoRun,
    setIsAutoRun,
    resetAutoRunCount,
    handleCommandFinished,
    handleCommandStarted,
    processAIResponse,
  };

  return [state, actions];
}
