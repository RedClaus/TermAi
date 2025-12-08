/**
 * Prompts API Route
 * Handles loading and saving custom prompt templates
 * 
 * User prompts are stored in ~/.config/termai/prompts.json
 */

const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const os = require("os");

// Config directory path
const CONFIG_DIR = path.join(os.homedir(), ".config", "termai");
const PROMPTS_FILE = path.join(CONFIG_DIR, "prompts.json");

/**
 * Ensure config directory exists
 */
function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/**
 * Load prompts from file
 */
function loadPrompts() {
  try {
    if (!fs.existsSync(PROMPTS_FILE)) {
      return null;
    }
    const content = fs.readFileSync(PROMPTS_FILE, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    console.error("[Prompts] Error loading prompts:", error.message);
    return null;
  }
}

/**
 * Save prompts to file
 */
function savePrompts(data) {
  ensureConfigDir();
  fs.writeFileSync(PROMPTS_FILE, JSON.stringify(data, null, 2), "utf-8");
}

// ===========================================
// GET /api/prompts - Load user prompts
// ===========================================
router.get("/", (req, res) => {
  const prompts = loadPrompts();
  
  if (!prompts) {
    return res.status(404).json({ error: "No custom prompts file found" });
  }
  
  res.json(prompts);
});

// ===========================================
// POST /api/prompts - Save a prompt
// ===========================================
router.post("/", (req, res) => {
  const { prompt } = req.body;
  
  if (!prompt || !prompt.id || !prompt.template) {
    return res.status(400).json({ error: "Invalid prompt: id and template required" });
  }
  
  try {
    // Load existing prompts or create new library
    let library = loadPrompts() || {
      version: "1.0.0",
      prompts: [],
    };
    
    // Find and update existing prompt or add new one
    const existingIndex = library.prompts.findIndex((p) => p.id === prompt.id);
    if (existingIndex >= 0) {
      library.prompts[existingIndex] = prompt;
    } else {
      library.prompts.push(prompt);
    }
    
    savePrompts(library);
    res.json({ success: true, prompt });
  } catch (error) {
    console.error("[Prompts] Error saving prompt:", error);
    res.status(500).json({ error: error.message });
  }
});

// ===========================================
// DELETE /api/prompts/:id - Delete a prompt
// ===========================================
router.delete("/:id", (req, res) => {
  const { id } = req.params;
  
  try {
    const library = loadPrompts();
    if (!library) {
      return res.status(404).json({ error: "No prompts file found" });
    }
    
    const existingIndex = library.prompts.findIndex((p) => p.id === id);
    if (existingIndex < 0) {
      return res.status(404).json({ error: "Prompt not found" });
    }
    
    library.prompts.splice(existingIndex, 1);
    savePrompts(library);
    
    res.json({ success: true });
  } catch (error) {
    console.error("[Prompts] Error deleting prompt:", error);
    res.status(500).json({ error: error.message });
  }
});

// ===========================================
// PUT /api/prompts/reset - Reset to defaults
// ===========================================
router.put("/reset", (req, res) => {
  try {
    if (fs.existsSync(PROMPTS_FILE)) {
      fs.unlinkSync(PROMPTS_FILE);
    }
    res.json({ success: true, message: "Prompts reset to defaults" });
  } catch (error) {
    console.error("[Prompts] Error resetting prompts:", error);
    res.status(500).json({ error: error.message });
  }
});

// ===========================================
// GET /api/prompts/export - Export all prompts
// ===========================================
router.get("/export", (req, res) => {
  const prompts = loadPrompts();
  
  if (!prompts) {
    // Return empty library if no custom prompts
    return res.json({
      version: "1.0.0",
      prompts: [],
    });
  }
  
  res.json(prompts);
});

// ===========================================
// POST /api/prompts/import - Import prompts
// ===========================================
router.post("/import", (req, res) => {
  const { library } = req.body;
  
  if (!library || !Array.isArray(library.prompts)) {
    return res.status(400).json({ error: "Invalid library format" });
  }
  
  try {
    // Validate each prompt
    for (const prompt of library.prompts) {
      if (!prompt.id || !prompt.template) {
        return res.status(400).json({ 
          error: `Invalid prompt: ${prompt.id || 'unknown'} - id and template required` 
        });
      }
    }
    
    savePrompts(library);
    res.json({ success: true, count: library.prompts.length });
  } catch (error) {
    console.error("[Prompts] Error importing prompts:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
