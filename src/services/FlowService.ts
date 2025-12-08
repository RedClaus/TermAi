/**
 * FlowService - Frontend API client for TermFlow
 * 
 * Handles communication with the backend flow API and WebSocket events.
 */

import { config } from '../config';
import type {
  Flow,
  FlowTemplate,
  ExecutionContext,
  ListFlowsResponse,
  GetFlowResponse,
  SaveFlowResponse,
  ExecuteFlowResponse,
  ListExecutionsResponse,
  GetExecutionResponse,
  ListTemplatesResponse,
  FlowNodeStatusEvent,
  FlowCompletedEvent,
  FlowErrorEvent,
  NodeStatus,
  NodeResult,
} from '../types/flow';

// =============================================================================
// API CLIENT
// =============================================================================

class FlowServiceClass {
  private baseUrl: string;

  constructor() {
    this.baseUrl = config.apiUrl;
  }

  /**
   * Update base URL if config changes
   */
  setBaseUrl(url: string): void {
    this.baseUrl = url;
  }

  // ===========================================================================
  // FLOW CRUD
  // ===========================================================================

  /**
   * List all saved flows
   */
  async listFlows(): Promise<Flow[]> {
    const response = await fetch(`${this.baseUrl}/api/flows`);
    if (!response.ok) {
      throw new Error(`Failed to list flows: ${response.statusText}`);
    }
    const data: ListFlowsResponse = await response.json();
    return data.flows;
  }

  /**
   * Get a specific flow by ID
   */
  async getFlow(flowId: string): Promise<Flow | null> {
    const response = await fetch(`${this.baseUrl}/api/flows/${flowId}`);
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`Failed to get flow: ${response.statusText}`);
    }
    const data: GetFlowResponse = await response.json();
    return data.flow;
  }

  /**
   * Create a new flow
   */
  async createFlow(flow: Partial<Flow>): Promise<Flow> {
    const response = await fetch(`${this.baseUrl}/api/flows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(flow),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create flow');
    }
    const data: SaveFlowResponse = await response.json();
    return data.flow;
  }

  /**
   * Update an existing flow
   */
  async updateFlow(flowId: string, flow: Partial<Flow>): Promise<Flow> {
    const response = await fetch(`${this.baseUrl}/api/flows/${flowId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(flow),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update flow');
    }
    const data: SaveFlowResponse = await response.json();
    return data.flow;
  }

  /**
   * Delete a flow
   */
  async deleteFlow(flowId: string): Promise<boolean> {
    const response = await fetch(`${this.baseUrl}/api/flows/${flowId}`, {
      method: 'DELETE',
    });
    if (response.status === 404) {
      return false;
    }
    if (!response.ok) {
      throw new Error(`Failed to delete flow: ${response.statusText}`);
    }
    return true;
  }

  // ===========================================================================
  // FLOW EXECUTION (HTTP - for simple use cases)
  // ===========================================================================

  /**
   * Execute a flow synchronously (waits for completion)
   * For real-time updates, use WebSocket via useFlowExecution hook
   */
  async executeFlowSync(flowId: string, sessionId?: string): Promise<ExecutionContext> {
    const response = await fetch(`${this.baseUrl}/api/flows/${flowId}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, sync: true }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to execute flow');
    }
    const data: ExecuteFlowResponse = await response.json();
    if (!data.execution) {
      throw new Error('No execution data returned');
    }
    return data.execution;
  }

  /**
   * Execute a flow asynchronously (returns immediately)
   */
  async executeFlowAsync(flowId: string, sessionId?: string): Promise<{ message: string; flowId: string }> {
    const response = await fetch(`${this.baseUrl}/api/flows/${flowId}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, sync: false }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to execute flow');
    }
    return await response.json();
  }

  // ===========================================================================
  // EXECUTION HISTORY
  // ===========================================================================

  /**
   * List recent executions
   */
  async listExecutions(): Promise<ExecutionContext[]> {
    const response = await fetch(`${this.baseUrl}/api/flows/executions/list`);
    if (!response.ok) {
      throw new Error(`Failed to list executions: ${response.statusText}`);
    }
    const data: ListExecutionsResponse = await response.json();
    return data.executions;
  }

  /**
   * Get execution status and results
   */
  async getExecution(executionId: string): Promise<ExecutionContext | null> {
    const response = await fetch(`${this.baseUrl}/api/flows/executions/${executionId}`);
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`Failed to get execution: ${response.statusText}`);
    }
    const data: GetExecutionResponse = await response.json();
    return data.execution;
  }

  /**
   * Cancel a running execution
   */
  async cancelExecution(executionId: string): Promise<boolean> {
    const response = await fetch(`${this.baseUrl}/api/flows/executions/${executionId}/cancel`, {
      method: 'POST',
    });
    if (response.status === 404) {
      return false;
    }
    if (!response.ok) {
      throw new Error(`Failed to cancel execution: ${response.statusText}`);
    }
    return true;
  }

  // ===========================================================================
  // TEMPLATES
  // ===========================================================================

  /**
   * Get built-in flow templates
   */
  async getTemplates(): Promise<FlowTemplate[]> {
    const response = await fetch(`${this.baseUrl}/api/flows/templates/list`);
    if (!response.ok) {
      throw new Error(`Failed to get templates: ${response.statusText}`);
    }
    const data: ListTemplatesResponse = await response.json();
    return data.templates;
  }

  /**
   * Create a flow from a template
   */
  async createFromTemplate(templateId: string, name?: string): Promise<Flow> {
    const templates = await this.getTemplates();
    const template = templates.find(t => t.id === templateId);
    
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    return this.createFlow({
      name: name || template.name,
      description: template.description,
      nodes: template.nodes,
      edges: template.edges,
    });
  }
}

