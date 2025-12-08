/**
 * MultiLineInput component - Auto-expanding textarea
 * Grows with content, supports character limits
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
import { Send } from "lucide-react";
import clsx from "clsx";
import styles from "./MultiLineInput.module.css";

interface MultiLineInputProps {
  /** Current value */
  value?: string;
  /** Default value for uncontrolled mode */
  defaultValue?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Label text */
  label?: string;
  /** Whether field is required */
  required?: boolean;
  /** Whether field is disabled */
  disabled?: boolean;
  /** Whether field is read-only */
  readOnly?: boolean;
  /** Error message */
  error?: string;
  /** Helper text */
  helperText?: string;
  /** Maximum characters allowed */
  maxLength?: number;
  /** Show character count */
  showCharCount?: boolean;
  /** Warning threshold percentage (0-1) */
  charWarningThreshold?: number;
  /** Minimum height in rows */
  minRows?: number;
  /** Maximum height in rows */
  maxRows?: number;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Use monospace font */
  monospace?: boolean;
  /** Show submit button */
  showSubmitButton?: boolean;
  /** Submit button icon */
  submitIcon?: ReactNode;
  /** Callback on value change */
  onChange?: (value: string) => void;
  /** Callback on submit (Ctrl+Enter or button click) */
  onSubmit?: (value: string) => void;
  /** Callback on key down */
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  /** Additional class */
  className?: string;
  /** ID for the textarea */
  id?: string;
  /** Name attribute */
  name?: string;
  /** Auto focus on mount */
  autoFocus?: boolean;
}

export const MultiLineInput = memo(function MultiLineInput({
  value: controlledValue,
  defaultValue = "",
  placeholder,
  label,
  required = false,
  disabled = false,
  readOnly = false,
  error,
  helperText,
  maxLength,
  showCharCount = false,
  charWarningThreshold = 0.9,
  minRows = 3,
  maxRows = 10,
  size = "md",
  monospace = false,
  showSubmitButton = false,
  submitIcon,
  onChange,
  onSubmit,
  onKeyDown,
  className,
  id,
  name,
  autoFocus = false,
}: MultiLineInputProps) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Support both controlled and uncontrolled modes
  const isControlled = controlledValue !== undefined;
  const value = isControlled ? controlledValue : internalValue;

  // Calculate line height based on size
  const lineHeight = size === "sm" ? 18 : size === "lg" ? 24 : 21;

  // Auto-resize textarea
  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Reset height to auto to get correct scrollHeight
    textarea.style.height = "auto";

    // Calculate new height
    const minHeight = minRows * lineHeight;
    const maxHeight = maxRows * lineHeight;
    const newHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight);

    textarea.style.height = `${newHeight}px`;

    // Enable scrolling if content exceeds max height
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [minRows, maxRows, lineHeight]);

  // Adjust height on value change
  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  // Auto focus
  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;

      // Enforce max length
      if (maxLength && newValue.length > maxLength) {
        return;
      }

      if (!isControlled) {
        setInternalValue(newValue);
      }
      onChange?.(newValue);
    },
    [isControlled, maxLength, onChange]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      onKeyDown?.(e);

      // Submit on Ctrl+Enter or Cmd+Enter
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (onSubmit && value.trim()) {
          onSubmit(value);
        }
      }
    },
    [onKeyDown, onSubmit, value]
  );

  const handleSubmit = useCallback(() => {
    if (onSubmit && value.trim() && !disabled) {
      onSubmit(value);
    }
  }, [onSubmit, value, disabled]);

  // Character count state
  const charCount = value.length;
  const isOverWarning = maxLength
    ? charCount / maxLength >= charWarningThreshold
    : false;
  const isOverLimit = maxLength ? charCount >= maxLength : false;

  const inputId = id || name || "multiline-input";

  return (
    <div
      className={clsx(styles.container, styles[size], className, {
        [styles.monospace]: monospace,
      })}
    >
      {label && (
        <label
          htmlFor={inputId}
          className={clsx(styles.label, { [styles.required]: required })}
        >
          {label}
        </label>
      )}

      <div
        className={clsx(styles.inputWrapper, {
          [styles.error]: !!error,
          [styles.disabled]: disabled,
          [styles.hasSubmitButton]: showSubmitButton,
        })}
      >
        <textarea
          ref={textareaRef}
          id={inputId}
          name={name}
          className={styles.textarea}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={readOnly}
          required={required}
          maxLength={maxLength}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : undefined}
        />

        {showSubmitButton && (
          <button
            type="button"
            className={styles.submitButton}
            onClick={handleSubmit}
            disabled={disabled || !value.trim()}
            aria-label="Submit"
          >
            {submitIcon || <Send size={16} />}
          </button>
        )}
      </div>

      {(error || showCharCount || helperText) && (
        <div className={styles.footer}>
          {error ? (
            <span id={`${inputId}-error`} className={styles.errorMessage}>
              {error}
            </span>
          ) : helperText ? (
            <span className={styles.helperText}>{helperText}</span>
          ) : (
            <span />
          )}

          {showCharCount && (
            <span
              className={clsx(styles.charCount, {
                [styles.warning]: isOverWarning && !isOverLimit,
                [styles.error]: isOverLimit,
              })}
            >
              {charCount}
              {maxLength && ` / ${maxLength}`}
            </span>
          )}
        </div>
      )}
    </div>
  );
});

export default MultiLineInput;
