/**
 * Tooltip Component
 * CSS-based tooltip with multiple placement options
 * Inspired by WaveTerm's tooltip component
 */
import { memo } from "react";
import type { ReactNode } from "react";
import clsx from "clsx";
import styles from "./Tooltip.module.css";

type TooltipPlacement = "top" | "bottom" | "left" | "right";

interface TooltipProps {
  /** Content to show in tooltip */
  content: ReactNode;
  /** Element that triggers the tooltip */
  children: ReactNode;
  /** Tooltip placement */
  placement?: TooltipPlacement;
  /** Additional CSS class name */
  className?: string;
  /** Delay before showing tooltip (ms) */
  delay?: number;
  /** Whether tooltip is disabled */
  disabled?: boolean;
}

export const Tooltip = memo<TooltipProps>(
  ({
    content,
    children,
    placement = "top",
    className,
    delay = 200,
    disabled = false,
  }) => {
    if (disabled || !content) {
      return <>{children}</>;
    }

    return (
      <span
        className={clsx(styles.tooltipWrapper, className)}
        style={{ "--tooltip-delay": `${delay}ms` } as React.CSSProperties}
      >
        {children}
        <span
          className={clsx(styles.tooltip, styles[placement])}
          role="tooltip"
        >
          {content}
        </span>
      </span>
    );
  }
);

Tooltip.displayName = "Tooltip";
