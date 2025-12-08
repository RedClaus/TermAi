/**
 * PTY REST API Routes
 * Provides RESTful endpoints for PTY session management
 * Supports hybrid mode (REST + SSE) as alternative to WebSocket
 */

const express = require("express");
const { PTYAdapter } = require("../services/PTYAdapter");
const { logError } = require("../middleware/logger");

const router = express.Router();

// Create a shared PTY adapter instance
const ptyAdapter = new PTYAdapter({
  usePtyService: false, // Use direct node-pty for now
});

// Store SSE response streams for each session
// Map<sessionId, { res: Response, heartbeatInterval: NodeJS.Timeout }>
const sseStreams = new Map();

// Store PTY output buffers for sessions
// Map<sessionId, Array<{type: string, data: string, timestamp: number}>>
const outputBuffers = new Map();

// ===========================================
// POST /api/pty/spawn - Create new PTY session
// ===========================================
/**
 * Spawn a new PTY session
 * Body: { command?, cwd?, cols?, rows?, env?, sessionId }
 * Returns: { sessionId, pid, shell, cwd }
 */
router.post("/spawn", (req, res) => {
  const { command, cwd, cols, rows, env, sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: "sessionId is required" });
  }

  try {
    // Check if session already exists
    if (ptyAdapter.hasSession(sessionId)) {
      return res.status(409).json({
        error: `Session ${sessionId} already exists`,
        sessionId
      });
    }

    // Spawn PTY with options
    const ptyProcess = ptyAdapter.spawn(sessionId, {
      shell: command, // If command provided, use it as shell, otherwise defaults
      cwd,
      cols: cols || 80,
      rows: rows || 24,
      env,
    });

    // Initialize output buffer for this session
    outputBuffers.set(sessionId, []);

    // Attach data handler to buffer output
    ptyProcess.onData((data) => {
      const buffer = outputBuffers.get(sessionId);
      if (buffer) {
        buffer.push({
          type: 'output',
          data,
          timestamp: Date.now(),
        });

        // Keep buffer size reasonable (last 1000 entries)
        if (buffer.length > 1000) {
          buffer.shift();
        }

        // Send to SSE stream if connected
        const stream = sseStreams.get(sessionId);
        if (stream?.res) {
          try {
            stream.res.write(`data: ${JSON.stringify({ type: 'output', data })}\n\n`);
          } catch (e) {
            console.warn(`[PTY API] Failed to write to SSE stream for ${sessionId}:`, e.message);
          }
        }
      }
    });

    // Attach exit handler
    ptyProcess.onExit(({ exitCode, signal }) => {
      const buffer = outputBuffers.get(sessionId);
      if (buffer) {
        buffer.push({
          type: 'exit',
          data: JSON.stringify({ exitCode, signal }),
          timestamp: Date.now(),
        });
      }

      // Send exit event to SSE stream if connected
      const stream = sseStreams.get(sessionId);
      if (stream?.res) {
        try {
          stream.res.write(`data: ${JSON.stringify({ type: 'exit', exitCode, signal })}\n\n`);
          stream.res.end();
        } catch (e) {
          console.warn(`[PTY API] Failed to send exit event for ${sessionId}:`, e.message);
        }
      }

      // Cleanup
      cleanupSession(sessionId);
    });

    // Get session info
    const sessionInfo = ptyAdapter.getSessionInfo(sessionId);

    res.json({
      success: true,
      sessionId,
      pid: sessionInfo.pid,
      shell: sessionInfo.shell,
      cwd: sessionInfo.cwd,
    });
  } catch (error) {
    console.error(`[PTY API] Error spawning session ${sessionId}:`, error.message);
    logError(error, req);
    res.status(500).json({
      error: error.message,
      sessionId
    });
  }
});

// ===========================================
// POST /api/pty/write - Send input to PTY
// ===========================================
/**
 * Write data to PTY session
 * Body: { sessionId, data }
 * Returns: { success: true }
 */
