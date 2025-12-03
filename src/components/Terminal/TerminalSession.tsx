import React, { useState, useRef, useEffect, useCallback } from "react";
import { Block } from "./Block";
import { InputArea } from "./InputArea";
import { InteractiveBlock } from "./InteractiveBlock";
import { Dashboard } from "./Dashboard";
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

interface TerminalSessionProps {
  sessionId?: string;
}

export const TerminalSession: React.FC<TerminalSessionProps> = ({
  sessionId,
}) => {
  const [blocks, setBlocks] = useState<BlockData[]>([]);
  const [cwd, setCwd] = useState("~");
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentCommandRef = useRef<string | null>(null);

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
      const isInteractive = command.trim().startsWith("ssh");
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
        const result = await executeCommand(command, cwd, tempId);

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
      <div className={styles.scrollArea} ref={scrollRef}>
        {blocks.length === 0 && <Dashboard onCommand={handleExecute} />}
        {blocks.map((block) =>
          block.isInteractive ? (
            <InteractiveBlock
              key={block.id}
              command={block.command}
              cwd={block.cwd}
              onExit={(code) => handleInteractiveExit(block.id, code)}
            />
          ) : (
            <Block key={block.id} data={block} />
          ),
        )}
      </div>
      <InputArea onExecute={handleExecute} cwd={cwd} />
    </div>
  );
};
