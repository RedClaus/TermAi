import React, { useState, useRef, useEffect } from 'react';
import { Block } from './Block';
import { InputArea } from './InputArea';
import type { BlockData } from '../../types';
import { executeCommand, cancelCommand } from '../../utils/commandRunner';
import styles from './TerminalSession.module.css';
import { v4 as uuidv4 } from 'uuid';

interface TerminalSessionProps {
    sessionId?: string;
}

export const TerminalSession: React.FC<TerminalSessionProps> = ({ sessionId }) => {
    const [blocks, setBlocks] = useState<BlockData[]>([]);
    const [cwd, setCwd] = useState('~');
    const scrollRef = useRef<HTMLDivElement>(null);


    // Load history specific to session if provided
    useEffect(() => {
        if (sessionId) {
            const storedCwd = localStorage.getItem(`termai_cwd_${sessionId}`);
            if (storedCwd) setCwd(storedCwd);
        }
    }, [sessionId]);

    // Save CWD and emit event for AI (scoped)
    useEffect(() => {
        if (sessionId) {
            localStorage.setItem(`termai_cwd_${sessionId}`, cwd);
        }
        window.dispatchEvent(new CustomEvent('termai-cwd-changed', {
            detail: { cwd, sessionId }
        }));
    }, [cwd, sessionId]);

    useEffect(() => {
        const handleRunCommand = (e: CustomEvent<{ command: string }>) => {
            handleExecute(e.detail.command);
        };

        window.addEventListener('termai-run-command' as any, handleRunCommand as any);
        return () => {
            window.removeEventListener('termai-run-command' as any, handleRunCommand as any);
        };
    }, [cwd, blocks, sessionId]); // Re-bind when state changes to capture latest cwd or sessionId

    const handleExecute = async (command: string) => {
        if (command === 'clear') {
            setBlocks([]);
            return;
        }

        const tempId = uuidv4();
        const pendingBlock: BlockData = {
            id: tempId,
            command,
            output: '',
            cwd,
            timestamp: Date.now(),
            exitCode: 0,
            isLoading: true
        };

        setBlocks(prev => [...prev, pendingBlock]);

        // Emit start event for AI Watchdog
        window.dispatchEvent(new CustomEvent('termai-command-started', {
            detail: { commandId: tempId, command, sessionId }
        }));

        // Scroll to bottom immediately
        setTimeout(() => {
            if (scrollRef.current) {
                scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            }
        }, 10);

        // Listen for cancel events for this specific command
        const handleCancel = (e: CustomEvent<{ commandId: string, sessionId?: string }>) => {
            // Only cancel if it matches our session (or if no session specified for backward compat)
            if (e.detail.commandId === tempId && (!e.detail.sessionId || e.detail.sessionId === sessionId)) {
                cancelCommand(tempId);
                setBlocks(prev => prev.map(b =>
                    b.id === tempId
                        ? { ...b, output: 'Command cancelled by user/AI.', exitCode: 130, isLoading: false }
                        : b
                ));
            }
        };
        window.addEventListener('termai-cancel-command' as any, handleCancel as any);

        try {
            const result = await executeCommand(command, cwd, tempId);

            setBlocks(prev => prev.map(b =>
                b.id === tempId
                    ? { ...b, output: result.output, exitCode: result.exitCode, isLoading: false }
                    : b
            ));

            if (result.newCwd) {
                setCwd(result.newCwd);
                window.dispatchEvent(new CustomEvent('termai-cwd-changed', { detail: { cwd: result.newCwd } }));
            }

            // Emit output event for System Overseer (to prove aliveness)
            window.dispatchEvent(new CustomEvent('termai-command-output', {
                detail: { commandId: tempId, output: result.output, sessionId }
            }));

            // Emit event for AI to see output
            window.dispatchEvent(new CustomEvent('termai-command-finished', {
                detail: {
                    command,
                    output: result.output,
                    exitCode: result.exitCode,
                    sessionId // Ensure sessionId is passed
                }
            }));
        } catch (error) {
            // Failsafe: Ensure we don't hang
            setBlocks(prev => prev.map(b =>
                b.id === tempId
                    ? { ...b, output: `Error: ${(error as Error).message}`, exitCode: 1, isLoading: false }
                    : b
            ));
            window.dispatchEvent(new CustomEvent('termai-command-finished', {
                detail: {
                    command,
                    output: `Error: ${(error as Error).message}`,
                    exitCode: 1,
                    sessionId
                }
            }));
        } finally {
            window.removeEventListener('termai-cancel-command' as any, handleCancel as any);
        }

        setTimeout(() => {
            if (scrollRef.current) {
                scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            }
        }, 10);
    };

    // Auto-scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [blocks]);

    return (
        <div className={styles.container}>
            <div className={styles.scrollArea} ref={scrollRef}>
                {blocks.length === 0 && (
                    <div className={styles.welcomeMessage}>
                        <div className={styles.welcomeTitle}>Welcome to TermAI</div>
                        <p>Your new terminal buddy.</p>
                        <p>Try running <code>ls</code>, <code>help</code>, or ask AI with <code>#</code>.</p>
                    </div>
                )}
                {blocks.map(block => (
                    <Block key={block.id} data={block} />
                ))}
            </div>
            <InputArea onExecute={handleExecute} cwd={cwd} />
        </div>
    );
};
