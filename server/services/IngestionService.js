/**
 * Ingestion Service
 * Orchestrates the conversation import pipeline:
 * 1. File upload and format detection
 * 2. Parsing conversations from various sources
 * 3. Extracting knowledge patterns via LLM
 * 4. Storing candidates for review
 * 5. Approving/rejecting and merging into skills
 */

const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const EventEmitter = require('events');

const { getParserRegistry } = require('./parsers');
const ExtractionEngine = require('./ExtractionEngine');

/**
 * @typedef {import('../types/ingestion').IngestionJob} IngestionJob
 * @typedef {import('../types/ingestion').ExtractionCandidate} ExtractionCandidate
 * @typedef {import('../types/ingestion').ImportedConversation} ImportedConversation
 * @typedef {import('../types/ingestion').ConversationSource} ConversationSource
 */

// Data storage paths
const DATA_DIR = path.join(__dirname, '../data');
const JOBS_FILE = path.join(DATA_DIR, 'ingestion-jobs.json');
const CANDIDATES_FILE = path.join(DATA_DIR, 'candidates.json');
const CONVERSATIONS_FILE = path.join(DATA_DIR, 'imported-conversations.json');
const SKILLS_FILE = path.join(DATA_DIR, 'skills.json');

class IngestionService extends EventEmitter {
  constructor() {
    super();
    this.parserRegistry = getParserRegistry();
    this.extractionEngine = new ExtractionEngine();

    /** @type {Map<string, IngestionJob>} */
    this.jobs = new Map();

    // LLM function reference (set externally)
    this.llmChat = null;

    // Ensure data files exist
    this.ensureDataFiles();
  }

  /**
   * Set the LLM chat function for extraction
   * @param {Function} llmChat - (messages) => Promise<string>
   */
  setLLMChat(llmChat) {
    this.llmChat = llmChat;
    this.extractionEngine.setLLMChat(llmChat);
    console.log('[IngestionService] LLM chat function configured');
  }

  /**
   * Ensure data files exist
   */
  async ensureDataFiles() {
    try {
      await fs.access(DATA_DIR);
    } catch {
      await fs.mkdir(DATA_DIR, { recursive: true });
    }

    const files = [JOBS_FILE, CANDIDATES_FILE, CONVERSATIONS_FILE];
    for (const file of files) {
      try {
        await fs.access(file);
      } catch {
        await fs.writeFile(file, '[]', 'utf-8');
      }
    }
  }

  /**
   * Create a new ingestion job
   * @param {Array<{originalname: string, size: number, buffer: Buffer}>} files - Uploaded files
   * @returns {Promise<IngestionJob>}
   */
  async createJob(files) {
    /** @type {IngestionJob} */
    const job = {
      id: crypto.randomUUID(),
      status: 'queued',
      files: files.map(f => ({
        name: f.originalname,
        size: f.size,
        detectedFormat: 'markdown',
        status: 'pending'
      })),
      progress: {
        current: 0,
        total: files.length,
        phase: 'Queued'
      },
      results: {
        conversationsFound: 0,
        candidatesExtracted: 0,
        errors: []
      },
      createdAt: new Date().toISOString()
    };

    this.jobs.set(job.id, job);

    // Start processing asynchronously
    this.processJob(job, files).catch(e => {
      console.error(`[IngestionService] Job ${job.id} failed:`, e);
      job.status = 'failed';
      job.results.errors.push(e.message);
      this.emit(`job:${job.id}:error`, { error: e.message });
    });

    return job;
  }

  /**
   * Process an ingestion job
   * @param {IngestionJob} job
   * @param {Array<{originalname: string, buffer: Buffer}>} files
   */
  async processJob(job, files) {
    job.status = 'parsing';
    this.emit(`job:${job.id}:status`, job);

    /** @type {ImportedConversation[]} */
    const allConversations = [];
    /** @type {ExtractionCandidate[]} */
    const allCandidates = [];

    // Phase 1: Parse files
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      job.files[i].status = 'processing';
      job.progress = {
        current: i,
        total: files.length,
        phase: `Parsing ${file.originalname}`
      };
      this.emit(`job:${job.id}:progress`, job.progress);

      try {
        const content = file.buffer.toString('utf-8');
        const { parser, conversations } = this.parserRegistry.parse(content, file.originalname);

        if (!parser) {
          job.files[i].status = 'failed';
          job.files[i].error = 'Unknown format';
          job.results.errors.push(`${file.originalname}: Unknown format`);
          continue;
        }

        job.files[i].detectedFormat = parser.source;
        job.files[i].conversationsFound = conversations.length;

        // Add source file to each conversation
        conversations.forEach(c => {
          c.sourceFile = file.originalname;
        });

        allConversations.push(...conversations);
        job.results.conversationsFound += conversations.length;
        job.files[i].status = 'complete';

        console.log(`[IngestionService] Parsed ${conversations.length} conversations from ${file.originalname}`);
      } catch (error) {
        job.files[i].status = 'failed';
        job.files[i].error = error.message;
        job.results.errors.push(`${file.originalname}: ${error.message}`);
        console.error(`[IngestionService] Parse error for ${file.originalname}:`, error.message);
      }
    }

