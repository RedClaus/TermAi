import React, { useState, useRef, useEffect, useCallback, memo } from "react";
import styles from "./InputArea.module.css";
import { Play, Rocket, Clock } from "lucide-react";
import { useCommandHistory } from "../../hooks/useCommandHistory";

interface InputAreaProps {
  onExecute: (command: string) => void;
  cwd: string;
  sessionId?: string;
}

/**
 * InputArea Component
 * Command input area with auto-resize and history navigation
 */
export const InputArea = memo<InputAreaProps>(
  ({ onExecute, cwd, sessionId }) => {
    const [value, setValue] = useState("");
    const [showHistory, setShowHistory] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const {
      addToHistory,
      navigateUp,
      navigateDown,
      resetNavigation,
      searchHistory,
    } = useCommandHistory({ sessionId });

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        // Enter to execute
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          if (value.trim()) {
            addToHistory(value);
            onExecute(value);
            setValue("");
            setShowHistory(false);
          }
          return;
        }

        // Up arrow for history
        if (e.key === "ArrowUp" && !e.shiftKey) {
          e.preventDefault();
          const prev = navigateUp();
          if (prev !== null) {
            setValue(prev);
          }
          return;
        }

        // Down arrow for history
        if (e.key === "ArrowDown" && !e.shiftKey) {
          e.preventDefault();
          const next = navigateDown();
          if (next !== null) {
            setValue(next);
          }
          return;
        }

        // Escape to close history
        if (e.key === "Escape") {
          setShowHistory(false);
          return;
        }

        // Ctrl+R for history search
        if (e.key === "r" && e.ctrlKey) {
          e.preventDefault();
          setShowHistory((prev) => !prev);
          return;
        }
      },
      [value, onExecute, addToHistory, navigateUp, navigateDown],
    );

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setValue(e.target.value);
        resetNavigation();
      },
      [resetNavigation],
    );

    const handleRunClick = useCallback(() => {
      if (value.trim()) {
        addToHistory(value);
        onExecute(value);
        setValue("");
        setShowHistory(false);
      }
    }, [value, onExecute, addToHistory]);

    const handleHistorySelect = useCallback((command: string) => {
      setValue(command);
      setShowHistory(false);
      textareaRef.current?.focus();
    }, []);

    // Auto-resize textarea
    useEffect(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
        textareaRef.current.style.height =
          textareaRef.current.scrollHeight + "px";
      }
    }, [value]);

    // Filter history based on current input
    const filteredHistory = showHistory ? searchHistory(value) : [];

    return (
      <div className={styles.container}>
        {/* History Dropdown */}
        {showHistory && filteredHistory.length > 0 && (
          <div className={styles.historyDropdown}>
            <div className={styles.historyHeader}>
              <Clock size={12} />
              <span>Command History</span>
              <span className={styles.historyHint}>
                ↑↓ to navigate, Enter to select
              </span>
            </div>
            {filteredHistory.map((cmd, index) => (
              <div
                key={`${cmd}-${index}`}
                className={styles.historyItem}
                onClick={() => handleHistorySelect(cmd)}
              >
                <code>{cmd}</code>
              </div>
            ))}
          </div>
        )}

        <div className={styles.inputWrapper}>
          <div className={styles.prompt}>{cwd} $</div>
          <textarea
            ref={textareaRef}
            className={styles.input}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Type a command... (↑↓ for history, Ctrl+R to search)"
            rows={1}
            autoFocus
          />
          <div className={styles.actions}>
            <button
              className={styles.actionBtn}
              title="Command History (Ctrl+R)"
              type="button"
              onClick={() => setShowHistory((prev) => !prev)}
            >
              <Clock size={16} />
            </button>
            <button
              className={styles.actionBtn}
              title="AI Command Search"
              type="button"
            >
              <Rocket size={16} />
            </button>
            <button
              className={styles.actionBtn}
              title="Run Command"
              type="button"
              onClick={handleRunClick}
            >
              <Play size={16} fill="currentColor" />
            </button>
          </div>
        </div>
      </div>
    );
  },
);

InputArea.displayName = "InputArea";
