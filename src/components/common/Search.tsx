/**
 * Search component - In-panel search with filters
 * Supports filter chips, sorting, and keyboard shortcuts
 */
import {
  memo,
  useState,
  useRef,
  useEffect,
  useCallback,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Search as SearchIcon, X } from "lucide-react";
import clsx from "clsx";
import styles from "./Search.module.css";

interface SearchFilter {
  /** Unique identifier */
  id: string;
  /** Display label */
  label: string;
  /** Optional icon */
  icon?: ReactNode;
  /** Whether filter is active */
  active?: boolean;
}

interface SearchProps {
  /** Current search value */
  value?: string;
  /** Default value for uncontrolled mode */
  defaultValue?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Available filters */
  filters?: SearchFilter[];
  /** Active filter IDs */
  activeFilters?: string[];
  /** Show loading state */
  loading?: boolean;
  /** Results count to display */
  resultsCount?: number;
  /** Show results info bar */
  showResultsInfo?: boolean;
  /** Sort options */
  sortOptions?: Array<{ value: string; label: string }>;
  /** Current sort value */
  sortValue?: string;
  /** Show keyboard shortcut hint */
  showShortcutHint?: boolean;
  /** Shortcut key (e.g., "/" or "k") */
  shortcutKey?: string;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Visual variant */
  variant?: "default" | "minimal";
  /** Auto focus on mount */
  autoFocus?: boolean;
  /** Callback on value change */
  onChange?: (value: string) => void;
  /** Callback on filter toggle */
  onFilterToggle?: (filterId: string) => void;
  /** Callback on submit (Enter key) */
  onSubmit?: (value: string, filters: string[]) => void;
  /** Callback on sort change */
  onSortChange?: (value: string) => void;
  /** Callback on clear */
  onClear?: () => void;
  /** Additional class */
  className?: string;
}

export const Search = memo(function Search({
  value: controlledValue,
  defaultValue = "",
  placeholder = "Search...",
  filters = [],
  activeFilters: controlledActiveFilters,
  loading = false,
  resultsCount,
  showResultsInfo = false,
  sortOptions,
  sortValue,
  showShortcutHint = false,
  shortcutKey = "/",
  size = "md",
  variant = "default",
  autoFocus = false,
  onChange,
  onFilterToggle,
  onSubmit,
  onSortChange,
  onClear,
  className,
}: SearchProps) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [internalActiveFilters, setInternalActiveFilters] = useState<string[]>(
    []
  );
  const inputRef = useRef<HTMLInputElement>(null);

  // Support both controlled and uncontrolled modes
  const isValueControlled = controlledValue !== undefined;
  const value = isValueControlled ? controlledValue : internalValue;

  const isFiltersControlled = controlledActiveFilters !== undefined;
  const activeFilterIds = isFiltersControlled
    ? controlledActiveFilters
    : internalActiveFilters;

  // Auto focus
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  // Global keyboard shortcut
  useEffect(() => {
    if (!showShortcutHint) return;

    const handleGlobalKeyDown = (e: globalThis.KeyboardEvent) => {
      // Check for shortcut key when not focused on input
      if (
        e.key === shortcutKey &&
        !["INPUT", "TEXTAREA"].includes(
          (e.target as HTMLElement).tagName
        )
      ) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };

    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => document.removeEventListener("keydown", handleGlobalKeyDown);
  }, [showShortcutHint, shortcutKey]);

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;

      if (!isValueControlled) {
        setInternalValue(newValue);
      }
      onChange?.(newValue);
    },
    [isValueControlled, onChange]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onSubmit?.(value, activeFilterIds);
      }
      if (e.key === "Escape") {
        inputRef.current?.blur();
      }
    },
    [value, activeFilterIds, onSubmit]
  );

  const handleClear = useCallback(() => {
    if (!isValueControlled) {
      setInternalValue("");
    }
    onChange?.("");
    onClear?.();
    inputRef.current?.focus();
  }, [isValueControlled, onChange, onClear]);

  const handleFilterToggle = useCallback(
    (filterId: string) => {
      if (!isFiltersControlled) {
        setInternalActiveFilters((prev) =>
          prev.includes(filterId)
            ? prev.filter((id) => id !== filterId)
            : [...prev, filterId]
        );
      }
      onFilterToggle?.(filterId);
    },
    [isFiltersControlled, onFilterToggle]
  );

  const iconSize = size === "sm" ? 14 : size === "lg" ? 20 : 16;

  return (
    <div
      className={clsx(styles.container, styles[size], styles[variant], className)}
    >
      <div className={styles.inputWrapper}>
        <span className={styles.searchIcon}>
          <SearchIcon size={iconSize} />
        </span>

        <input
          ref={inputRef}
          type="text"
          className={styles.input}
          value={value}
          placeholder={placeholder}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          aria-label="Search"
        />

        {loading && <div className={styles.spinner} />}

        {showShortcutHint && !value && (
          <span className={styles.shortcutHint}>{shortcutKey}</span>
        )}

        {value && !loading && (
          <button
            type="button"
            className={styles.clearButton}
            onClick={handleClear}
            aria-label="Clear search"
          >
            <X size={iconSize} />
          </button>
        )}
      </div>

      {filters.length > 0 && (
        <div className={styles.filters} role="group" aria-label="Search filters">
          {filters.map((filter) => {
            const isActive = activeFilterIds.includes(filter.id);

            return (
              <button
                key={filter.id}
                type="button"
                className={clsx(styles.filterChip, { [styles.active]: isActive })}
                onClick={() => handleFilterToggle(filter.id)}
                aria-pressed={isActive}
              >
                {filter.icon && (
                  <span className={styles.filterChipIcon}>{filter.icon}</span>
                )}
                {filter.label}
                {isActive && (
                  <span className={styles.filterChipRemove}>
                    <X size={10} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {showResultsInfo && resultsCount !== undefined && (
        <div className={styles.resultsInfo}>
          <span className={styles.resultsCount}>
            {resultsCount} {resultsCount === 1 ? "result" : "results"}
          </span>

          {sortOptions && sortOptions.length > 0 && (
            <select
              className={styles.resultsSortSelect}
              value={sortValue}
              onChange={(e) => onSortChange?.(e.target.value)}
              aria-label="Sort results"
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  );
});

export default Search;
