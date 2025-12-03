/**
 * Knowledge Base Routes
 * Handles storage and retrieval of learned skills and task logs
 */

const express = require("express");
const fs = require("fs").promises;
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const router = express.Router();

const DATA_DIR = path.join(__dirname, "../data");
const SKILLS_FILE = path.join(DATA_DIR, "skills.json");
const TASKS_FILE = path.join(DATA_DIR, "tasks.json");

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
  // In production, use vector embeddings or fuzzy search
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

// ===========================================
// Tasks API
// ===========================================

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

module.exports = router;
