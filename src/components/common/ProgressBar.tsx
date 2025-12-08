/**
 * ProgressBar Component
 * Smooth animated progress indicator
 * Inspired by WaveTerm's progressbar component
 */
import { memo } from "react";
import clsx from "clsx";
import styles from "./ProgressBar.module.css";

interface ProgressBarProps {
  /** Progress value (0-100) */
  value: number;
  /** Maximum value (default 100) */
  max?: number;
  /** Additional CSS class name */
  className?: string;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Color variant */
  variant?: "default" | "success" | "warning" | "error";
  /** Whether to show indeterminate animation */
  indeterminate?: boolean;
  /** Whether to show the percentage label */
  showLabel?: boolean;
  /** Custom label format function */
  formatLabel?: (value: number, max: number) => string;
  /** Accessible label */
  "aria-label"?: string;
}

export const ProgressBar = memo<ProgressBarProps>(
  ({
    value,
    max = 100,
    className,
    size = "md",
    variant = "default",
    indeterminate = false,
    showLabel = false,
    formatLabel,
    "aria-label": ariaLabel,
  }) => {
    const percentage = Math.min(100, Math.max(0, (value / max) * 100));
    const label = formatLabel
      ? formatLabel(value, max)
      : `${Math.round(percentage)}%`;

    return (
      <div
        className={clsx(styles.wrapper, className, {
          [styles.withLabel]: showLabel,
        })}
      >
        <div
          role="progressbar"
          aria-valuenow={indeterminate ? undefined : value}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-label={ariaLabel ?? `Progress: ${label}`}
          className={clsx(styles.progressBar, styles[size], styles[variant], {
            [styles.indeterminate]: indeterminate,
          })}
        >
          <div
            className={styles.fill}
            style={
              indeterminate ? undefined : { width: `${percentage}%` }
            }
          />
        </div>
        {showLabel && !indeterminate && (
          <span className={styles.label}>{label}</span>
        )}
      </div>
    );
  }
);

ProgressBar.displayName = "ProgressBar";
