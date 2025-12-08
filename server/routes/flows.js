/**
 * Flow API Routes
 * 
 * RESTful API for managing and executing TermFlow workflows.
 * 
 * Endpoints:
 *   GET    /api/flows           - List all flows
 *   GET    /api/flows/:id       - Get a specific flow
 *   POST   /api/flows           - Create a new flow
 *   PUT    /api/flows/:id       - Update a flow
 *   DELETE /api/flows/:id       - Delete a flow
 *   POST   /api/flows/:id/execute - Execute a flow
 *   GET    /api/flows/executions - List recent executions
 *   GET    /api/flows/executions/:id - Get execution status
 *   POST   /api/flows/executions/:id/cancel - Cancel execution
 */

const express = require('express');
const { flowEngine } = require('../services/FlowEngine');
const { llmChat } = require('./llm');

const router = express.Router();

// Configure FlowEngine with LLM chat function
flowEngine.setLLMChat(llmChat);

// =============================================================================
// FLOW CRUD
// =============================================================================

/**
 * GET /api/flows
 * List all saved flows
 */
router.get('/', (_req, res) => {
  try {
    const flows = flowEngine.listFlows();
    res.json({ flows });
  } catch (error) {
    console.error('[Flows API] Error listing flows:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/flows/:id
 * Get a specific flow by ID
 */
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const flow = flowEngine.getFlow(id);
    
    if (!flow) {
      return res.status(404).json({ error: 'Flow not found' });
    }
    
    res.json({ flow });
  } catch (error) {
    console.error('[Flows API] Error getting flow:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/flows
 * Create a new flow
 */
router.post('/', (req, res) => {
  try {
    const flowData = req.body;
    
    if (!flowData.name) {
      return res.status(400).json({ error: 'Flow name is required' });
    }
    
    // Ensure nodes and edges arrays exist
    flowData.nodes = flowData.nodes || [];
    flowData.edges = flowData.edges || [];
    
    const flow = flowEngine.saveFlow(flowData);
    res.status(201).json({ flow });
  } catch (error) {
    console.error('[Flows API] Error creating flow:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/flows/:id
 * Update an existing flow
 */
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const flowData = req.body;
    
    // Verify flow exists
    const existing = flowEngine.getFlow(id);
    if (!existing) {
      return res.status(404).json({ error: 'Flow not found' });
    }
    
    // Merge with existing data
    const updatedFlow = {
      ...existing,
      ...flowData,
      id, // Preserve original ID
    };
    
    const flow = flowEngine.saveFlow(updatedFlow);
    res.json({ flow });
  } catch (error) {
    console.error('[Flows API] Error updating flow:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/flows/:id
 * Delete a flow
 */
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const deleted = flowEngine.deleteFlow(id);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Flow not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('[Flows API] Error deleting flow:', error);
    res.status(500).json({ error: error.message });
  }
});

// =============================================================================
// FLOW EXECUTION (HTTP - for simple cases without live updates)
// =============================================================================

/**
 * POST /api/flows/:id/execute
 * Execute a flow and return the execution ID
 * 
 * For live updates, use WebSocket: socket.emit('flow:execute', { flowId, sessionId })
 * 
 * Query params:
 *   - sync=true: Wait for completion and return full results (blocking)
 */
router.post('/:id/execute', async (req, res) => {
  try {
    const { id } = req.params;
    const { sessionId, sync } = req.body;
    
    const flow = flowEngine.getFlow(id);
    if (!flow) {
      return res.status(404).json({ error: 'Flow not found' });
    }
    
    if (sync) {
      // Synchronous execution - wait for completion
      const result = await flowEngine.execute(id, sessionId || 'default', {});
      res.json({ execution: result });
    } else {
      // Async execution - return immediately with execution ID
      // Note: For real-time updates, use WebSocket
      const executionPromise = flowEngine.execute(id, sessionId || 'default', {});
      
      // Get execution ID from the promise (we need to wait briefly)
      const result = await Promise.race([
        executionPromise,
        new Promise(resolve => setTimeout(() => resolve(null), 100))
      ]);
      
      if (result) {
        res.json({ 
          executionId: result.executionId,
          status: result.status,
          message: 'Execution completed',
        });
      } else {
        // Execution is still running
        res.status(202).json({ 
          message: 'Execution started. Use WebSocket for live updates.',
          flowId: id,
        });
      }
    }
  } catch (error) {
    console.error('[Flows API] Error executing flow:', error);
    res.status(500).json({ error: error.message });
  }
});

// =============================================================================
// EXECUTION HISTORY
// =============================================================================

/**
 * GET /api/flows/executions
 * List recent executions
 */
router.get('/executions/list', (_req, res) => {
  try {
    const executions = flowEngine.listExecutions(50);
    res.json({ executions });
  } catch (error) {
    console.error('[Flows API] Error listing executions:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/flows/executions/:id
 * Get execution status and results
 */
router.get('/executions/:executionId', (req, res) => {
  try {
    const { executionId } = req.params;
    const execution = flowEngine.getExecution(executionId);
    
    if (!execution) {
      return res.status(404).json({ error: 'Execution not found' });
    }
    
    res.json({ execution });
  } catch (error) {
    console.error('[Flows API] Error getting execution:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/flows/executions/:id/cancel
 * Cancel a running execution
 */
router.post('/executions/:executionId/cancel', (req, res) => {
  try {
    const { executionId } = req.params;
    const cancelled = flowEngine.cancelExecution(executionId);
    
    if (!cancelled) {
      return res.status(404).json({ error: 'Active execution not found' });
    }
    
    res.json({ success: true, message: 'Execution cancelled' });
  } catch (error) {
    console.error('[Flows API] Error cancelling execution:', error);
    res.status(500).json({ error: error.message });
  }
});

// =============================================================================
// FLOW TEMPLATES
// =============================================================================

/**
 * GET /api/flows/templates
 * Get built-in flow templates
 */
router.get('/templates/list', (_req, res) => {
  const templates = [
    {
      id: 'template-git-commit',
      name: 'Git Commit with AI Message',
      description: 'Stage changes, generate commit message with AI, and commit',
      nodes: [
        {
          id: '1',
          type: 'command',
          position: { x: 100, y: 100 },
          data: { command: 'git status --porcelain', label: 'Check Git Status' }
        },
        {
          id: '2',
          type: 'condition',
          position: { x: 100, y: 200 },
          data: { condition: '{{1.stdout}}.length > 0', label: 'Has Changes?' }
        },
        {
          id: '3',
          type: 'command',
          position: { x: 100, y: 300 },
          data: { command: 'git diff --staged', label: 'Get Staged Diff' }
        },
        {
          id: '4',
          type: 'ai-reasoning',
          position: { x: 100, y: 400 },
          data: { 
            prompt: 'Generate a concise git commit message for these changes:\n\n{{3.stdout}}',
            label: 'Generate Commit Message'
          }
        },
      ],
      edges: [
        { id: 'e1-2', source: '1', target: '2' },
        { id: 'e2-3', source: '2', target: '3', sourceHandle: 'true' },
        { id: 'e3-4', source: '3', target: '4' },
      ]
    },
    {
      id: 'template-npm-audit',
      name: 'NPM Security Audit',
      description: 'Run npm audit and analyze vulnerabilities with AI',
      nodes: [
        {
          id: '1',
          type: 'command',
          position: { x: 100, y: 100 },
          data: { command: 'npm audit --json', label: 'Run NPM Audit' }
        },
        {
          id: '2',
          type: 'ai-reasoning',
          position: { x: 100, y: 200 },
          data: { 
            prompt: 'Analyze this npm audit report and summarize the critical issues:\n\n{{1.stdout}}',
            label: 'Analyze Vulnerabilities'
          }
        },
      ],
      edges: [
        { id: 'e1-2', source: '1', target: '2' },
      ]
    },
    {
      id: 'template-test-deploy',
      name: 'Test and Deploy',
      description: 'Run tests, build, and deploy if tests pass',
      nodes: [
        {
          id: '1',
          type: 'command',
          position: { x: 100, y: 100 },
          data: { command: 'npm test', label: 'Run Tests' }
        },
        {
          id: '2',
          type: 'condition',
          position: { x: 100, y: 200 },
          data: { condition: '{{1.exitCode}} === 0', label: 'Tests Passed?' }
        },
        {
          id: '3',
          type: 'command',
          position: { x: 100, y: 300 },
          data: { command: 'npm run build', label: 'Build' }
        },
        {
          id: '4',
          type: 'command',
          position: { x: 300, y: 300 },
          data: { command: 'echo "Tests failed, skipping deploy"', label: 'Skip Deploy' }
        },
      ],
      edges: [
        { id: 'e1-2', source: '1', target: '2' },
        { id: 'e2-3', source: '2', target: '3', sourceHandle: 'true' },
        { id: 'e2-4', source: '2', target: '4', sourceHandle: 'false' },
      ]
    },
  ];
  
  res.json({ templates });
});

module.exports = router;
