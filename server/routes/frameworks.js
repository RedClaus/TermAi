const express = require('express');
const router = express.Router();
const {
  FrameworkSelector,
  stateManager,
  getAvailableFrameworks,
  getRegistryStats,
  FRAMEWORK_DEFINITIONS,
  orchestrator,
  analytics
} = require('../services/frameworks');
const { llmChat } = require('./llm');

/**
 * POST /select - Select best framework for a task
 * Body: { message: string, intent?: string, context?: object, onlyRegistered?: boolean }
 * Returns: { matches: FrameworkMatch[], recommended: FrameworkMatch }
 */
router.post('/select', async (req, res) => {
  try {
    const { message, intent, context, onlyRegistered = true } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }

    const selector = new FrameworkSelector();
    let matches = selector.getAllMatches(message, intent || 'unknown', context || {});

    // Filter to only registered frameworks if requested (default: true)
    if (onlyRegistered) {
      const registeredFrameworks = getAvailableFrameworks();
      matches = matches.filter(m => registeredFrameworks.includes(m.framework));
    }

    res.json({
      matches,
      recommended: matches[0] || null
    });
  } catch (error) {
    console.error('[Frameworks] Error selecting framework:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /execute - Start executing a framework
 * Body: { sessionId: string, framework: FrameworkType, problem: string, context?: object }
 * Returns: { state: FrameworkState }
 */
router.post('/execute', async (req, res) => {
  try {
    const { sessionId, framework, problem, context } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }
    if (!framework) {
      return res.status(400).json({ error: 'framework is required' });
    }
    if (!problem) {
      return res.status(400).json({ error: 'problem is required' });
    }

    // Start framework in state manager
    const state = stateManager.startFramework(sessionId, framework, problem);

    // Add initial context if provided
    if (context) {
      stateManager.updateState(sessionId, { context: { ...state.context, ...context } });
    }

    res.json({ state: stateManager.getState(sessionId) });
  } catch (error) {
    console.error('[Frameworks] Error executing framework:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /state/:sessionId - Get current framework state
 * Returns: { state: FrameworkState | null, hasActive: boolean }
 */
router.get('/state/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;

    const state = stateManager.getState(sessionId);
    const hasActive = stateManager.hasActiveFramework(sessionId);

    res.json({ state, hasActive });
  } catch (error) {
    console.error('[Frameworks] Error getting state:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /step/:sessionId - Add a step to current execution
 * Body: { phase: string, thought: string, action?: string, result?: object, confidence?: number }
 * Returns: { step: ThinkingStep, state: FrameworkState }
 */
router.post('/step/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { phase, thought, action, result, confidence } = req.body;

    const state = stateManager.getState(sessionId);
    if (!state) {
      return res.status(404).json({ error: 'No active framework for this session' });
    }

    const step = {
      phase: phase || state.phase,
      thought: thought || '',
      action,
      result,
      confidence: confidence || 0.5
    };

    stateManager.addStep(sessionId, step);

    if (phase) {
      stateManager.setPhase(sessionId, phase);
    }

    const updatedState = stateManager.getState(sessionId);
    const addedStep = updatedState.steps[updatedState.steps.length - 1];

    res.json({ step: addedStep, state: updatedState });
  } catch (error) {
    console.error('[Frameworks] Error adding step:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /pause/:sessionId - Pause framework execution
 * Returns: { state: FrameworkState }
 */
router.post('/pause/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;

    const state = stateManager.pauseFramework(sessionId);
    if (!state) {
      return res.status(404).json({ error: 'No active framework for this session' });
    }

    res.json({ state });
  } catch (error) {
    console.error('[Frameworks] Error pausing framework:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /resume/:sessionId - Resume framework execution
 * Returns: { state: FrameworkState }
 */
router.post('/resume/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;

    const state = stateManager.resumeFramework(sessionId);
    if (!state) {
      return res.status(404).json({ error: 'No framework to resume for this session' });
    }

    res.json({ state });
  } catch (error) {
    console.error('[Frameworks] Error resuming framework:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /complete/:sessionId - Complete framework execution
 * Body: { result: FrameworkResult }
 * Returns: { result: FrameworkResult }
 */
router.post('/complete/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const { result } = req.body;

    if (!result) {
      return res.status(400).json({ error: 'result is required' });
    }

    const completedResult = stateManager.completeFramework(sessionId, result);
    res.json({ result: completedResult });
  } catch (error) {
    console.error('[Frameworks] Error completing framework:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /history/:sessionId - Get execution history
 * Query: limit (default 10)
 * Returns: { history: FrameworkResult[] }
 */
router.get('/history/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const limit = parseInt(req.query.limit) || 10;

    const history = stateManager.getHistory(sessionId, limit);
    res.json({ history });
  } catch (error) {
    console.error('[Frameworks] Error getting history:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /available - Get list of available frameworks
 * Returns: { frameworks: string[], definitions: object }
 */
router.get('/available', (req, res) => {
  try {
    const frameworks = getAvailableFrameworks();
    const stats = getRegistryStats();

    res.json({
      frameworks,
      definitions: FRAMEWORK_DEFINITIONS,
      stats
    });
  } catch (error) {
    console.error('[Frameworks] Error getting available frameworks:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /definitions - Get all framework definitions
 * Returns: { definitions: object }
 */
router.get('/definitions', (req, res) => {
  try {
    res.json({ definitions: FRAMEWORK_DEFINITIONS });
  } catch (error) {
    console.error('[Frameworks] Error getting definitions:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===========================================
// ORCHESTRATOR ENDPOINTS (Phase 5)
// ===========================================

/**
 * POST /orchestrate/analyze - Analyze a message for framework usage
 * Body: { message: string, sessionId: string, context?: object }
 * Returns: { shouldUseFramework: boolean, framework?: string, confidence?: number, ... }
 */
router.post('/orchestrate/analyze', async (req, res) => {
  try {
    const { message, sessionId, context } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    const analysis = await orchestrator.analyzeMessage(message, sessionId, context || {});
    res.json(analysis);
  } catch (error) {
    console.error('[Frameworks] Error analyzing message:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /orchestrate/start - Start framework execution via orchestrator
 * Body: { sessionId: string, framework: string, problem: string, context?: object }
 * Returns: { framework: string, state: FrameworkState }
 */
router.post('/orchestrate/start', async (req, res) => {
  try {
    const { sessionId, framework, problem, context } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }
    if (!framework) {
      return res.status(400).json({ error: 'framework is required' });
    }
    if (!problem) {
      return res.status(400).json({ error: 'problem is required' });
    }

    const result = await orchestrator.startFramework(
      sessionId,
      framework,
      problem,
      context || {},
      llmChat
    );

    res.json({
      framework: result.framework,
      state: result.state
    });
  } catch (error) {
    console.error('[Frameworks] Error starting framework:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /orchestrate/step/:sessionId - Execute a step via orchestrator
 * Body: { input: string, options?: object }
 * Returns: { step result with next action }
 */
router.post('/orchestrate/step/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { input, options } = req.body;

    const result = await orchestrator.executeStep(sessionId, input || '', options || {});
    res.json(result);
  } catch (error) {
    console.error('[Frameworks] Error executing step:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /orchestrate/complete/:sessionId - Complete framework via orchestrator
 * Body: { result: object }
 * Returns: { final result }
 */
router.post('/orchestrate/complete/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { result } = req.body;

    if (!result) {
      return res.status(400).json({ error: 'result is required' });
    }

    const finalResult = await orchestrator.completeFramework(sessionId, result);
    res.json({ result: finalResult });
  } catch (error) {
    console.error('[Frameworks] Error completing framework:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /orchestrate/cancel/:sessionId - Cancel framework execution
 * Body: { reason?: string }
 * Returns: { cancelled: boolean, reason: string }
 */
router.post('/orchestrate/cancel/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const { reason } = req.body;

    const result = orchestrator.cancelFramework(sessionId, reason);
    res.json(result);
  } catch (error) {
    console.error('[Frameworks] Error cancelling framework:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /orchestrate/state/:sessionId - Get orchestrator state
 * Returns: { state, hasActive }
 */
router.get('/orchestrate/state/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;

    const state = orchestrator.getState(sessionId);
    const hasActive = orchestrator.hasActiveFramework(sessionId);

    res.json({ state, hasActive });
  } catch (error) {
    console.error('[Frameworks] Error getting orchestrator state:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /orchestrate/enhance-prompt - Build enhanced system prompt with framework context
 * Body: { basePrompt: string, sessionId: string }
 * Returns: { enhancedPrompt: string }
 */
router.post('/orchestrate/enhance-prompt', (req, res) => {
  try {
    const { basePrompt, sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    const enhancedPrompt = orchestrator.buildEnhancedPrompt(basePrompt || '', sessionId);
    res.json({ enhancedPrompt });
  } catch (error) {
    console.error('[Frameworks] Error enhancing prompt:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /orchestrate/parse-response - Parse LLM response for framework actions
 * Body: { response: string, sessionId: string }
 * Returns: { parsed response with framework actions }
 */
router.post('/orchestrate/parse-response', (req, res) => {
  try {
    const { response, sessionId } = req.body;

    if (!response) {
      return res.status(400).json({ error: 'response is required' });
    }
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    const parsed = orchestrator.parseFrameworkResponse(response, sessionId);
    res.json(parsed);
  } catch (error) {
    console.error('[Frameworks] Error parsing response:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /orchestrate/stats - Get orchestrator statistics
 * Returns: { activeExecutions, confidenceThreshold, availableFrameworks }
 */
router.get('/orchestrate/stats', (req, res) => {
  try {
    const stats = orchestrator.getStats();
    res.json(stats);
  } catch (error) {
    console.error('[Frameworks] Error getting orchestrator stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===========================================
// ANALYTICS ENDPOINTS (Phase 5)
// ===========================================

/**
 * POST /analytics/record - Record a framework execution
 * Body: { sessionId: string, framework: string, intent: string, result: object }
 * Returns: { record: ExecutionRecord }
 */
router.post('/analytics/record', (req, res) => {
  try {
    const { sessionId, framework, intent, result } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }
    if (!framework) {
      return res.status(400).json({ error: 'framework is required' });
    }
    if (!result) {
      return res.status(400).json({ error: 'result is required' });
    }

    const record = analytics.recordExecution(sessionId, framework, intent || 'unknown', result);
    res.json({ record });
  } catch (error) {
    console.error('[Frameworks] Error recording execution:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /analytics/stats - Get global analytics statistics
 * Returns: { totalExecutions, successRate, frameworkStats, ... }
 */
router.get('/analytics/stats', (req, res) => {
  try {
    const stats = analytics.getGlobalStats();
    res.json(stats);
  } catch (error) {
    console.error('[Frameworks] Error getting analytics stats:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /analytics/success-rates - Get success rates by framework
 * Returns: { frameworkName: { successRate, totalExecutions, avgDuration, ... } }
 */
router.get('/analytics/success-rates', (req, res) => {
  try {
    const rates = analytics.getSuccessRates();
    res.json(rates);
  } catch (error) {
    console.error('[Frameworks] Error getting success rates:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /analytics/weights/:intent - Get adjusted weights for framework selection
 * Returns: { frameworkName: weight }
 */
router.get('/analytics/weights/:intent', (req, res) => {
  try {
    const { intent } = req.params;
    const weights = analytics.getAdjustedWeights(intent);
    res.json(weights);
  } catch (error) {
    console.error('[Frameworks] Error getting weights:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /analytics/best/:intent - Get best framework for an intent
 * Query: candidates (comma-separated list)
 * Returns: { framework, weight, score, stats }
 */
router.get('/analytics/best/:intent', (req, res) => {
  try {
    const { intent } = req.params;
    const candidatesParam = req.query.candidates;

    const candidates = candidatesParam
      ? candidatesParam.split(',')
      : getAvailableFrameworks();

    const best = analytics.getBestFramework(intent, candidates);
    res.json(best || { framework: null, reason: 'No suitable framework found' });
  } catch (error) {
    console.error('[Frameworks] Error getting best framework:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /analytics/patterns - Analyze success patterns
 * Returns: { bestFrameworksByIntent, underperforming, recommendations }
 */
router.get('/analytics/patterns', (req, res) => {
  try {
    const patterns = analytics.analyzeSuccessPatterns();
    res.json(patterns);
  } catch (error) {
    console.error('[Frameworks] Error analyzing patterns:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /analytics/history/:sessionId - Get session execution history
 * Query: limit (default 10)
 * Returns: { history: ExecutionRecord[] }
 */
router.get('/analytics/history/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const limit = parseInt(req.query.limit) || 10;

    const history = analytics.getSessionHistory(sessionId, limit);
    res.json({ history });
  } catch (error) {
    console.error('[Frameworks] Error getting session history:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
