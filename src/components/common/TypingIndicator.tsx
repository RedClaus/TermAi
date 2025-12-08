/**
 * TypingIndicator Component
 * Animated three-dot loading indicator for AI responses
 * Inspired by WaveTerm's typingindicator component
 */
import { memo } from "react";
import clsx from "clsx";
import styles from "./TypingIndicator.module.css";

interface TypingIndicatorProps {
  /** Additional CSS class name */
  className?: string;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Optional label text */
  label?: string;
}

export const TypingIndicator = memo<TypingIndicatorProps>(
  ({ className, size = "md", label }) => {
    return (
      <div className={clsx(styles.container, className)}>
        <div className={clsx(styles.typing, styles[size])}>
          <span></span>
          <span></span>
          <span></span>
        </div>
        {label && <span className={styles.label}>{label}</span>}
      </div>
    );
  }
);

TypingIndicator.displayName = "TypingIndicator";
