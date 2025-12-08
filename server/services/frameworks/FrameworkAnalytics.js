/**
 * FrameworkAnalytics - Tracking and Learning for Thinking Frameworks
 *
 * Tracks framework effectiveness, learns from executions, and provides
 * adaptive framework selection based on historical success patterns.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const ANALYTICS_FILE = path.join(DATA_DIR, 'framework_analytics.json');

/**
 * @typedef {Object} ExecutionRecord
 * @property {string} id - Unique execution ID
 * @property {string} sessionId - Session identifier
 * @property {string} framework - Framework type used
 * @property {string} intent - Classified intent
 * @property {boolean} success - Whether execution succeeded
 * @property {number} duration - Execution duration in ms
 * @property {number} iterations - Number of framework iterations
 * @property {number} steps - Number of steps taken
 * @property {string[]} keywords - Keywords from the problem
 * @property {number} timestamp - When recorded
 */

/**
 * @typedef {Object} FrameworkStats
 * @property {number} totalExecutions - Total times this framework was used
 * @property {number} successCount - Number of successful executions
 * @property {number} failCount - Number of failed executions
 * @property {number} avgDuration - Average execution duration
 * @property {number} avgIterations - Average iterations needed
 * @property {Object} intentBreakdown - Success rate by intent type
 */

class FrameworkAnalytics {
  constructor() {
    this.data = {
      executions: [],
      frameworkStats: {},
      intentFrameworkMatrix: {},
      lastUpdated: null
    };
    this.loaded = false;
  }

  /**
   * Load analytics data from file
   */
  load() {
    if (this.loaded) return;

    try {
      if (fs.existsSync(ANALYTICS_FILE)) {
        const content = fs.readFileSync(ANALYTICS_FILE, 'utf-8');
        this.data = JSON.parse(content);
        console.log(`[Analytics] Loaded ${this.data.executions.length} execution records`);
      }
      this.loaded = true;
    } catch (error) {
      console.error('[Analytics] Error loading data:', error.message);
      this.loaded = true; // Prevent retries
    }
  }

  /**
   * Save analytics data to file
   */
  save() {
    try {
      // Ensure data directory exists
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      this.data.lastUpdated = Date.now();

      fs.writeFileSync(
        ANALYTICS_FILE,
        JSON.stringify(this.data, null, 2),
        'utf-8'
      );
    } catch (error) {
      console.error('[Analytics] Error saving data:', error.message);
    }
  }

