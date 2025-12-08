/**
 * Ingestion System Type Definitions
 * JSDoc types for conversation import and knowledge extraction
 */

/**
 * Supported conversation export sources
 * @typedef {'claude'|'chatgpt'|'warp'|'cursor'|'cline'|'aider'|'github-copilot'|'terminal-raw'|'markdown'|'custom'} ConversationSource
 */

/**
 * Code block extracted from conversation
 * @typedef {Object} CodeBlock
 * @property {string} language - Programming language or 'bash'/'shell'
 * @property {string} content - The code content
 * @property {boolean} isCommand - True if this is a shell command
 */

/**
 * Tool call from AI assistants
 * @typedef {Object} ToolCall
 * @property {string} name - Tool name
 * @property {Object} input - Tool input parameters
 * @property {string} [output] - Tool output if available
 */

/**
 * Single message in a conversation
 * @typedef {Object} ConversationMessage
 * @property {'user'|'assistant'|'system'|'tool'} role
 * @property {string} content
 * @property {string} [timestamp]
 * @property {Object} [metadata]
 * @property {CodeBlock[]} [metadata.codeBlocks]
 * @property {ToolCall[]} [metadata.toolCalls]
 * @property {string} [metadata.errorOutput]
 */

/**
 * Imported conversation from external source
 * @typedef {Object} ImportedConversation
 * @property {string} id - Unique ID for this import
 * @property {ConversationSource} source - Where this came from
 * @property {string} sourceFile - Original filename
 * @property {string} importedAt - ISO timestamp
 * @property {ConversationMessage[]} messages - The conversation messages
 * @property {Object} metadata
 * @property {string} [metadata.originalId] - ID from source system
 * @property {string} [metadata.title] - Conversation title
 * @property {string} [metadata.createdAt] - Original creation date
 * @property {string} [metadata.model] - AI model used
 * @property {string[]} [metadata.tags] - Any tags/labels
 */

/**
 * Solution step in extracted knowledge
 * @typedef {Object} SolutionStep
 * @property {'command'|'check'|'explanation'|'file_edit'} type
 * @property {string} content
 * @property {string} [description] - Optional explanation
 */

/**
 * Inferred context from conversation
 * @typedef {Object} InferredContext
 * @property {string} [os] - 'darwin'|'linux'|'windows'
 * @property {string} [shell] - 'bash'|'zsh'|'powershell'
 * @property {string} [packageManager] - 'npm'|'yarn'|'pip'|'brew'|'apt'
 * @property {string} [language] - Primary programming language
 * @property {string} [framework] - Framework if detected
 * @property {string[]} [tools] - Tools/services mentioned
 */

/**
 * Candidate knowledge pattern extracted from conversation
 * @typedef {Object} ExtractionCandidate
 * @property {string} id
 * @property {string} conversationId - Reference to source conversation
 * @property {number} confidence - 0-1, extraction confidence
 * @property {Object} problem
 * @property {string} problem.description - What went wrong
 * @property {string} [problem.errorText] - Exact error message
 * @property {string[]} problem.errorPatterns - Regex patterns to match similar errors
 * @property {string} [problem.triggerCommand] - Command that caused the issue
 * @property {[number, number]} problem.messageRange - Start/end message indices
 * @property {Object} solution
 * @property {string} solution.description - What fixed it
 * @property {SolutionStep[]} solution.steps - Steps to resolve
 * @property {[number, number]} solution.messageRange - Start/end message indices
 * @property {boolean} solution.wasSuccessful - Did this actually work?
 * @property {InferredContext} inferredContext
 * @property {'pending'|'approved'|'rejected'|'merged'} status
 * @property {string} [reviewNotes] - Notes from human review
 * @property {string} [mergedIntoId] - If merged, the target skill ID
 */

/**
 * File status in an ingestion job
 * @typedef {Object} IngestionFileStatus
 * @property {string} name - Filename
 * @property {number} size - File size in bytes
 * @property {ConversationSource} detectedFormat - Detected parser
 * @property {'pending'|'processing'|'complete'|'failed'} status
 * @property {string} [error] - Error message if failed
 * @property {number} [conversationsFound] - Count from this file
 */

/**
 * Progress update for ingestion job
 * @typedef {Object} IngestionProgress
 * @property {number} current - Current item index
 * @property {number} total - Total items
 * @property {string} phase - Human-readable phase description
 */

/**
 * Results summary for ingestion job
 * @typedef {Object} IngestionResults
 * @property {number} conversationsFound - Total conversations parsed
 * @property {number} candidatesExtracted - Knowledge patterns found
 * @property {string[]} errors - Any error messages
 */

/**
 * Ingestion job tracking
 * @typedef {Object} IngestionJob
 * @property {string} id
 * @property {'queued'|'parsing'|'extracting'|'complete'|'failed'} status
 * @property {IngestionFileStatus[]} files
 * @property {IngestionProgress} progress
 * @property {IngestionResults} results
 * @property {string} createdAt - ISO timestamp
 * @property {string} [completedAt] - ISO timestamp
 */

/**
 * Conversation segment identified for extraction
 * @typedef {Object} ConversationSegment
 * @property {number} startIndex - Start message index
 * @property {number} endIndex - End message index
 * @property {'installation_error'|'configuration'|'runtime_error'|'how_to'|'debugging'|'refactoring'} problemType
 * @property {string} briefDescription
 * @property {boolean} wasResolved
 * @property {number} confidence - 0-1
 */

module.exports = {
  // Export empty object - types are used via JSDoc imports
  // Example: const { ExtractionCandidate } = require('./types/ingestion');
  // Actually used as: /** @type {import('./types/ingestion').ExtractionCandidate} */
};
