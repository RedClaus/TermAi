/**
 * ChatMessage
 * Renders a single chat message with code block handling
 */

import React, { memo } from "react";
import { Send } from "lucide-react";
import styles from "./ChatMessage.module.css";
import type { Message } from "../../types";
import { emit } from "../../events";

export interface ChatMessageProps {
  message: Message;
  sessionId?: string | undefined;
  isAutoRun: boolean;
}

export const ChatMessage: React.FC<ChatMessageProps> = memo(
  ({ message, sessionId, isAutoRun }) => {
    const { role, content } = message;

    const handleRunCommand = (command: string) => {
      emit("termai-run-command", { command: command.trim(), sessionId });
    };

    // System messages render simply
    if (role === "system") {
      return (
        <div className={`${styles.message} ${styles.systemMessage}`}>
          <div className={styles.systemContent}>{content}</div>
        </div>
      );
    }

    // Split content into text and code blocks
    const parts = content.split(/```(?:\w+)?\n([\s\S]*?)\n```/g);

    return (
      <div
        className={`${styles.message} ${role === "user" ? styles.userMessage : styles.aiMessage}`}
      >
        {parts.map((part, i) => {
          // Odd indices are code blocks
          if (i % 2 === 1) {
            return (
              <div key={i} className={styles.codeBlock}>
                <code className={styles.code}>{part}</code>
                {!isAutoRun && (
                  <button
                    className={styles.runButton}
                    onClick={() => handleRunCommand(part)}
                  >
                    <Send size={10} /> Run
                  </button>
                )}
              </div>
            );
          }
          // Even indices are regular text
          return part ? <span key={i}>{part}</span> : null;
        })}
      </div>
    );
  },
);

ChatMessage.displayName = "ChatMessage";
