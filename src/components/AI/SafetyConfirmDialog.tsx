/**
 * SafetyConfirmDialog
 * Displays a confirmation dialog for dangerous commands
 * Supports "Allow All" for low-risk commands in a session
 */

import React from "react";
import styles from "./dialogs.module.css";
import type { RiskLevel } from "../../types";

interface SafetyConfirmDialogProps {
  command: string;
  impact?: string | null | undefined;
  risk?: RiskLevel | undefined;
  allowAllOption?: boolean | undefined;
  onConfirm: (allowAll?: boolean) => void;
  onCancel: () => void;
}

const getRiskLabel = (risk: RiskLevel | undefined): string => {
  switch (risk) {
    case "critical":
      return "Critical Risk";
    case "high":
      return "High Risk";
    case "medium":
      return "Medium Risk";
    case "low":
      return "Low Risk (Installation)";
    default:
      return "Dangerous Command";
  }
};

const getRiskColor = (risk: RiskLevel | undefined): string => {
  switch (risk) {
    case "critical":
    case "high":
      return styles.dangerDialog;
    case "medium":
      return styles.warningDialog;
    case "low":
      return styles.infoDialog;
    default:
      return styles.dangerDialog;
  }
};

export const SafetyConfirmDialog: React.FC<SafetyConfirmDialogProps> = ({
  command,
  impact,
  risk,
  allowAllOption,
  onConfirm,
  onCancel,
}) => {
  return (
    <div className={styles.dialogOverlay}>
      <div className={`${styles.dialog} ${getRiskColor(risk)}`}>
        <div className={styles.dialogHeader}>
          <span className={styles.warningIcon}>
            {risk === "low" ? "📦" : "⚠️"}
          </span>
          <span
            className={risk === "low" ? styles.dialogTitle : styles.dangerTitle}
          >
            {getRiskLabel(risk)}
          </span>
        </div>

        <div className={styles.dialogBody}>
          <p className={styles.dialogDescription}>
            {risk === "low"
              ? "The AI wants to install packages:"
              : "The AI wants to run a potentially destructive command:"}
          </p>

          <div className={styles.commandBlock}>
            <code>{command}</code>
          </div>

          {impact && (
            <div
              className={risk === "low" ? styles.infoBlock : styles.impactBlock}
            >
              <strong>{risk === "low" ? "Note:" : "Impact:"}</strong> {impact}
            </div>
          )}
        </div>

        <div className={styles.dialogActions}>
          <button
            className={`${styles.dialogButton} ${risk === "low" ? styles.primaryButton : styles.dangerButton}`}
            onClick={() => onConfirm(false)}
          >
            Allow & Run
          </button>
          {allowAllOption && (
            <button
              className={`${styles.dialogButton} ${styles.allowAllButton}`}
              onClick={() => onConfirm(true)}
              title="Auto-approve similar commands for this session"
            >
              Allow All
            </button>
          )}
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
