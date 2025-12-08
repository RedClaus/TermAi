/**
 * Result Step
 * Shows success/failure summary after import completion
 */

import { CheckCircle, XCircle, AlertTriangle, Brain, Sparkles } from "lucide-react";
import styles from "./KnowledgeImport.module.css";

export interface ImportResult {
  totalCandidates: number;
  approved: number;
  rejected: number;
  skipped: number;
  errors: string[];
}

interface ResultStepProps {
  result: ImportResult;
  onClose: () => void;
}

export function ResultStep({ result, onClose }: ResultStepProps) {
  const { totalCandidates, approved, rejected, skipped, errors } = result;
  const hasErrors = errors.length > 0;
  const success = approved > 0 && !hasErrors;
  const partial = approved > 0 && hasErrors;

  return (
    <div className={styles.resultContainer}>
      {/* Status Icon */}
      <div className={`${styles.resultIcon} ${success ? styles.success : partial ? styles.warning : styles.error}`}>
        {success ? (
          <CheckCircle size={48} />
        ) : partial ? (
          <AlertTriangle size={48} />
        ) : hasErrors ? (
          <XCircle size={48} />
        ) : (
          <Brain size={48} />
        )}
      </div>

      {/* Title */}
      <h3 className={styles.resultTitle}>
        {success
          ? "Import Successful!"
          : partial
          ? "Import Completed with Issues"
          : hasErrors
          ? "Import Failed"
          : "No Patterns Found"}
      </h3>

      {/* Summary Stats */}
      <div className={styles.resultStats}>
        {totalCandidates > 0 && (
          <div className={styles.statItem}>
            <span className={styles.statValue}>{totalCandidates}</span>
            <span className={styles.statLabel}>Patterns Found</span>
          </div>
        )}
        {approved > 0 && (
          <div className={`${styles.statItem} ${styles.approved}`}>
            <span className={styles.statValue}>{approved}</span>
            <span className={styles.statLabel}>Added to Knowledge</span>
          </div>
        )}
        {rejected > 0 && (
          <div className={styles.statItem}>
            <span className={styles.statValue}>{rejected}</span>
            <span className={styles.statLabel}>Rejected</span>
          </div>
        )}
        {skipped > 0 && (
          <div className={styles.statItem}>
            <span className={styles.statValue}>{skipped}</span>
            <span className={styles.statLabel}>Skipped</span>
          </div>
        )}
      </div>

      {/* Success Message */}
      {approved > 0 && (
        <div className={styles.resultMessage}>
          <Sparkles size={16} />
          <p>
            {approved} skill{approved !== 1 ? "s" : ""} added to your knowledge base.
            These patterns will help TermAI assist you with similar tasks in the future.
          </p>
        </div>
      )}

      {/* Errors */}
      {hasErrors && (
        <div className={styles.resultErrors}>
          <h4>Errors:</h4>
          <ul>
            {errors.slice(0, 5).map((error, i) => (
              <li key={i}>{error}</li>
            ))}
            {errors.length > 5 && (
              <li className={styles.moreErrors}>
                ...and {errors.length - 5} more error{errors.length - 5 !== 1 ? "s" : ""}
              </li>
            )}
          </ul>
        </div>
      )}

      {/* No Patterns Message */}
      {totalCandidates === 0 && !hasErrors && (
        <div className={styles.resultMessage}>
          <p>
            No actionable patterns were found in the uploaded conversation.
            This could mean the conversation didn't contain problem-solution pairs,
            or the format wasn't recognized.
          </p>
        </div>
      )}

      {/* Done Button */}
      <div className={styles.resultActions}>
        <button type="button" className={styles.primaryButton} onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}

export default ResultStep;
