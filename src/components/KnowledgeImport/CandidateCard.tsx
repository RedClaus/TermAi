/**
 * Candidate Card
 * Expandable card showing extracted knowledge pattern details
 */

import { useState, useCallback } from "react";
import {
  ChevronDown,
  CheckCircle,
  XCircle,
  Terminal,
  FileText,
  HelpCircle,
} from "lucide-react";
import type { ExtractionCandidate, SolutionStep } from "../../types/ingestion";
import styles from "./KnowledgeImport.module.css";

interface CandidateCardProps {
  candidate: ExtractionCandidate;
  selected: boolean;
  onSelect: () => void;
  onReview: (action: "approve" | "reject") => void;
}

export function CandidateCard({
  candidate,
  selected,
  onSelect,
  onReview,
}: CandidateCardProps) {
  const [expanded, setExpanded] = useState(false);

  const handleHeaderClick = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  const handleCheckboxClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onSelect();
    },
    [onSelect]
  );

  const handleApprove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onReview("approve");
    },
    [onReview]
  );

  const handleReject = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onReview("reject");
    },
    [onReview]
  );

  // Determine confidence badge variant
  const confidenceVariant =
    candidate.confidence >= 0.8
      ? "high"
      : candidate.confidence >= 0.6
      ? "medium"
      : "low";

  return (
    <div
      className={`${styles.candidateCard} ${selected ? styles.selected : ""} ${
        expanded ? styles.expanded : ""
      }`}
    >
      {/* Card Header */}
      <div className={styles.cardHeader} onClick={handleHeaderClick}>
        <input
          type="checkbox"
          checked={selected}
          onChange={() => {}}
          onClick={handleCheckboxClick}
          className={styles.cardCheckbox}
        />

        <div className={styles.problemSummary}>
          <p className={styles.problemDescription}>
            {candidate.problem.description}
          </p>
          {candidate.problem.errorText && (
            <code className={styles.errorSnippet}>
              {truncate(candidate.problem.errorText, 80)}
            </code>
          )}
        </div>

        <div className={styles.cardMeta}>
          <span className={`${styles.confidenceBadge} ${styles[confidenceVariant]}`}>
            {Math.round(candidate.confidence * 100)}%
          </span>

          {candidate.inferredContext.os && (
            <span className={styles.contextBadge}>
              {candidate.inferredContext.os}
            </span>
          )}

          {candidate.inferredContext.packageManager && (
            <span className={styles.contextBadge}>
              {candidate.inferredContext.packageManager}
            </span>
          )}
        </div>

        <ChevronDown
          className={`${styles.chevron} ${expanded ? styles.rotated : ""}`}
        />
      </div>

      {/* Card Body (Expanded) */}
      {expanded && (
        <div className={styles.cardBody}>
          {/* Problem Section */}
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>Problem</h4>
            <p className={styles.sectionContent}>
              {candidate.problem.description}
            </p>

            {candidate.problem.errorText && (
              <pre className={styles.errorFull}>
                {candidate.problem.errorText}
              </pre>
            )}

            {candidate.problem.triggerCommand && (
              <code className={styles.triggerCommand}>
                Trigger: {candidate.problem.triggerCommand}
              </code>
            )}
          </div>

          {/* Solution Section */}
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>Solution</h4>
            <p className={styles.sectionContent}>
              {candidate.solution.description}
            </p>

            {candidate.solution.steps.length > 0 && (
              <ol className={styles.solutionSteps}>
                {candidate.solution.steps.map((step, index) => (
                  <li key={index} className={styles.solutionStep}>
                    <StepIcon type={step.type} />
                    <code className={styles.stepContent}>{step.content}</code>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {/* Context Section */}
          {hasContext(candidate.inferredContext) && (
            <div className={styles.section}>
              <h4 className={styles.sectionTitle}>Context</h4>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {candidate.inferredContext.os && (
                  <span className={styles.contextBadge}>
                    OS: {candidate.inferredContext.os}
                  </span>
                )}
                {candidate.inferredContext.shell && (
                  <span className={styles.contextBadge}>
                    Shell: {candidate.inferredContext.shell}
                  </span>
                )}
                {candidate.inferredContext.packageManager && (
                  <span className={styles.contextBadge}>
                    {candidate.inferredContext.packageManager}
                  </span>
                )}
                {candidate.inferredContext.language && (
                  <span className={styles.contextBadge}>
                    {candidate.inferredContext.language}
                  </span>
                )}
                {candidate.inferredContext.framework && (
                  <span className={styles.contextBadge}>
                    {candidate.inferredContext.framework}
                  </span>
                )}
                {candidate.inferredContext.tools?.map((tool) => (
                  <span key={tool} className={styles.contextBadge}>
                    {tool}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className={styles.cardActions}>
            <button
              type="button"
              className={`${styles.actionButton} ${styles.approve}`}
              onClick={handleApprove}
            >
              <CheckCircle size={16} />
              Approve
            </button>
            <button
              type="button"
              className={`${styles.actionButton} ${styles.reject}`}
              onClick={handleReject}
            >
              <XCircle size={16} />
              Reject
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface StepIconProps {
  type: SolutionStep["type"];
}

function StepIcon({ type }: StepIconProps) {
  switch (type) {
    case "command":
      return <Terminal className={styles.stepIcon} />;
    case "check":
      return <CheckCircle className={styles.stepIcon} />;
    case "file_edit":
      return <FileText className={styles.stepIcon} />;
    default:
      return <HelpCircle className={styles.stepIcon} />;
  }
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

function hasContext(context: ExtractionCandidate["inferredContext"]): boolean {
  return !!(
    context.os ||
    context.shell ||
    context.packageManager ||
    context.language ||
    context.framework ||
    (context.tools && context.tools.length > 0)
  );
}

export default CandidateCard;
