/**
 * Ingestion Service (Frontend)
 * Client-side API for conversation import and knowledge extraction
 */

import { config } from "../config";
import type {
  IngestionJob,
  ExtractionCandidate,
  KnowledgeStats,
  ReviewAction,
  BulkReviewResult,
  ImportResult,
  IngestionSSEEvent,
  ConversationSource,
} from "../types/ingestion";

/**
 * Format descriptor for supported conversation types
 */
interface FormatInfo {
  id: ConversationSource;
  name: string;
  extensions: string[];
  description: string;
}

export class IngestionService {
  // ===========================================
  // Upload & Jobs
  // ===========================================

  /**
   * Upload files for ingestion
   * @param files - Files to upload
   * @returns Job info with ID for tracking
   */
  static async uploadFiles(
    files: File[]
  ): Promise<{ jobId: string; status: string; filesCount: number }> {
    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));

    const response = await fetch(`${config.apiUrl}/api/ingestion/upload`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Upload failed");
    }

    return response.json();
  }

  /**
   * Get job status
   * @param jobId - Job ID to query
   */
  static async getJob(jobId: string): Promise<IngestionJob | null> {
    try {
      const response = await fetch(
        `${config.apiUrl}/api/ingestion/job/${jobId}`
      );

      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error("Failed to get job");
      }

      return response.json();
    } catch (e) {
      console.error("[IngestionService] getJob error:", e);
      return null;
    }
  }

  /**
   * Subscribe to job progress via SSE
   * @param jobId - Job ID to monitor
   * @param onEvent - Callback for each event
   * @returns Cleanup function to close connection
   */
  static subscribeToJob(
    jobId: string,
    onEvent: (event: IngestionSSEEvent) => void
  ): () => void {
    const eventSource = new EventSource(
      `${config.apiUrl}/api/ingestion/job/${jobId}/stream`
    );

    eventSource.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as IngestionSSEEvent;
        onEvent(event);

        // Auto-close on complete or error
        if (event.type === "complete" || event.type === "error") {
          eventSource.close();
        }
      } catch (err) {
        console.error("[IngestionService] SSE parse error:", err);
      }
    };

    eventSource.onerror = () => {
      console.warn("[IngestionService] SSE connection error");
      eventSource.close();
    };

    // Return cleanup function
    return () => {
      eventSource.close();
    };
  }

  /**
   * Get recent ingestion jobs
   * @param limit - Max jobs to return
   */
  static async getRecentJobs(limit = 20): Promise<IngestionJob[]> {
    try {
      const response = await fetch(
        `${config.apiUrl}/api/ingestion/jobs?limit=${limit}`
      );

      if (!response.ok) return [];

      const data = await response.json();
      return data.jobs || [];
    } catch (e) {
      console.error("[IngestionService] getRecentJobs error:", e);
      return [];
    }
  }

  // ===========================================
  // Candidates
  // ===========================================

  /**
   * Get pending candidates for review
   * @param filters - Optional filters
   */
  static async getCandidates(filters?: {
    source?: ConversationSource;
    minConfidence?: number;
  }): Promise<ExtractionCandidate[]> {
    try {
      const params = new URLSearchParams();
      if (filters?.source) params.append("source", filters.source);
      if (filters?.minConfidence !== undefined) {
        params.append("minConfidence", filters.minConfidence.toString());
      }

      const url = `${config.apiUrl}/api/ingestion/candidates?${params}`;
      const response = await fetch(url);

      if (!response.ok) return [];

      const data = await response.json();
      return data.candidates || [];
    } catch (e) {
      console.error("[IngestionService] getCandidates error:", e);
      return [];
    }
  }

  /**
   * Get a specific candidate
   * @param candidateId - Candidate ID
   */
  static async getCandidate(
    candidateId: string
  ): Promise<ExtractionCandidate | null> {
    try {
      const response = await fetch(
        `${config.apiUrl}/api/ingestion/candidates/${candidateId}`
      );

      if (!response.ok) return null;

      return response.json();
    } catch (e) {
      console.error("[IngestionService] getCandidate error:", e);
      return null;
    }
  }

  /**
   * Review a candidate (approve, reject, or edit)
   * @param candidateId - Candidate to review
   * @param action - Review action
   * @param edits - Optional edits if action is 'edit'
   */
  static async reviewCandidate(
    candidateId: string,
    action: ReviewAction,
    edits?: Partial<ExtractionCandidate>
  ): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch(
        `${config.apiUrl}/api/ingestion/candidates/${candidateId}/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, edits }),
        }
      );

      return response.json();
    } catch (e) {
      console.error("[IngestionService] reviewCandidate error:", e);
      return { success: false, message: "Network error" };
    }
  }

  /**
   * Bulk review multiple candidates
   * @param candidateIds - IDs to review
   * @param action - Action to apply to all
   */
  static async bulkReview(
    candidateIds: string[],
    action: "approve" | "reject"
  ): Promise<BulkReviewResult> {
    try {
      const response = await fetch(
        `${config.apiUrl}/api/ingestion/candidates/bulk-review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ candidateIds, action }),
        }
      );

      return response.json();
    } catch (e) {
      console.error("[IngestionService] bulkReview error:", e);
      return { processed: 0, errors: ["Network error"] };
    }
  }

  // ===========================================
  // Statistics & Export
  // ===========================================

  /**
   * Get knowledge base statistics
   */
  static async getStats(): Promise<KnowledgeStats | null> {
    try {
      const response = await fetch(`${config.apiUrl}/api/ingestion/stats`);

      if (!response.ok) return null;

      return response.json();
    } catch (e) {
      console.error("[IngestionService] getStats error:", e);
      return null;
    }
  }

  /**
   * Export entire knowledge base
   * Downloads as JSON file
   */
  static async exportKnowledge(): Promise<void> {
    try {
      const response = await fetch(`${config.apiUrl}/api/ingestion/export`);

      if (!response.ok) {
        throw new Error("Export failed");
      }

      // Get filename from Content-Disposition header or use default
      const disposition = response.headers.get("Content-Disposition");
      let filename = `termai-knowledge-${Date.now()}.json`;
      if (disposition) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match) filename = match[1];
      }

      // Download as file
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("[IngestionService] exportKnowledge error:", e);
      throw e;
    }
  }

  /**
   * Import knowledge from file
   * @param file - JSON file from previous export
   */
  static async importKnowledge(file: File): Promise<ImportResult> {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(`${config.apiUrl}/api/ingestion/import`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Import failed");
    }

    return response.json();
  }

  /**
   * Get supported conversation formats
   */
  static async getSupportedFormats(): Promise<FormatInfo[]> {
    try {
      const response = await fetch(`${config.apiUrl}/api/ingestion/formats`);

      if (!response.ok) return [];

      const data = await response.json();
      return data.formats || [];
    } catch (e) {
      console.error("[IngestionService] getSupportedFormats error:", e);
      return [];
    }
  }
}
