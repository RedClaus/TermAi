import React, { useState, useEffect, useRef, useCallback } from "react";
import styles from "./SystemOverseer.module.css";
import { Activity, AlertTriangle, CheckCircle } from "lucide-react";
import clsx from "clsx";
import { emit } from "../../events";
import { useTermAiEvent } from "../../hooks/useTermAiEvent";
import type {
  CommandStartedPayload,
  CommandOutputPayload,
  CommandFinishedPayload,
  AiThinkingPayload,
} from "../../events/types";
import type { SystemState } from "../../types";

interface SystemOverseerProps {
  sessionId: string;
}

export const SystemOverseer: React.FC<SystemOverseerProps> = ({
  sessionId,
}) => {
  const [state, setState] = useState<SystemState>("healthy");
  const [statusMessage, setStatusMessage] = useState("System Healthy");

  // Tracking state
  const lastActivityRef = useRef<number>(0);
  const runningCommandRef = useRef<{ id: string; startTime: number } | null>(
    null,
  );
  const isAiThinkingRef = useRef<boolean>(false);
  const aiStartTimeRef = useRef<number>(0);
  const stateRef = useRef<SystemState>("healthy");

  // Initialize lastActivityRef on mount
  useEffect(() => {
    lastActivityRef.current = Date.now();
  }, []);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const updateActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  const handleIntervention = useCallback(
    (force: boolean | React.MouseEvent = false) => {
      const isForce = typeof force === "boolean" ? force : false;

      if (stateRef.current === "stalled" || isForce) {
        if (runningCommandRef.current) {
          emit("termai-cancel-command", {
            commandId: runningCommandRef.current.id,
            sessionId,
          });
          setStatusMessage("Intervention: Cancelled Command");
        }
        if (isAiThinkingRef.current) {
          isAiThinkingRef.current = false;
          setState("healthy");
          setStatusMessage("Intervention: Reset AI");
        }
        if (stateRef.current === "stalled") {
          setState("healthy");
          setTimeout(() => setStatusMessage("System Healthy"), 2000);
        }
      }
    },
    [sessionId],
  );

  // Event Handlers
  useTermAiEvent(
    "termai-command-started",
    (payload: CommandStartedPayload) => {
      if (payload.sessionId !== sessionId) return;
      runningCommandRef.current = {
        id: payload.commandId,
        startTime: Date.now(),
      };
      updateActivity();
      setState("busy");
      setStatusMessage(`Running: ${payload.command}`);
    },
    [sessionId, updateActivity],
  );

  useTermAiEvent(
    "termai-command-output",
    (payload: CommandOutputPayload) => {
      if (payload.sessionId !== sessionId) return;
      updateActivity();
      if (stateRef.current === "stalled") {
        setState("busy");
        setStatusMessage("Processing output...");
      }
    },
    [sessionId, updateActivity],
  );

  useTermAiEvent(
    "termai-command-finished",
    (payload: CommandFinishedPayload) => {
      if (payload.sessionId !== sessionId) return;
      runningCommandRef.current = null;
      updateActivity();
      setState("healthy");
      setStatusMessage("Command finished");
      setTimeout(() => setStatusMessage("System Healthy"), 2000);
    },
    [sessionId, updateActivity],
  );

  useTermAiEvent(
    "termai-ai-thinking",
    (payload: AiThinkingPayload) => {
      if (payload.sessionId !== sessionId) return;
      if (payload.isThinking) {
        isAiThinkingRef.current = true;
        aiStartTimeRef.current = Date.now();
        setState("busy");
        setStatusMessage("AI Thinking...");
      } else {
        isAiThinkingRef.current = false;
        setState("healthy");
        setStatusMessage("AI Ready");
        setTimeout(() => setStatusMessage("System Healthy"), 2000);
      }
    },
    [sessionId],
  );

  // Watchdog Loop
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();

      // Check Command Stall
      if (runningCommandRef.current) {
        const runDuration = now - runningCommandRef.current.startTime;
        const timeSinceActivity = now - lastActivityRef.current;

        if (runDuration > 30000 && timeSinceActivity > 30000) {
          if (stateRef.current !== "stalled") {
            setState("stalled");
            setStatusMessage("Stalled! Auto-Fixing...");
          }

          if (runDuration > 35000) {
            handleIntervention(true);
          }
        }
      }

      // Check AI Stall
      if (isAiThinkingRef.current) {
        const thinkDuration = now - aiStartTimeRef.current;
        if (thinkDuration > 45000) {
          if (stateRef.current !== "stalled") {
            setState("stalled");
            setStatusMessage("AI Stalled?");
          }
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [handleIntervention]);

  return (
    <div
      className={clsx(styles.overseer, styles[state])}
      onClick={handleIntervention}
      title={state === "stalled" ? "Click to Intervene" : statusMessage}
    >
      {state === "healthy" && <CheckCircle size={14} />}
      {state === "busy" && <Activity size={14} className={styles.pulse} />}
      {state === "stalled" && <AlertTriangle size={14} />}
      <span className={styles.statusText}>{statusMessage}</span>
    </div>
  );
};
