/**
 * CopyButton Component
 * Button with visual feedback for copy actions
 * Inspired by WaveTerm's copybutton component
 */
import { memo, useState, useRef, useEffect, useCallback } from "react";
import { Copy, Check } from "lucide-react";
import clsx from "clsx";
import styles from "./CopyButton.module.css";

interface CopyButtonProps {
  /** Text to copy to clipboard */
  text: string;
  /** Additional CSS class name */
  className?: string;
  /** Button title/tooltip */
  title?: string;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Callback after successful copy */
  onCopy?: () => void;
}

export const CopyButton = memo<CopyButtonProps>(
  ({ text, className, title = "Copy", size = "md", onCopy }) => {
    const [isCopied, setIsCopied] = useState(false);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleClick = useCallback(
      async (e: React.MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();

        if (isCopied) return;

        try {
          await navigator.clipboard.writeText(text);
          setIsCopied(true);
          onCopy?.();

          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
          }
          timeoutRef.current = setTimeout(() => {
            setIsCopied(false);
            timeoutRef.current = null;
          }, 2000);
        } catch (err) {
          console.error("Failed to copy:", err);
        }
      },
      [text, isCopied, onCopy]
    );

    useEffect(() => {
      return () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
      };
    }, []);

    const iconSize = size === "sm" ? 12 : size === "lg" ? 18 : 14;

    return (
      <button
        type="button"
        onClick={handleClick}
        className={clsx(styles.copyButton, styles[size], className, {
          [styles.copied]: isCopied,
        })}
        title={isCopied ? "Copied!" : title}
        aria-label={isCopied ? "Copied!" : title}
      >
        {isCopied ? <Check size={iconSize} /> : <Copy size={iconSize} />}
      </button>
    );
  }
);

CopyButton.displayName = "CopyButton";