// Export singleton instance
export const FlowService = new FlowServiceClass();

// =============================================================================
// EXECUTION STATE MANAGER
// =============================================================================

/**
 * Manages real-time flow execution state
 * Used with WebSocket events for live updates
 */
export class FlowExecutionManager {
  private nodeStatuses: Map<string, NodeStatus> = new Map();
  private nodeResults: Map<string, NodeResult> = new Map();
  private listeners: Set<(event: FlowExecutionEvent) => void> = new Set();
  private _isExecuting: boolean = false;
  private _executionId: string | null = null;
  private _flowId: string | null = null;

  get isExecuting(): boolean {
    return this._isExecuting;
  }

  get executionId(): string | null {
    return this._executionId;
  }

  get flowId(): string | null {
    return this._flowId;
  }

  /**
   * Subscribe to execution events
   */
  subscribe(listener: (event: FlowExecutionEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Emit event to all listeners
   */
  private emit(event: FlowExecutionEvent): void {
    this.listeners.forEach(listener => listener(event));
  }

  /**
   * Start tracking a new execution
   */
  startExecution(flowId: string): void {
    this._isExecuting = true;
    this._flowId = flowId;
    this._executionId = null;
    this.nodeStatuses.clear();
    this.nodeResults.clear();
    this.emit({ type: 'started', flowId });
  }

  /**
   * Handle node status update from WebSocket
   */
  handleNodeStatus(event: FlowNodeStatusEvent): void {
    this.nodeStatuses.set(event.nodeId, event.status);
    if (event.result) {
      this.nodeResults.set(event.nodeId, event.result);
      this.emit({ 
        type: 'node-update', 
        nodeId: event.nodeId, 
        status: event.status,
        result: event.result,
      });
    } else {
      this.emit({ 
        type: 'node-update', 
        nodeId: event.nodeId, 
        status: event.status,
      });
    }
  }

  /**
   * Handle flow completion from WebSocket
   */
  handleFlowComplete(event: FlowCompletedEvent): void {
    this._isExecuting = false;
    this._executionId = event.executionId;
    
    // Update all results
    for (const [nodeId, result] of Object.entries(event.results)) {
      this.nodeStatuses.set(nodeId, result.status);
      this.nodeResults.set(nodeId, result);
    }
    
    this.emit({
      type: 'completed',
      executionId: event.executionId,
      status: event.status,
      duration: event.duration,
      results: event.results,
    });
  }

  /**
   * Handle flow error from WebSocket
   */
  handleFlowError(event: FlowErrorEvent): void {
    this._isExecuting = false;
    this.emit({
      type: 'error',
      flowId: event.flowId,
      message: event.message,
    });
  }

  /**
   * Get current node status
   */
  getNodeStatus(nodeId: string): NodeStatus | undefined {
    return this.nodeStatuses.get(nodeId);
  }

  /**
   * Get current node result
   */
  getNodeResult(nodeId: string): NodeResult | undefined {
    return this.nodeResults.get(nodeId);
  }

  /**
   * Get all node statuses
   */
  getAllNodeStatuses(): Record<string, NodeStatus> {
    return Object.fromEntries(this.nodeStatuses);
  }

  /**
   * Get all node results
   */
  getAllNodeResults(): Record<string, NodeResult> {
    return Object.fromEntries(this.nodeResults);
  }

  /**
   * Reset execution state
   */
  reset(): void {
    this._isExecuting = false;
    this._executionId = null;
    this._flowId = null;
    this.nodeStatuses.clear();
    this.nodeResults.clear();
  }
}

/**
 * Flow execution event types
 */
export type FlowExecutionEvent =
  | { type: 'started'; flowId: string }
  | { type: 'node-update'; nodeId: string; status: NodeStatus; result?: NodeResult }
  | { type: 'completed'; executionId: string; status: string; duration: number; results: Record<string, NodeResult> }
  | { type: 'error'; flowId: string; message: string };

// Export singleton execution manager
export const flowExecutionManager = new FlowExecutionManager();
