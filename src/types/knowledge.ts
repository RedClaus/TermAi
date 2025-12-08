/**
 * Knowledge Base Types
 * Definitions for learned skills, task logs, and vector search
 */

export interface ToolSop {
  tool_name: string;
  action: string;
}

/**
 * Flow node configuration for learned skills
 * Allows skills to be used as nodes in TermFlow
 */
export interface SkillFlowNode {
  /** Display name in the node palette */
  name: string;
  /** Brief description shown in palette */
  description: string;
  /** The command to execute (can include {{variables}}) */
  command: string;
  /** Icon identifier (optional) */
  icon?: string;
  /** Color for the node (optional) */
  color?: string;
  /** Default timeout in ms */
  timeout?: number;
  /** Variable definitions with default values */
  variables?: Record<string, string>;
}

export interface Skill {
  id: string;
  timestamp: number;
  use_when: string;
  preferences?: string | undefined;
  tool_sops: ToolSop[];
  /** Optional: Makes this skill available as a flow node */
  flowNode?: SkillFlowNode | undefined;
}

export interface TaskLog {
  id: string;
  timestamp: number;
  description: string;
  status: "success" | "failed";
  progresses?: string[];
  user_preferences?: string[];
}

export interface SearchSkillsResponse {
  skills: Skill[];
}

export interface AddSkillResponse {
  success: boolean;
  skill: Skill;
}

export interface LogTaskResponse {
  success: boolean;
  task: TaskLog;
}

// Vector Search Types (RAG)
export interface VectorSearchResult {
  text: string;
  path: string;
  lineStart: number;
  lineEnd: number;
  score: number;
}

export interface VectorSearchResponse {
  results: VectorSearchResult[];
  count: number;
}

export interface ContextResponse {
  context: string;
  sources: Array<{
    path: string;
    lineStart: number;
    lineEnd: number;
    score: number;
  }>;
  count: number;
  message?: string;
}

export interface KnowledgeEngineStatus {
  initialized: boolean;
  hasTable: boolean;
  processingCount: number;
  dbPath: string;
  model: string;
  message?: string;
}

export interface IndexDirectoryResponse {
  success: boolean;
  message: string;
  results: {
    indexed: number;
    skipped: number;
    errors: number;
    total: number;
  };
}