    // Store imported conversations
    await this.storeConversations(allConversations);

    // Phase 2: Extract knowledge (if LLM available)
    if (this.llmChat && allConversations.length > 0) {
      job.status = 'extracting';
      job.progress.phase = 'Extracting knowledge patterns';
      this.emit(`job:${job.id}:status`, job);

      for (let i = 0; i < allConversations.length; i++) {
        job.progress = {
          current: i,
          total: allConversations.length,
          phase: `Analyzing conversation ${i + 1}/${allConversations.length}`
        };
        this.emit(`job:${job.id}:progress`, job.progress);

        try {
          const candidates = await this.extractionEngine.extractKnowledge(allConversations[i]);
          allCandidates.push(...candidates);
          job.results.candidatesExtracted += candidates.length;

          console.log(`[IngestionService] Extracted ${candidates.length} candidates from conversation ${i + 1}`);
        } catch (error) {
          job.results.errors.push(`Extraction error: ${error.message}`);
          console.error(`[IngestionService] Extraction error:`, error.message);
        }
      }

      // Store candidates for review
      await this.storeCandidates(allCandidates);
    } else if (!this.llmChat) {
      console.warn('[IngestionService] No LLM configured, skipping extraction');
      job.results.errors.push('LLM not configured - extraction skipped');
    }

    // Complete
    job.status = 'complete';
    job.completedAt = new Date().toISOString();
    job.progress = {
      current: job.progress.total,
      total: job.progress.total,
      phase: 'Complete'
    };

    // Save job to history
    await this.saveJob(job);