router.post("/write", (req, res) => {
  const { sessionId, data } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: "sessionId is required" });
  }

  if (data === undefined) {
    return res.status(400).json({ error: "data is required" });
  }

  try {
    const success = ptyAdapter.write(sessionId, data);

    if (!success) {
      return res.status(404).json({
        error: `Session ${sessionId} not found`,
        sessionId
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error(`[PTY API] Error writing to session ${sessionId}:`, error.message);
    logError(error, req);
    res.status(500).json({
      error: error.message,
      sessionId
    });
  }
});

// ===========================================
// POST /api/pty/resize - Resize terminal
// ===========================================
/**
 * Resize PTY terminal
 * Body: { sessionId, cols, rows }
 * Returns: { success: true }
 */
router.post("/resize", (req, res) => {
  const { sessionId, cols, rows } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: "sessionId is required" });
  }

  if (!cols || !rows) {
    return res.status(400).json({ error: "cols and rows are required" });
  }

  try {
    const success = ptyAdapter.resize(sessionId, cols, rows);

    if (!success) {
      return res.status(404).json({
        error: `Session ${sessionId} not found`,
        sessionId
      });
    }

    res.json({ success: true, cols, rows });
  } catch (error) {
    console.error(`[PTY API] Error resizing session ${sessionId}:`, error.message);
    logError(error, req);
    res.status(500).json({
      error: error.message,
      sessionId
    });
  }
});

// ===========================================
// POST /api/pty/kill - Kill PTY session
// ===========================================
/**
 * Kill PTY session
 * Body: { sessionId, signal? }
 * Returns: { success: true }
 */
router.post("/kill", (req, res) => {
  const { sessionId, signal } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: "sessionId is required" });
  }

  try {
    const success = ptyAdapter.kill(sessionId, signal || 'SIGHUP');

    if (!success) {
      return res.status(404).json({
        error: `Session ${sessionId} not found`,
        sessionId
      });
    }

    // Cleanup
    cleanupSession(sessionId);

    res.json({ success: true });
  } catch (error) {
    console.error(`[PTY API] Error killing session ${sessionId}:`, error.message);
    logError(error, req);
    res.status(500).json({
      error: error.message,
      sessionId
    });
  }
});

// ===========================================
// GET /api/pty/output/:sessionId - SSE stream for PTY output
// ===========================================
/**
 * Server-Sent Events stream for PTY output
 * Real-time alternative to WebSocket
 *
 * Events sent:
 * - { type: 'connected', sessionId }
 * - { type: 'output', data: string }
 * - { type: 'exit', exitCode: number, signal?: string }
 * - { type: 'heartbeat', timestamp: number }
 * - { type: 'error', error: string }
 */
