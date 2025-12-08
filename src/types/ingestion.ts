/**
 * Ingestion System Types (Frontend)
 * Types for conversation import and knowledge extraction UI
 */

/**
 * Supported conversation export sources
 */
export type ConversationSource =
  | "claude"
  | "chatgpt"
  | "warp"
  | "cursor"
  | "cline"
  | "aider"
  | "github-copilot"
  | "terminal-raw"
  | "markdown"
  | "custom";

/**
 * Solution step in extracted knowledge
 */
export interface SolutionStep {
  type: "command" | "check" | "explanation" | "file_edit";
  content: string;
  description?: string;
}

/**
 * Inferred context from conversation
 */
export interface InferredContext {
  os?: "darwin" | "linux" | "windows";
  shell?: "bash" | "zsh" | "powershell";
  packageManager?: "npm" | "yarn" | "pip" | "brew" | "apt";
  language?: string;
  framework?: string;
  tools?: string[];
}

/**
 * Problem description in extraction candidate
 */
export interface ExtractionProblem {
  description: string;
  errorText?: string;
  errorPatterns: string[];
  triggerCommand?: string;
  messageRange?: [number, number];
}

/**
 * Solution description in extraction candidate
 */
export interface ExtractionSolution {
  description: string;
  steps: SolutionStep[];
  messageRange?: [number, number];
  wasSuccessful: boolean;
}

/**
 * Candidate knowledge pattern extracted from conversation
 */
export interface ExtractionCandidate {
  id: string;
  conversationId: string;
  confidence: number;
  problem: ExtractionProblem;
  solution: ExtractionSolution;
  inferredContext: InferredContext;
  status: "pending" | "approved" | "rejected" | "merged";
  reviewNotes?: string;
  mergedIntoId?: string;
}

/**
 * File status in an ingestion job
 */
export interface IngestionFileStatus {
  name: string;
  size: number;
  detectedFormat: ConversationSource;
  status: "pending" | "processing" | "complete" | "failed";
  error?: string;
  conversationsFound?: number;
}

/**
 * Progress update for ingestion job
 */
export interface IngestionProgress {
  current: number;
  total: number;
  phase: string;
}

/**
 * Results summary for ingestion job
 */
export interface IngestionResults {
  conversationsFound: number;
  candidatesExtracted: number;
  errors: string[];
}

/**
 * Ingestion job tracking
 */
export interface IngestionJob {
  id: string;
  status: "queued" | "parsing" | "extracting" | "complete" | "failed";
  files: IngestionFileStatus[];
  progress: IngestionProgress;
  results: IngestionResults;
  createdAt: string;
  completedAt?: string;
}

/**
 * Knowledge statistics
 */
export interface KnowledgeStats {
  totalExperiences: number;
  totalConversations: number;
  totalCandidates: number;
  pendingReview: number;
  sources: string[];
  sourceBreakdown: Record<string, number>;
  statusBreakdown: Record<string, number>;
  successRate: number;
  learnedThisWeek: number;
}

/**
 * SSE event types for job progress
 */
export interface IngestionSSEEvent {
  type: "progress" | "status" | "complete" | "error";
  data: IngestionProgress | IngestionJob | { error: string };
}

/**
 * Review action for candidates
 */
export type ReviewAction = "approve" | "reject" | "edit";

/**
 * Bulk review result
 */
export interface BulkReviewResult {
  processed: number;
  errors: string[];
}

/**
 * Import result
 */
export interface ImportResult {
  imported: number;
  skipped: number;
}
