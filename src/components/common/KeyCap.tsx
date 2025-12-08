/**
 * KeyCap Component
 * Displays keyboard keys/shortcuts in a styled key cap format
 * Inspired by WaveTerm's keycap component
 */
import { memo } from "react";
import type { ReactNode } from "react";
import clsx from "clsx";
import styles from "./KeyCap.module.css";

interface KeyCapProps {
  /** Key or key combination to display */
  children: ReactNode;
  /** Additional CSS class name */
  className?: string;
  /** Size variant */
  size?: "sm" | "md" | "lg";
}

/**
 * Displays a single key cap
 */
export const KeyCap = memo<KeyCapProps>(
  ({ children, className, size = "md" }) => {
    return (
      <kbd className={clsx(styles.keyCap, styles[size], className)}>
        {children}
      </kbd>
    );
  }
);

KeyCap.displayName = "KeyCap";

interface KeyboardShortcutProps {
  /** Keys to display (e.g., ["Ctrl", "Shift", "P"]) */
  keys: string[];
  /** Additional CSS class name */
  className?: string;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Separator between keys */
  separator?: "+" | " " | "none";
}

/**
 * Displays a keyboard shortcut with multiple keys
 */
export const KeyboardShortcut = memo<KeyboardShortcutProps>(
  ({ keys, className, size = "md", separator = "+" }) => {
    return (
      <span className={clsx(styles.shortcut, className)}>
        {keys.map((key, index) => (
          <span key={index} className={styles.keyWrapper}>
            <KeyCap size={size}>{key}</KeyCap>
            {separator !== "none" && index < keys.length - 1 && (
              <span className={styles.separator}>
                {separator === " " ? "\u00A0" : separator}
              </span>
            )}
          </span>
        ))}
      </span>
    );
  }
);

KeyboardShortcut.displayName = "KeyboardShortcut";
