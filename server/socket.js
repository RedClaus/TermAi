/**
 * Socket Handlers
 * Connects WebSockets to SessionManager and KnowledgeEngine for hybrid AI workflow.
 * 
 * Events:
 * - terminal:input   - Raw user keyboard input
 * - terminal:resize  - Terminal resize
 * - terminal:output  - PTY output to client
 * - ai:prompt        - User prompt to AI (triggers RAG + LLM + command execution)
 * - ai:status        - AI status updates (typing, executing, idle)
 * - ai:response      - AI response text
 * - ai:interrupt     - User interrupts AI
 */

const { SessionManager } = require('./services/SessionManager');
const { FileProcessor } = require('./services/FileProcessor');
const { flowEngine } = require('./services/FlowEngine');

/**
 * Setup socket handlers for a Socket.io server
 * @param {Server} io - Socket.io server instance or namespace
 * @param {Object} options - Options including getEngine function
 */
function setupSocketHandlers(io, options = {}) {
  const fileProcessor = new FileProcessor();
  const getEngine = options.getEngine || (() => null);
  
  // Track sessions per socket
  const sessions = new Map();

  io.on('connection', (socket) => {
    console.log(`[Socket/Hybrid] Client connected: ${socket.id}`);

    // Create a session for this client
    const session = new SessionManager({
      cwd: process.env.TERMAI_LAUNCH_CWD || process.cwd(),
    });
    sessions.set(socket.id, session);

    // ==========================================
    // PTY Output -> Client
    // ==========================================
    session.on('output', (data) => {
      socket.emit('terminal:output', data);
    });

    session.on('exit', ({ exitCode, signal }) => {
      socket.emit('terminal:exit', { exitCode, signal });
    });

    session.on('ai-status', (status) => {
      socket.emit('ai:status', { status });
    });

    session.on('error', (error) => {
      socket.emit('terminal:error', { message: error.message });
    });

    // CWD tracking via OSC 7
    session.on('cwd-changed', (cwd) => {
      socket.emit('terminal:cwd', { cwd });
    });

    // ==========================================
    // Terminal Events (Raw PTY interaction)
    // ==========================================
    
    socket.on('terminal:input', (data) => {
      session.writeUser(data);
    });

    socket.on('terminal:resize', ({ cols, rows }) => {
      session.resize(cols, rows);
    });

    // ==========================================
    // AI Prompt (Hybrid Workflow)
    // ==========================================
    
    socket.on('ai:prompt', async (payload) => {
      const { text, attachments = [], options = {} } = payload;
      
      if (!text) {
        socket.emit('ai:error', { message: 'Empty prompt' });
        return;
      }

      socket.emit('ai:status', { status: 'thinking' });

      try {
        // 1. Build context from RAG (codebase search)
        let ragContext = '';
        const knowledgeEngine = getEngine();
        if (knowledgeEngine && knowledgeEngine.isInitialized) {
          try {
            const ragResults = await knowledgeEngine.search(text, 4);
            if (ragResults.length > 0) {
              ragContext = '\n## Relevant Codebase Context\n' + 
                ragResults.map(doc => 
                  `File: ${doc.path}\n\`\`\`\n${doc.text}\n\`\`\``
                ).join('\n\n---\n\n');
            }
          } catch (ragError) {
            console.warn('[Socket] RAG search failed:', ragError.message);
          }
        }

        // 2. Process file attachments
        let attachmentContext = '';
        if (attachments.length > 0) {
          const processed = await fileProcessor.processFiles(attachments);
          attachmentContext = fileProcessor.createContext(processed);
        }

        // 3. Get terminal context (recent output)
        const terminalContext = session.getOutputBuffer(50);

        // 4. Build full context for LLM
        const fullContext = [
          ragContext,
          attachmentContext,
          terminalContext ? `\n## Recent Terminal Output\n\`\`\`\n${terminalContext}\n\`\`\`` : '',
          `\nUser Request: ${text}`
        ].filter(Boolean).join('\n');

        // 5. Call LLM
        socket.emit('ai:status', { status: 'generating' });
        
        const llmResponse = await getLLMResponse(fullContext, options);
        
        // 6. Emit AI response
        socket.emit('ai:response', { 
          text: llmResponse.text,
          hasCommand: llmResponse.hasCommand,
          command: llmResponse.command 
        });

        // 7. Execute command if present and auto-run is enabled
        if (llmResponse.hasCommand && options.autoRun !== false) {
          socket.emit('ai:status', { status: 'typing' });
          
          const result = await session.writeAi(llmResponse.command, {
            typingDelay: options.typingDelay || 15,
            timeout: options.commandTimeout || 30000
          });

          socket.emit('ai:command-complete', {
            command: llmResponse.command,
            output: result.output,
            interrupted: result.interrupted,
            duration: result.duration
          });
        }

        socket.emit('ai:status', { status: 'idle' });

      } catch (error) {
        console.error('[Socket] AI prompt error:', error);
        socket.emit('ai:error', { message: error.message });
        socket.emit('ai:status', { status: 'error' });
      }
    });

    // ==========================================
    // AI Interrupt
    // ==========================================
    
    socket.on('ai:interrupt', () => {
      session.interruptAi();
    });

    // ==========================================
    // Session State
    // ==========================================
    
    socket.on('session:state', () => {
      socket.emit('session:state', session.getState());
    });

    // ==========================================
    // Flow Execution (Real-time updates)
    // ==========================================
    
    socket.on('flow:execute', async ({ flowId, sessionId }) => {
      if (!flowId) {
        socket.emit('flow:error', { message: 'flowId is required' });
        return;
      }

      // Configure FlowEngine with session's PTY
      flowEngine.setSessionManager(session);
      
      // Configure LLM chat function
      flowEngine.setLLMChat(async (provider, model, messages, systemPrompt) => {
        try {
          const response = await fetch(`http://localhost:${process.env.PORT || 3001}/api/llm/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              provider,
              model,
              messages,
              systemPrompt,
              sessionId: sessionId || 'flow-execution'
            })
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'LLM request failed');
          }

          return await response.json();
        } catch (error) {
          console.error('[FlowEngine] LLM call failed:', error);
          throw error;
        }
      });

      socket.emit('flow:started', { flowId, executionId: null });

      try {
        const result = await flowEngine.execute(flowId, sessionId || 'default', {
          onNodeStart: (nodeId) => {
            socket.emit('flow:node-status', { 
              nodeId, 
              status: 'running',
              timestamp: Date.now()
            });
          },
          onNodeComplete: (nodeId, nodeResult) => {
            socket.emit('flow:node-status', { 
              nodeId, 
              status: 'success',
              result: nodeResult,
              timestamp: Date.now()
            });
          },
          onNodeError: (nodeId, error) => {
            socket.emit('flow:node-status', { 
              nodeId, 
              status: 'failed',
              error,
              timestamp: Date.now()
            });
          },
          onFlowComplete: (status, results) => {
            socket.emit('flow:completed', { 
              flowId,
              status,
              results,
              timestamp: Date.now()
            });
          }
        });

        socket.emit('flow:completed', {
          flowId,
          executionId: result.executionId,
          status: result.status,
          duration: result.endTime - result.startTime,
          results: result.results
        });

      } catch (error) {
        console.error('[Socket] Flow execution error:', error);
        socket.emit('flow:error', { 
          flowId,
          message: error.message 
        });
      }
    });

    socket.on('flow:cancel', ({ executionId }) => {
      if (executionId) {
        const cancelled = flowEngine.cancelExecution(executionId);
        socket.emit('flow:cancelled', { executionId, success: cancelled });
      }
    });

    // ==========================================
    // Disconnect
    // ==========================================
    
    socket.on('disconnect', () => {
      console.log(`[Socket] Client disconnected: ${socket.id}`);
      session.kill();
      sessions.delete(socket.id);
    });
  });

  console.log('[Socket] Handlers initialized');
}

/**
 * Extract command from LLM response
 * Looks for ```bash blocks or single-line commands
 */
function extractCommand(response) {
  // Look for ```bash or ```sh blocks
  const bashBlockMatch = response.match(/```(?:bash|sh|shell|zsh)\n([\s\S]*?)```/);
  if (bashBlockMatch) {
    const command = bashBlockMatch[1].trim();
    // Only return single-line commands for safety
    if (!command.includes('\n') || command.split('\n').length <= 3) {
      return command.split('\n')[0]; // Take first line
    }
  }

  // Look for inline code that looks like a command
  const inlineMatch = response.match(/`([^`]+)`/);
  if (inlineMatch) {
    const maybeCommand = inlineMatch[1].trim();
    // Check if it looks like a command (starts with common commands)
    if (/^(ls|cd|cat|echo|npm|yarn|git|docker|make|python|node|go|cargo|curl|wget|mkdir|rm|cp|mv|touch|chmod|chown|find|grep|sed|awk|head|tail|less|more|vi|vim|nano)/.test(maybeCommand)) {
      return maybeCommand;
    }
  }

  return null;
}

/**
 * Call LLM and parse response
 */
async function getLLMResponse(context, options = {}) {
  // Get LLM provider from env or options
  const provider = options.provider || process.env.TERMAI_DEFAULT_PROVIDER || 'gemini';
  
  // Build system prompt for terminal assistant
  const systemPrompt = `You are TermAI, an AI assistant embedded in a terminal. You help users with:
- Running shell commands
- Understanding code and files
- Debugging errors
- Explaining command output

When suggesting a command, wrap it in a \`\`\`bash code block.
Keep responses concise and actionable.
Current working directory: ${options.cwd || process.cwd()}`;

  try {
    // Use the existing LLM routes infrastructure
    const response = await fetch(`http://localhost:${process.env.PORT || 3001}/api/llm/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider,
        model: options.model,
        message: context,
        systemPrompt,
        sessionId: options.sessionId || 'socket-session'
      })
    });

    if (!response.ok) {
      throw new Error(`LLM request failed: ${response.statusText}`);
    }

    const data = await response.json();
    const text = data.response || data.message || '';
    const command = extractCommand(text);

    return {
      text,
      hasCommand: !!command,
      command
    };
  } catch (error) {
    console.error('[Socket] LLM call failed:', error);
    throw error;
  }
}

module.exports = { setupSocketHandlers };
