/**
 * Ingestion API Routes
 * Handles conversation import, extraction, and review workflows
 */

const express = require("express");
const multer = require("multer");
const { getIngestionService } = require("../services/IngestionService");

const router = express.Router();

// Configure multer for memory storage (files stored in buffer)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB per file
    files: 20, // Max 20 files per upload
  },
  fileFilter: (req, file, cb) => {
    // Accept common conversation export formats
    const allowedMimes = [
      "application/json",
      "text/plain",
      "text/markdown",
      "text/x-markdown",
      "application/x-yaml",
      "text/yaml",
    ];

    const allowedExts = [".json", ".txt", ".md", ".markdown", ".yaml", ".yml"];
    const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf("."));

    if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`), false);
    }
  },
});

// ===========================================
// Upload & Job Management
// ===========================================

/**
 * POST /api/ingestion/upload
 * Upload conversation files for processing
 */
router.post("/upload", upload.array("files", 20), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    const ingestionService = getIngestionService();
    const job = await ingestionService.createJob(req.files);

    res.json({
      jobId: job.id,
      status: job.status,
      filesCount: job.files.length,
    });
  } catch (error) {
    console.error("[Ingestion] Upload error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/ingestion/job/:jobId
 * Get job status and details
 */
router.get("/job/:jobId", (req, res) => {
  const ingestionService = getIngestionService();
  const job = ingestionService.getJob(req.params.jobId);

  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }

  res.json(job);
});

/**
 * GET /api/ingestion/job/:jobId/stream
 * SSE endpoint for real-time job progress
 */
router.get("/job/:jobId/stream", (req, res) => {
  const { jobId } = req.params;
  const ingestionService = getIngestionService();

  // Check if job exists
  const job = ingestionService.getJob(jobId);
  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }

  // Setup SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering

  // Send initial state
  res.write(`data: ${JSON.stringify({ type: "status", data: job })}\n\n`);

  // If already complete, close connection
  if (job.status === "complete" || job.status === "failed") {
    res.write(`data: ${JSON.stringify({ type: "complete", data: job })}\n\n`);
    res.end();
    return;
  }

  // Event handlers
  const onProgress = (progress) => {
    res.write(`data: ${JSON.stringify({ type: "progress", data: progress })}\n\n`);
  };

  const onStatus = (jobData) => {
    res.write(`data: ${JSON.stringify({ type: "status", data: jobData })}\n\n`);
  };

  const onComplete = (jobData) => {
    res.write(`data: ${JSON.stringify({ type: "complete", data: jobData })}\n\n`);
    cleanup();
    res.end();
  };

  const onError = (error) => {
    res.write(`data: ${JSON.stringify({ type: "error", data: error })}\n\n`);
    cleanup();
    res.end();
  };

  // Subscribe to events
  ingestionService.on(`job:${jobId}:progress`, onProgress);
  ingestionService.on(`job:${jobId}:status`, onStatus);
  ingestionService.on(`job:${jobId}:complete`, onComplete);
  ingestionService.on(`job:${jobId}:error`, onError);

  // Cleanup function
  const cleanup = () => {
    ingestionService.off(`job:${jobId}:progress`, onProgress);
    ingestionService.off(`job:${jobId}:status`, onStatus);
    ingestionService.off(`job:${jobId}:complete`, onComplete);
    ingestionService.off(`job:${jobId}:error`, onError);
  };

  // Handle client disconnect
  req.on("close", () => {
    cleanup();
  });

  // Keep-alive ping every 30 seconds
  const keepAlive = setInterval(() => {
    res.write(": keepalive\n\n");
  }, 30000);

  req.on("close", () => {
    clearInterval(keepAlive);
  });
});

/**
 * GET /api/ingestion/jobs
 * Get recent ingestion jobs
 */
router.get("/jobs", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const ingestionService = getIngestionService();
    const jobs = await ingestionService.getRecentJobs(limit);
    res.json({ jobs });
  } catch (error) {
    console.error("[Ingestion] Get jobs error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ===========================================
// Candidate Review
// ===========================================

/**
 * GET /api/ingestion/candidates
 * Get pending candidates for review
 */
router.get("/candidates", async (req, res) => {
  try {
    const { source, minConfidence } = req.query;
    const ingestionService = getIngestionService();

    const candidates = await ingestionService.getPendingCandidates({
      source: source || undefined,
      minConfidence: minConfidence ? parseFloat(minConfidence) : undefined,
    });

    res.json({ candidates, count: candidates.length });
  } catch (error) {
    console.error("[Ingestion] Get candidates error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/ingestion/candidates/:id
 * Get a specific candidate
 */
router.get("/candidates/:id", async (req, res) => {
  try {
    const ingestionService = getIngestionService();
    const candidates = await ingestionService.getPendingCandidates();
    const candidate = candidates.find((c) => c.id === req.params.id);

    if (!candidate) {
      return res.status(404).json({ error: "Candidate not found" });
    }

    res.json(candidate);
  } catch (error) {
    console.error("[Ingestion] Get candidate error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/ingestion/candidates/:id/review
 * Review a single candidate (approve, reject, or edit)
 */
router.post("/candidates/:id/review", async (req, res) => {
  try {
    const { action, edits } = req.body;

    if (!["approve", "reject", "edit"].includes(action)) {
      return res.status(400).json({ error: "Invalid action. Use: approve, reject, or edit" });
    }

    const ingestionService = getIngestionService();
    const result = await ingestionService.reviewCandidate(req.params.id, action, edits);

    if (!result.success) {
      return res.status(404).json({ error: result.message });
    }

    res.json(result);
  } catch (error) {
    console.error("[Ingestion] Review error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/ingestion/candidates/bulk-review
 * Bulk review multiple candidates
 */
router.post("/candidates/bulk-review", async (req, res) => {
  try {
    const { candidateIds, action } = req.body;

    if (!Array.isArray(candidateIds) || candidateIds.length === 0) {
      return res.status(400).json({ error: "candidateIds array is required" });
    }

    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({ error: "Invalid action. Use: approve or reject" });
    }

    const ingestionService = getIngestionService();
    const results = await ingestionService.bulkReview(candidateIds, action);

    res.json(results);
  } catch (error) {
    console.error("[Ingestion] Bulk review error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ===========================================
// Statistics & Export
// ===========================================

/**
 * GET /api/ingestion/stats
 * Get knowledge base statistics
 */
router.get("/stats", async (req, res) => {
  try {
    const ingestionService = getIngestionService();
    const stats = await ingestionService.getStats();
    res.json(stats);
  } catch (error) {
    console.error("[Ingestion] Stats error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/ingestion/export
 * Export entire knowledge base
 */
router.get("/export", async (req, res) => {
  try {
    const ingestionService = getIngestionService();
    const data = await ingestionService.exportAll();

    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="termai-knowledge-${Date.now()}.json"`
    );
    res.json(data);
  } catch (error) {
    console.error("[Ingestion] Export error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/ingestion/import
 * Import knowledge from a previous export
 */
router.post("/import", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const content = req.file.buffer.toString("utf-8");
    const data = JSON.parse(content);

    const ingestionService = getIngestionService();
    const results = await ingestionService.importKnowledge(data);

    res.json({
      success: true,
      ...results,
    });
  } catch (error) {
    console.error("[Ingestion] Import error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ===========================================
// Supported Formats Info
// ===========================================

/**
 * GET /api/ingestion/formats
 * Get list of supported conversation formats
 */
router.get("/formats", (req, res) => {
  res.json({
    formats: [
      {
        id: "claude",
        name: "Claude",
        extensions: [".json"],
        description: "Exported conversations from claude.ai",
      },
      {
        id: "chatgpt",
        name: "ChatGPT",
        extensions: [".json"],
        description: "Exported conversations from chat.openai.com",
      },
      {
        id: "cursor",
        name: "Cursor IDE",
        extensions: [".json"],
        description: "Chat and Composer sessions from Cursor",
      },
      {
        id: "warp",
        name: "Warp Terminal",
        extensions: [".json", ".yaml", ".yml", ".txt"],
        description: "Sessions and workflows from Warp",
      },
      {
        id: "markdown",
        name: "Markdown/Text",
        extensions: [".md", ".txt", ".markdown"],
        description: "Generic conversation transcripts",
      },
    ],
  });
});

// Error handling for multer
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: "File too large. Maximum size is 50MB." });
    }
    if (error.code === "LIMIT_FILE_COUNT") {
      return res.status(413).json({ error: "Too many files. Maximum is 20 files." });
    }
    return res.status(400).json({ error: error.message });
  }
  next(error);
});

module.exports = router;
