/**
 * Toggle Component
 * Animated switch toggle control
 * Inspired by WaveTerm's toggle component
 */
import { memo, useId } from "react";
import clsx from "clsx";
import styles from "./Toggle.module.css";

interface ToggleProps {
  /** Whether the toggle is checked */
  checked: boolean;
  /** Callback when toggle state changes */
  onChange: (checked: boolean) => void;
  /** Additional CSS class name */
  className?: string;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Whether the toggle is disabled */
  disabled?: boolean;
  /** Label text */
  label?: string;
  /** Label position */
  labelPosition?: "left" | "right";
  /** Accessible name for the toggle */
  "aria-label"?: string;
}

export const Toggle = memo<ToggleProps>(
  ({
    checked,
    onChange,
    className,
    size = "md",
    disabled = false,
    label,
    labelPosition = "right",
    "aria-label": ariaLabel,
  }) => {
    const id = useId();

    const handleChange = () => {
      if (!disabled) {
        onChange(!checked);
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleChange();
      }
    };

    const toggle = (
      <button
        type="button"
        role="switch"
        id={id}
        aria-checked={checked}
        aria-label={ariaLabel ?? label}
        disabled={disabled}
        onClick={handleChange}
        onKeyDown={handleKeyDown}
        className={clsx(styles.toggle, styles[size], className, {
          [styles.checked]: checked,
          [styles.disabled]: disabled,
        })}
      >
        <span className={styles.thumb} />
      </button>
    );

    if (!label) {
      return toggle;
    }

    return (
      <div
        className={clsx(styles.wrapper, {
          [styles.labelLeft]: labelPosition === "left",
        })}
      >
        {labelPosition === "left" && (
          <label htmlFor={id} className={styles.label}>
            {label}
          </label>
        )}
        {toggle}
        {labelPosition === "right" && (
          <label htmlFor={id} className={styles.label}>
            {label}
          </label>
        )}
      </div>
    );
  }
);

Toggle.displayName = "Toggle";
