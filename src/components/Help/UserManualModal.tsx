import React, { useEffect, useRef } from "react";
import styles from "./UserManualModal.module.css";
import { X, Book } from "lucide-react";
import { Markdown } from "../common/Markdown";
import { userManualContent } from "../../data/userManual";

interface UserManualModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UserManualModal: React.FC<UserManualModalProps> = ({
  isOpen,
  onClose,
}) => {
  const contentRef = useRef<HTMLDivElement>(null);

  // Focus trap and escape key handler
  useEffect(() => {
    if (!isOpen) return;

    // Focus the modal content for keyboard accessibility
    contentRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div 
        className={styles.modal} 
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="manual-title"
      >
        <div className={styles.header}>
          <div className={styles.title} id="manual-title">
            <Book size={20} />
            User Manual
          </div>
          <button 
            className={styles.closeBtn} 
            onClick={onClose}
            aria-label="Close user manual"
          >
            <X size={18} />
          </button>
        </div>

        <div className={styles.content} ref={contentRef} tabIndex={-1}>
          <Markdown content={userManualContent} />
        </div>

        <div className={styles.footer}>
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
