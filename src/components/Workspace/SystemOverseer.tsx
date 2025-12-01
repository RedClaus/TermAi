import React, { useState, useEffect, useRef } from 'react';
import styles from './SystemOverseer.module.css';
import { Activity, AlertTriangle, CheckCircle } from 'lucide-react';
import clsx from 'clsx';

interface SystemOverseerProps {
    sessionId: string;
}

type SystemState = 'healthy' | 'busy' | 'stalled' | 'error';

export const SystemOverseer: React.FC<SystemOverseerProps> = ({ sessionId }) => {
    const [state, setState] = useState<SystemState>('healthy');
    const [statusMessage, setStatusMessage] = useState('System Healthy');

    // Tracking state
    const lastActivityRef = useRef<number>(Date.now());
    const runningCommandRef = useRef<{ id: string, startTime: number } | null>(null);
    const isAiThinkingRef = useRef<boolean>(false);
    const aiStartTimeRef = useRef<number>(0);

    useEffect(() => {
        const updateActivity = () => {
            lastActivityRef.current = Date.now();
        };

        // Event Listeners
        const handleCommandStarted = (e: CustomEvent) => {
            if (e.detail.sessionId !== sessionId) return;
            runningCommandRef.current = { id: e.detail.commandId, startTime: Date.now() };
            updateActivity();
            setState('busy');
            setStatusMessage(`Running: ${e.detail.command}`);
        };

        const handleCommandOutput = (e: CustomEvent) => {
            if (e.detail.sessionId !== sessionId) return;
            updateActivity();
            // If we get output, we are healthy even if running long
            if (state === 'stalled') {
                setState('busy');
                setStatusMessage('Processing output...');
            }
        };

        const handleCommandFinished = (e: CustomEvent) => {
            if (e.detail.sessionId !== sessionId) return;
            runningCommandRef.current = null;
            updateActivity();
            setState('healthy');
            setStatusMessage('Command finished');
            setTimeout(() => setStatusMessage('System Healthy'), 2000);
        };

        const handleAiThinking = (e: CustomEvent) => {
            if (e.detail.sessionId !== sessionId) return;
            if (e.detail.isThinking) {
                isAiThinkingRef.current = true;
                aiStartTimeRef.current = Date.now();
                setState('busy');
                setStatusMessage('AI Thinking...');
            } else {
                isAiThinkingRef.current = false;
                setState('healthy');
                setStatusMessage('AI Ready');
                setTimeout(() => setStatusMessage('System Healthy'), 2000);
            }
        };

        window.addEventListener('termai-command-started' as any, handleCommandStarted);
        window.addEventListener('termai-command-output' as any, handleCommandOutput);
        window.addEventListener('termai-command-finished' as any, handleCommandFinished);
        window.addEventListener('termai-ai-thinking' as any, handleAiThinking);

        // Watchdog Loop
        const interval = setInterval(() => {
            const now = Date.now();

            // Check Command Stall (Running > 15s AND No Output > 15s)
            if (runningCommandRef.current) {
                const runDuration = now - runningCommandRef.current.startTime;
                const timeSinceActivity = now - lastActivityRef.current;

                // Check Command Stall (Running > 30s AND No Output > 30s)
                if (runDuration > 30000 && timeSinceActivity > 30000) {
                    setState('stalled');
                    setStatusMessage('Stalled! Auto-Fixing...');

                    // Auto-Intervention after 5s of stall
                    if (runDuration > 35000) {
                        handleIntervention();
                    }
                }
            }

            // Check AI Stall (Thinking > 45s)
            if (isAiThinkingRef.current) {
                const thinkDuration = now - aiStartTimeRef.current;
                if (thinkDuration > 45000) {
                    setState('stalled');
                    setStatusMessage('AI Stalled?');
                }
            }
        }, 1000);

        return () => {
            window.removeEventListener('termai-command-started' as any, handleCommandStarted);
            window.removeEventListener('termai-command-output' as any, handleCommandOutput);
            window.removeEventListener('termai-command-finished' as any, handleCommandFinished);
            window.removeEventListener('termai-ai-thinking' as any, handleAiThinking);
            clearInterval(interval);
        };
    }, [sessionId]);

    const handleIntervention = () => {
        if (state === 'stalled') {
            if (runningCommandRef.current) {
                // Cancel command
                window.dispatchEvent(new CustomEvent('termai-cancel-command', {
                    detail: { commandId: runningCommandRef.current.id, sessionId }
                }));
                setStatusMessage('Intervention: Cancelled Command');
            }
            if (isAiThinkingRef.current) {
                // Reset AI (simulated by just clearing state for now, ideally we'd abort the fetch)
                isAiThinkingRef.current = false;
                setStatusMessage('Intervention: Reset AI');
            }
            setState('healthy');
            setTimeout(() => setStatusMessage('System Healthy'), 2000);
        }
    };

    return (
        <div
            className={clsx(styles.overseer, styles[state])}
            onClick={handleIntervention}
            title={state === 'stalled' ? "Click to Intervene" : statusMessage}
        >
            {state === 'healthy' && <CheckCircle size={14} />}
            {state === 'busy' && <Activity size={14} className={styles.pulse} />}
            {state === 'stalled' && <AlertTriangle size={14} />}
            <span className={styles.statusText}>{statusMessage}</span>
        </div>
    );
};
