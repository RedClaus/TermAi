/**
 * Knowledge Engine
 * Vector-based code indexing and semantic search using LanceDB and Ollama/OpenAI
 * 
 * This is a robust implementation with:
 * - Concurrency control (processing queue)
 * - State management (file hashing to avoid re-embedding unchanged files)
 * - Graceful handling (ignoring binaries and sensitive files)
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const OpenAI = require('openai');

// CONFIGURATION
const LANCE_DB_PATH = path.join(process.cwd(), '.term-ai', 'data', 'vectors');
const OLLAMA_MODEL = 'nomic-embed-text'; // Run: ollama pull nomic-embed-text
const OLLAMA_BASE_URL = process.env.OLLAMA_ENDPOINT || 'http://localhost:11434';
const OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small';
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;

// Senior Dev Tip: Hardcode strict ignores for safety
const IGNORED_DIRS = ['node_modules', '.git', 'dist', 'build', '.term-ai', '__pycache__', '.venv', 'venv', '.next', '.nuxt', 'coverage'];
const IGNORED_FILES = ['.env', '.DS_Store', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'];

class KnowledgeEngine {
  constructor() {
    this.db = null;
    this.table = null;
    this.embeddings = null;
    this.splitter = null;
    this.processingQueue = new Set();
    this.isInitialized = false;
    this.initPromise = null;
    this.config = {
      provider: 'ollama',
      apiKey: null,
      ollamaEndpoint: OLLAMA_BASE_URL,
      embeddingProvider: 'ollama' // 'ollama' or 'openai'
    };
  }

  /**
   * Set configuration
   */
  setConfig(config) {
    console.log('[KnowledgeEngine] Updating config:', { provider: config.provider, hasKey: !!config.apiKey });
    const prevProvider = this.config.provider;
    this.config = { ...this.config, ...config };
    
    // If provider changed, force re-init
    if (this.isInitialized && prevProvider !== this.config.provider) {
      console.log('[KnowledgeEngine] Provider changed, re-initializing...');
      this.isInitialized = false;
      this.initPromise = null;
      this.table = null;
      // We don't await here, next call to init() will handle it
    }
  }

  /**
   * Initialize the DB and dependencies
   */
  async init() {
    // Always allow re-init if not initialized
    if (this.isInitialized) return true;

    // Prevent multiple simultaneous initializations
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this._doInit();
    return this.initPromise;
  }

  async _doInit() {
    try {
      // 1. Load LanceDB (Vector DB)
      let lancedbConnect;
      try {
        const lancedb = require('@lancedb/lancedb');
        lancedbConnect = lancedb.connect;
        console.log('[KnowledgeEngine] Loaded driver: @lancedb/lancedb');
      } catch (e) {
        console.error('[KnowledgeEngine] Failed to load @lancedb/lancedb:', e.message);
        throw e;
      }

      // 2. Load LangChain dependencies (ESM)
      let OllamaEmbeddings, RecursiveCharacterTextSplitter, isBinaryPath;
      try {
        const langchainOllama = await import('@langchain/community/embeddings/ollama');
        const langchainSplitter = await import('langchain/text_splitter');
        const isBinaryPathModule = await import('is-binary-path');
        
        OllamaEmbeddings = langchainOllama.OllamaEmbeddings;
        RecursiveCharacterTextSplitter = langchainSplitter.RecursiveCharacterTextSplitter;
        isBinaryPath = isBinaryPathModule.default || isBinaryPathModule;
      } catch (e) {
        console.warn('[KnowledgeEngine] LangChain dependencies missing:', e.message);
        throw e;
      }

      // Store isBinaryPath for later use
      this.isBinaryPath = isBinaryPath;

      // 3. Initialize Embeddings based on configuration
      // Logic: Prefer Ollama (local, free), fall back to OpenAI if Ollama unavailable
      let useOllama = true;
      let ollamaAvailable = false;

      // Check if Ollama is running and has the embedding model
      try {
        const ollamaCheck = await fetch(`${this.config.ollamaEndpoint || OLLAMA_BASE_URL}/api/tags`);
        if (ollamaCheck.ok) {
          const ollamaData = await ollamaCheck.json();
          const hasEmbedModel = ollamaData.models?.some(m => m.name.includes('nomic-embed'));
          if (hasEmbedModel) {
            ollamaAvailable = true;
            console.log('[KnowledgeEngine] Ollama available with embedding model');
          } else {
            console.log('[KnowledgeEngine] Ollama running but no embedding model found');
          }
        }
      } catch (e) {
        console.log('[KnowledgeEngine] Ollama not available:', e.message);
        useOllama = false;
      }

      // Explicit provider override
      if (this.config.provider === 'openai') {
        useOllama = false;
      } else if (this.config.provider === 'ollama') {
        useOllama = true;
      }

      if (useOllama && ollamaAvailable) {
        console.log('[KnowledgeEngine] Using Ollama Embeddings (local)');
        this.embeddings = new OllamaEmbeddings({
          model: OLLAMA_MODEL,
          baseUrl: this.config.ollamaEndpoint || OLLAMA_BASE_URL,
        });
        this.config.embeddingProvider = 'ollama';
      } else {
        // Fall back to OpenAI
        const { getApiKey } = require('../config');
        const openAIKey = this.config.apiKey || getApiKey('openai') || process.env.OPENAI_API_KEY;

        if (openAIKey) {
          console.log('[KnowledgeEngine] Using OpenAI Embeddings (fallback)');
          const openai = new OpenAI({ apiKey: openAIKey });
          this.embeddings = {
            embedQuery: async (text) => {
              try {
                const response = await openai.embeddings.create({
                  model: OPENAI_EMBEDDING_MODEL,
                  input: text,
                });
                return response.data[0].embedding;
              } catch (err) {
                // If OpenAI embeddings fail (403, rate limit, etc.), log and return null
                console.error('[KnowledgeEngine] OpenAI embedding error:', err.message);
                return null;
              }
            }
          };
          this.config.embeddingProvider = 'openai';
        } else {
          console.warn('[KnowledgeEngine] No embedding provider available - semantic search disabled');
          this.embeddings = null;
          this.config.embeddingProvider = 'none';
        }
      }

      // 4. Initialize Splitter
      this.splitter = new RecursiveCharacterTextSplitter({
        chunkSize: CHUNK_SIZE,
        chunkOverlap: CHUNK_OVERLAP,
        separators: ["\n\n", "\n", " ", ""], // Standard priority for code
      });

      // 5. Connect to DB
      await fs.mkdir(path.dirname(LANCE_DB_PATH), { recursive: true });
      this.db = await lancedbConnect(LANCE_DB_PATH);

      // Table name depends on embedding provider to avoid mixing vectors
      const tableName = `codebase_${this.config.embeddingProvider}`;
      console.log(`[KnowledgeEngine] Using table: ${tableName}`);

      // Check if table exists
      const tableNames = await this.db.tableNames();
      if (tableNames.includes(tableName)) {
        this.table = await this.db.openTable(tableName);
        console.log(`[KnowledgeEngine] Opened existing ${tableName} table`);
      } else {
        console.log(`[KnowledgeEngine] Table ${tableName} will be created on first insert`);
        this.table = null; // Reset table if switching providers and it doesn't exist
      }

      this.isInitialized = true;
      console.log('🧠 Knowledge Engine Initialized');
      return true;
    } catch (error) {
      console.error('[KnowledgeEngine] Failed to initialize:', error.message);
      this.isInitialized = false;
      this.initPromise = null; // Allow retry
      return false;
    }
  }

  /**
   * Check if a file path should be ignored
   */
  isIgnored(filePath) {
    return IGNORED_DIRS.some(dir => filePath.includes(dir)) ||
           IGNORED_FILES.some(file => filePath.endsWith(file));
  }

  /**
   * Process and index a single file
   */
  async processFile(filePath, rootDir) {
    if (!this.isInitialized) {
      console.warn('[KnowledgeEngine] Not initialized, skipping:', filePath);
      return;
    }

    if (this.processingQueue.has(filePath)) return; // Debounce
    this.processingQueue.add(filePath);

    try {
      const relativePath = path.relative(rootDir, filePath);

      // 1. Safety Checks
      if (this.isIgnored(relativePath)) {
        this.processingQueue.delete(filePath);
        return;
      }
      
      if (this.isBinaryPath && this.isBinaryPath(filePath)) {
        this.processingQueue.delete(filePath);
        return;
      }

      // 2. Read and Hash
      const content = await fs.readFile(filePath, 'utf-8');
      const fileHash = crypto.createHash('md5').update(content).digest('hex');

      // 3. Check Stale Data (If table exists)
      if (this.table) {
        try {
          const existing = await this.table
            .query()
            .where(`path = '${relativePath}'`)
            .limit(1)
            .toArray();

          if (existing.length > 0 && existing[0].hash === fileHash) {
            // File hasn't changed. Skip embedding.
            this.processingQueue.delete(filePath);
            return;
          }

          // If it exists but hash is different, delete old vectors first
          if (existing.length > 0) {
            await this.table.delete(`path = '${relativePath}'`);
          }
        } catch (e) {
          // Query might fail on empty/new table, continue with indexing
        }
      }

      // 4. Chunking
      const docs = await this.splitter.createDocuments(
        [content],
        [{ path: relativePath, hash: fileHash }]
      );

      // 5. Embedding & Indexing
      console.log(`⚡ Indexing: ${relativePath} (${docs.length} chunks)`);

      const vectors = [];
      for (const doc of docs) {
        try {
          const vector = await this.embeddings.embedQuery(doc.pageContent);
          vectors.push({
            vector: vector,
            text: doc.pageContent,
            path: relativePath,
            hash: fileHash,
            line_start: doc.metadata.loc?.lines?.from || 0,
            line_end: doc.metadata.loc?.lines?.to || 0
          });
        } catch (embedError) {
          console.error(`[KnowledgeEngine] Embedding error for ${relativePath}:`, embedError.message);
        }
      }

      if (vectors.length === 0) {
        this.processingQueue.delete(filePath);
        return;
      }

      // 6. Upsert to DB
      if (!this.table) {
        this.table = await this.db.createTable(`codebase_${this.config.embeddingProvider}`, vectors);
      } else {
        await this.table.add(vectors);
      }

    } catch (error) {
      console.error(`[KnowledgeEngine] Error processing ${filePath}:`, error.message);
    } finally {
      this.processingQueue.delete(filePath);
    }
  }

  /**
   * Remove file from index
   */
  async removeFile(filePath, rootDir) {
    if (!this.table) return;
    const relativePath = path.relative(rootDir, filePath);
    console.log(`🗑️ Removing vectors for: ${relativePath}`);
    
    try {
      await this.table.delete(`path = '${relativePath}'`);
    } catch (error) {
      console.error(`[KnowledgeEngine] Error removing ${relativePath}:`, error.message);
    }
  }

  /**
   * Search the knowledge base (used by the UI)
   */
  async search(query, limit = 5) {
    if (!this.table || !this.isInitialized) {
      return [];
    }

    try {
      const queryVector = await this.embeddings.embedQuery(query);

      const results = await this.table
        .vectorSearch(queryVector)
        .limit(limit)
        .toArray();

      return results.map(r => ({
        text: r.text,
        path: r.path,
        lineStart: r.line_start,
        lineEnd: r.line_end,
        score: r._distance
      }));
    } catch (error) {
      console.error('[KnowledgeEngine] Search error:', error.message);
      return [];
    }
  }

  /**
   * Index an entire directory (for initial setup)
   */
  async indexDirectory(rootDir, options = {}) {
    if (!this.isInitialized) {
      console.warn('[KnowledgeEngine] Not initialized, cannot index directory');
      return { indexed: 0, skipped: 0, errors: 0 };
    }

    const { recursive = true } = options;
    const results = { indexed: 0, skipped: 0, errors: 0, total: 0 };

    const walkDir = async (dir) => {
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch (e) {
        return;
      }

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (recursive && !IGNORED_DIRS.includes(entry.name)) {
            await walkDir(fullPath);
          }
        } else if (entry.isFile()) {
          results.total++;
          try {
            await this.processFile(fullPath, rootDir);
            results.indexed++;
          } catch (e) {
            results.errors++;
          }
        }
      }
    };

    console.log(`[KnowledgeEngine] Starting directory index: ${rootDir}`);
    await walkDir(rootDir);
    console.log(`[KnowledgeEngine] Indexing complete:`, results);
    
    return results;
  }

  /**
   * Get engine status
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      hasTable: !!this.table,
      processingCount: this.processingQueue.size,
      dbPath: LANCE_DB_PATH,
      model: this.config.embeddingProvider === 'openai' ? OPENAI_EMBEDDING_MODEL : OLLAMA_MODEL,
      provider: this.config.embeddingProvider
    };
  }
}

// --- WATCHER SETUP ---

/**
 * Start file watcher for automatic indexing
 */
