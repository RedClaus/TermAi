/**
 * ThinkingStateManager - Manages framework execution state across requests
 */

class ThinkingStateManager {
  constructor() {
    this.sessions = new Map(); // sessionId → FrameworkState
    this.history = new Map();  // sessionId → FrameworkResult[]
    this.maxHistoryPerSession = 10;

    // Auto-cleanup stale sessions every 30 minutes
    this._cleanupInterval = setInterval(() => this.cleanup(), 30 * 60 * 1000);
  }

  /**
   * Start a new framework execution
   * @param {string} sessionId - Session identifier
   * @param {string} framework - Framework type
   * @param {string} problem - Problem statement
   * @returns {Object} FrameworkState
   */
  startFramework(sessionId, framework, problem) {
    const state = {
      framework,
      phase: 'init',
      steps: [],
      loopCount: 0,
      context: {
        problem,
        startTime: Date.now(),
        lastUpdate: Date.now()
      },
      status: 'active',
      error: null
    };

    this.sessions.set(sessionId, state);
    return state;
  }

  /**
   * Update existing state with partial updates
   * @param {string} sessionId - Session identifier
   * @param {Object} updates - Partial state updates
   * @returns {Object|null} Updated state or null
   */
  updateState(sessionId, updates) {
    const state = this.sessions.get(sessionId);
    if (!state) return null;

    // Deep merge context if provided
    if (updates.context) {
      updates.context = { ...state.context, ...updates.context, lastUpdate: Date.now() };
    } else {
      state.context.lastUpdate = Date.now();
    }

    Object.assign(state, updates);
    return state;
  }

  /**
   * Get current state for a session
   * @param {string} sessionId - Session identifier
   * @returns {Object|null} FrameworkState or null
   */
  getState(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Check if session has an active framework
   * @param {string} sessionId - Session identifier
   * @returns {boolean}
   */
  hasActiveFramework(sessionId) {
    const state = this.sessions.get(sessionId);
    return state && (state.status === 'active' || state.status === 'paused');
  }

  /**
   * Pause framework execution
   * @param {string} sessionId - Session identifier
   * @returns {Object|null} Updated state or null
   */
  pauseFramework(sessionId) {
    return this.updateState(sessionId, { status: 'paused' });
  }

  /**
   * Resume framework execution
   * @param {string} sessionId - Session identifier
   * @returns {Object|null} Updated state or null
   */
  resumeFramework(sessionId) {
    return this.updateState(sessionId, { status: 'active' });
  }

  /**
   * Complete framework execution and move to history
   * @param {string} sessionId - Session identifier
   * @param {Object} result - FrameworkResult
   * @returns {Object} The result with metadata
   */
  completeFramework(sessionId, result) {
    const state = this.sessions.get(sessionId);
    if (!state) return result;

    // Enrich result with metadata
    const enrichedResult = {
      ...result,
      framework: state.framework,
      duration: Date.now() - state.context.startTime,
      completedAt: Date.now(),
      steps: state.steps
    };

    // Add to history
    if (!this.history.has(sessionId)) {
      this.history.set(sessionId, []);
    }
    const sessionHistory = this.history.get(sessionId);
    sessionHistory.unshift(enrichedResult);

    // Trim history
    if (sessionHistory.length > this.maxHistoryPerSession) {
      sessionHistory.pop();
    }

    // Remove from active sessions
    this.sessions.delete(sessionId);

    return enrichedResult;
  }

  /**
   * Mark framework as failed and move to history
   * @param {string} sessionId - Session identifier
   * @param {string} error - Error message
   * @returns {Object|null} The failed result
   */
  failFramework(sessionId, error) {
    const state = this.sessions.get(sessionId);
    if (!state) return null;

    state.status = 'failed';
    state.error = error;

    return this.completeFramework(sessionId, {
      status: 'failed',
      summary: `Framework failed: ${error}`,
      chain: state.steps,
      error
    });
  }

  /**
   * Get execution history for a session
   * @param {string} sessionId - Session identifier
   * @param {number} limit - Max results
   * @returns {Object[]} FrameworkResult[]
   */
  getHistory(sessionId, limit = 10) {
    const sessionHistory = this.history.get(sessionId) || [];
    return sessionHistory.slice(0, limit);
  }

  /**
   * Add a step to current state
   * @param {string} sessionId - Session identifier
   * @param {Object} step - ThinkingStep
   * @returns {Object|null} Updated state or null
   */
  addStep(sessionId, step) {
    const state = this.sessions.get(sessionId);
    if (!state) return null;

    // Ensure step has ID and timestamp
    if (!step.id) {
      step.id = `step_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    if (!step.timestamp) {
      step.timestamp = Date.now();
    }

    state.steps.push(step);
    state.context.lastUpdate = Date.now();

    return state;
  }

  /**
   * Update a specific step
   * @param {string} sessionId - Session identifier
   * @param {string} stepId - Step ID
   * @param {Object} updates - Step updates
   * @returns {Object|null} Updated step or null
   */
  updateStep(sessionId, stepId, updates) {
    const state = this.sessions.get(sessionId);
    if (!state) return null;

    const step = state.steps.find(s => s.id === stepId);
    if (!step) return null;

    Object.assign(step, updates);
    state.context.lastUpdate = Date.now();

    return step;
  }

  /**
   * Set current phase
   * @param {string} sessionId - Session identifier
   * @param {string} phase - Phase name
   * @returns {Object|null} Updated state or null
   */
  setPhase(sessionId, phase) {
    return this.updateState(sessionId, { phase });
  }

  /**
   * Increment loop count
   * @param {string} sessionId - Session identifier
   * @returns {number} New loop count or -1 if not found
   */
  incrementLoopCount(sessionId) {
    const state = this.sessions.get(sessionId);
    if (!state) return -1;

    state.loopCount++;
    state.context.lastUpdate = Date.now();

    return state.loopCount;
  }

  /**
   * Remove stale sessions
   * @param {number} maxAge - Max age in milliseconds (default 1 hour)
   */
  cleanup(maxAge = 3600000) {
    const now = Date.now();

    for (const [sessionId, state] of this.sessions.entries()) {
      const age = now - state.context.lastUpdate;
      if (age > maxAge) {
        console.log(`[ThinkingStateManager] Cleaning up stale session: ${sessionId}`);
        this.sessions.delete(sessionId);
      }
    }
  }

  /**
   * Get statistics about current state
   * @returns {Object} Stats
   */
  getStats() {
    const stats = {
      activeSessions: this.sessions.size,
      totalHistoryEntries: 0,
      byFramework: {},
      byStatus: { active: 0, paused: 0 }
    };

    for (const state of this.sessions.values()) {
      stats.byFramework[state.framework] = (stats.byFramework[state.framework] || 0) + 1;
      stats.byStatus[state.status] = (stats.byStatus[state.status] || 0) + 1;
    }

    for (const history of this.history.values()) {
      stats.totalHistoryEntries += history.length;
    }

    return stats;
  }

  /**
   * Destroy manager and cleanup
   */
  destroy() {
    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
    }
    this.sessions.clear();
    this.history.clear();
  }
}

// Singleton instance
const stateManager = new ThinkingStateManager();

module.exports = {
  ThinkingStateManager,
  stateManager
};
