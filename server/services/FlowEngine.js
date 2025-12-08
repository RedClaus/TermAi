/**
 * FlowEngine - DAG Execution Engine for TermFlow
 * 
 * A lightweight, embedded directed-acyclic-graph (DAG) execution engine.
 * Uses token-passing model where each node passes a Context Token
 * containing stdout, stderr, exitCode, and custom data to the next node.
 * 
 * Key Features:
 * - Sequential and parallel node execution
 * - Variable interpolation ({{node.stdout}})
 * - Safe condition evaluation (no eval)
 * - Integration with SessionManager (PTY) and LLM
 * - Real-time status updates via callbacks
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// =============================================================================
// CONSTANTS
// =============================================================================

const FLOWS_DIR = path.join(__dirname, '../data/flows');
const EXECUTIONS_DIR = path.join(__dirname, '../data/executions');

// Ensure directories exist
if (!fs.existsSync(FLOWS_DIR)) {
  fs.mkdirSync(FLOWS_DIR, { recursive: true });
}
if (!fs.existsSync(EXECUTIONS_DIR)) {
  fs.mkdirSync(EXECUTIONS_DIR, { recursive: true });
}

// =============================================================================
// TYPES (JSDoc for IDE support)
// =============================================================================

/**
 * @typedef {Object} FlowNode
 * @property {string} id - Unique node identifier
 * @property {string} type - Node type: 'command' | 'ai-reasoning' | 'condition' | 'file-op'
 * @property {Object} data - Node-specific configuration
 * @property {Object} position - {x, y} position on canvas
 */

/**
 * @typedef {Object} FlowEdge
 * @property {string} id - Unique edge identifier
 * @property {string} source - Source node ID
 * @property {string} target - Target node ID
 * @property {string} [sourceHandle] - Source handle (for condition nodes: 'true' | 'false')
 */

/**
 * @typedef {Object} Flow
 * @property {string} id - Unique flow identifier
 * @property {string} name - Flow display name
 * @property {string} [description] - Optional description
 * @property {FlowNode[]} nodes - Array of nodes
 * @property {FlowEdge[]} edges - Array of edges
 * @property {number} createdAt - Creation timestamp
 * @property {number} updatedAt - Last update timestamp
 */

/**
 * @typedef {Object} ExecutionContext
 * @property {string} executionId - Unique execution ID
 * @property {string} flowId - Flow being executed
 * @property {string} sessionId - Terminal session ID
 * @property {Object<string, NodeResult>} results - Results keyed by node ID
 * @property {string} status - 'running' | 'completed' | 'failed' | 'cancelled'
 * @property {number} startTime - Execution start timestamp
 * @property {number} [endTime] - Execution end timestamp
 */

/**
 * @typedef {Object} NodeResult
 * @property {string} nodeId
 * @property {string} status - 'pending' | 'running' | 'success' | 'failed' | 'skipped'
 * @property {string} [stdout] - Command output
 * @property {string} [stderr] - Error output
 * @property {number} [exitCode] - Command exit code
 * @property {string} [response] - AI response
 * @property {*} [data] - Any additional data
 * @property {number} [duration] - Execution time in ms
 * @property {string} [error] - Error message if failed
 */

// =============================================================================
// FLOW ENGINE CLASS
// =============================================================================

class FlowEngine {
  constructor() {
    // Active executions map: executionId -> ExecutionContext
    this.activeExecutions = new Map();
    
    // Session manager reference (set externally)
    this.sessionManager = null;
    
    // LLM chat function (set externally)
    this.llmChat = null;
  }

  // ===========================================================================
  // CONFIGURATION
  // ===========================================================================

  /**
   * Set the session manager for command execution
   * @param {Object} sessionManager - SessionManager instance
   */
  setSessionManager(sessionManager) {
    this.sessionManager = sessionManager;
  }

  /**
   * Set the LLM chat function for AI nodes
   * @param {Function} chatFn - Async function(provider, model, messages, systemPrompt) => response
   */
  setLLMChat(chatFn) {
    this.llmChat = chatFn;
  }

  // ===========================================================================
  // FLOW CRUD OPERATIONS
  // ===========================================================================

