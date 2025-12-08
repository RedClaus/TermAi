/**
 * ChatMessage
 * Renders a single chat message with code block handling
 * Warp-style design with gradient backgrounds
 */

import React, { memo } from "react";
import { Send } from "lucide-react";
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
        <div className="p-4 rounded-lg text-[14px] leading-[1.6] whitespace-pre-wrap break-words bg-emerald-500/10 border border-dashed border-emerald-500/30 text-emerald-500">
          <div className="whitespace-pre-wrap">{content}</div>
        </div>
      );
    }

    // Split content into text and code blocks
    const parts = content.split(/```(?:\w+)?\n([\s\S]*?)\n```/g);

    return (
      <div
        className={`
          p-4 rounded-lg text-[15px] leading-[1.6] whitespace-pre-wrap break-words relative
          ${role === "user" 
            ? 'bg-blue-500 text-white self-end max-w-[85%] rounded-br-sm font-medium' 
            : 'bg-[#1a1a1a] text-gray-200 border border-gray-800 rounded-bl-sm'
          }
        `}
      >
        {parts.map((part, i) => {
          // Odd indices are code blocks
          if (i % 2 === 1) {
            return (
              <div key={i} className="bg-[#0f0f0f] p-4 rounded-lg my-3 border border-gray-800">
                <code className="block mb-3 font-mono text-[14px] whitespace-pre-wrap break-all text-cyan-400">
                  {part}
                </code>
                {!isAutoRun && (
                  <button
                    className="bg-emerald-500 text-white border-none rounded px-4 py-2 text-[14px] font-semibold cursor-pointer inline-flex items-center gap-2 transition-all hover:bg-emerald-400"
                    onClick={() => handleRunCommand(part)}
                  >
                    <Send size={14} /> Run
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