  /**
   * Record a framework execution
   * @param {string} sessionId - Session identifier
   * @param {string} framework - Framework type used
   * @param {string} intent - Classified intent
   * @param {Object} result - Execution result
   */
  recordExecution(sessionId, framework, intent, result) {
    this.load();

    const record = {
      id: `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sessionId,
      framework,
      intent: intent || 'unknown',
      success: result.success === true,
      duration: result.duration || 0,
      iterations: result.loopCount || result.iterations || 1,
      steps: result.steps?.length || 0,
      keywords: result.keywords || [],
      timestamp: Date.now()
    };

    this.data.executions.push(record);

    // Update framework stats
    this.updateFrameworkStats(framework, record);

    // Update intent-framework matrix
    this.updateIntentMatrix(framework, intent, record.success);

    // Keep only last 1000 records
    if (this.data.executions.length > 1000) {
      this.data.executions = this.data.executions.slice(-1000);
    }

    this.save();

    console.log(`[Analytics] Recorded ${framework} execution for ${intent}: ${record.success ? 'success' : 'failed'}`);

    return record;
  }

  /**
   * Update framework statistics
   * @param {string} framework - Framework type
   * @param {ExecutionRecord} record - Execution record
   */
  updateFrameworkStats(framework, record) {
    if (!this.data.frameworkStats[framework]) {
      this.data.frameworkStats[framework] = {
        totalExecutions: 0,
        successCount: 0,
        failCount: 0,
        totalDuration: 0,
        totalIterations: 0,
        totalSteps: 0,
        intentBreakdown: {}
      };
    }

    const stats = this.data.frameworkStats[framework];
    stats.totalExecutions++;
    stats.totalDuration += record.duration;
    stats.totalIterations += record.iterations;
    stats.totalSteps += record.steps;

    if (record.success) {
      stats.successCount++;
    } else {
      stats.failCount++;
    }

    // Track intent breakdown
    if (!stats.intentBreakdown[record.intent]) {
      stats.intentBreakdown[record.intent] = { success: 0, total: 0 };
    }
    stats.intentBreakdown[record.intent].total++;
    if (record.success) {
      stats.intentBreakdown[record.intent].success++;
    }
  }

  /**
   * Update intent-framework success matrix
   * @param {string} framework - Framework type
   * @param {string} intent - Intent type
   * @param {boolean} success - Whether execution succeeded
   */
  updateIntentMatrix(framework, intent, success) {
    if (!this.data.intentFrameworkMatrix[intent]) {
      this.data.intentFrameworkMatrix[intent] = {};
    }

    if (!this.data.intentFrameworkMatrix[intent][framework]) {
      this.data.intentFrameworkMatrix[intent][framework] = {
        success: 0,
        total: 0
      };
    }

    this.data.intentFrameworkMatrix[intent][framework].total++;
    if (success) {
      this.data.intentFrameworkMatrix[intent][framework].success++;
    }
  }

  /**
   * Get success rates by framework
   * @returns {Object} Success rates
   */
  getSuccessRates() {
    this.load();

    const rates = {};
    for (const [framework, stats] of Object.entries(this.data.frameworkStats)) {
      rates[framework] = {
        successRate: stats.totalExecutions > 0
          ? stats.successCount / stats.totalExecutions
          : 0,
        totalExecutions: stats.totalExecutions,
        avgDuration: stats.totalExecutions > 0
          ? stats.totalDuration / stats.totalExecutions
          : 0,
        avgIterations: stats.totalExecutions > 0
          ? stats.totalIterations / stats.totalExecutions
          : 0,
        avgSteps: stats.totalExecutions > 0
          ? stats.totalSteps / stats.totalExecutions
          : 0
      };
    }
    return rates;
  }

  /**
   * Get adjusted weights for framework selection based on historical success
   * @param {string} intent - Intent type
   * @returns {Object} Framework weights (multipliers)
   */
  getAdjustedWeights(intent) {
    this.load();

    const weights = {};
    const intentData = this.data.intentFrameworkMatrix[intent] || {};

    // Calculate base weights from overall success rates
    const successRates = this.getSuccessRates();

    for (const [framework, stats] of Object.entries(this.data.frameworkStats)) {
      // Start with baseline weight of 1.0
      let weight = 1.0;

      // Adjust based on overall success rate
      const overallRate = successRates[framework]?.successRate || 0.5;
      weight *= (0.5 + overallRate); // Range: 0.5 to 1.5

      // Adjust based on intent-specific success rate
      const intentStats = intentData[framework];
      if (intentStats && intentStats.total >= 3) {
        const intentRate = intentStats.success / intentStats.total;
        // Weight intent-specific data more heavily
        weight *= (0.7 + intentRate * 0.6); // Range: 0.7 to 1.3
      }

      weights[framework] = Math.round(weight * 100) / 100;
    }

    return weights;
  }

  /**
   * Get best framework for an intent based on historical data
   * @param {string} intent - Intent type
   * @param {string[]} candidates - Candidate frameworks
   * @returns {Object|null} Best framework or null
   */
  getBestFramework(intent, candidates) {
    this.load();

    const weights = this.getAdjustedWeights(intent);

    let bestFramework = null;
    let bestScore = 0;

    for (const framework of candidates) {
      const weight = weights[framework] || 1.0;
      const stats = this.data.frameworkStats[framework];

      // Score = weight * (confidence from data quantity)
      // More executions = more confidence in the weight
      const confidence = stats
        ? Math.min(1, stats.totalExecutions / 10)
        : 0.5;

      const score = weight * (0.5 + confidence * 0.5);

      if (score > bestScore) {
        bestScore = score;
        bestFramework = {
          framework,
          weight,
          score,
          stats: stats || null
        };
      }
    }

    return bestFramework;
  }

  /**
   * Analyze success patterns across executions
   * @returns {Object} Pattern analysis
   */
  analyzeSuccessPatterns() {
    this.load();

    const patterns = {
      bestFrameworksByIntent: {},
      underperforming: [],
      recommendations: []
    };

    // Find best framework for each intent
    for (const [intent, frameworkData] of Object.entries(this.data.intentFrameworkMatrix)) {
      let bestFramework = null;
      let bestRate = 0;

      for (const [framework, stats] of Object.entries(frameworkData)) {
        if (stats.total >= 3) { // Minimum sample size
          const rate = stats.success / stats.total;
          if (rate > bestRate) {
            bestRate = rate;
            bestFramework = {
              framework,
              successRate: rate,
              executions: stats.total
            };
          }
        }
      }

      if (bestFramework) {
        patterns.bestFrameworksByIntent[intent] = bestFramework;
      }
    }

    // Find underperforming frameworks
    const successRates = this.getSuccessRates();
    for (const [framework, data] of Object.entries(successRates)) {
      if (data.totalExecutions >= 5 && data.successRate < 0.4) {
        patterns.underperforming.push({
          framework,
          successRate: data.successRate,
          executions: data.totalExecutions,
          recommendation: `Consider reviewing ${framework} usage or improving its prompts`
        });
      }
    }

    // Generate recommendations
    for (const [intent, best] of Object.entries(patterns.bestFrameworksByIntent)) {
      patterns.recommendations.push({
        intent,
        recommendation: `For ${intent} tasks, prefer ${best.framework} (${Math.round(best.successRate * 100)}% success rate)`
      });
    }

    return patterns;
  }

  /**
   * Get recent executions for a session
   * @param {string} sessionId - Session identifier
   * @param {number} limit - Max records to return
   * @returns {ExecutionRecord[]} Recent executions
   */
  getSessionHistory(sessionId, limit = 10) {
    this.load();

    return this.data.executions
      .filter(e => e.sessionId === sessionId)
      .slice(-limit)
      .reverse();
  }

  /**
   * Get global statistics
   * @returns {Object} Global stats
   */
  getGlobalStats() {
    this.load();

    const totalExecutions = this.data.executions.length;
    const successfulExecutions = this.data.executions.filter(e => e.success).length;

    return {
      totalExecutions,
      successfulExecutions,
      overallSuccessRate: totalExecutions > 0
        ? successfulExecutions / totalExecutions
        : 0,
      frameworkCount: Object.keys(this.data.frameworkStats).length,
      intentCount: Object.keys(this.data.intentFrameworkMatrix).length,
      lastUpdated: this.data.lastUpdated,
      frameworkStats: this.data.frameworkStats
    };
  }

  /**
   * Clear all analytics data (for testing)
   */
  clear() {
    this.data = {
      executions: [],
      frameworkStats: {},
      intentFrameworkMatrix: {},
      lastUpdated: null
    };
    this.save();
    console.log('[Analytics] Cleared all data');
  }
}

// Singleton instance
const analytics = new FrameworkAnalytics();

module.exports = {
  FrameworkAnalytics,
  analytics
};
