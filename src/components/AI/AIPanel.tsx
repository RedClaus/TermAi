import React, { useState, useEffect, useRef } from 'react';
import styles from './AIPanel.module.css';
import { X, Sparkles, Send, GitBranch, Folder, Paperclip, ArrowUp, Pencil, Save } from 'lucide-react';
import { LLMManager } from '../../services/LLMManager';
import { buildSystemPrompt } from '../../utils/promptBuilder';
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
        const storedKey = localStorage.getItem(`termai_${storedProvider}_key`);

        if (storedKey) {
            setApiKey(storedKey);
            setHasKey(true);
            // Load chat history if available
            const historyKey = sessionId ? `termai_chat_history_${sessionId}` : 'termai_chat_history';
            const storedHistory = localStorage.getItem(historyKey);
            if (storedHistory) {
                setMessages(JSON.parse(storedHistory));
            } else if (messages.length === 1 && messages[0].role === 'ai') {
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

        return () => {
            window.removeEventListener('termai-settings-changed', handleSettingsChange);
            window.removeEventListener('termai-cwd-changed' as any, handleCwdChange as any);
        };
    }, [isOpen]);

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
            let outputMsg = `Command executed: \`${command}\`\nExit Code: ${exitCode}\nOutput:\n\`\`\`\n${output.substring(0, 1000)}${output.length > 1000 ? '...' : ''}\n\`\`\``;

            // Intelligent Backtracking Trigger
            if (exitCode !== 0) {
                outputMsg += `\n\n⚠️ Command Failed (Exit Code: ${exitCode}).\n\nAUTO-RECOVERY INITIATED:\n1. Review your last plan.\n2. Identify which step failed.\n3. Backtrack to the state before this step.\n4. Propose a DIFFERENT command to achieve the same goal. Do NOT repeat the failed command.`;
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

                    while ((match = codeBlockRegex.exec(response)) !== null) {
                        const nextCommand = match[1].trim();
                        if (nextCommand) {
                            foundCommand = true;
                            setAutoRunCount(prev => prev + 1);
                            setTimeout(() => {
                                const isCoding = nextCommand.startsWith('echo') || nextCommand.startsWith('cat') || nextCommand.startsWith('printf') || nextCommand.includes('>');
                                setAgentStatus(isCoding ? `Coding: ${nextCommand}` : `Terminal: ${nextCommand}`);
                                // We can't easily get the ID back unless TerminalSession broadcasts it.
                                // Actually, we just dispatch the command string. TerminalSession generates the ID.
                                // We can't easily get the ID back unless TerminalSession broadcasts it.
                                // Let's assume for now we just broadcast "CANCEL" and TerminalSession cancels the *latest* one?
                                // Or better: TerminalSession broadcasts "termai-command-started" with ID.
                                window.dispatchEvent(new CustomEvent('termai-run-command', { detail: { command: nextCommand, sessionId } }));
                            }, 1500); // Delay for UX
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
            setRunningCommandId(e.detail.commandId);
            // Watchdog is now handled by SystemOverseer
        };
        window.addEventListener('termai-command-started' as any, handleCommandStarted as any);

        return () => {
            window.removeEventListener('termai-command-finished' as any, handleCommandFinished as any);
            window.removeEventListener('termai-command-started' as any, handleCommandStarted as any);
            // if (watchdogTimerRef.current) clearTimeout(watchdogTimerRef.current);
        };
    }, [apiKey, isAutoRun, messages, autoRunCount, runningCommandId]);

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
                const codeBlockRegex = /```(?:\w+)?\n([\s\S]*?)\n```/g;
                let match;
                while ((match = codeBlockRegex.exec(response)) !== null) {
                    const command = match[1].trim();
                    if (command) {
                        setAutoRunCount(prev => prev + 1);
                        window.dispatchEvent(new CustomEvent('termai-run-command', { detail: { command, sessionId } }));
                        const isCoding = command.startsWith('echo') || command.startsWith('cat') || command.startsWith('printf') || command.includes('>');
                        setAgentStatus(isCoding ? `Coding: ${command}` : `Terminal: ${command}`);
                    }
                }
                if (response.includes('[NEW_TAB]')) {
                    window.dispatchEvent(new CustomEvent('termai-new-tab'));
                }
            }
        }
        catch (error) {
            setMessages(prev => [...prev, { role: 'ai', content: 'Sorry, something went wrong. Please check your API key in Settings.' }]);
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
                        <p style={{ marginBottom: '10px' }}>Please enter your {(localStorage.getItem('termai_provider') || 'gemini').charAt(0).toUpperCase() + (localStorage.getItem('termai_provider') || 'gemini').slice(1)} API Key:</p>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                                type="password"
                                className={styles.input}
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                placeholder="API Key"
                            />
                            <button onClick={handleSaveKey} className={styles.actionBtn} style={{ background: 'var(--accent-primary)', color: 'white', border: 'none', borderRadius: '4px', padding: '0 12px', cursor: 'pointer' }}>
                                Save
                            </button>
                        </div>
                        <p style={{ fontSize: '10px', marginTop: '8px', opacity: 0.7 }}>Key is stored locally in your browser.</p>
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
                                selectedModelId={selectedModelId}
                                onSelect={(model) => setSelectedModelId(model.id)}
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
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '12px'
                            }}
                        >
                            New Conversation
                        </button>
                        <button
                            onClick={() => handleSend(pendingComplexMessage, false)}
                            style={{
                                flex: 1,
                                padding: '8px',
                                background: 'var(--bg-tertiary)',
                                color: 'var(--text-primary)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '12px'
                            }}
                        >
                            Continue
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
