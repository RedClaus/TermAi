/**
 * TermFlow Type Definitions
 * 
 * TypeScript interfaces for the TermFlow automation engine.
 */

// =============================================================================
// NODE TYPES
// =============================================================================

export type FlowNodeType = 'command' | 'ai-reasoning' | 'condition' | 'file-op' | 'learned-skill';

export type NodeStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped';

/**
 * Base configuration shared by all node types
 * Index signature required for React Flow compatibility
 */
export interface BaseNodeData {
  [key: string]: unknown;
  label?: string;
  continueOnError?: boolean;
  status?: NodeStatus;
}

/**
 * Command Node - Executes shell commands
 */
export interface CommandNodeData extends BaseNodeData {
  command: string;
  timeout?: number | undefined;
  cwd?: string | undefined;
}

/**
 * AI Reasoning Node - Queries LLM for analysis
 */
export interface AIReasoningNodeData extends BaseNodeData {
  prompt: string;
  provider?: 'gemini' | 'openai' | 'anthropic' | 'ollama' | undefined;
  model?: string | undefined;
  systemPrompt?: string | undefined;
}

/**
 * Condition Node - Evaluates expressions for branching
 */
export interface ConditionNodeData extends BaseNodeData {
  condition: string;
}

/**
 * File Operation Node - Read/write files
 */
export interface FileOpNodeData extends BaseNodeData {
  operation: 'read' | 'write' | 'append' | 'exists' | 'delete';
  filePath: string;
  content?: string | undefined;
}

/**
 * Learned Skill Node - User-saved command patterns from AI interactions
 */
export interface LearnedSkillNodeData extends BaseNodeData {
  skillId: string;
  skillName: string;
  command: string;
  description?: string | undefined;
  timeout?: number | undefined;
  cwd?: string | undefined;
  /** Variables that can be substituted in the command (e.g., {{filename}}) */
  variables?: Record<string, string> | undefined;
}

/**
 * Union of all node data types
 */
export type FlowNodeData = 
  | CommandNodeData 
  | AIReasoningNodeData 
  | ConditionNodeData 
  | FileOpNodeData
  | LearnedSkillNodeData;

/**
 * Flow Node (matches React Flow node structure)
 */
export interface FlowNode {
  id: string;
  type: FlowNodeType;
  position: { x: number; y: number };
  data: FlowNodeData;
  selected?: boolean;
  dragging?: boolean;
}

/**
 * Flow Edge (matches React Flow edge structure)
 */
export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string; // 'true' | 'false' | 'default'
  targetHandle?: string;
  animated?: boolean;
  style?: Record<string, string | number>;
}

// =============================================================================
// FLOW DEFINITION
// =============================================================================

/**
 * Complete Flow Definition
 */
export interface Flow {
  id: string;
  name: string;
  description?: string;
  folder?: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  createdAt: number;
  updatedAt: number;
}

/**
 * Flow Template (pre-built workflow)
 */
export interface FlowTemplate {
  id: string;
  name: string;
  description: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

// =============================================================================
// EXECUTION
// =============================================================================

export type ExecutionStatus = 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * Result of executing a single node
 */
export interface NodeResult {
  nodeId: string;
  status: NodeStatus;
  startTime?: number;
  duration?: number;
  
  // Command node outputs
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  
  // AI node outputs
  response?: string;
  provider?: string;
  model?: string;
  
  // Condition node outputs
  conditionResult?: boolean;
  evaluatedCondition?: string;
  
  // File node outputs
  content?: string;
  filePath?: string;
  bytesWritten?: number;
  exists?: boolean;
  deleted?: boolean;
  
  // Error info
  error?: string;
  
  // Generic data
  data?: unknown;
}

/**
 * Execution Context - Full state of a flow execution
 */
export interface ExecutionContext {
  executionId: string;
  flowId: string;
  sessionId: string;
  status: ExecutionStatus;
  startTime: number;
  endTime?: number;
  results: Record<string, NodeResult>;
  error?: string;
}

// =============================================================================
// SOCKET EVENTS
// =============================================================================

/**
 * Flow execution started event
 */
export interface FlowStartedEvent {
  flowId: string;
  executionId: string | null;
}

/**
 * Node status update event
 */
export interface FlowNodeStatusEvent {
  nodeId: string;
  status: NodeStatus;
  result?: NodeResult;
  error?: string;
  timestamp: number;
}

/**
 * Flow execution completed event
 */
export interface FlowCompletedEvent {
  flowId: string;
  executionId: string;
  status: ExecutionStatus;
  duration: number;
  results: Record<string, NodeResult>;
}

/**
 * Flow execution error event
 */
export interface FlowErrorEvent {
  flowId: string;
  message: string;
}

/**
 * Flow cancelled event
 */
export interface FlowCancelledEvent {
  executionId: string;
  success: boolean;
}

// =============================================================================
// API RESPONSES
// =============================================================================

export interface ListFlowsResponse {
  flows: Flow[];
}

export interface GetFlowResponse {
  flow: Flow;
}

export interface SaveFlowResponse {
  flow: Flow;
}

export interface ExecuteFlowResponse {
  executionId?: string;
  execution?: ExecutionContext;
  status?: ExecutionStatus;
  message?: string;
  flowId?: string;
}

export interface ListExecutionsResponse {
  executions: ExecutionContext[];
}

export interface GetExecutionResponse {
  execution: ExecutionContext;
}

export interface ListTemplatesResponse {
  templates: FlowTemplate[];
}

// =============================================================================
// UI STATE
// =============================================================================

/**
 * Flow editor state
 */
export interface FlowEditorState {
  flow: Flow | null;
  isDirty: boolean;
  selectedNodeId: string | null;
  isExecuting: boolean;
  executionId: string | null;
  nodeStatuses: Record<string, NodeStatus>;
  nodeResults: Record<string, NodeResult>;
}

/**
 * Node palette item
 */
export interface NodePaletteItem {
  type: FlowNodeType;
  label: string;
  description: string;
  icon: string;
  defaultData: FlowNodeData;
}

// =============================================================================
// VARIABLE INTERPOLATION
// =============================================================================

/**
 * Available variable for autocomplete
 */
export interface AvailableVariable {
  path: string; // e.g., "node1.stdout"
  nodeId: string;
  nodeLabel?: string;
  property: string;
  type: 'string' | 'number' | 'boolean' | 'object';
  preview?: string;
}
