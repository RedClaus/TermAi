/**
 * useChatHistory Hook
 * Manages chat message history with localStorage persistence
 */
import { useState, useEffect, useCallback, useRef } from "react";
import type { Message } from "../types";

const DEFAULT_WELCOME_MESSAGE: Message = {
  role: "ai",
  content:
    "Hi! I'm TermAI. How can I help you with your terminal commands today?",
};

interface UseChatHistoryConfig {
  sessionId?: string | undefined;
  storageKeyPrefix?: string | undefined;
}

interface UseChatHistoryReturn {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  addMessage: (message: Message) => void;
  addMessages: (newMessages: Message[]) => void;
  clearHistory: () => void;
  resetToWelcome: (customMessage?: string) => void;
  getHistoryKey: () => string;
  scrollToBottom: () => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

export function useChatHistory(
  config: UseChatHistoryConfig = {},
): UseChatHistoryReturn {
  const { sessionId, storageKeyPrefix = "termai_chat_history" } = config;

  const [messages, setMessages] = useState<Message[]>([
    DEFAULT_WELCOME_MESSAGE,
  ]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  /**
   * Get the storage key for this session's chat history
   */
  const getHistoryKey = useCallback(() => {
    return sessionId ? `${storageKeyPrefix}_${sessionId}` : storageKeyPrefix;
  }, [sessionId, storageKeyPrefix]);

  /**
   * Load chat history from localStorage on mount
   */
  useEffect(() => {
    const historyKey = getHistoryKey();
    const storedHistory = localStorage.getItem(historyKey);
    if (storedHistory) {
      try {
        const parsed = JSON.parse(storedHistory);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
        }
      } catch (e) {
        console.error("Failed to parse chat history:", e);
      }
    }
  }, [getHistoryKey]);

  /**
   * Persist messages to localStorage whenever they change
   */
  useEffect(() => {
    if (messages.length > 1) {
      const historyKey = getHistoryKey();
      localStorage.setItem(historyKey, JSON.stringify(messages));
    }
  }, [messages, getHistoryKey]);

  /**
   * Add a single message to the history
   */
  const addMessage = useCallback((message: Message) => {
    setMessages((prev) => [
      ...prev,
      { ...message, timestamp: message.timestamp ?? Date.now() },
    ]);
  }, []);

  /**
   * Add multiple messages to the history
   */
  const addMessages = useCallback((newMessages: Message[]) => {
    setMessages((prev) => [
      ...prev,
      ...newMessages.map((m) => ({
        ...m,
        timestamp: m.timestamp ?? Date.now(),
      })),
    ]);
  }, []);

  /**
   * Clear the entire chat history
   */
  const clearHistory = useCallback(() => {
    const historyKey = getHistoryKey();
    localStorage.removeItem(historyKey);
    setMessages([DEFAULT_WELCOME_MESSAGE]);
  }, [getHistoryKey]);

  /**
   * Reset to welcome message (optionally with custom content)
   */
  const resetToWelcome = useCallback((customMessage?: string) => {
    setMessages([
      {
        role: "ai",
        content: customMessage || DEFAULT_WELCOME_MESSAGE.content,
      },
    ]);
  }, []);

  /**
   * Scroll to the bottom of the messages container
   */
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Auto-scroll when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  return {
    messages,
    setMessages,
    addMessage,
    addMessages,
    clearHistory,
    resetToWelcome,
    getHistoryKey,
    scrollToBottom,
    messagesEndRef,
  };
}

// Export default welcome message for external use
export { DEFAULT_WELCOME_MESSAGE };
