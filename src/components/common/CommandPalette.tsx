/**
 * CommandPalette Component
 * Quick action launcher (Cmd+K / Ctrl+K)
 */
import React, { useState, useEffect, useCallback, useRef, memo } from "react";
import {
  Search,
  Terminal,
  Settings,
  MessageSquare,
  Plus,
  Moon,
  History,
  GraduationCap,
} from "lucide-react";
import styles from "./CommandPalette.module.css";
import {
  useKeyboardNavigation,
  useGlobalShortcut,
  useFocusTrap,
} from "../../hooks";
import { emit } from "../../events";

interface Command {
  id: string;
  title: string;
  description?: string;
  icon: React.ReactNode;
  shortcut?: string;
  action: () => void;
  category: string;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  customCommands?: Command[];
}

const defaultCommands: Command[] = [
  {
    id: "new-tab",
    title: "New Terminal Tab",
    description: "Open a new terminal session",
    icon: <Plus size={16} />,
    shortcut: "⌘T",
    category: "Terminal",
    action: () => emit("termai-new-tab"),
  },
  {
    id: "clear-terminal",
    title: "Clear Terminal",
    description: "Clear the current terminal output",
    icon: <Terminal size={16} />,
    category: "Terminal",
    action: () => {
      // This will be handled by the terminal
      document.dispatchEvent(new CustomEvent("termai-clear-terminal"));
    },
  },
  {
    id: "toggle-ai",
    title: "Toggle AI Panel",
    description: "Show or hide the AI assistant",
    icon: <MessageSquare size={16} />,
    shortcut: "⌘I",
    category: "AI",
    action: () => {
      document.dispatchEvent(new CustomEvent("termai-toggle-ai"));
    },
  },
  {
    id: "open-settings",
    title: "Open Settings",
    description: "Configure TermAI preferences",
    icon: <Settings size={16} />,
    shortcut: "⌘,",
    category: "Settings",
    action: () => {
      document.dispatchEvent(new CustomEvent("termai-open-settings"));
    },
  },
  {
    id: "toggle-theme",
    title: "Toggle Theme",
    description: "Switch between dark and light mode",
    icon: <Moon size={16} />,
    category: "Settings",
    action: () => {
      const currentTheme = localStorage.getItem("termai_theme") || "dark";
      const newTheme = currentTheme === "dark" ? "light" : "dark";
      localStorage.setItem("termai_theme", newTheme);
      emit("termai-theme-changed", { theme: newTheme });
    },
  },
  {
    id: "view-history",
    title: "View Session History",
    description: "Browse previous sessions",
    icon: <History size={16} />,
    category: "Sessions",
    action: () => {
      document.dispatchEvent(new CustomEvent("termai-show-history"));
    },
  },
  {
    id: "view-skills",
    title: "View Learned Skills",
    description: "See what the AI has learned",
    icon: <GraduationCap size={16} />,
    category: "AI",
    action: () => {
      document.dispatchEvent(new CustomEvent("termai-show-skills"));
    },
  },
];

/**
 * Command Item
 */
const CommandItem = memo<{
  command: Command;
  isActive: boolean;
  onClick: () => void;
}>(({ command, isActive, onClick }) => (
  <div
    className={`${styles.commandItem} ${isActive ? styles.active : ""}`}
    onClick={onClick}
  >
    <div className={styles.commandIcon}>{command.icon}</div>
    <div className={styles.commandContent}>
      <div className={styles.commandTitle}>{command.title}</div>
      {command.description && (
        <div className={styles.commandDescription}>{command.description}</div>
      )}
    </div>
    {command.shortcut && (
      <div className={styles.commandShortcut}>{command.shortcut}</div>
    )}
  </div>
));

CommandItem.displayName = "CommandItem";

/**
 * CommandPalette Component
 */
export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  customCommands = [],
}) => {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const allCommands = [...defaultCommands, ...customCommands];

  // Filter commands based on query
  const filteredCommands = query.trim()
    ? allCommands.filter(
        (cmd) =>
          cmd.title.toLowerCase().includes(query.toLowerCase()) ||
          cmd.description?.toLowerCase().includes(query.toLowerCase()) ||
          cmd.category.toLowerCase().includes(query.toLowerCase()),
      )
    : allCommands;

  // Group by category
  const groupedCommands = filteredCommands.reduce(
    (acc, cmd) => {
      if (!acc[cmd.category]) {
        acc[cmd.category] = [];
      }
      acc[cmd.category].push(cmd);
      return acc;
    },
    {} as Record<string, Command[]>,
  );

  // Keyboard navigation
  const { activeIndex, handleKeyDown, reset } = useKeyboardNavigation({
    items: filteredCommands,
    onSelect: (cmd) => {
      cmd.action();
      onClose();
    },
    onEscape: onClose,
  });

  // Focus trap
  useFocusTrap(containerRef, isOpen);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      reset();
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen, reset]);

  // Handle input keydown
  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && filteredCommands.length > 0) {
        e.preventDefault();
        const selected =
          activeIndex >= 0
            ? filteredCommands[activeIndex]
            : filteredCommands[0];
        selected.action();
        onClose();
        return;
      }
      handleKeyDown(e);
    },
    [handleKeyDown, filteredCommands, activeIndex, onClose],
  );

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        ref={containerRef}
        className={styles.palette}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.searchContainer}>
          <Search size={18} className={styles.searchIcon} />
          <input
            ref={inputRef}
            type="text"
            className={styles.searchInput}
            placeholder="Type a command or search..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
          />
        </div>

        <div className={styles.commandList}>
          {Object.entries(groupedCommands).map(([category, commands]) => (
            <div key={category} className={styles.commandGroup}>
              <div className={styles.categoryHeader}>{category}</div>
              {commands.map((cmd) => (
                <CommandItem
                  key={cmd.id}
                  command={cmd}
                  isActive={filteredCommands.indexOf(cmd) === activeIndex}
                  onClick={() => {
                    cmd.action();
                    onClose();
                  }}
                />
              ))}
            </div>
          ))}

          {filteredCommands.length === 0 && (
            <div className={styles.noResults}>
              No commands found for "{query}"
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <span>↑↓ Navigate</span>
          <span>↵ Select</span>
          <span>Esc Close</span>
        </div>
      </div>
    </div>
  );
};

/**
 * Hook to use command palette with global shortcut
 */
export function useCommandPalette() {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  // Cmd+K / Ctrl+K to open
  useGlobalShortcut("k", toggle, { meta: true });
  useGlobalShortcut("k", toggle, { ctrl: true });

  return { isOpen, open, close, toggle };
}
