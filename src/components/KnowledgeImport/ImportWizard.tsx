/**
 * Import Wizard
 * Multi-step wizard for importing conversations and extracting knowledge
 */

import { useState, useCallback } from "react";
import { X, Upload, Loader2, CheckCircle, Brain, Trophy } from "lucide-react";
import { UploadStep } from "./UploadStep";
import { ProcessingStep } from "./ProcessingStep";
import { ReviewStep } from "./ReviewStep";
import { ResultStep, type ImportResult } from "./ResultStep";
import type { IngestionJob, ExtractionCandidate } from "../../types/ingestion";
import styles from "./KnowledgeImport.module.css";

type WizardStep = "upload" | "processing" | "review" | "result";

interface ImportWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete?: () => void;
}

export function ImportWizard({ isOpen, onClose, onComplete }: ImportWizardProps) {
  const [step, setStep] = useState<WizardStep>("upload");
  const [job, setJob] = useState<IngestionJob | null>(null);
  const [candidates, setCandidates] = useState<ExtractionCandidate[]>([]);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const handleJobCreated = useCallback((newJob: IngestionJob) => {
    setJob(newJob);
    setStep("processing");
  }, []);

  const handleProcessingComplete = useCallback((extractedCandidates: ExtractionCandidate[]) => {
    setCandidates(extractedCandidates);
    setStep("review");
  }, []);

  const handleReviewComplete = useCallback((finalCandidates: ExtractionCandidate[]) => {
    // Calculate results
    const approved = finalCandidates.filter((c) => c.status === "approved").length;
    const rejected = finalCandidates.filter((c) => c.status === "rejected").length;
    const skipped = finalCandidates.filter((c) => c.status === "pending").length;

    setImportResult({
      totalCandidates: finalCandidates.length,
      approved,
      rejected,
      skipped,
      errors: [],
    });
    setStep("result");
  }, []);

  const handleResultClose = useCallback(() => {
    // Reset wizard state
    setStep("upload");
    setJob(null);
    setCandidates([]);
    setImportResult(null);
    onComplete?.();
    onClose();
  }, [onClose, onComplete]);

  const handleClose = useCallback(() => {
    // Reset state when closing
    setStep("upload");
    setJob(null);
    setCandidates([]);
    setImportResult(null);
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div className={styles.wizardOverlay} onClick={handleClose}>
      <div className={styles.wizardContainer} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.wizardHeader}>
          <h2 className={styles.wizardTitle}>
            <Brain size={22} />
            Import Conversations
          </h2>
          <button type="button" className={styles.closeButton} onClick={handleClose}>
            <X size={20} />
          </button>
        </div>

        {/* Steps Indicator */}
        <div className={styles.stepsIndicator}>
          <StepIndicator
            icon={Upload}
            label="Upload"
            isActive={step === "upload"}
            isCompleted={step !== "upload"}
          />
          <div className={`${styles.stepConnector} ${step !== "upload" ? styles.active : ""}`} />
          <StepIndicator
            icon={Loader2}
            label="Process"
            isActive={step === "processing"}
            isCompleted={step === "review" || step === "result"}
          />
          <div className={`${styles.stepConnector} ${step === "review" || step === "result" ? styles.active : ""}`} />
          <StepIndicator
            icon={CheckCircle}
            label="Review"
            isActive={step === "review"}
            isCompleted={step === "result"}
          />
          <div className={`${styles.stepConnector} ${step === "result" ? styles.active : ""}`} />
          <StepIndicator
            icon={Trophy}
            label="Result"
            isActive={step === "result"}
            isCompleted={false}
          />
        </div>

        {/* Content */}
        <div className={styles.wizardContent}>
          {step === "upload" && (
            <UploadStep onJobCreated={handleJobCreated} />
          )}

          {step === "processing" && job && (
            <ProcessingStep
              job={job}
              onComplete={handleProcessingComplete}
            />
          )}

          {step === "review" && (
            <ReviewStep
              candidates={candidates}
              onComplete={handleReviewComplete}
            />
          )}

          {step === "result" && importResult && (
            <ResultStep
              result={importResult}
              onClose={handleResultClose}
            />
          )}
        </div>
      </div>
    </div>
  );
}

interface StepIndicatorProps {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  isActive: boolean;
  isCompleted: boolean;
}

function StepIndicator({ icon: Icon, label, isActive, isCompleted }: StepIndicatorProps) {
  return (
    <div
      className={`${styles.step} ${isActive ? styles.active : ""} ${isCompleted ? styles.completed : ""}`}
    >
      <Icon size={16} />
      <span>{label}</span>
    </div>
  );
}

export default ImportWizard;
