/**
 * Processing Step
 * Shows real-time progress of file parsing and knowledge extraction
 */

import { useState, useEffect, useCallback } from "react";
import { Loader2, CheckCircle, XCircle, FileText } from "lucide-react";
import { IngestionService } from "../../services/IngestionService";
import type {
  IngestionJob,
  ExtractionCandidate,
  IngestionSSEEvent,
  IngestionProgress,
} from "../../types/ingestion";
import styles from "./KnowledgeImport.module.css";

interface ProcessingStepProps {
  job: IngestionJob;
  onComplete: (candidates: ExtractionCandidate[]) => void;
}

export function ProcessingStep({ job, onComplete }: ProcessingStepProps) {
  const [currentJob, setCurrentJob] = useState<IngestionJob>(job);
  const [progress, setProgress] = useState<IngestionProgress>(job.progress);

  useEffect(() => {
    // Subscribe to job updates via SSE
    const cleanup = IngestionService.subscribeToJob(job.id, (event: IngestionSSEEvent) => {
      switch (event.type) {
        case "progress":
          setProgress(event.data as IngestionProgress);
          break;

        case "status":
          setCurrentJob(event.data as IngestionJob);
          break;

        case "complete": {
          const completedJob = event.data as IngestionJob;
          setCurrentJob(completedJob);
          setProgress(completedJob.progress);

          // Fetch candidates and move to review
          fetchCandidatesAndComplete();
          break;
        }

        case "error":
          console.error("[ProcessingStep] Job error:", event.data);
          break;
      }
    });

    return cleanup;
  }, [job.id]);

  const fetchCandidatesAndComplete = useCallback(async () => {
    try {
      const candidates = await IngestionService.getCandidates();
      onComplete(candidates);
    } catch (e) {
      console.error("[ProcessingStep] Failed to fetch candidates:", e);
      onComplete([]);
    }
  }, [onComplete]);

  // Calculate progress percentage
  const progressPercent = progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0;

  // Circle progress calculations
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progressPercent / 100) * circumference;

  const isComplete = currentJob.status === "complete";
  const isFailed = currentJob.status === "failed";

  return (
    <div className={styles.processingContainer}>
      {/* Progress Ring */}
      <div className={styles.progressRing}>
        <svg className={styles.progressCircle} width="120" height="120">
          <circle
            className={styles.progressBg}
            cx="60"
            cy="60"
            r={radius}
          />
          <circle
            className={styles.progressFill}
            cx="60"
            cy="60"
            r={radius}
            strokeDasharray={circumference}
            strokeDashoffset={isComplete ? 0 : strokeDashoffset}
          />
        </svg>
        <div className={styles.progressText}>
          {isComplete ? (
            <CheckCircle size={36} style={{ color: "var(--success-color)" }} />
          ) : isFailed ? (
            <XCircle size={36} style={{ color: "var(--error-color)" }} />
          ) : (
            `${progressPercent}%`
          )}
        </div>
      </div>

      {/* Phase Description */}
      <p className={styles.processingPhase}>
        {isComplete
          ? "Processing Complete!"
          : isFailed
          ? "Processing Failed"
          : progress.phase}
      </p>

      {!isComplete && !isFailed && (
        <p className={styles.processingSubtext}>
          {progress.current} of {progress.total}
        </p>
      )}

      {/* File Status List */}
      <div className={styles.fileStatusList}>
        {currentJob.files.map((file, index) => (
          <div
            key={`${file.name}-${index}`}
            className={`${styles.fileStatusItem} ${styles[file.status]}`}
          >
            {file.status === "processing" && (
              <Loader2 className={`${styles.statusIcon} ${styles.spinning}`} />
            )}
            {file.status === "complete" && (
              <CheckCircle className={`${styles.statusIcon} ${styles.success}`} />
            )}
            {file.status === "failed" && (
              <XCircle className={`${styles.statusIcon} ${styles.error}`} />
            )}
            {file.status === "pending" && (
              <FileText className={styles.statusIcon} />
            )}

            <span className={styles.fileStatusName}>{file.name}</span>

            {file.detectedFormat && file.status !== "pending" && (
              <span className={styles.fileStatusFormat}>
                {file.detectedFormat}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Results Summary (when complete) */}
      {isComplete && (
        <div className={styles.resultsSummary}>
          <p>
            Found <strong>{currentJob.results.conversationsFound}</strong> conversations
          </p>
          <p>
            Extracted <strong>{currentJob.results.candidatesExtracted}</strong> knowledge patterns
          </p>
          {currentJob.results.errors.length > 0 && (
            <p style={{ color: "var(--error-color)", marginTop: 8, fontSize: 12 }}>
              {currentJob.results.errors.length} error(s) occurred
            </p>
          )}
        </div>
      )}

      {/* Error Details */}
      {isFailed && currentJob.results.errors.length > 0 && (
        <div className={styles.resultsSummary} style={{ borderColor: "var(--error-color)" }}>
          <p style={{ color: "var(--error-color)" }}>
            {currentJob.results.errors[0]}
          </p>
        </div>
      )}

      {/* Continue Button (when complete) */}
      {isComplete && (
        <div style={{ marginTop: 24 }}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={fetchCandidatesAndComplete}
          >
            {currentJob.results.candidatesExtracted > 0
              ? "Review Extracted Knowledge"
              : "Finish"}
          </button>
        </div>
      )}
    </div>
  );
}

export default ProcessingStep;
