/**
 * Review Step
 * Review and approve/reject extracted knowledge candidates
 */

import { useState, useCallback } from "react";
import { CheckCircle, XCircle, Inbox } from "lucide-react";
import { CandidateCard } from "./CandidateCard";
import { IngestionService } from "../../services/IngestionService";
import type { ExtractionCandidate } from "../../types/ingestion";
import styles from "./KnowledgeImport.module.css";

interface ReviewStepProps {
  candidates: ExtractionCandidate[];
  onComplete: (finalCandidates: ExtractionCandidate[]) => void;
}

export function ReviewStep({ candidates: initialCandidates, onComplete }: ReviewStepProps) {
  const [candidates, setCandidates] = useState<ExtractionCandidate[]>(initialCandidates);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [minConfidence, setMinConfidence] = useState(0.5);
  const [processing, setProcessing] = useState(false);

  // Filter candidates by confidence
  const filteredCandidates = candidates.filter(
    (c) => c.confidence >= minConfidence && c.status === "pending"
  );

  const handleSelect = useCallback((candidateId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(candidateId)) {
        next.delete(candidateId);
      } else {
        next.add(candidateId);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (selected.size === filteredCandidates.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredCandidates.map((c) => c.id)));
    }
  }, [filteredCandidates, selected.size]);

  const handleBulkAction = useCallback(
    async (action: "approve" | "reject") => {
      if (selected.size === 0) return;

      setProcessing(true);
      try {
        const result = await IngestionService.bulkReview(
          Array.from(selected),
          action
        );

        if (result.processed > 0) {
          // Update local state to reflect changes
          setCandidates((prev) =>
            prev.map((c) =>
              selected.has(c.id)
                ? { ...c, status: action === "approve" ? "approved" : "rejected" }
                : c
            )
          );
          setSelected(new Set());
        }

        if (result.errors.length > 0) {
          console.warn("[ReviewStep] Bulk review errors:", result.errors);
        }
      } catch (e) {
        console.error("[ReviewStep] Bulk action failed:", e);
      } finally {
        setProcessing(false);
      }
    },
    [selected]
  );

  const handleSingleReview = useCallback(
    async (candidateId: string, action: "approve" | "reject") => {
      try {
        const result = await IngestionService.reviewCandidate(candidateId, action);

        if (result.success) {
          setCandidates((prev) =>
            prev.map((c) =>
              c.id === candidateId
                ? { ...c, status: action === "approve" ? "approved" : "rejected" }
                : c
            )
          );
          setSelected((prev) => {
            const next = new Set(prev);
            next.delete(candidateId);
            return next;
          });
        }
      } catch (e) {
        console.error("[ReviewStep] Review failed:", e);
      }
    },
    []
  );

  // Calculate stats
  const approvedCount = candidates.filter((c) => c.status === "approved").length;
  const rejectedCount = candidates.filter((c) => c.status === "rejected").length;
  const pendingCount = candidates.filter((c) => c.status === "pending").length;

  return (
    <div>
      {/* Header */}
      <div className={styles.reviewHeader}>
        <h3 className={styles.reviewTitle}>
          {filteredCandidates.length} pattern{filteredCandidates.length !== 1 ? "s" : ""} to review
        </h3>

        {/* Confidence Filter */}
        <div className={styles.reviewFilters}>
          <label className={styles.filterLabel}>
            Min confidence:
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={minConfidence}
              onChange={(e) => setMinConfidence(parseFloat(e.target.value))}
              className={styles.filterSlider}
            />
            <span>{Math.round(minConfidence * 100)}%</span>
          </label>
        </div>

        {/* Bulk Actions */}
        <div className={styles.bulkActions}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={handleSelectAll}
            disabled={filteredCandidates.length === 0}
          >
            {selected.size === filteredCandidates.length ? "Deselect All" : "Select All"}
          </button>
          <button
            type="button"
            className={`${styles.bulkButton} ${styles.approve}`}
            onClick={() => handleBulkAction("approve")}
            disabled={selected.size === 0 || processing}
          >
            <CheckCircle size={16} />
            Approve ({selected.size})
          </button>
          <button
            type="button"
            className={`${styles.bulkButton} ${styles.reject}`}
            onClick={() => handleBulkAction("reject")}
            disabled={selected.size === 0 || processing}
          >
            <XCircle size={16} />
            Reject
          </button>
        </div>
      </div>

      {/* Candidates List */}
      {filteredCandidates.length > 0 ? (
        <div className={styles.candidatesList}>
          {filteredCandidates.map((candidate) => (
            <CandidateCard
              key={candidate.id}
              candidate={candidate}
              selected={selected.has(candidate.id)}
              onSelect={() => handleSelect(candidate.id)}
              onReview={(action) => handleSingleReview(candidate.id, action)}
            />
          ))}
        </div>
      ) : (
        <div className={styles.emptyState}>
          <Inbox className={styles.emptyIcon} />
          <p>
            {pendingCount === 0
              ? "All patterns have been reviewed!"
              : "No patterns match the current filter."}
          </p>
          {pendingCount === 0 && approvedCount > 0 && (
            <p style={{ marginTop: 8, fontSize: 14 }}>
              {approvedCount} pattern{approvedCount !== 1 ? "s" : ""} added to your knowledge base.
            </p>
          )}
        </div>
      )}

      {/* Footer */}
      <div className={styles.wizardFooter} style={{ marginTop: 24, padding: 0, border: "none" }}>
        <div className={styles.footerLeft}>
          {approvedCount > 0 && (
            <span style={{ color: "var(--success-color)" }}>
              {approvedCount} approved
            </span>
          )}
          {approvedCount > 0 && rejectedCount > 0 && " · "}
          {rejectedCount > 0 && (
            <span style={{ color: "var(--text-secondary)" }}>
              {rejectedCount} rejected
            </span>
          )}
        </div>
        <div className={styles.footerRight}>
          <button type="button" className={styles.primaryButton} onClick={() => onComplete(candidates)}>
            {pendingCount > 0 ? "Finish Later" : "Done"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ReviewStep;