const startWatcher = async (rootDir, existingEngine) => {
  const engine = existingEngine || await getKnowledgeEngine();
  
  // Try to init if not already
  if (!engine.isInitialized) {
    await engine.init();
  }
  
  let chokidar;
  try {
    chokidar = (await import('chokidar')).default;
  } catch (e) {
    console.warn('[KnowledgeEngine] chokidar not installed, file watching disabled');
    console.warn('[KnowledgeEngine] To enable, run: npm install chokidar');
    return engine;
  }

  const watcher = chokidar.watch(rootDir, {
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true,
    ignoreInitial: false // Process files on startup
  });

  watcher
    .on('add', filePath => engine.processFile(filePath, rootDir))
    .on('change', filePath => engine.processFile(filePath, rootDir))
    .on('unlink', filePath => engine.removeFile(filePath, rootDir));

  console.log(`👀 Watching codebase at: ${rootDir}`);
  return engine;
};

// Singleton instance for the server
let knowledgeEngineInstance = null;

/**
 * Get or create the singleton Knowledge Engine
 */
const getKnowledgeEngine = async () => {
  if (!knowledgeEngineInstance) {
    knowledgeEngineInstance = new KnowledgeEngine();
    await knowledgeEngineInstance.init();
  }
  return knowledgeEngineInstance;
};

module.exports = {
  KnowledgeEngine,
  startWatcher,
  getKnowledgeEngine
};
