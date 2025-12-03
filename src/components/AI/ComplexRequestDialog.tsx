/**
 * ComplexRequestDialog
 * Asks user whether to start a new conversation or continue existing one
 */

import React from "react";
import styles from "./dialogs.module.css";

interface ComplexRequestDialogProps {
  onStartNew: () => void;
  onContinue: () => void;
}

export const ComplexRequestDialog: React.FC<ComplexRequestDialogProps> = ({
  onStartNew,
  onContinue,
}) => {
  return (
    <div className={styles.dialogOverlay}>
      <div className={styles.dialog}>
        <div className={styles.dialogHeader}>
          <span className={styles.dialogTitle}>Start new conversation?</span>
        </div>

        <div className={styles.dialogBody}>
          <p className={styles.dialogDescription}>
            You're changing topics. Would you like to start a fresh context or
            continue this one?
          </p>
        </div>

        <div className={styles.dialogActions}>
          <button
            className={`${styles.dialogButton} ${styles.primaryButton}`}
            onClick={onStartNew}
          >
            Start New
          </button>
          <button
            className={`${styles.dialogButton} ${styles.secondaryButton}`}
            onClick={onContinue}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
};