router.get("/output/:sessionId", (req, res) => {
  const { sessionId } = req.params;

  if (!sessionId) {
    return res.status(400).json({ error: "sessionId is required" });
  }

  // Check if session exists
  if (!ptyAdapter.hasSession(sessionId)) {
    return res.status(404).json({
      error: `Session ${sessionId} not found`,
      sessionId
    });
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  res.flushHeaders();

  console.log(`[PTY API] SSE stream connected for session ${sessionId}`);

  // Send connection confirmation
  res.write(`data: ${JSON.stringify({ type: 'connected', sessionId })}\n\n`);

  // Send buffered output (if any)
  const buffer = outputBuffers.get(sessionId);
  if (buffer && buffer.length > 0) {
    console.log(`[PTY API] Sending ${buffer.length} buffered events to ${sessionId}`);
    for (const event of buffer) {
      try {
        res.write(`data: ${JSON.stringify({ type: event.type, data: event.data })}\n\n`);
      } catch (e) {
        console.warn(`[PTY API] Error sending buffered event:`, e.message);
        break;
      }
    }
  }

  // Setup heartbeat to keep connection alive
  const heartbeatInterval = setInterval(() => {
    try {
      res.write(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: Date.now() })}\n\n`);
    } catch (e) {
      console.warn(`[PTY API] Heartbeat failed for ${sessionId}, cleaning up:`, e.message);
      clearInterval(heartbeatInterval);
      sseStreams.delete(sessionId);
    }
  }, 15000); // 15 seconds

  // Store stream reference
  sseStreams.set(sessionId, { res, heartbeatInterval });

  // Cleanup on client disconnect
  req.on('close', () => {
    console.log(`[PTY API] SSE stream disconnected for session ${sessionId}`);
    clearInterval(heartbeatInterval);
    sseStreams.delete(sessionId);
  });

  // Handle errors
  res.on('error', (error) => {
    console.error(`[PTY API] SSE stream error for ${sessionId}:`, error.message);
    clearInterval(heartbeatInterval);
    sseStreams.delete(sessionId);
  });
});

// ===========================================
// GET /api/pty/sessions - List all active sessions
// ===========================================
/**
 * Get list of all active PTY sessions
 * Returns: { sessions: Array<SessionInfo> }
 */
router.get("/sessions", (req, res) => {
  try {
    const sessions = ptyAdapter.getAllSessionsInfo();
    res.json({ sessions });
  } catch (error) {
    console.error(`[PTY API] Error listing sessions:`, error.message);
    logError(error, req);
    res.status(500).json({ error: error.message });
  }
});

// ===========================================
// GET /api/pty/session/:sessionId - Get session info
// ===========================================
/**
 * Get information about a specific session
 * Returns: SessionInfo object
 */
router.get("/session/:sessionId", (req, res) => {
  const { sessionId } = req.params;

  if (!sessionId) {
    return res.status(400).json({ error: "sessionId is required" });
  }

  try {
    const sessionInfo = ptyAdapter.getSessionInfo(sessionId);

    if (!sessionInfo) {
      return res.status(404).json({
        error: `Session ${sessionId} not found`,
        sessionId
      });
    }

    res.json(sessionInfo);
  } catch (error) {
    console.error(`[PTY API] Error getting session info for ${sessionId}:`, error.message);
    logError(error, req);
    res.status(500).json({
      error: error.message,
      sessionId
    });
  }
});

// ===========================================
// GET /api/pty/stats - Get adapter statistics
// ===========================================
/**
 * Get PTY adapter statistics
 * Returns: { activeSessions, backend, sessions }
 */
router.get("/stats", (req, res) => {
  try {
    const stats = ptyAdapter.getStats();
    res.json(stats);
  } catch (error) {
    console.error(`[PTY API] Error getting stats:`, error.message);
    logError(error, req);
    res.status(500).json({ error: error.message });
  }
});

// ===========================================
// Helper Functions
// ===========================================

/**
 * Cleanup session resources
 * @param {string} sessionId - Session to cleanup
 */
function cleanupSession(sessionId) {
  // Cleanup SSE stream
  const stream = sseStreams.get(sessionId);
  if (stream) {
    if (stream.heartbeatInterval) {
      clearInterval(stream.heartbeatInterval);
    }
    sseStreams.delete(sessionId);
  }

  // Cleanup output buffer
  outputBuffers.delete(sessionId);

  console.log(`[PTY API] Cleaned up session ${sessionId}`);
}

/**
 * Cleanup all sessions on shutdown
 */
function cleanup() {
  console.log(`[PTY API] Cleaning up all sessions...`);

  // Close all SSE streams
  for (const [sessionId, stream] of sseStreams) {
    try {
      if (stream.heartbeatInterval) {
        clearInterval(stream.heartbeatInterval);
      }
      if (stream.res) {
        stream.res.end();
      }
    } catch (e) {
      console.warn(`[PTY API] Error closing SSE stream for ${sessionId}:`, e.message);
    }
  }
  sseStreams.clear();

  // Clear output buffers
  outputBuffers.clear();

  // Destroy all PTY sessions
  ptyAdapter.destroyAll();

  console.log(`[PTY API] Cleanup complete`);
}

// Export router and cleanup function
module.exports = router;
module.exports.cleanup = cleanup;
module.exports.ptyAdapter = ptyAdapter;
