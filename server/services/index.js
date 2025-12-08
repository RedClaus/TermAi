/**
 * Server Services Index
 *
 * Central export point for all server-side services.
 * This simplifies imports throughout the server codebase.
 *
 * Usage:
 *   const { ContextInferenceEngine, KnowledgeEngine } = require('./services');
 *   const { frameworks, parsers } = require('./services');
 */

module.exports = {
  // Context & Intelligence (RAPID Framework)
  ContextInferenceEngine: require('./ContextInferenceEngine'),
  IntentClassifier: require('./IntentClassifier'),
  SmartResponseGenerator: require('./SmartResponseGenerator'),
  RAPIDPrompt: require('./RAPIDPrompt'),

  // Knowledge & Learning
  KnowledgeEngine: require('./KnowledgeEngine'),
  ExtractionEngine: require('./ExtractionEngine'),
  IngestionService: require('./IngestionService'),

  // Session & Flow Management
  SessionManager: require('./SessionManager'),
  FlowEngine: require('./FlowEngine'),

  // File Processing
  FileProcessor: require('./FileProcessor'),

  // Thinking Frameworks (subsystem)
  frameworks: require('./frameworks'),

  // Conversation Parsers (subsystem)
  parsers: require('./parsers'),

  // PTY (Terminal)
  PTYAdapter: require('./PTYAdapter').PTYAdapter,
  getDefaultAdapter: require('./PTYAdapter').getDefaultAdapter,
};
