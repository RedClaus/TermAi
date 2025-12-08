/**
 * Context API Routes
 *
 * Part of the RAPID Framework (Reduce AI Prompt Iteration Depth)
 *
 * Endpoints for gathering and managing terminal context.
 */

const express = require('express');
const router = express.Router();

const { getContextInferenceEngine } = require('../services/ContextInferenceEngine');
const { getIntentClassifier } = require('../services/IntentClassifier');
const { getSmartResponseGenerator } = require('../services/SmartResponseGenerator');
const { buildContextSummary } = require('../services/RAPIDPrompt');

// Get singleton instances
const contextEngine = getContextInferenceEngine();
const intentClassifier = getIntentClassifier();
const responseGenerator = getSmartResponseGenerator();

/**
 * POST /api/context/gather
 *
 * Gather full context for a session.
 * Call this when a session starts or periodically to update context.
 *
 * Body: { sessionId: string, cwd?: string }
 * Response: Full context object
 */
router.post('/gather', async (req, res) => {
  try {
    const { sessionId, cwd } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    console.log(`[Context] Gathering context for session: ${sessionId}`);
    const startTime = Date.now();

    const context = await contextEngine.gatherContext(sessionId, cwd);

    console.log(`[Context] Gathered in ${Date.now() - startTime}ms, completeness: ${Math.round(context.contextCompleteness * 100)}%`);

    res.json({
      success: true,
      context,
      summary: buildContextSummary(context)
    });
  } catch (error) {
    console.error('[Context] Error gathering context:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/context/record-command
 *
 * Record a command execution for context tracking.
 * Call this after every command completes.
 *
 * Body: {
 *   sessionId: string,
 *   command: string,
 *   cwd: string,
 *   result: { exitCode: number, output: string, duration?: number }
 * }
 */
router.post('/record-command', (req, res) => {
  try {
    const { sessionId, command, cwd, result } = req.body;

    if (!sessionId || !command) {
      return res.status(400).json({ error: 'sessionId and command are required' });
    }

    contextEngine.recordCommand(sessionId, command, cwd, result || { exitCode: 0, output: '' });

    res.json({ success: true });
  } catch (error) {
    console.error('[Context] Error recording command:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/context/classify
 *
 * Classify user intent from a message.
 * Useful for understanding what type of problem the user has.
 *
 * Body: { sessionId: string, message: string, cwd?: string }
 * Response: Intent classification with gaps analysis
 */
router.post('/classify', async (req, res) => {
  try {
    const { sessionId, message, cwd } = req.body;

    if (!sessionId || !message) {
      return res.status(400).json({ error: 'sessionId and message are required' });
    }

    // Get context first
    const context = await contextEngine.gatherContext(sessionId, cwd);

    // Classify intent
    const intent = intentClassifier.classify(message, context);

    res.json({
      success: true,
      intent,
      context: buildContextSummary(context)
    });
  } catch (error) {
    console.error('[Context] Error classifying intent:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/context/strategy
 *
 * Get full response strategy for a user message.
 * Returns context, intent, strategy, and enhanced system prompt.
 *
 * Body: { sessionId: string, message: string, cwd?: string }
 * Response: Complete strategy data including system prompt
 */
router.post('/strategy', async (req, res) => {
  try {
    const { sessionId, message, cwd } = req.body;

    if (!sessionId || !message) {
      return res.status(400).json({ error: 'sessionId and message are required' });
    }

    const strategyData = await responseGenerator.generateStrategy(message, sessionId, cwd);

    res.json({
      success: true,
      strategy: strategyData.strategy,
      intent: strategyData.intent,
      context: buildContextSummary(strategyData.context),
      systemPrompt: strategyData.systemPrompt
    });
  } catch (error) {
    console.error('[Context] Error generating strategy:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/context/summary
 *
 * Get a quick context summary for display in UI.
 * Faster than full gather, uses cached data when possible.
 *
 * Query: ?sessionId=xxx&cwd=yyy
 */
router.get('/summary', async (req, res) => {
  try {
    const { sessionId, cwd } = req.query;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    const context = await contextEngine.gatherContext(sessionId, cwd);
    const summary = buildContextSummary(context);

    res.json({
      success: true,
      summary
    });
  } catch (error) {
    console.error('[Context] Error getting summary:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/context/last-error
 *
 * Get the last error for a session.
 * Quick lookup for error context.
 *
 * Query: ?sessionId=xxx
 */
router.get('/last-error', (req, res) => {
  try {
    const { sessionId } = req.query;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    const lastError = contextEngine.getLastError(sessionId);

    res.json({
      success: true,
      hasError: lastError !== null,
      error: lastError
    });
  } catch (error) {
    console.error('[Context] Error getting last error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/context/session/:sessionId
 *
 * Clear context for a session.
 * Call when session ends or user wants fresh context.
 */
router.delete('/session/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;

    contextEngine.clearSession(sessionId);

    res.json({ success: true, message: `Context cleared for session ${sessionId}` });
  } catch (error) {
    console.error('[Context] Error clearing session:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/context/generate-question
 *
 * Generate a compound question for missing context.
 * Useful when strategy is 'ask'.
 *
 * Body: { gaps: Array<{ field, importance, question }> }
 */
router.post('/generate-question', (req, res) => {
  try {
    const { gaps } = req.body;

    if (!gaps || !Array.isArray(gaps)) {
      return res.status(400).json({ error: 'gaps array is required' });
    }

    const question = intentClassifier.generateCompoundQuestion(gaps);

    res.json({
      success: true,
      question
    });
  } catch (error) {
    console.error('[Context] Error generating question:', error);
    res.status(500).json({ error: error.message });
  }
});

// Export router and setter for LLM chat function
module.exports = router;

// Allow setting LLM chat function after initialization
module.exports.setLLMChat = function(llmChat) {
  intentClassifier.setLLMChat(llmChat);
  responseGenerator.setLLMChat(llmChat);
};
