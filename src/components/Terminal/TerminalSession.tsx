import React, { useState, useRef, useEffect, useCallback } from "react";
import { Block } from "./Block";
import { InputArea } from "./InputArea";
import { InteractiveBlock } from "./InteractiveBlock";
import { AIInputBox } from "./AIInputBox";
import { GripHorizontal } from "lucide-react";
import type { BlockData } from "../../types";
import type {
  RunCommandPayload,
  CancelCommandPayload,
} from "../../events/types";
import { executeCommand, cancelCommand } from "../../utils/commandRunner";
import { emit } from "../../events";
import { useTermAiEvent } from "../../hooks/useTermAiEvent";
import styles from "./TerminalSession.module.css";
import { v4 as uuidv4 } from "uuid";

const MIN_AI_HEIGHT = 80;
const MAX_AI_HEIGHT = 400;
const DEFAULT_AI_HEIGHT = 140;

interface TerminalSessionProps {
  sessionId?: string;
}

export const TerminalSession: React.FC<TerminalSessionProps> = ({
  sessionId,
}) => {
  const [blocks, setBlocks] = useState<BlockData[]>([]);
  const [cwd, setCwd] = useState("~");
  const [aiBoxHeight, setAiBoxHeight] = useState(() => {
    const saved = localStorage.getItem("termai_ai_box_height");
    return saved ? parseInt(saved, 10) : DEFAULT_AI_HEIGHT;
  });
  const [isResizing, setIsResizing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentCommandRef = useRef<string | null>(null);
  const resizeRef = useRef<HTMLDivElement>(null);

  // Handle resize drag
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const container = resizeRef.current?.parentElement;
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const newHeight = e.clientY - containerRect.top;
      const clampedHeight = Math.min(
        MAX_AI_HEIGHT,
        Math.max(MIN_AI_HEIGHT, newHeight),
      );
      setAiBoxHeight(clampedHeight);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      localStorage.setItem("termai_ai_box_height", aiBoxHeight.toString());
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, aiBoxHeight]);

  // Load history specific to session if provided
  useEffect(() => {
    if (sessionId) {
      const storedCwd = localStorage.getItem(`termai_cwd_${sessionId}`);
      if (storedCwd) setCwd(storedCwd);
      setBlocks([]);
    }
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
    <div className={styles.container}>
      {/* Persistent AI Input Box at top */}
      <div
        className={styles.aiBoxWrapper}
        style={{ height: aiBoxHeight }}
        ref={resizeRef}
      >
        <AIInputBox onCommand={handleExecute} sessionId={sessionId} cwd={cwd} />
      </div>

      {/* Resize handle */}
      <div
        className={`${styles.resizeHandle} ${isResizing ? styles.resizing : ""}`}
        onMouseDown={handleMouseDown}
      >
        <GripHorizontal size={16} />
      </div>

      {/* Terminal output area */}
      <div className={styles.scrollArea} ref={scrollRef}>
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
    </div>
  );
};
