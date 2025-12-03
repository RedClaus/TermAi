/**
 * SafetyConfirmDialog
 * Displays a confirmation dialog for dangerous commands
 */

import React from "react";
import styles from "./dialogs.module.css";
import type { PendingSafetyCommand } from "../../types";

interface SafetyConfirmDialogProps {
  command: PendingSafetyCommand;
  onConfirm: () => void;
  onCancel: () => void;
}

export const SafetyConfirmDialog: React.FC<SafetyConfirmDialogProps> = ({
  command,
  onConfirm,
  onCancel,
}) => {
  return (
    <div className={styles.dialogOverlay}>
      <div className={`${styles.dialog} ${styles.dangerDialog}`}>
        <div className={styles.dialogHeader}>
          <span className={styles.warningIcon}>⚠️</span>
          <span className={styles.dangerTitle}>Dangerous Command Detected</span>
        </div>

        <div className={styles.dialogBody}>
          <p className={styles.dialogDescription}>
            The AI wants to run a potentially destructive command:
          </p>

          <div className={styles.commandBlock}>
            <code>{command.command}</code>
          </div>

          {command.impact && (
            <div className={styles.impactBlock}>
              <strong>Impact:</strong> {command.impact}
            </div>
          )}
        </div>

        <div className={styles.dialogActions}>
          <button
            className={`${styles.dialogButton} ${styles.dangerButton}`}
            onClick={onConfirm}
          >
            Allow & Run
          </button>
          <button
            className={`${styles.dialogButton} ${styles.secondaryButton}`}
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
