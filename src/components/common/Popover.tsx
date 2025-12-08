/**
 * Popover component - CSS-based floating panel
 * No external positioning library required
 */
import {
  memo,
  useState,
  useRef,
  useEffect,
  useCallback,
  type ReactNode,
  type KeyboardEvent,
} from "react";
import { X } from "lucide-react";
import clsx from "clsx";
import styles from "./Popover.module.css";

type PopoverPlacement =
  | "top"
  | "topStart"
  | "topEnd"
  | "bottom"
  | "bottomStart"
  | "bottomEnd"
  | "left"
  | "right";

interface PopoverProps {
  /** The trigger element */
  trigger: ReactNode;
  /** Popover content */
  children: ReactNode;
  /** Optional header content */
  header?: ReactNode;
  /** Optional footer content */
  footer?: ReactNode;
  /** Placement relative to trigger */
  placement?: PopoverPlacement;
  /** Show arrow indicator */
  showArrow?: boolean;
  /** Show close button */
  showCloseButton?: boolean;
  /** Controlled open state */
  open?: boolean;
  /** Callback when open state changes */
  onOpenChange?: (open: boolean) => void;
  /** Close when clicking outside */
  closeOnClickOutside?: boolean;
  /** Close when pressing Escape */
  closeOnEscape?: boolean;
  /** Additional class for the popover */
  className?: string;
  /** Additional class for the trigger */
  triggerClassName?: string;
}

export const Popover = memo(function Popover({
  trigger,
  children,
  header,
  footer,
  placement = "bottom",
  showArrow = true,
  showCloseButton = false,
  open: controlledOpen,
  onOpenChange,
  closeOnClickOutside = true,
  closeOnEscape = true,
  className,
  triggerClassName,
}: PopoverProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Support both controlled and uncontrolled modes
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;

  const setOpen = useCallback(
    (newOpen: boolean) => {
      if (!isControlled) {
        setInternalOpen(newOpen);
      }
      onOpenChange?.(newOpen);
    },
    [isControlled, onOpenChange]
  );

  const handleToggle = useCallback(() => {
    setOpen(!isOpen);
  }, [isOpen, setOpen]);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, [setOpen]);

  // Handle keyboard events
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (closeOnEscape && e.key === "Escape" && isOpen) {
        e.preventDefault();
        handleClose();
      }
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleToggle();
      }
    },
    [closeOnEscape, isOpen, handleClose, handleToggle]
  );

  // Handle click outside
  useEffect(() => {
    if (!isOpen || !closeOnClickOutside) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        handleClose();
      }
    };

    // Delay adding listener to prevent immediate close
    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, closeOnClickOutside, handleClose]);

  // Focus management
  useEffect(() => {
    if (isOpen && popoverRef.current) {
      const focusable = popoverRef.current.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      focusable?.focus();
    }
  }, [isOpen]);

  return (
    <div ref={containerRef} className={styles.popoverContainer}>
      <button
        type="button"
        className={clsx(styles.trigger, triggerClassName)}
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        {trigger}
      </button>

      <div
        ref={popoverRef}
        role="dialog"
        aria-modal="false"
        className={clsx(styles.popover, styles[placement], className, {
          [styles.open]: isOpen,
        })}
      >
        {showArrow && <div className={styles.arrow} />}

        {showCloseButton && (
          <button
            type="button"
            className={styles.closeButton}
            onClick={handleClose}
            aria-label="Close popover"
          >
            <X size={14} />
          </button>
        )}

        {header && <div className={styles.header}>{header}</div>}

        <div className={styles.content}>{children}</div>

        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>
  );
});

export default Popover;
