import React, { useState, useEffect, useRef } from 'react';
import styles from './AIPanel.module.css';
import { X, Sparkles, Send, GitBranch, Folder, Paperclip, ArrowUp, Pencil, Save } from 'lucide-react';
import { LLMManager } from '../../services/LLMManager';
import { buildSystemPrompt } from '../../utils/promptBuilder';
import { FileSystemService } from '../../services/FileSystemService';
import { ModelSelector } from './ModelSelector';
import { AVAILABLE_MODELS } from '../../data/models';
import { SessionManager } from '../../services/SessionManager';
import clsx from 'clsx';

interface AIPanelProps {
    isOpen: boolean;
    onClose: () => void;
    sessionId?: string;
    isEmbedded?: boolean;
}

export const AIPanel: React.FC<AIPanelProps> = ({ isOpen, onClose, sessionId, isEmbedded }) => {
    const [input, setInput] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [hasKey, setHasKey] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isAutoRun, setIsAutoRun] = useState(false);
    const [autoRunCount, setAutoRunCount] = useState(0);
    const [agentStatus, setAgentStatus] = useState<string | null>(null);
    const [showSafetyConfirm, setShowSafetyConfirm] = useState(false);
    const [pendingSafetyCommand, setPendingSafetyCommand] = useState<{ command: string, sessionId?: string, impact?: string } | null>(null);

    const getCommandImpact = (cmd: string): string | null => {
        if (/(?:^|\s|;|&)(rm\s+)(?:-[a-zA-Z]*r[a-zA-Z]*\s+)?\//.test(cmd)) return "CRITICAL: Recursively deletes from root. System destruction likely.";
        if (/(?:^|\s|;|&)(rm\s+)(?:-[a-zA-Z]*r[a-zA-Z]*\s+)?~/.test(cmd)) return "CRITICAL: Recursively deletes home directory. Data loss likely.";
        if (/(?:^|\s|;|&)(rm\s+)(?:-[a-zA-Z]*r[a-zA-Z]*\s+)?/.test(cmd)) return "Deletes files/directories recursively. Permanent data loss.";
        if (/(?:^|\s|;|&)(rm\s+)/.test(cmd)) return "Deletes files permanently.";
        if (/(?:^|\s|;|&)(mkfs)/.test(cmd)) return "Formats a filesystem. All data on target will be lost.";
        if (/(?:^|\s|;|&)(dd)/.test(cmd)) return "Low-level data copy. Can overwrite disks/partitions.";
        if (/(?:^|\s|;|&)(sudo)/.test(cmd)) return "Runs with superuser privileges. Can modify system files.";
        if (/(?:^|\s|;|&)(:(){ :|:& };:)/.test(cmd)) return "Fork bomb. Will crash the system.";
        return null;
    };

    const handleSafetyConfirm = (confirmed: boolean) => {
        if (confirmed && pendingSafetyCommand) {
            window.dispatchEvent(new CustomEvent('termai-run-command', { detail: pendingSafetyCommand }));
            const cmd = pendingSafetyCommand.command;
            const isCoding = cmd.startsWith('echo') || cmd.startsWith('cat') || cmd.startsWith('printf') || cmd.includes('>');
            setAgentStatus(isCoding ? `Coding: ${cmd}` : `Terminal: ${cmd}`);
            setAutoRunCount(prev => prev + 1);
        } else {
            setMessages(prev => [...prev, { role: 'system', content: '⚠️ Command cancelled by user safety check.' }]);
            setAgentStatus('Command cancelled.');
        }
        setShowSafetyConfirm(false);
        setPendingSafetyCommand(null);
    };

    // ... UI ...
    {
        showSafetyConfirm && pendingSafetyCommand && (
            <div style={{
                position: 'absolute',
                bottom: '80px',
                left: '16px',
                right: '16px',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--error)',
                borderRadius: '8px',
                padding: '16px',
                boxShadow: 'var(--shadow-lg)',
                zIndex: 1000
            }}>
                <div style={{ marginBottom: '12px', fontWeight: 600, fontSize: '13px', color: 'var(--error)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '16px' }}>⚠️</span> Dangerous Command Detected
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                    The AI wants to run a potentially destructive command:
                </div>
                <div style={{
                    background: 'var(--bg-tertiary)',
                    padding: '8px',
                    borderRadius: '4px',
                    fontFamily: 'monospace',
                    fontSize: '11px',
                    marginBottom: '12px',
                    overflowX: 'auto',
                    whiteSpace: 'pre-wrap',
                    color: 'var(--error)'
                }}>
                    {pendingSafetyCommand.command}
                </div>
                <div style={{
                    fontSize: '12px',
                    color: 'var(--text-primary)',
                    marginBottom: '16px',
                    padding: '8px',
                    background: 'rgba(218, 54, 51, 0.1)',
                    borderRadius: '4px',
                    borderLeft: '3px solid var(--error)'
                }}>
                    <strong>Impact:</strong> {pendingSafetyCommand.impact}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        onClick={() => handleSafetyConfirm(true)}
                        style={{
                            flex: 1,
                            padding: '8px',
                            background: 'var(--error)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontWeight: 600
                        }}
                    >
                        Allow & Run
                    </button>
                    <button
                        onClick={() => handleSafetyConfirm(false)}
                        style={{
                            flex: 1,
                            padding: '8px',
                            background: 'var(--bg-tertiary)',
                            color: 'var(--text-primary)',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer'
                        }}
                    >
                        Cancel
                    </button>
                </div>
            </div>
        )
    }
    const [runningCommandId, setRunningCommandId] = useState<string | null>(null);
    const [selectedModelId, setSelectedModelId] = useState(AVAILABLE_MODELS[0].id);
    // const watchdogTimerRef = useRef<NodeJS.Timeout | null>(null); // Moved to SystemOverseer
    const [currentCwd, setCurrentCwd] = useState('~');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const MAX_AUTO_STEPS = 10;
    const [messages, setMessages] = useState([
        { role: 'ai', content: 'Hi! I\'m TermAI. How can I help you with your terminal commands today?' }
    ]);
    const [sessionName, setSessionName] = useState('');
    const [isEditingName, setIsEditingName] = useState(false);
    const [showComplexConfirm, setShowComplexConfirm] = useState(false);
    const [pendingComplexMessage, setPendingComplexMessage] = useState('');
    const [models, setModels] = useState(AVAILABLE_MODELS);

    const fetchOllamaModels = async (endpoint: string) => {
        try {
            let data;
            try {
                // Try direct first
                const response = await fetch(`${endpoint}/api/tags`);
                if (!response.ok) throw new Error('Direct fetch failed');
                data = await response.json();
            } catch (e) {
                console.warn('Direct fetch failed, trying proxy...', e);
                // Try proxy
                const response = await fetch(`http://localhost:3001/api/proxy/ollama/tags?endpoint=${encodeURIComponent(endpoint)}`);
                if (!response.ok) throw new Error('Proxy fetch failed');
                data = await response.json();
            }

            const ollamaModels = data.models.map((m: any) => ({
                id: `ollama-${m.name}`,
                name: `${m.name} (Ollama)`,
                provider: 'ollama',
                intelligence: 80, // Default estimate
                speed: 90,
                cost: 0,
                contextWindow: 'Unknown',
                description: `Local model: ${m.name}`
            }));

            // Merge with existing models, replacing old Ollama ones if needed
            setModels(prev => {
                const nonOllama = prev.filter(p => p.provider !== 'ollama');
                return [...nonOllama, ...ollamaModels];
            });

            // Auto-save endpoint and switch to chat view
            localStorage.setItem('termai_ollama_key', endpoint);
            setApiKey(endpoint);
            setHasKey(true);
            setAgentStatus(`Fetched ${ollamaModels.length} local models!`);

            // If no messages or just a welcome message, show success
            setMessages(prev => {
                const isWelcome = prev.length === 0 || (prev.length === 1 && prev[0].role === 'ai');
                if (isWelcome) {
                    return [{ role: 'ai', content: `Connected to Ollama at ${endpoint}. Found ${ollamaModels.length} models. How can I help?` }];
                }
                return prev;
            });

            setTimeout(() => setAgentStatus(null), 3000);
        } catch (error) {
            console.error('Error fetching Ollama models:', error);
            setAgentStatus('Error fetching models. Check endpoint.');
            setTimeout(() => setAgentStatus(null), 3000);
        }
    };

    useEffect(() => {
        if (sessionId) {
            const saved = SessionManager.getSession(sessionId);
            if (saved) {
                setSessionName(saved.name);
            } else {
                setSessionName(`Session ${sessionId.substring(0, 6)}`);
            }
        }
    }, [sessionId]);

    const handleSaveSessionName = () => {
        if (sessionId && sessionName.trim()) {
            SessionManager.saveSession({
                id: sessionId,
                name: sessionName,
                timestamp: Date.now(),
                preview: messages[messages.length - 1]?.content.substring(0, 50) || ''
            });
            setIsEditingName(false);
        }
    };

    const loadSettings = () => {
        const storedProvider = localStorage.getItem('termai_provider') || 'gemini';
        let storedKey = localStorage.getItem(`termai_${storedProvider}_key`);

        // Default for Ollama if not set
        if (storedProvider === 'ollama') {
            if (!storedKey) {
                storedKey = 'http://localhost:11434';
                localStorage.setItem('termai_ollama_key', storedKey);
            }
            // Fetch models on startup to ensure we have the latest from the custom endpoint
            fetchOllamaModels(storedKey);
        }

        if (storedKey) {
            setApiKey(storedKey);
            setHasKey(true);
            // Load chat history if available
            const historyKey = sessionId ? `termai_chat_history_${sessionId}` : 'termai_chat_history';
            const storedHistory = localStorage.getItem(historyKey);
            if (storedHistory) {
                setMessages(JSON.parse(storedHistory));
            } else {
                // Reset to default if no history for this session
                setMessages([{ role: 'ai', content: 'Hi! I\'m TermAI. How can I help you with your terminal commands today?' }]);
            }
        } else {
            setApiKey('');
            setHasKey(false);
            setMessages([{ role: 'ai', content: `Hi! I'm TermAI. Please enter your ${storedProvider.charAt(0).toUpperCase() + storedProvider.slice(1)} API key to get started.` }]);
        }
    };

    useEffect(() => {
        loadSettings();

        const handleSettingsChange = () => {
            loadSettings();
        };

        window.addEventListener('termai-settings-changed', handleSettingsChange);

        const handleCwdChange = (e: CustomEvent<{ cwd: string, sessionId?: string }>) => {
            if (e.detail.sessionId === sessionId) {
                setCurrentCwd(e.detail.cwd);
            }
        };
        window.addEventListener('termai-cwd-changed' as any, handleCwdChange as any);

        const handleFetchModels = (e: CustomEvent<{ endpoint: string }>) => {
            fetchOllamaModels(e.detail.endpoint);
        };
        window.addEventListener('termai-fetch-models' as any, handleFetchModels as any);

        return () => {
            window.removeEventListener('termai-settings-changed', handleSettingsChange);
            window.removeEventListener('termai-cwd-changed' as any, handleCwdChange as any);
            window.removeEventListener('termai-fetch-models' as any, handleFetchModels as any);
        };
    }, [isOpen, sessionId]);

    // Persist messages
    useEffect(() => {
        if (messages.length > 1) {
            const historyKey = sessionId ? `termai_chat_history_${sessionId}` : 'termai_chat_history';
            localStorage.setItem(historyKey, JSON.stringify(messages));
        }
    }, [messages]);

    // Emit thinking state for SystemOverseer
    useEffect(() => {
        window.dispatchEvent(new CustomEvent('termai-ai-thinking', {
            detail: { isThinking: isLoading, sessionId }
        }));
    }, [isLoading, sessionId]);

    // Auto-scroll to bottom
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, agentStatus, isLoading]);

    useEffect(() => {
        const handleCommandFinished = async (e: CustomEvent<{ command: string, output: string, exitCode: number, sessionId?: string }>) => {
            if (e.detail.sessionId !== sessionId) return;

            const { command, output, exitCode } = e.detail;
            setRunningCommandId(null);
            // if (watchdogTimerRef.current) clearTimeout(watchdogTimerRef.current);

            // Add system output to chat
            let outputMsg = `> Executed: \`${command}\` (Exit: ${exitCode})\n\nOutput:\n\`\`\`\n${output.substring(0, 1000)}${output.length > 1000 ? '...' : ''}\n\`\`\``;

            // Intelligent Backtracking Trigger
            if (isAutoRun && exitCode !== 0) {
                outputMsg += `\n\n⚠️ Command Failed (Exit Code: ${exitCode}).\n\nAUTO-RECOVERY INITIATED:\n1. Review your last plan.\n2. Identify which step failed.\n3. Backtrack to the state before this step.\n4. Propose a DIFFERENT command to achieve the same goal. Do NOT repeat the failed command.`;
            } else if (isAutoRun) {
                // Success case - minimal noise
                // We don't need to add anything extra for success, the AI will just see the output.
            }

            setMessages(prev => [...prev, { role: 'system', content: outputMsg }]);

            // If Auto-Run is on, feed back to LLM
            if (isAutoRun) {
                if (autoRunCount >= MAX_AUTO_STEPS) {
                    setMessages(prev => [...prev, { role: 'system', content: '⚠️ Auto-Run limit reached (10 steps). Stopping for safety.' }]);
                    setIsAutoRun(false);
                    setAutoRunCount(0);
                    return;
                }

                setIsLoading(true);
                setAgentStatus('Analyzing command output...');
                try {
                    const providerType = localStorage.getItem('termai_provider') || 'gemini';
                    const llm = LLMManager.getProvider(providerType, apiKey, selectedModelId);

                    // Context includes full history
                    const context = messages.map(m => `${m.role}: ${m.content}`).join('\n') + `\nSystem Output:\n${outputMsg}`;

                    const systemPrompt = buildSystemPrompt({ cwd: currentCwd, isAutoRun, os: 'macOS' });

                    const response = await llm.chat(systemPrompt, context);

                    setMessages(prev => [...prev, { role: 'ai', content: response }]);

                    // Check for code blocks to auto-run
                    // Regex to match code blocks with or without language identifier
                    const codeBlockRegex = /```(?:\w+)?\n([\s\S]*?)\n```/g;
                    let match;
                    let foundCommand = false;


                    // ... inside useEffect for auto-run ...
                    while ((match = codeBlockRegex.exec(response)) !== null) {
                        const nextCommand = match[1].trim();
                        if (nextCommand) {
                            const impact = getCommandImpact(nextCommand);
                            if (impact) {
                                setPendingSafetyCommand({ command: nextCommand, sessionId, impact });
                                setShowSafetyConfirm(true);
                                setAgentStatus('Waiting for safety confirmation...');
                                break;
                            }
                            setAutoRunCount(prev => prev + 1);
                            window.dispatchEvent(new CustomEvent('termai-run-command', { detail: { command: nextCommand, sessionId } }));
                            setTimeout(() => {
                                const isCoding = nextCommand.startsWith('echo') || nextCommand.startsWith('cat') || nextCommand.startsWith('printf') || nextCommand.includes('>');
                                setAgentStatus(isCoding ? `Coding: ${nextCommand}` : `Terminal: ${nextCommand}`);
                            }, 1500);
                        }
                    }


                    if (!foundCommand && response.toLowerCase().includes('task complete')) {
                        // Keep Auto-Run on, just reset count for next task
                        setAutoRunCount(0);
                        setAgentStatus(null);
                    } else if (!foundCommand && isAutoRun) {
                        // Stall detection: Auto-Run is on, but no command and not complete
                        setMessages(prev => [...prev, { role: 'system', content: '⚠️ Auto-Run Stalled: No command found. Please explain why you stopped or ask for input.' }]);
                        // Don't turn off auto-run, let it try to explain itself in next turn if triggered manually, 
                        // but for now we just stop the loop to prevent infinite "thinking" without action.
                        setAgentStatus('Stalled. Waiting for input...');
                    }

                    if (response.includes('[NEW_TAB]')) {
                        window.dispatchEvent(new CustomEvent('termai-new-tab'));
                        setAgentStatus('Opening new tab...');
                    }

                    if (response.includes('[CANCEL]')) {
                        // We need the ID. For now, let's just emit a generic cancel event and let TerminalSession handle it?
                        // But TerminalSession needs an ID.
                        // Let's update TerminalSession to broadcast the ID when it starts.
                        if (runningCommandId) {
                            window.dispatchEvent(new CustomEvent('termai-cancel-command', { detail: { commandId: runningCommandId, sessionId } }));
                            setAgentStatus('Cancelling command...');
                            setRunningCommandId(null);
                        }
                    }

                } catch (error) {
                    setMessages(prev => [...prev, { role: 'ai', content: 'Error in auto-run loop.' }]);
                    // Keep Auto-Run on, let user decide to stop
                    setAgentStatus('Error encountered.');
                } finally {
                    setIsLoading(false);
                }
            }
        };

        window.addEventListener('termai-command-finished' as any, handleCommandFinished as any);

        const handleCommandStarted = (e: CustomEvent<{ commandId: string, command: string, sessionId?: string }>) => {
            if (e.detail.sessionId !== sessionId) return;

            setRunningCommandId(e.detail.commandId);
            // Watchdog is now handled by SystemOverseer
        };
        window.addEventListener('termai-command-started' as any, handleCommandStarted as any);

        const handleAutoContinue = () => {
            if (isAutoRun) {
                handleSend('', false); // Trigger generation with empty input (continuation)
            }
        };
        window.addEventListener('termai-auto-continue', handleAutoContinue);

        return () => {
            window.removeEventListener('termai-command-finished' as any, handleCommandFinished as any);
            window.removeEventListener('termai-command-started' as any, handleCommandStarted as any);
            window.removeEventListener('termai-auto-continue', handleAutoContinue);
            // if (watchdogTimerRef.current) clearTimeout(watchdogTimerRef.current);
        };
    }, [apiKey, isAutoRun, messages, autoRunCount, runningCommandId]);

    // Loop Prevention: Check if the last AI message is identical to the one before the last system message
    // This is a heuristic to stop repetitive loops.
    useEffect(() => {
        if (isAutoRun && messages.length > 4) {
            const lastAiMsg = messages[messages.length - 1];
            const prevAiMsg = messages[messages.length - 3]; // AI -> System -> AI
            if (lastAiMsg.role === 'ai' && prevAiMsg?.role === 'ai' && lastAiMsg.content === prevAiMsg.content) {
                setMessages(prev => [...prev, { role: 'system', content: '⚠️ Loop Detected: You are repeating the same command/response. Auto-Run stopped.' }]);
                setIsAutoRun(false);
                setAgentStatus('Loop detected. Stopped.');
            }
        }
    }, [messages, isAutoRun]);

    const handleSaveKey = () => {
        if (apiKey.trim()) {
            const provider = localStorage.getItem('termai_provider') || 'gemini';
            localStorage.setItem(`termai_${provider}_key`, apiKey);
            setHasKey(true);
            setMessages([{ role: 'ai', content: 'API Key saved! How can I help you?' }]);
        }
    };

    const handleSend = async (overrideInput?: string, isNewConversation: boolean = false) => {
        const textToSend = overrideInput || input;
        if (!textToSend.trim()) return;

        // Complex Request Check
        if (!overrideInput && messages.length > 2 && textToSend.length > 50 && !showComplexConfirm) {
            setPendingComplexMessage(textToSend);
            setShowComplexConfirm(true);
            return;
        }

        setShowComplexConfirm(false);
        setPendingComplexMessage('');

        if (isNewConversation) {
            setMessages([{ role: 'ai', content: 'Starting new conversation...' }]);
            // Ideally we would generate a new session ID here, but since we are bound to the tab's session ID,
            // we effectively "reset" the current session's memory.
            // A better approach might be to ask the parent to create a new tab, but for now resetting is safer.
        }

        const userMsg = textToSend;
        setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
        setInput('');
        setIsLoading(true);
        setAgentStatus('Thinking...');

        // Save session implicitly on interaction
        if (sessionId) {
            SessionManager.saveSession({
                id: sessionId,
                name: sessionName || `Session ${sessionId.substring(0, 6)}`,
                timestamp: Date.now(),
                preview: userMsg.substring(0, 50)
            });
        }

        try {
            const providerType = localStorage.getItem('termai_provider') || 'gemini';
            const llm = LLMManager.getProvider(providerType, apiKey, selectedModelId);

            // Context includes full history
            const context = messages.map(m => `${m.role}: ${m.content}`).join('\n') + `\nUser: ${userMsg}`;

            const systemPrompt = buildSystemPrompt({ cwd: currentCwd, isAutoRun, os: 'macOS' });

            const response = await llm.chat(systemPrompt, context);

            setMessages(prev => [...prev, { role: 'ai', content: response }]);
            setAgentStatus(null);

            // Check for code blocks to auto-run
            if (isAutoRun) {
                // --- Tool Execution Logic ---
                const toolRegex = /\[(READ_FILE|WRITE_FILE|LIST_FILES|MKDIR): (.*?)\]/g;
                let toolMatch;
                while ((toolMatch = toolRegex.exec(response)) !== null) {
                    const [fullMatch, tool, args] = toolMatch;
                    const path = args.trim();
                    let output = '';
                    let success = false;

                    setAgentStatus(`Executing Tool: ${tool}...`);

                    try {
                        switch (tool) {
                            case 'READ_FILE':
                                const content = await FileSystemService.readFile(path);
                                output = `[TOOL_OUTPUT]\nFile: ${path}\nContent:\n\`\`\`\n${content}\n\`\`\``;
                                success = true;
                                break;
                            case 'LIST_FILES':
                                const files = await FileSystemService.listFiles(path);
                                output = `[TOOL_OUTPUT]\nDirectory: ${path}\nFiles:\n${files.map(f => `${f.isDirectory ? '[DIR]' : '[FILE]'} ${f.name}`).join('\n')}`;
                                success = true;
                                break;
                            case 'MKDIR':
                                await FileSystemService.createDirectory(path);
                                output = `[TOOL_OUTPUT]\nDirectory created: ${path}`;
                                success = true;
                                break;
                            case 'WRITE_FILE':
                                // Find the code block immediately following the tool call
                                const codeBlockRegex = /```(?:\w+)?\n([\s\S]*?)\n```/;
                                const afterTool = response.substring(toolMatch.index + fullMatch.length);
                                const codeMatch = codeBlockRegex.exec(afterTool);
                                if (codeMatch) {
                                    const fileContent = codeMatch[1];
                                    await FileSystemService.writeFile(path, fileContent);
                                    output = `[TOOL_OUTPUT]\nFile written: ${path}`;
                                    success = true;
                                } else {
                                    output = `[TOOL_ERROR]\nNo content block found for WRITE_FILE: ${path}`;
                                }
                                break;
                        }
                    } catch (error: any) {
                        output = `[TOOL_ERROR]\n${error.message}`;
                    }

                    // Feed result back to AI
                    setMessages(prev => [...prev, { role: 'system', content: output }]);

                    // Trigger next step if successful
                    if (success) {
                        // We need to trigger the AI again with the new context
                        // This is a bit recursive, so we use a timeout to break the stack
                        setTimeout(() => {
                            if (isAutoRun) { // Check again in case user stopped it
                                handleSend('', false); // Empty input triggers "continue" logic if we handle it? 
                                // Actually handleSend expects input. We need a way to "continue".
                                // We can just call handleSend with a hidden system prompt or just re-trigger.
                                // Let's modify handleSend to accept a "continue" flag or just call it with "Continue"
                                // But "Continue" might be interpreted as user input.
                                // Better: The system message is added. We just need to call the API again.
                                // I'll extract the API call logic or just simulate a user "continue" for now, 
                                // but really we want the AI to see the tool output and keep going.
                                // Let's just call handleSend with a special flag or empty string and handle it.
                                // For now, I'll manually trigger the API call logic here to avoid recursion issues with handleSend state.
                                // Actually, simpler: Just set a state "triggerNextTurn" and use a useEffect?
                                // Or just call handleSend('System: Tool executed. Continue.')?
                                // Let's try calling handleSend with a hidden prompt.
                                // But wait, handleSend adds a USER message. We don't want that.
                                // We added a SYSTEM message above.
                                // We need to trigger the AI generation only.
                                // I'll refactor handleSend slightly or just duplicate the generation logic for tools?
                                // Duplication is risky.
                                // Let's use a "trigger" state.
                                window.dispatchEvent(new CustomEvent('termai-auto-continue'));
                            }
                        }, 1000);
                    }
                }

                // --- Existing Command Logic ---
                const codeBlockRegex = /```(?:\w+)?\n([\s\S]*?)\n```/g;
                let match;
                while ((match = codeBlockRegex.exec(response)) !== null) {
                    const nextCommand = match[1].trim();
                    // Skip if it looks like file content (heuristic: long, or preceded by WRITE_FILE)
                    // This is tricky. The WRITE_FILE logic above consumes the block? No, regexes are independent.
                    // We need to be careful not to execute file content as shell commands.
                    // Heuristic: If previous line contained [WRITE_FILE], skip.
                    const beforeBlock = response.substring(0, match.index).trim();
                    if (beforeBlock.endsWith(']')) { // Likely [WRITE_FILE: ...]
                        const lastBracket = beforeBlock.lastIndexOf('[');
                        if (lastBracket !== -1) {
                            const tag = beforeBlock.substring(lastBracket);
                            if (tag.includes('WRITE_FILE')) continue; // Skip this block
                        }
                    }

                    if (nextCommand) {
                        const impact = getCommandImpact(nextCommand);
                        if (impact) {
                            setPendingSafetyCommand({ command: nextCommand, sessionId, impact });
                            setShowSafetyConfirm(true);
                            setAgentStatus('Waiting for safety confirmation...');
                            break;
                        }
                        setAutoRunCount(prev => prev + 1);
                        window.dispatchEvent(new CustomEvent('termai-run-command', { detail: { command: nextCommand, sessionId } }));
                        const isCoding = nextCommand.startsWith('echo') || nextCommand.startsWith('cat') || nextCommand.startsWith('printf') || nextCommand.includes('>');
                        setAgentStatus(isCoding ? `Coding: ${nextCommand}` : `Terminal: ${nextCommand}`);
                    }
                }
                if (response.includes('[NEW_TAB]')) {
                    window.dispatchEvent(new CustomEvent('termai-new-tab'));
                }
            }
        }
        catch (error: any) {
            console.error('LLM Error:', error);
            let errorMsg = 'Sorry, something went wrong.';

            if (error.message) {
                errorMsg += ` Error: ${error.message}`;
            }

            if (localStorage.getItem('termai_provider') !== 'ollama') {
                errorMsg += ' Please check your API key in Settings.';
            } else {
                errorMsg += ' Please check your Ollama endpoint and ensure the model is installed.';
            }

            setMessages(prev => [...prev, { role: 'ai', content: errorMsg }]);
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className={clsx(styles.panel, isEmbedded && styles.embedded)}>
            {!isEmbedded && (
                <div className={styles.header}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Sparkles size={16} className="text-accent-primary" />
                        <span>TermAI</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', cursor: 'pointer', color: isAutoRun ? 'var(--accent-primary)' : 'var(--text-secondary)' }}>
                            <input
                                type="checkbox"
                                checked={isAutoRun}
                                onChange={(e) => {
                                    setIsAutoRun(e.target.checked);
                                    if (!e.target.checked) setAutoRunCount(0);
                                }}
                                style={{ accentColor: 'var(--accent-primary)' }}
                            />
                            Auto-Run
                        </label>
                        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                            <X size={16} />
                        </button>
                    </div>
                </div>
            )}

            {isEmbedded && (
                <div className={styles.header}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                        <Sparkles size={16} className="text-accent-primary" />
                        {isEditingName ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <input
                                    value={sessionName}
                                    onChange={(e) => setSessionName(e.target.value)}
                                    className={styles.input}
                                    style={{ padding: '2px 4px', height: '24px', width: '120px' }}
                                    autoFocus
                                    onKeyDown={(e) => e.key === 'Enter' && handleSaveSessionName()}
                                    onBlur={handleSaveSessionName}
                                />
                                <button onClick={handleSaveSessionName} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--success)' }}>
                                    <Save size={14} />
                                </button>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }} onClick={() => setIsEditingName(true)}>
                                <span style={{ fontWeight: 600, fontSize: '13px' }}>{sessionName || 'TermAI'}</span>
                                <Pencil size={12} style={{ opacity: 0.5 }} />
                            </div>
                        )}
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', cursor: 'pointer', color: isAutoRun ? 'var(--accent-primary)' : 'var(--text-secondary)' }}>
                        <input
                            type="checkbox"
                            checked={isAutoRun}
                            onChange={(e) => {
                                setIsAutoRun(e.target.checked);
                                if (!e.target.checked) setAutoRunCount(0);
                            }}
                            style={{ accentColor: 'var(--accent-primary)' }}
                        />
                        Auto-Run
                    </label>
                </div>
            )}

            <div className={styles.content}>
                {!hasKey ? (
                    <div className={styles.message + ' ' + styles.aiMessage}>
                        <p style={{ marginBottom: '10px' }}>
                            {localStorage.getItem('termai_provider') === 'ollama'
                                ? 'Enter Ollama Endpoint URL:'
                                : `Please enter your ${(localStorage.getItem('termai_provider') || 'gemini').charAt(0).toUpperCase() + (localStorage.getItem('termai_provider') || 'gemini').slice(1)} API Key:`}
                        </p>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                                type={localStorage.getItem('termai_provider') === 'ollama' ? 'text' : 'password'}
                                className={styles.input}
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                placeholder={localStorage.getItem('termai_provider') === 'ollama' ? 'http://localhost:11434' : 'API Key'}
                            />
                            {localStorage.getItem('termai_provider') === 'ollama' && (
                                <button
                                    onClick={() => fetchOllamaModels(apiKey || 'http://localhost:11434')}
                                    className={styles.actionBtn}
                                    style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '0 12px', cursor: 'pointer' }}
                                >
                                    Fetch Models
                                </button>
                            )}
                            <button onClick={handleSaveKey} className={styles.actionBtn} style={{ background: 'var(--accent-primary)', color: 'white', border: 'none', borderRadius: '4px', padding: '0 12px', cursor: 'pointer' }}>
                                Save
                            </button>
                        </div>
                        <p style={{ fontSize: '10px', marginTop: '8px', opacity: 0.7 }}>
                            {localStorage.getItem('termai_provider') === 'ollama'
                                ? 'Default: http://localhost:11434. No key required.'
                                : 'Key is stored locally in your browser.'}
                        </p>
                    </div>
                ) : (
                    messages.map((msg, idx) => (
                        <div key={idx} className={`${styles.message} ${msg.role === 'user' ? styles.userMessage : msg.role === 'system' ? styles.systemMessage : styles.aiMessage}`}>
                            {msg.role === 'system' ? (
                                <div style={{ fontSize: '11px', opacity: 0.8, whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                            ) : (
                                msg.content.split(/```(?:\w+)?\n([\s\S]*?)\n```/g).map((part, i) => {
                                    if (i % 2 === 1) {
                                        // This is a code block
                                        return (
                                            <div key={i} style={{ background: 'rgba(0,0,0,0.3)', padding: '8px', borderRadius: '4px', margin: '8px 0', border: '1px solid var(--border-color)' }}>
                                                <code style={{ display: 'block', marginBottom: '8px', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{part}</code>
                                                {!isAutoRun && (
                                                    <button
                                                        onClick={() => window.dispatchEvent(new CustomEvent('termai-run-command', { detail: { command: part.trim(), sessionId } }))}
                                                        style={{
                                                            background: 'var(--accent-primary)',
                                                            color: 'white',
                                                            border: 'none',
                                                            borderRadius: '4px',
                                                            padding: '4px 8px',
                                                            fontSize: '11px',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '4px'
                                                        }}
                                                    >
                                                        <Send size={10} /> Run
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    }
                                    return <span key={i}>{part}</span>;
                                })
                            )}
                        </div>
                    ))
                )}


                {agentStatus && (
                    <div style={{
                        background: 'rgba(var(--accent-primary-rgb), 0.1)',
                        border: '1px solid var(--accent-primary)',
                        borderRadius: '8px',
                        padding: '12px',
                        margin: '10px 0',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        fontSize: '12px',
                        color: 'var(--text-primary)'
                    }}>
                        <div className={styles.spinner}></div>
                        <span>{agentStatus}</span>
                    </div>
                )}

                {isLoading && !agentStatus && <div className={styles.message + ' ' + styles.aiMessage}>Thinking...</div>}
                <div ref={messagesEndRef} />
            </div>

            {hasKey && (
                <div className={styles.inputWrapper}>
                    <div className={styles.inputContainer}>
                        <div className={styles.contextChips}>
                            <div className={styles.chip}>
                                <Folder size={10} className={styles.chipIcon} />
                                {currentCwd.split('/').pop() || '~'}
                            </div>
                            <div className={styles.chip}>
                                <GitBranch size={10} className={styles.chipIcon} />
                                git:(main)
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
                            <button style={{ color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                                <Paperclip size={16} />
                            </button>
                            <ModelSelector
                                models={models}
                                selectedModelId={selectedModelId}
                                onSelect={(model) => {
                                    setSelectedModelId(model.id);
                                    // Update provider based on model
                                    const newProvider = model.provider;
                                    localStorage.setItem('termai_provider', newProvider);

                                    // Load key for new provider
                                    const storedKey = localStorage.getItem(`termai_${newProvider}_key`);
                                    if (newProvider === 'ollama') {
                                        setHasKey(true); // Ollama doesn't strictly need a key
                                        setApiKey(storedKey || 'http://localhost:11434');
                                    } else if (storedKey) {
                                        setApiKey(storedKey);
                                        setHasKey(true);
                                    } else {
                                        setApiKey('');
                                        setHasKey(false);
                                        setMessages(prev => [...prev, { role: 'system', content: `Switched to ${model.name}. Please enter your ${newProvider} API key.` }]);
                                    }

                                    // Dispatch event to notify other components if needed
                                    window.dispatchEvent(new Event('termai-settings-changed'));
                                }}
                            />
                            <textarea
                                className={styles.input}
                                placeholder="Ask a follow up..."
                                rows={1}
                                value={input}
                                onChange={(e) => {
                                    setInput(e.target.value);
                                    e.target.style.height = 'auto';
                                    e.target.style.height = e.target.scrollHeight + 'px';
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSend();
                                    }
                                }}
                            />
                            <button
                                onClick={() => handleSend()}
                                disabled={isLoading}
                                style={{
                                    background: input.trim() ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: isLoading ? 'wait' : 'pointer',
                                    color: input.trim() ? 'white' : 'var(--text-secondary)',
                                    padding: '6px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                <ArrowUp size={16} />
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {showComplexConfirm && (
                <div style={{
                    position: 'absolute',
                    bottom: '80px',
                    left: '16px',
                    right: '16px',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    padding: '16px',
                    boxShadow: 'var(--shadow-lg)',
                    zIndex: 1000
                }}>
                    <div style={{ marginBottom: '12px', fontWeight: 600, fontSize: '13px' }}>Start new conversation?</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                        You're changing topics. Would you like to start a fresh context or continue this one?
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            onClick={() => handleSend(pendingComplexMessage, true)}
                            style={{
                                flex: 1,
                                padding: '8px',
                                background: 'var(--accent-primary)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer'
                            }}
                        >
                            Start New
                        </button>
                        <button
                            onClick={() => handleSend(pendingComplexMessage, false)}
                            style={{
                                flex: 1,
                                padding: '8px',
                                background: 'var(--bg-tertiary)',
                                color: 'var(--text-primary)',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer'
                            }}
                        >
                            Continue
                        </button>
                    </div>
                </div>
            )}
            {showSafetyConfirm && pendingSafetyCommand && (
                <div style={{
                    position: 'absolute',
                    bottom: '80px',
                    left: '16px',
                    right: '16px',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--error-color)',
                    borderRadius: '8px',
                    padding: '16px',
                    boxShadow: 'var(--shadow-lg)',
                    zIndex: 1000
                }}>
                    <div style={{ marginBottom: '12px', fontWeight: 600, fontSize: '13px', color: 'var(--error-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '16px' }}>⚠️</span> Dangerous Command Detected
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                        The AI wants to run a potentially destructive command:
                    </div>
                    <div style={{
                        background: 'var(--bg-tertiary)',
                        padding: '8px',
                        borderRadius: '4px',
                        fontFamily: 'monospace',
                        fontSize: '11px',
                        marginBottom: '16px',
                        overflowX: 'auto',
                        whiteSpace: 'pre-wrap',
                        color: 'var(--error-color)'
                    }}>
                        {pendingSafetyCommand.command}
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            onClick={() => handleSafetyConfirm(true)}
                            style={{
                                flex: 1,
                                padding: '8px',
                                background: 'var(--error-color)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontWeight: 600
                            }}
                        >
                            Allow & Run
                        </button>
                        <button
                            onClick={() => handleSafetyConfirm(false)}
                            style={{
                                flex: 1,
                                padding: '8px',
                                background: 'var(--bg-tertiary)',
                                color: 'var(--text-primary)',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer'
                            }}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