  /**
   * Helper to find a flow file by ID recursively
   * @private
   */
  _findFlowPath(flowId) {
    // Check root
    let filePath = path.join(FLOWS_DIR, `${flowId}.json`);
    if (fs.existsSync(filePath)) return filePath;

    // Check subdirectories (one level deep for now, or recursive)
    try {
      const items = fs.readdirSync(FLOWS_DIR, { withFileTypes: true });
      for (const item of items) {
        if (item.isDirectory()) {
          filePath = path.join(FLOWS_DIR, item.name, `${flowId}.json`);
          if (fs.existsSync(filePath)) return filePath;
        }
      }
    } catch (e) {
      console.warn('Error searching flow files:', e);
    }
    return null;
  }

  /**
   * List all saved flows (recursive)
   * @returns {Flow[]}
   */
  listFlows() {
    try {
      const flows = [];
      
      // Helper to scan directory
      const scanDir = (dir) => {
        if (!fs.existsSync(dir)) return;
        const items = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const item of items) {
          const fullPath = path.join(dir, item.name);
          if (item.isDirectory()) {
            scanDir(fullPath);
          } else if (item.name.endsWith('.json')) {
            try {
              const content = fs.readFileSync(fullPath, 'utf-8');
              const flow = JSON.parse(content);
              // Inject folder name if in subdirectory
              const relativeDir = path.relative(FLOWS_DIR, dir);
              if (relativeDir) flow.folder = relativeDir;
              flows.push(flow);
            } catch (e) {
              console.warn(`Failed to parse flow ${item.name}:`, e.message);
            }
          }
        }
      };

      scanDir(FLOWS_DIR);
      return flows.sort((a, b) => b.updatedAt - a.updatedAt);
    } catch (error) {
      console.error('[FlowEngine] Error listing flows:', error);
      return [];
    }
  }

  /**
   * Get a flow by ID
   * @param {string} flowId
   * @returns {Flow|null}
   */
  getFlow(flowId) {
    try {
      const filePath = this._findFlowPath(flowId);
      if (!filePath) return null;
      
      const content = fs.readFileSync(filePath, 'utf-8');
      const flow = JSON.parse(content);
      
      // Inject folder info
      const dir = path.dirname(filePath);
      const relativeDir = path.relative(FLOWS_DIR, dir);
      if (relativeDir) flow.folder = relativeDir;
      
      return flow;
    } catch (error) {
      console.error('[FlowEngine] Error getting flow:', error);
      return null;
    }
  }

  /**
   * Save a flow (create or update)
   * @param {Flow} flow
   * @returns {Flow}
   */
  saveFlow(flow) {
    const now = Date.now();
    const isNew = !flow.id;
    
    const savedFlow = {
      ...flow,
      id: flow.id || uuidv4(),
      createdAt: flow.createdAt || now,
      updatedAt: now,
    };

    // Determine target directory
    let targetDir = FLOWS_DIR;
    if (savedFlow.folder) {
      // Sanitize folder path to prevent traversal
      const safeFolder = savedFlow.folder.replace(/[^a-zA-Z0-9_\-\/]/g, '');
      targetDir = path.join(FLOWS_DIR, safeFolder);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
    }

    const targetPath = path.join(targetDir, `${savedFlow.id}.json`);

    // Check if it exists elsewhere and move it if folder changed
    if (!isNew) {
      const existingPath = this._findFlowPath(savedFlow.id);
      if (existingPath && existingPath !== targetPath) {
        fs.unlinkSync(existingPath); // Delete old file
        console.log(`[FlowEngine] Moved flow ${savedFlow.id} to ${savedFlow.folder || 'root'}`);
      }
    }

    fs.writeFileSync(targetPath, JSON.stringify(savedFlow, null, 2));
    
    console.log(`[FlowEngine] Flow ${isNew ? 'created' : 'updated'}: ${savedFlow.name} (${savedFlow.id})`);
    return savedFlow;
  }

  /**
   * Delete a flow
   * @param {string} flowId
   * @returns {boolean}
   */
  deleteFlow(flowId) {
    try {
      const filePath = this._findFlowPath(flowId);
      if (filePath) {
        fs.unlinkSync(filePath);
        console.log(`[FlowEngine] Flow deleted: ${flowId}`);
        return true;
      }
      return false;
    } catch (error) {
      console.error('[FlowEngine] Error deleting flow:', error);
      return false;
    }
  }

  // ===========================================================================
  // FLOW EXECUTION
  // ===========================================================================

  /**
   * Execute a flow
   * @param {string} flowId - Flow to execute
   * @param {string} sessionId - Terminal session ID
   * @param {Object} callbacks - Event callbacks
   * @param {Function} callbacks.onNodeStart - (nodeId) => void
   * @param {Function} callbacks.onNodeComplete - (nodeId, result) => void
   * @param {Function} callbacks.onNodeError - (nodeId, error) => void
   * @param {Function} callbacks.onFlowComplete - (status, results) => void
   * @returns {Promise<ExecutionContext>}
   */
  async execute(flowId, sessionId, callbacks = {}) {
    const flow = this.getFlow(flowId);
    if (!flow) {
      throw new Error(`Flow not found: ${flowId}`);
    }

    const executionId = uuidv4();
    const context = {
      executionId,
      flowId,
      sessionId,
      results: {},
      status: 'running',
      startTime: Date.now(),
    };

    this.activeExecutions.set(executionId, context);
    console.log(`[FlowEngine] Starting execution: ${executionId} for flow: ${flow.name}`);

    try {
      // Build execution graph
      const graph = this._buildGraph(flow);
      
      // Find entry nodes (nodes with no incoming edges)
      const entryNodes = this._findEntryNodes(flow);
      
      if (entryNodes.length === 0) {
        throw new Error('Flow has no entry nodes');
      }

      // Execute starting from entry nodes
      await this._executeNodes(entryNodes, flow, context, graph, callbacks);

      context.status = 'completed';
      context.endTime = Date.now();
      
      console.log(`[FlowEngine] Execution completed: ${executionId} in ${context.endTime - context.startTime}ms`);
      
    } catch (error) {
      context.status = 'failed';
      context.endTime = Date.now();
      context.error = error.message;
      console.error(`[FlowEngine] Execution failed: ${executionId}`, error);
    } finally {
      // Save execution history
      this._saveExecution(context);
      this.activeExecutions.delete(executionId);
      
      if (callbacks.onFlowComplete) {
        callbacks.onFlowComplete(context.status, context.results);
      }
    }

    return context;
  }

  /**
   * Cancel an active execution
   * @param {string} executionId
   * @returns {boolean}
   */
  cancelExecution(executionId) {
    const context = this.activeExecutions.get(executionId);
    if (context) {
      context.status = 'cancelled';
      console.log(`[FlowEngine] Execution cancelled: ${executionId}`);
      return true;
    }
    return false;
  }

  /**
   * Get execution status
   * @param {string} executionId
   * @returns {ExecutionContext|null}
   */
  getExecution(executionId) {
    // Check active first
    if (this.activeExecutions.has(executionId)) {
      return this.activeExecutions.get(executionId);
    }
    // Check saved executions
    try {
      const filePath = path.join(EXECUTIONS_DIR, `${executionId}.json`);
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      }
    } catch (error) {
      console.error('[FlowEngine] Error getting execution:', error);
    }
    return null;
  }

  // ===========================================================================
  // GRAPH EXECUTION INTERNALS
  // ===========================================================================

  /**
   * Build adjacency list from flow edges
   * @private
   */
  _buildGraph(flow) {
    const graph = {
      outgoing: {}, // nodeId -> [{target, handle}]
      incoming: {}, // nodeId -> [sourceId]
    };

    for (const node of flow.nodes) {
      graph.outgoing[node.id] = [];
      graph.incoming[node.id] = [];
    }

    for (const edge of flow.edges) {
      graph.outgoing[edge.source].push({
        target: edge.target,
        handle: edge.sourceHandle || 'default',
      });
      graph.incoming[edge.target].push(edge.source);
    }

    return graph;
  }

  /**
   * Find entry nodes (no incoming edges)
   * @private
   */
  _findEntryNodes(flow) {
    const graph = this._buildGraph(flow);
    return flow.nodes.filter(node => graph.incoming[node.id].length === 0);
  }

  /**
   * Execute nodes in topological order with parallel support
   * @private
   */
  async _executeNodes(nodes, flow, context, graph, callbacks) {
    if (nodes.length === 0) return;

    // Check for cancellation
    if (context.status === 'cancelled') return;

    // Execute nodes in parallel if multiple
    const promises = nodes.map(node => 
      this._executeNode(node, flow, context, graph, callbacks)
    );

    await Promise.all(promises);
  }

  /**
   * Execute a single node
   * @private
   */
  async _executeNode(node, flow, context, graph, callbacks) {
    // Check for cancellation
    if (context.status === 'cancelled') return;

    // Check if all dependencies are complete
    const dependencies = graph.incoming[node.id];
    for (const depId of dependencies) {
      const depResult = context.results[depId];
      if (!depResult || depResult.status === 'pending' || depResult.status === 'running') {
        // Dependency not ready, skip for now (will be called again)
        return;
      }
      // If dependency failed and node doesn't have continueOnError, skip
      if (depResult.status === 'failed' && !node.data?.continueOnError) {
        context.results[node.id] = {
          nodeId: node.id,
          status: 'skipped',
          error: `Dependency ${depId} failed`,
        };
        return;
      }
    }

    // Mark as running
    context.results[node.id] = {
      nodeId: node.id,
      status: 'running',
      startTime: Date.now(),
    };

    if (callbacks.onNodeStart) {
      callbacks.onNodeStart(node.id);
    }

    try {
      // Interpolate variables in node data
      const interpolatedData = this._interpolateNodeData(node.data, context.results);
      
      // Execute based on node type
      let result;
      switch (node.type) {
        case 'command':
        case 'cmd': // Support legacy 'cmd' node type
          result = await this._executeCommandNode(interpolatedData, context);
          break;
        case 'learned-skill':
          // Learned skill nodes are essentially command nodes with pre-defined commands
          result = await this._executeLearnedSkillNode(interpolatedData, context);
          break;
        case 'ai-reasoning':
          result = await this._executeAINode(interpolatedData, context);
          break;
        case 'condition':
          result = await this._executeConditionNode(interpolatedData, context);
          break;
        case 'file-op':
          result = await this._executeFileOpNode(interpolatedData, context);
          break;
        default:
          throw new Error(`Unknown node type: ${node.type}`);
      }

      // Update result
      context.results[node.id] = {
        ...context.results[node.id],
        ...result,
        status: 'success',
        duration: Date.now() - context.results[node.id].startTime,
      };

      if (callbacks.onNodeComplete) {
        callbacks.onNodeComplete(node.id, context.results[node.id]);
      }

      // Find and execute next nodes
      const nextEdges = graph.outgoing[node.id];
      const nextNodes = [];

      for (const edge of nextEdges) {
        // For condition nodes, check handle
        if (node.type === 'condition') {
          const conditionResult = result.conditionResult;
          if ((conditionResult && edge.handle === 'true') || 
              (!conditionResult && edge.handle === 'false') ||
              edge.handle === 'default') {
            const nextNode = flow.nodes.find(n => n.id === edge.target);
            if (nextNode) nextNodes.push(nextNode);
          }
        } else {
          const nextNode = flow.nodes.find(n => n.id === edge.target);
          if (nextNode) nextNodes.push(nextNode);
        }
      }

      // Execute next nodes
      await this._executeNodes(nextNodes, flow, context, graph, callbacks);

    } catch (error) {
      context.results[node.id] = {
        ...context.results[node.id],
        status: 'failed',
        error: error.message,
        duration: Date.now() - context.results[node.id].startTime,
      };

      if (callbacks.onNodeError) {
        callbacks.onNodeError(node.id, error.message);
      }

      // Propagate failure unless continueOnError
      if (!node.data?.continueOnError) {
        throw error;
      }
    }
  }

  // ===========================================================================
  // NODE TYPE EXECUTORS
  // ===========================================================================

  /**
   * Execute a command node
   * @private
   */
  async _executeCommandNode(data, _context) {
    const { command, timeout = 60000, cwd } = data;

    if (!command) {
      throw new Error('Command is required');
    }

    console.log(`[FlowEngine] Executing command: ${command}`);

    // Use SessionManager if available for PTY execution
    if (this.sessionManager) {
      const result = await this.sessionManager.writeAi(command, {
        waitForCompletion: true,
        timeout,
      });

      return {
        stdout: result.output || '',
        exitCode: result.interrupted ? 130 : 0, // 130 = interrupted
        duration: result.duration,
        cwd: result.cwd,
      };
    }

    // Fallback to child_process.exec
    const { exec } = require('child_process');
    return new Promise((resolve, reject) => {
      const options = {
        cwd: cwd || process.cwd(),
        timeout,
        maxBuffer: 10 * 1024 * 1024, // 10MB
      };

      exec(command, options, (error, stdout, stderr) => {
        if (error && error.killed) {
          reject(new Error('Command timed out'));
          return;
        }

        resolve({
          stdout: stdout || '',
          stderr: stderr || '',
          exitCode: error ? error.code || 1 : 0,
        });
      });
    });
  }

  /**
   * Execute a learned skill node (user-saved command patterns)
   * @private
   */
  async _executeLearnedSkillNode(data, _context) {
    const { command, timeout = 60000, cwd, skillId, skillName } = data;

    if (!command) {
      throw new Error('Learned skill requires a command');
    }

    console.log(`[FlowEngine] Executing learned skill "${skillName || skillId}": ${command}`);

    // Learned skills execute the same way as command nodes
    // Use SessionManager if available for PTY execution
    if (this.sessionManager) {
      const result = await this.sessionManager.writeAi(command, {
        waitForCompletion: true,
        timeout,
      });

      return {
        stdout: result.output || '',
        exitCode: result.interrupted ? 130 : 0,
        duration: result.duration,
        cwd: result.cwd,
        skillId,
        skillName,
      };
    }

    // Fallback to child_process.exec
    const { exec } = require('child_process');
    return new Promise((resolve, reject) => {
      const options = {
        cwd: cwd || process.cwd(),
        timeout,
        maxBuffer: 10 * 1024 * 1024,
      };

      exec(command, options, (error, stdout, stderr) => {
        if (error && error.killed) {
          reject(new Error('Learned skill command timed out'));
          return;
        }

        resolve({
          stdout: stdout || '',
          stderr: stderr || '',
          exitCode: error ? error.code || 1 : 0,
          skillId,
          skillName,
        });
      });
    });
  }

  /**
   * Execute an AI reasoning node
   * @private
   */
  async _executeAINode(data, _context) {
    const { 
      prompt, 
      provider = 'gemini', 
      model = 'auto',
      systemPrompt = 'You are a helpful assistant analyzing terminal output and code.',
    } = data;

    if (!prompt) {
      throw new Error('Prompt is required for AI node');
    }

    console.log(`[FlowEngine] AI reasoning: ${prompt.substring(0, 50)}...`);

    if (this.llmChat) {
      const response = await this.llmChat(provider, model, [
        { role: 'user', content: prompt }
      ], systemPrompt);

      return {
        response: response.content || response,
        provider,
        model,
      };
    }

    // Fallback: throw error if not configured
    throw new Error('LLM chat function not configured. Set via setLLMChat().');
  }

  /**
   * Execute a condition node
   * @private
   */
  async _executeConditionNode(data, context) {
    const { condition } = data;

    if (!condition) {
      throw new Error('Condition is required');
    }

    console.log(`[FlowEngine] Evaluating condition: ${condition}`);

    const result = this._safeEvaluateCondition(condition, context.results);

    return {
      conditionResult: result,
      evaluatedCondition: condition,
    };
  }

  /**
   * Expand ~ to home directory
   * @private
   */
  _expandHome(p) {
    if (p && p.startsWith('~')) {
      return path.join(require('os').homedir(), p.slice(1));
    }
    return p;
  }

  /**
   * Execute a file operation node
   * @private
   */
  async _executeFileOpNode(data, _context) {
    const { operation, filePath, path: pathField, content } = data;
    
    // Support both 'filePath' and 'path' fields (legacy compatibility)
    const targetPath = filePath || pathField;

    if (!operation || !targetPath) {
      throw new Error('Operation and filePath (or path) are required');
    }

    console.log(`[FlowEngine] File operation: ${operation} on ${targetPath}`);

    // Expand ~ and resolve the path
    const expandedPath = this._expandHome(targetPath);
    const resolvedPath = path.resolve(expandedPath);
    const homeDir = require('os').homedir();
    
    console.log(`[FlowEngine] Resolved path: ${resolvedPath}`);

    // Security: Ensure path is within allowed directories
    if (!resolvedPath.startsWith(homeDir) && !resolvedPath.startsWith(process.cwd())) {
      throw new Error(`File access denied: Path "${resolvedPath}" is outside allowed directories (home: ${homeDir}, cwd: ${process.cwd()})`);
    }

    switch (operation) {
      case 'read':
        if (!fs.existsSync(resolvedPath)) {
          throw new Error(`File not found: ${resolvedPath}`);
        }
        const fileContent = fs.readFileSync(resolvedPath, 'utf-8');
        return { content: fileContent, filePath: resolvedPath };

      case 'write':
        if (!content && content !== '') {
          throw new Error('Content is required for write operation');
        }
        // Ensure directory exists
        const writeDir = path.dirname(resolvedPath);
        if (!fs.existsSync(writeDir)) {
          fs.mkdirSync(writeDir, { recursive: true });
        }
        fs.writeFileSync(resolvedPath, content, 'utf-8');
        return { filePath: resolvedPath, bytesWritten: content.length };

      case 'append':
        if (!content) {
          throw new Error('Content is required for append operation');
        }
        // Ensure directory exists
        const appendDir = path.dirname(resolvedPath);
        if (!fs.existsSync(appendDir)) {
          fs.mkdirSync(appendDir, { recursive: true });
        }
        fs.appendFileSync(resolvedPath, content, 'utf-8');
        return { filePath: resolvedPath, bytesWritten: content.length };

      case 'exists':
        return { exists: fs.existsSync(resolvedPath), filePath: resolvedPath };

      case 'delete':
        if (fs.existsSync(resolvedPath)) {
          fs.unlinkSync(resolvedPath);
        }
        return { deleted: true, filePath: resolvedPath };

      default:
        throw new Error(`Unknown file operation: ${operation}`);
    }
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  /**
   * Interpolate variables in node data using Handlebars-style syntax
   * Supports: {{nodeId.stdout}}, {{nodeId.response}}, etc.
   * @private
   */
  _interpolateNodeData(data, results) {
    if (!data) return data;

    const interpolate = (str) => {
      if (typeof str !== 'string') return str;

      return str.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
        const parts = path.trim().split('.');
        let value = results;

        for (const part of parts) {
          if (value === null || value === undefined) return '';
          value = value[part];
        }

        // Handle different value types
        if (value === null || value === undefined) return '';
        if (typeof value === 'object') return JSON.stringify(value);
        return String(value);
      });
    };

    // Deep interpolate object
    const deepInterpolate = (obj) => {
      if (typeof obj === 'string') {
        return interpolate(obj);
      }
      if (Array.isArray(obj)) {
        return obj.map(deepInterpolate);
      }
      if (obj && typeof obj === 'object') {
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
          result[key] = deepInterpolate(value);
        }
        return result;
      }
      return obj;
    };

    return deepInterpolate(data);
  }

  /**
   * Safely evaluate a condition without using eval()
   * Supports:
   * - Equality: value === 0, value !== 'error'
   * - Comparison: value > 0, value <= 100
   * - String methods: value.includes('text'), value.startsWith('prefix')
   * - Length: value.length > 0
   * - Truthy/falsy: just the value
   * @private
   */
  _safeEvaluateCondition(condition, results) {
    // First interpolate variables
    let interpolated = condition.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
      const parts = path.trim().split('.');
      let value = results;

      for (const part of parts) {
        if (value === null || value === undefined) return 'null';
        value = value[part];
      }

      if (value === null || value === undefined) return 'null';
      if (typeof value === 'string') return JSON.stringify(value);
      if (typeof value === 'object') return JSON.stringify(value);
      return String(value);
    });

    console.log(`[FlowEngine] Interpolated condition: ${interpolated}`);

    // Pattern matchers for safe evaluation
    const patterns = [
      // Equality: "value" === "other" or value === 0
      {
        regex: /^(.+?)\s*(===|!==|==|!=)\s*(.+)$/,
        evaluate: (match) => {
          const left = this._parseValue(match[1].trim());
          const op = match[2];
          const right = this._parseValue(match[3].trim());
          
          switch (op) {
            case '===': return left === right;
            case '!==': return left !== right;
            case '==': return left == right;
            case '!=': return left != right;
          }
        }
      },
      // Comparison: value > 0
      {
        regex: /^(.+?)\s*(>=|<=|>|<)\s*(.+)$/,
        evaluate: (match) => {
          const left = this._parseValue(match[1].trim());
          const op = match[2];
          const right = this._parseValue(match[3].trim());
          
          switch (op) {
            case '>': return left > right;
            case '<': return left < right;
            case '>=': return left >= right;
            case '<=': return left <= right;
          }
        }
      },
      // String includes: value.includes("text")
      {
        regex: /^(.+?)\.includes\s*\(\s*["'](.+?)["']\s*\)$/,
        evaluate: (match) => {
          const value = this._parseValue(match[1].trim());
          const search = match[2];
          return String(value).includes(search);
        }
      },
      // String startsWith: value.startsWith("prefix")
      {
        regex: /^(.+?)\.startsWith\s*\(\s*["'](.+?)["']\s*\)$/,
        evaluate: (match) => {
          const value = this._parseValue(match[1].trim());
          const prefix = match[2];
          return String(value).startsWith(prefix);
        }
      },
      // String endsWith: value.endsWith("suffix")
      {
        regex: /^(.+?)\.endsWith\s*\(\s*["'](.+?)["']\s*\)$/,
        evaluate: (match) => {
          const value = this._parseValue(match[1].trim());
          const suffix = match[2];
          return String(value).endsWith(suffix);
        }
      },
      // Length comparison: value.length > 0
      {
        regex: /^(.+?)\.length\s*(===|!==|>=|<=|>|<)\s*(\d+)$/,
        evaluate: (m) => {
          const value = this._parseValue(m[1].trim());
          const op = m[2];
          const num = parseInt(m[3], 10);
          const len = String(value).length;
          
          switch (op) {
            case '===': return len === num;
            case '!==': return len !== num;
            case '>': return len > num;
            case '<': return len < num;
            case '>=': return len >= num;
            case '<=': return len <= num;
          }
        }
      },
      // Truthy check: just the value
      {
        regex: /^(.+)$/,
        evaluate: (m) => {
          const value = this._parseValue(m[1].trim());
          return !!value;
        }
      }
    ];

    // Try each pattern
    for (const pattern of patterns) {
      const match = interpolated.match(pattern.regex);
      if (match) {
        try {
          return pattern.evaluate(match);
        } catch (error) {
          console.error(`[FlowEngine] Condition evaluation error:`, error);
          return false;
        }
      }
    }

    console.warn(`[FlowEngine] Could not parse condition: ${condition}`);
    return false;
  }

  /**
   * Parse a value from condition string
   * @private
   */
  _parseValue(str) {
    // Quoted string
    if ((str.startsWith('"') && str.endsWith('"')) || 
        (str.startsWith("'") && str.endsWith("'"))) {
      return str.slice(1, -1);
    }
    // null/undefined
    if (str === 'null' || str === 'undefined') return null;
    // Boolean
    if (str === 'true') return true;
    if (str === 'false') return false;
    // Number
    const num = Number(str);
    if (!isNaN(num)) return num;
    // Return as string
    return str;
  }

  /**
   * Save execution history
   * @private
   */
  _saveExecution(context) {
    try {
      const filePath = path.join(EXECUTIONS_DIR, `${context.executionId}.json`);
      fs.writeFileSync(filePath, JSON.stringify(context, null, 2));
    } catch (error) {
      console.error('[FlowEngine] Error saving execution:', error);
    }
  }

  /**
   * List recent executions
   * @param {number} limit
   * @returns {ExecutionContext[]}
   */
  listExecutions(limit = 50) {
    try {
      const files = fs.readdirSync(EXECUTIONS_DIR)
        .filter(f => f.endsWith('.json'))
        .sort((a, b) => {
          const statA = fs.statSync(path.join(EXECUTIONS_DIR, a));
          const statB = fs.statSync(path.join(EXECUTIONS_DIR, b));
          return statB.mtime - statA.mtime;
        })
        .slice(0, limit);

      return files.map(file => {
        const content = fs.readFileSync(path.join(EXECUTIONS_DIR, file), 'utf-8');
        return JSON.parse(content);
      });
    } catch (error) {
      console.error('[FlowEngine] Error listing executions:', error);
      return [];
    }
  }
}

// Export singleton instance
const flowEngine = new FlowEngine();

module.exports = { FlowEngine, flowEngine };
