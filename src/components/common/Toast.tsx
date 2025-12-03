/**
 * Toast Notification System
 * Provides toast notifications with auto-dismiss
 */
import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  memo,
} from "react";
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from "lucide-react";
import styles from "./Toast.module.css";
import clsx from "clsx";

// ===========================================
// Types
// ===========================================

type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastContextValue {
  toasts: Toast[];
  addToast: (message: string, type?: ToastType, duration?: number) => void;
  removeToast: (id: string) => void;
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  warning: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
}

// ===========================================
// Context
// ===========================================

const ToastContext = createContext<ToastContextValue | null>(null);

// ===========================================
// Hook
// ===========================================

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

// ===========================================
// Toast Item Component
// ===========================================

const ToastIcon = memo<{ type: ToastType }>(({ type }) => {
  const iconSize = 18;
  switch (type) {
    case "success":
      return <CheckCircle size={iconSize} />;
    case "error":
      return <AlertCircle size={iconSize} />;
    case "warning":
      return <AlertTriangle size={iconSize} />;
    case "info":
      return <Info size={iconSize} />;
  }
});

ToastIcon.displayName = "ToastIcon";

const ToastItem = memo<{
  toast: Toast;
  onRemove: (id: string) => void;
}>(({ toast, onRemove }) => {
  useEffect(() => {
    if (toast.duration && toast.duration > 0) {
      const timer = setTimeout(() => {
        onRemove(toast.id);
      }, toast.duration);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [toast.id, toast.duration, onRemove]);

  return (
    <div className={clsx(styles.toast, styles[toast.type])}>
      <div className={styles.icon}>
        <ToastIcon type={toast.type} />
      </div>
      <div className={styles.message}>{toast.message}</div>
      <button
        className={styles.closeButton}
        onClick={() => onRemove(toast.id)}
        type="button"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
});

ToastItem.displayName = "ToastItem";

// ===========================================
// Toast Container Component
// ===========================================

const ToastContainer = memo<{
  toasts: Toast[];
  onRemove: (id: string) => void;
}>(({ toasts, onRemove }) => {
  if (toasts.length === 0) return null;

  return (
    <div className={styles.container}>
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  );
});

ToastContainer.displayName = "ToastContainer";

// ===========================================
// Provider Component
// ===========================================

let toastCounter = 0;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (message: string, type: ToastType = "info", duration = 5000) => {
      const id = `toast-${++toastCounter}`;
      const newToast: Toast = { id, message, type, duration };
      setToasts((prev) => [...prev, newToast]);
    },
    [],
  );

  const success = useCallback(
    (message: string, duration?: number) =>
      addToast(message, "success", duration),
    [addToast],
  );

  const error = useCallback(
    (message: string, duration?: number) =>
      addToast(message, "error", duration),
    [addToast],
  );

  const warning = useCallback(
    (message: string, duration?: number) =>
      addToast(message, "warning", duration),
    [addToast],
  );

  const info = useCallback(
    (message: string, duration?: number) => addToast(message, "info", duration),
    [addToast],
  );

  const value: ToastContextValue = {
    toasts,
    addToast,
    removeToast,
    success,
    error,
    warning,
    info,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
};
