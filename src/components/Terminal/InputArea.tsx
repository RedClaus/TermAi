import React, { useState, useRef, useEffect, useCallback, memo } from "react";
import { Play, Rocket, Clock } from "lucide-react";
import { useCommandHistory } from "../../hooks/useCommandHistory";

interface InputAreaProps {
  onExecute: (command: string) => void;
  cwd: string;
  sessionId?: string | undefined;
}

/**
 * InputArea Component
 * Warp-style floating input with cyan glow on focus
 */
export const InputArea = memo<InputAreaProps>(
  ({ onExecute, cwd, sessionId }) => {
    const [value, setValue] = useState("");
    const [showHistory, setShowHistory] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
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
      <div className="p-6 bg-[#0a0a0a] sticky bottom-0 relative z-50">
        {/* History Dropdown */}
        {showHistory && filteredHistory.length > 0 && (
          <div className="absolute bottom-full left-6 right-6 bg-[#1a1a1a] border border-gray-800 rounded-lg mb-3 max-h-[300px] overflow-y-auto shadow-xl z-50">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 text-[14px] text-gray-400 font-medium">
              <Clock size={14} />
              <span>Command History</span>
              <span className="ml-auto text-xs text-gray-500">
                ↑↓ to navigate, Enter to select
              </span>
            </div>
            {filteredHistory.map((cmd, index) => (
              <div
                key={`${cmd}-${index}`}
                className="px-4 py-3 cursor-pointer transition-colors duration-150 hover:bg-white/5"
                onClick={() => handleHistorySelect(cmd)}
              >
                <code className="font-mono text-[14px] text-gray-100">{cmd}</code>
              </div>
            ))}
          </div>
        )}

        {/* Floating input card with cyan glow */}
        <div className="max-w-6xl mx-auto">
          <div 
            className={`
              bg-[#141414] border-2 rounded-lg overflow-hidden
              transition-all duration-200
              ${isFocused 
                ? 'border-cyan-400/30 shadow-[0_0_30px_-5px_rgba(34,211,238,0.3)]' 
                : 'border-gray-800 hover:border-gray-700'
              }
            `}
          >
            {/* Input Field */}
            <div className="flex items-center gap-3 px-5 py-4">
              <span className="text-[14px] font-semibold font-mono text-emerald-500">{cwd}</span>
              <span className="text-gray-600">$</span>
              <textarea
                ref={textareaRef}
                className="flex-1 bg-transparent border-none text-base font-mono text-gray-100 outline-none resize-none min-h-[24px] leading-relaxed placeholder-gray-500"
                value={value}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder="Type a command or ask AI..."
                rows={1}
                autoFocus
              />
              <div className="flex gap-2 ml-3">
                <button
                  className="bg-transparent border-none text-gray-500 cursor-pointer p-2 rounded flex items-center justify-center hover:bg-white/5 hover:text-gray-300 transition-all min-w-[36px] min-h-[36px]"
                  title="Command History (Ctrl+R)"
                  type="button"
                  onClick={() => setShowHistory((prev) => !prev)}
                >
                  <Clock size={18} />
                </button>
                <button
                  className="bg-transparent border-none text-gray-500 cursor-pointer p-2 rounded flex items-center justify-center hover:bg-purple-500/10 hover:text-purple-400 transition-all min-w-[36px] min-h-[36px]"
                  title="AI Command Search"
                  type="button"
                >
                  <Rocket size={18} />
                </button>
                <button
                  className="bg-cyan-400/10 border-none text-cyan-400 cursor-pointer p-2 rounded flex items-center justify-center hover:bg-cyan-400/20 transition-all min-w-[36px] min-h-[36px]"
                  title="Run Command"
                  type="button"
                  onClick={handleRunClick}
                >
                  <Play size={18} fill="currentColor" />
                </button>
              </div>
            </div>

            {/* Footer with info */}
            <div className="bg-[#0f0f0f] px-5 py-2 flex items-center justify-between border-t border-gray-800">
              <div className="flex items-center gap-4">
                <span className="text-xs text-gray-500">main*</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs bg-gray-800 px-2 py-0.5 rounded border border-gray-700 text-gray-400">⌘I</span>
                <span className="text-xs text-gray-500">AI Chat</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  },
);

InputArea.displayName = "InputArea";
