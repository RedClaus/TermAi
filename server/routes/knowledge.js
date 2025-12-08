/**
 * Knowledge Base Routes
 * Handles storage and retrieval of learned skills, task logs, and vector search
 */

const express = require("express");
const fs = require("fs").promises;
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const router = express.Router();

const DATA_DIR = path.join(__dirname, "../data");
const SKILLS_FILE = path.join(DATA_DIR, "skills.json");
const TASKS_FILE = path.join(DATA_DIR, "tasks.json");

// Knowledge Engine instance (set from server.js)
let knowledgeEngine = null;

/**
 * Set the knowledge engine instance
 */
const setKnowledgeEngine = (engine) => {
  knowledgeEngine = engine;
};

// Ensure data directory and files exist
async function ensureFiles() {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }

  try {
    await fs.access(SKILLS_FILE);
  } catch {
    await fs.writeFile(SKILLS_FILE, JSON.stringify([], null, 2));
  }

  try {
    await fs.access(TASKS_FILE);
  } catch {
    await fs.writeFile(TASKS_FILE, JSON.stringify([], null, 2));
  }
}

ensureFiles();

// Helper to read JSON
async function readJson(filePath) {
  try {
    const data = await fs.readFile(filePath, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error);
    return [];
  }
}

// Helper to write JSON
async function writeJson(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

// ===========================================
// Vector Search API (RAG)
// ===========================================

/**
 * POST /api/knowledge/search
 * Semantic search across indexed codebase
 */
router.post("/search", async (req, res) => {
  const { query, limit = 5 } = req.body;

  if (!query) {
    return res.status(400).json({ error: "Query is required" });
  }

  if (!knowledgeEngine) {
    return res.status(503).json({ 
      error: "Knowledge engine not initialized",
      message: "Vector search is not available. Make sure Ollama is running and dependencies are installed."
    });
  }

  try {
    const results = await knowledgeEngine.search(query, limit);
    res.json({ 
      results,
      count: results.length 
    });
  } catch (error) {
    console.error("[Knowledge] Search error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/knowledge/status
 * Get knowledge engine status
 */
router.get("/status", async (req, res) => {
  if (!knowledgeEngine) {
    return res.json({
      initialized: false,
      message: "Knowledge engine not loaded"
    });
  }

  try {
    const status = knowledgeEngine.getStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/knowledge/index
 * Trigger indexing of a directory
 */
router.post("/index", async (req, res) => {
  const { directory } = req.body;

  if (!directory) {
    return res.status(400).json({ error: "Directory path is required" });
  }

  if (!knowledgeEngine) {
    return res.status(503).json({ 
      error: "Knowledge engine not initialized" 
    });
  }

  try {
    // Start indexing (async, returns immediately)
    const results = await knowledgeEngine.indexDirectory(directory);
    res.json({ 
      success: true, 
      message: "Indexing complete",
      results 
    });
  } catch (error) {
    console.error("[Knowledge] Index error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/knowledge/context
 * Get formatted context for RAG (ready to inject into prompt)
 */
router.post("/context", async (req, res) => {
  const { query, limit = 5 } = req.body;

  if (!query) {
    return res.status(400).json({ error: "Query is required" });
  }

  if (!knowledgeEngine) {
    return res.json({ 
      context: "",
      sources: [],
      message: "Knowledge engine not available"
    });
  }

  try {
    const results = await knowledgeEngine.search(query, limit);
    
    // Format context for LLM injection
    const contextString = results.map(doc => 
      `File: ${doc.path} (lines ${doc.lineStart}-${doc.lineEnd})\n\`\`\`\n${doc.text}\n\`\`\``
    ).join('\n\n---\n\n');

    const sources = results.map(doc => ({
      path: doc.path,
      lineStart: doc.lineStart,
      lineEnd: doc.lineEnd,
      score: doc.score
    }));

    res.json({ 
      context: contextString,
      sources,
      count: results.length
    });
  } catch (error) {
    console.error("[Knowledge] Context error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ===========================================
// Skills API
// ===========================================

/**
 * GET /api/knowledge/skills
 * Search skills by query
 */
router.get("/skills", async (req, res) => {
  const { query } = req.query;
  const skills = await readJson(SKILLS_FILE);

  if (!query) {
    return res.json({ skills });
  }

  const lowerQuery = query.toLowerCase();
  
  // Simple keyword matching search
  const matches = skills.filter(skill => {
    const content = JSON.stringify(skill).toLowerCase();
    return content.includes(lowerQuery);
  });

  res.json({ skills: matches });
});

/**
 * POST /api/knowledge/skills
 * Add a new learned skill
 */
router.post("/skills", async (req, res) => {
  const { skill } = req.body;
  
  if (!skill) {
    return res.status(400).json({ error: "Skill object is required" });
  }

  const skills = await readJson(SKILLS_FILE);
  
  const newSkill = {
    id: uuidv4(),
    timestamp: Date.now(),
    ...skill
  };

  skills.push(newSkill);
  await writeJson(SKILLS_FILE, skills);

  res.json({ success: true, skill: newSkill });
});

/**
 * DELETE /api/knowledge/skills/:id
 * Delete a skill by ID
 */
router.delete("/skills/:id", async (req, res) => {
  const { id } = req.params;
  const skills = await readJson(SKILLS_FILE);
  
  const filtered = skills.filter(s => s.id !== id);
  
  if (filtered.length === skills.length) {
    return res.status(404).json({ error: "Skill not found" });
  }

  await writeJson(SKILLS_FILE, filtered);
  res.json({ success: true });
});

// ===========================================
// Tasks API
// ===========================================

/**
 * GET /api/knowledge/tasks
 * Get recent tasks
 */
router.get("/tasks", async (req, res) => {
  const { limit = 100 } = req.query;
  const tasks = await readJson(TASKS_FILE);
  
  // Return most recent tasks
  const recent = tasks.slice(-parseInt(limit, 10));
  res.json({ tasks: recent });
});

/**
 * POST /api/knowledge/tasks
 * Log a task execution
 */
router.post("/tasks", async (req, res) => {
  const { task } = req.body;

  if (!task) {
    return res.status(400).json({ error: "Task object is required" });
  }

  const tasks = await readJson(TASKS_FILE);
  
  const newTask = {
    id: uuidv4(),
    timestamp: Date.now(),
    ...task
  };

  // Keep log size manageable (last 1000 tasks)
  if (tasks.length > 1000) {
    tasks.shift();
  }

  tasks.push(newTask);
  await writeJson(TASKS_FILE, tasks);

  res.json({ success: true, task: newTask });
});

/**
 * POST /api/knowledge/config
 * Update knowledge engine configuration
 */
router.post("/config", async (req, res) => {
  const { provider, apiKey, endpoint } = req.body;

  if (!knowledgeEngine) {
    return res.status(503).json({ error: "Knowledge engine not initialized" });
  }

  // Get API key from server storage if not provided in body
  let effectiveApiKey = apiKey;
  if (!effectiveApiKey && provider !== 'ollama') {
     const { getApiKey } = require('../config');
     effectiveApiKey = getApiKey(provider);
  }

  try {
    knowledgeEngine.setConfig({
      provider,
      apiKey: effectiveApiKey,
      ollamaEndpoint: endpoint
    });
    
    // Trigger re-init
    await knowledgeEngine.init();
    
    res.json({ 
      success: true, 
      status: knowledgeEngine.getStatus() 
    });
  } catch (error) {
    console.error("[Knowledge] Config error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Export router and setter
router.setKnowledgeEngine = setKnowledgeEngine;
module.exports = router;
