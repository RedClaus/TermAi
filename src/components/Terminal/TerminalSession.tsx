import React, { useState, useRef, useEffect, useCallback } from "react";
import { Block } from "./Block";
import { InputArea } from "./InputArea";
import { InteractiveBlock } from "./InteractiveBlock";
import type { BlockData } from "../../types";
import type {
  RunCommandPayload,
  CancelCommandPayload,
} from "../../events/types";
import { executeCommand, cancelCommand } from "../../utils/commandRunner";
import { emit } from "../../events";
import { useTermAiEvent } from "../../hooks/useTermAiEvent";
import { InitialCwdService } from "../../services/InitialCwdService";
import { PathCorrectionDialog } from "../AI/PathCorrectionDialog";
import { v4 as uuidv4 } from "uuid";

interface TerminalSessionProps {
  sessionId?: string;
}

export const TerminalSession: React.FC<TerminalSessionProps> = ({
  sessionId,
}) => {
  const [blocks, setBlocks] = useState<BlockData[]>([]);
  const [cwd, setCwd] = useState("~");
  const [isInitialized, setIsInitialized] = useState(false);
  const [pathCorrection, setPathCorrection] = useState<{
    originalPath: string;
    serverPath: string;
    reason: string;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentCommandRef = useRef<string | null>(null);

  // Fetch initial CWD from server (set by CLI launch)
  useEffect(() => {
    const initCwd = async () => {
      // First check localStorage for session-specific CWD
      if (sessionId) {
        const storedCwd = localStorage.getItem(`termai_cwd_${sessionId}`);
        if (storedCwd) {
          setCwd(storedCwd);
          setIsInitialized(true);
          return;
        }
      }

      // Otherwise, fetch the initial CWD from server
      try {
        const { cwd: initialCwd, isCliLaunch } = await InitialCwdService.getInitialCwd();
        console.log("[TerminalSession] Initial CWD:", initialCwd, "CLI Launch:", isCliLaunch);
        setCwd(initialCwd);
      } catch (error) {
        console.error("[TerminalSession] Failed to fetch initial CWD:", error);
        setCwd("~"); // Fallback
      } finally {
        setIsInitialized(true);
      }
    };

    initCwd();
    setBlocks([]);
  }, [sessionId]);

  // Save CWD and emit event for AI (scoped)
  useEffect(() => {
    if (sessionId) {
      localStorage.setItem(`termai_cwd_${sessionId}`, cwd);
    }
    emit("termai-cwd-changed", { cwd, sessionId });
  }, [cwd, sessionId]);

  const handleExecute = useCallback(
    async (command: string) => {
      if (command === "clear") {
        setBlocks([]);
        return;
      }

      const tempId = uuidv4();
      
      // Check for interactive commands that need PTY/xterm
      const interactiveCommands = [
        "ssh", "sudo", "nano", "vim", "vi", "emacs", 
        "top", "htop", "less", "more", "man", 
        "python", "python3", "node", "npm", "yarn", "pnpm", "bun",
        "docker", "docker-compose", "git"
      ];
      
      const firstWord = command.trim().split(/\s+/)[0];
      const args = command.trim().split(/\s+/).slice(1);
      
      // Heuristic: Is this likely an interactive command or long-running process?
      let isInteractive = false;

      // 1. Explicit interactive tools
      if (interactiveCommands.includes(firstWord)) {
        // Special exclusions (non-interactive uses)
        const isVersion = args.includes("-v") || args.includes("--version");
        const isHelp = args.includes("-h") || args.includes("--help");
        const isGitNonInteractive = firstWord === "git" && 
          ["status", "log", "diff", "add", "commit", "push", "pull", "fetch", "clone"].includes(args[0]);
        const isDockerNonInteractive = (firstWord === "docker" || firstWord === "docker-compose") &&
          ["ps", "images", "info", "version"].includes(args[0]);
        const isNpmNonInteractive = (firstWord === "npm" || firstWord === "yarn" || firstWord === "pnpm") &&
          ["install", "i", "add", "remove", "test", "run build"].some(cmd => args[0] === cmd || (args[0] === "run" && args[1] === "build"));

        if (!isVersion && !isHelp && !isGitNonInteractive && !isDockerNonInteractive && !isNpmNonInteractive) {
          isInteractive = true;
        }
        
        // REPLs are always interactive if no args (except flags)
        if ((firstWord === "python" || firstWord === "python3" || firstWord === "node") && args.length === 0) {
          isInteractive = true;
        }
      }

      // 2. Shell scripts and local executables
      if (command.includes(".sh") || command.startsWith("./")) {
        isInteractive = true;
      }

      // 3. SSH is always interactive
      if (command.trim().startsWith("ssh")) {
        isInteractive = true;
      }

      currentCommandRef.current = tempId;

      const pendingBlock: BlockData = {
        id: tempId,
        command,
        output: "",
        cwd,
        timestamp: Date.now(),
        exitCode: 0,
        isLoading: true,
        isInteractive,
      };

      setBlocks((prev) => [...prev, pendingBlock]);

      // Emit start event for AI Watchdog
      emit("termai-command-started", { commandId: tempId, command, sessionId });

      // Scroll to bottom immediately
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      }, 10);

      if (isInteractive) {
        // Interactive blocks handle their own execution via WebSocket
        return;
      }

      try {
        const result = await executeCommand(command, cwd, tempId, sessionId);

        setBlocks((prev) =>
          prev.map((b) =>
            b.id === tempId
              ? {
                  ...b,
                  output: result.output,
                  exitCode: result.exitCode,
                  isLoading: false,
                }
              : b,
          ),
        );

        if (result.newCwd) {
          setCwd(result.newCwd);
          emit("termai-cwd-changed", { cwd: result.newCwd, sessionId });
        }

        // Handle CWD correction (path not found)
        if (result.cwdFallback) {
          setPathCorrection(result.cwdFallback);
        }

        // Emit output event for System Overseer
        emit("termai-command-output", {
          commandId: tempId,
          output: result.output,
          sessionId,
        });

        // Emit event for AI to see output
        emit("termai-command-finished", {
          command,
          output: result.output,
          exitCode: result.exitCode,
          sessionId,
        });
      } catch (error) {
        const errorMessage = `Error: ${(error as Error).message}`;
        setBlocks((prev) =>
          prev.map((b) =>
            b.id === tempId
              ? { ...b, output: errorMessage, exitCode: 1, isLoading: false }
              : b,
          ),
        );
        emit("termai-command-finished", {
          command,
          output: errorMessage,
          exitCode: 1,
          sessionId,
        });
      } finally {
        currentCommandRef.current = null;
      }

      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      }, 10);
    },
    [cwd, sessionId],
  );

  // Handle run command events from AI
  useTermAiEvent(
    "termai-run-command",
    (payload: RunCommandPayload) => {
      // Only execute if for this session or no session specified
      if (!payload.sessionId || payload.sessionId === sessionId) {
        handleExecute(payload.command);
      }
    },
    [handleExecute, sessionId],
  );

  // Handle cancel command events
  useTermAiEvent(
    "termai-cancel-command",
    (payload: CancelCommandPayload) => {
      if (
        payload.commandId === currentCommandRef.current &&
        (!payload.sessionId || payload.sessionId === sessionId)
      ) {
        cancelCommand(payload.commandId);
        setBlocks((prev) =>
          prev.map((b) =>
            b.id === payload.commandId
              ? {
                  ...b,
                  output: "Command cancelled by user/AI.",
                  exitCode: 130,
                  isLoading: false,
                }
              : b,
          ),
        );

        // Get the command from blocks
        const block = blocks.find((b) => b.id === payload.commandId);
        if (block) {
          emit("termai-command-finished", {
            command: block.command,
            output: "Command cancelled by user/AI.",
            exitCode: 130,
            sessionId,
          });
        }
      }
    },
    [blocks, sessionId],
  );

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [blocks]);

  const handleInteractiveExit = useCallback(
    (blockId: string, exitCode: number) => {
      setBlocks((prev) =>
        prev.map((b) =>
          b.id === blockId ? { ...b, isLoading: false, exitCode } : b,
        ),
      );

      // Notify AI that interactive session finished
      const block = blocks.find((b) => b.id === blockId);
      if (block) {
        emit("termai-command-finished", {
          command: block.command,
          output: "[Interactive Session Finished]",
          exitCode,
          sessionId,
        });
      }
    },
    [blocks, sessionId],
  );

  return (
    <div className="flex flex-col h-full w-full bg-gradient-to-br from-[#0d1117] to-[#0a0e14] overflow-hidden">
      {/* Terminal output area - more generous padding */}
      <div 
        className="flex-1 overflow-y-auto px-6 py-6 pb-2 scroll-smooth scrollbar-hide md:px-10"
        ref={scrollRef}
      >
        {blocks.length === 0 && isInitialized && (
          <div className="flex flex-col items-center justify-center p-12 text-gray-400 text-center">
            <p className="text-base">Terminal ready in <code className="text-cyan-400 bg-[#1c2128] px-2.5 py-1 rounded-lg font-mono">{cwd}</code></p>
            <p className="text-sm mt-3 text-gray-500">Commands from AI will appear here, or type below to run directly.</p>
          </div>
        )}
        {blocks.map((block) =>
          block.isInteractive ? (
            <InteractiveBlock
              key={block.id}
              command={block.command}
              cwd={block.cwd}
              onExit={(code) => handleInteractiveExit(block.id, code)}
            />
          ) : (
            <Block key={block.id} data={block} sessionId={sessionId} />
          ),
        )}
      </div>
      <InputArea onExecute={handleExecute} cwd={cwd} />
      
      {/* Path Correction Dialog */}
      {pathCorrection && (
        <PathCorrectionDialog
          originalPath={pathCorrection.originalPath}
          serverPath={pathCorrection.serverPath}
          reason={pathCorrection.reason}
          onDismiss={() => setPathCorrection(null)}
          onClone={() => {
            setPathCorrection(null);
            handleExecute(`cd ~/github && echo "Cloning repo..."`); 
            // The user would likely need to paste the URL, so we just prep the dir
          }}
          onUseLocalAgent={() => {
            setPathCorrection(null);
            window.open('/bin/local-agent.cjs', '_blank');
          }}
        />
      )}
    </div>
  );
};