    this.emit(`job:${job.id}:complete`, job);
    console.log(`[IngestionService] Job ${job.id} complete:`, job.results);
  }

  /**
   * Get a job by ID
   * @param {string} jobId
   * @returns {IngestionJob|undefined}
   */
  getJob(jobId) {
    return this.jobs.get(jobId);
  }

  /**
   * Get pending candidates with optional filters
   * @param {Object} [filters]
   * @param {ConversationSource} [filters.source]
   * @param {number} [filters.minConfidence]
   * @returns {Promise<ExtractionCandidate[]>}
   */
  async getPendingCandidates(filters = {}) {
    let candidates = await this.loadCandidates();

    // Filter by status
    candidates = candidates.filter(c => c.status === 'pending');

    // Apply filters
    if (filters.source) {
      // Need to look up conversation to filter by source
      const conversations = await this.loadConversations();
      const convMap = new Map(conversations.map(c => [c.id, c]));
      candidates = candidates.filter(c => {
        const conv = convMap.get(c.conversationId);
        return conv && conv.source === filters.source;
      });
    }

    if (filters.minConfidence !== undefined) {
      candidates = candidates.filter(c => c.confidence >= filters.minConfidence);
    }

    // Sort by confidence descending
    return candidates.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Review a candidate
   * @param {string} candidateId
   * @param {'approve'|'reject'|'edit'} action
   * @param {Partial<ExtractionCandidate>} [edits]
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async reviewCandidate(candidateId, action, edits = {}) {
    const candidates = await this.loadCandidates();
    const index = candidates.findIndex(c => c.id === candidateId);

    if (index === -1) {
      return { success: false, message: 'Candidate not found' };
    }

    const candidate = candidates[index];

    if (action === 'reject') {
      candidate.status = 'rejected';
      await this.saveCandidates(candidates);
      return { success: true, message: 'Candidate rejected' };
    }

    if (action === 'edit') {
      // Apply edits
      if (edits.problem) Object.assign(candidate.problem, edits.problem);
      if (edits.solution) Object.assign(candidate.solution, edits.solution);
      if (edits.inferredContext) Object.assign(candidate.inferredContext, edits.inferredContext);
      if (edits.reviewNotes) candidate.reviewNotes = edits.reviewNotes;
    }

    // Approve: Convert to skill and save
    if (action === 'approve' || action === 'edit') {
      const skill = this.extractionEngine.candidateToSkill(candidate);

      // Check for duplicates
      const existingSkills = await this.loadSkills();
      const isDuplicate = existingSkills.some(s =>
        s.use_when.toLowerCase() === skill.use_when.toLowerCase()
      );

      if (isDuplicate) {
        candidate.status = 'merged';
        candidate.reviewNotes = (candidate.reviewNotes || '') + ' [Merged with existing skill]';
      } else {
        // Add as new skill
        const newSkill = {
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          ...skill
        };

        existingSkills.push(newSkill);
        await this.saveSkills(existingSkills);

        candidate.status = 'approved';
        candidate.mergedIntoId = newSkill.id;
      }

      await this.saveCandidates(candidates);
      return { success: true, message: `Candidate ${candidate.status}` };
    }

    return { success: false, message: 'Invalid action' };
  }

  /**
   * Bulk review candidates
   * @param {string[]} candidateIds
   * @param {'approve'|'reject'} action
   * @returns {Promise<{processed: number, errors: string[]}>}
   */
  async bulkReview(candidateIds, action) {
    const results = { processed: 0, errors: [] };

    for (const id of candidateIds) {
      try {
        const result = await this.reviewCandidate(id, action);
        if (result.success) {
          results.processed++;
        } else {
          results.errors.push(`${id}: ${result.message}`);
        }
      } catch (error) {
        results.errors.push(`${id}: ${error.message}`);
      }
    }

    return results;
  }

  /**
   * Get knowledge statistics
   * @returns {Promise<Object>}
   */
  async getStats() {
    const candidates = await this.loadCandidates();
    const skills = await this.loadSkills();
    const conversations = await this.loadConversations();

    // Count by source
    const sourceCount = {};
    for (const conv of conversations) {
      sourceCount[conv.source] = (sourceCount[conv.source] || 0) + 1;
    }

    // Count candidates by status
    const statusCount = {
      pending: 0,
      approved: 0,
      rejected: 0,
      merged: 0
    };
    for (const c of candidates) {
      statusCount[c.status] = (statusCount[c.status] || 0) + 1;
    }

    // Calculate success rate from skills
    const successRate = skills.length > 0
      ? skills.filter(s => s._source?.confidence > 0.7).length / skills.length
      : 0;

    // Skills learned this week
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const learnedThisWeek = skills.filter(s => s.timestamp > weekAgo).length;

    return {
      totalExperiences: skills.length,
      totalConversations: conversations.length,
      totalCandidates: candidates.length,
      pendingReview: statusCount.pending,
      sources: Object.keys(sourceCount),
      sourceBreakdown: sourceCount,
      statusBreakdown: statusCount,
      successRate,
      learnedThisWeek
    };
  }

  /**
   * Export all knowledge
   * @returns {Promise<Object>}
   */
  async exportAll() {
    const skills = await this.loadSkills();
    const conversations = await this.loadConversations();
    const candidates = await this.loadCandidates();

    return {
      exportedAt: new Date().toISOString(),
      version: '1.0',
      skills,
      conversations,
      candidates
    };
  }

  /**
   * Import knowledge from export
   * @param {Object} data
   * @returns {Promise<{imported: number, skipped: number}>}
   */
  async importKnowledge(data) {
    const results = { imported: 0, skipped: 0 };

    if (data.skills && Array.isArray(data.skills)) {
      const existingSkills = await this.loadSkills();
      const existingIds = new Set(existingSkills.map(s => s.id));

      for (const skill of data.skills) {
        if (!existingIds.has(skill.id)) {
          existingSkills.push(skill);
          results.imported++;
        } else {
          results.skipped++;
        }
      }

      await this.saveSkills(existingSkills);
    }

    return results;
  }

  // ===========================================
  // Storage Helpers
  // ===========================================

  async loadJson(filePath) {
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  async saveJson(filePath, data) {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  async loadCandidates() {
    return this.loadJson(CANDIDATES_FILE);
  }

  async saveCandidates(candidates) {
    await this.saveJson(CANDIDATES_FILE, candidates);
  }

  async storeCandidates(newCandidates) {
    const existing = await this.loadCandidates();
    existing.push(...newCandidates);
    await this.saveCandidates(existing);
  }

  async loadConversations() {
    return this.loadJson(CONVERSATIONS_FILE);
  }

  async storeConversations(conversations) {
    const existing = await this.loadConversations();
    existing.push(...conversations);
    await this.saveJson(CONVERSATIONS_FILE, existing);
  }

  async loadSkills() {
    return this.loadJson(SKILLS_FILE);
  }

  async saveSkills(skills) {
    await this.saveJson(SKILLS_FILE, skills);
  }

  async saveJob(job) {
    const jobs = await this.loadJson(JOBS_FILE);
    const index = jobs.findIndex(j => j.id === job.id);
    if (index >= 0) {
      jobs[index] = job;
    } else {
      jobs.push(job);
    }
    // Keep only last 100 jobs
    if (jobs.length > 100) {
      jobs.splice(0, jobs.length - 100);
    }
    await this.saveJson(JOBS_FILE, jobs);
  }

  async getRecentJobs(limit = 20) {
    const jobs = await this.loadJson(JOBS_FILE);
    return jobs.slice(-limit).reverse();
  }
}

// Singleton instance
let serviceInstance = null;

/**
 * Get the ingestion service singleton
 * @returns {IngestionService}
 */
function getIngestionService() {
  if (!serviceInstance) {
    serviceInstance = new IngestionService();
  }
  return serviceInstance;
}

module.exports = {
  IngestionService,
  getIngestionService
};
