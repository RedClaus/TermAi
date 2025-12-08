/**
 * ExpandableMenu component - Accordion-style collapsible menu
 * Supports single or multiple expanded items
 */
import {
  memo,
  useState,
  useCallback,
  type ReactNode,
  type KeyboardEvent,
} from "react";
import { ChevronDown } from "lucide-react";
import clsx from "clsx";
import styles from "./ExpandableMenu.module.css";

interface ExpandableMenuItem {
  /** Unique identifier */
  id: string;
  /** Label text */
  label: string;
  /** Optional icon */
  icon?: ReactNode;
  /** Optional badge/count */
  badge?: string | number;
  /** Content to show when expanded */
  content: ReactNode;
  /** Whether item is disabled */
  disabled?: boolean;
}

interface ExpandableMenuProps {
  /** Menu items */
  items: ExpandableMenuItem[];
  /** Allow multiple items to be expanded */
  allowMultiple?: boolean;
  /** Default expanded item IDs */
  defaultExpanded?: string[];
  /** Controlled expanded state */
  expanded?: string[];
  /** Callback when expansion changes */
  onExpandedChange?: (expanded: string[]) => void;
  /** Visual variant */
  variant?: "default" | "bordered" | "compact";
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Additional class */
  className?: string;
}

export const ExpandableMenu = memo(function ExpandableMenu({
  items,
  allowMultiple = false,
  defaultExpanded = [],
  expanded: controlledExpanded,
  onExpandedChange,
  variant = "default",
  size = "md",
  className,
}: ExpandableMenuProps) {
  const [internalExpanded, setInternalExpanded] =
    useState<string[]>(defaultExpanded);

  // Support both controlled and uncontrolled modes
  const isControlled = controlledExpanded !== undefined;
  const expandedIds = isControlled ? controlledExpanded : internalExpanded;

  const setExpanded = useCallback(
    (newExpanded: string[]) => {
      if (!isControlled) {
        setInternalExpanded(newExpanded);
      }
      onExpandedChange?.(newExpanded);
    },
    [isControlled, onExpandedChange]
  );

  const toggleItem = useCallback(
    (id: string) => {
      const isExpanded = expandedIds.includes(id);

      if (isExpanded) {
        setExpanded(expandedIds.filter((i) => i !== id));
      } else if (allowMultiple) {
        setExpanded([...expandedIds, id]);
      } else {
        setExpanded([id]);
      }
    },
    [expandedIds, allowMultiple, setExpanded]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent, id: string, disabled?: boolean) => {
      if (disabled) return;

      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleItem(id);
      }
    },
    [toggleItem]
  );

  return (
    <div
      className={clsx(
        styles.menu,
        styles[variant],
        styles[size],
        className
      )}
      role="tree"
    >
      {items.map((item) => {
        const isExpanded = expandedIds.includes(item.id);

        return (
          <div key={item.id} className={styles.item} role="treeitem">
            <button
              type="button"
              className={clsx(styles.header, {
                [styles.disabled]: item.disabled,
              })}
              onClick={() => !item.disabled && toggleItem(item.id)}
              onKeyDown={(e) => handleKeyDown(e, item.id, item.disabled)}
              aria-expanded={isExpanded}
              aria-disabled={item.disabled}
              disabled={item.disabled}
            >
              {item.icon && <span className={styles.icon}>{item.icon}</span>}
              <span className={styles.label}>{item.label}</span>
              {item.badge !== undefined && (
                <span className={styles.badge}>{item.badge}</span>
              )}
              <span
                className={clsx(styles.chevron, {
                  [styles.expanded]: isExpanded,
                })}
              >
                <ChevronDown size={16} />
              </span>
            </button>

            <div
              className={clsx(styles.content, {
                [styles.expanded]: isExpanded,
              })}
              role="group"
              aria-hidden={!isExpanded}
            >
              <div className={styles.contentInner}>{item.content}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
});

// Helper component for nested list items
interface ExpandableMenuListProps {
  items: Array<{
    id: string;
    label: string;
    active?: boolean;
    onClick?: () => void;
  }>;
}

export const ExpandableMenuList = memo(function ExpandableMenuList({
  items,
}: ExpandableMenuListProps) {
  return (
    <ul className={styles.nestedList}>
      {items.map((item) => (
        <li
          key={item.id}
          className={clsx(styles.nestedItem, {
            [styles.active]: item.active,
          })}
          onClick={item.onClick}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              item.onClick?.();
            }
          }}
          tabIndex={0}
          role="option"
          aria-selected={item.active}
        >
          {item.label}
        </li>
      ))}
    </ul>
  );
});

export default ExpandableMenu;
