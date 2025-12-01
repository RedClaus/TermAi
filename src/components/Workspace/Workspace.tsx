import React, { useState } from 'react';
import { TerminalSession } from '../Terminal/TerminalSession';
import { AIPanel } from '../AI/AIPanel';
import { SystemOverseer } from './SystemOverseer';
import styles from './Workspace.module.css';
import { LayoutTemplate, ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Moon, Sun } from 'lucide-react';
import clsx from 'clsx';

interface WorkspaceProps {
    sessionId: string;
    isActive: boolean;
}

type Layout = 'side-right' | 'side-left' | 'bottom' | 'top';

export const Workspace: React.FC<WorkspaceProps> = ({ sessionId }) => {
    const [layout, setLayout] = useState<Layout>('side-right');
    const [isAIOpen, setIsAIOpen] = useState(true);
    const [theme, setTheme] = useState<'dark' | 'light'>('dark');

    React.useEffect(() => {
        const storedTheme = localStorage.getItem('termai_theme') as 'dark' | 'light' || 'dark';
        setTheme(storedTheme);
        document.documentElement.setAttribute('data-theme', storedTheme);
    }, []);

    const toggleTheme = () => {
        const newTheme = theme === 'dark' ? 'light' : 'dark';
        setTheme(newTheme);
        localStorage.setItem('termai_theme', newTheme);
        document.documentElement.setAttribute('data-theme', newTheme);
        window.dispatchEvent(new CustomEvent('termai-theme-changed', { detail: { theme: newTheme } }));
    };

    return (
        <div className={styles.workspace}>
            <div className={styles.toolbar}>
                <SystemOverseer sessionId={sessionId} />
                <div className={styles.spacer} style={{ flex: 1 }} />
                <div className={styles.layoutControls}>
                    <button
                        className={styles.controlBtn}
                        onClick={toggleTheme}
                        title={theme === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}
                    >
                        {theme === 'dark' ? <Moon size={14} /> : <Sun size={14} />}
                    </button>
                    <div className={styles.divider} style={{ width: '1px', height: '16px', background: 'var(--border-color)', margin: '0 8px' }} />
                    <button
                        className={clsx(styles.controlBtn, layout === 'side-left' && styles.active)}
                        onClick={() => setLayout('side-left')}
                        title="AI on Left"
                    >
                        <ArrowLeft size={14} />
                    </button>
                    <button
                        className={clsx(styles.controlBtn, layout === 'side-right' && styles.active)}
                        onClick={() => setLayout('side-right')}
                        title="AI on Right"
                    >
                        <ArrowRight size={14} />
                    </button>
                    <button
                        className={clsx(styles.controlBtn, layout === 'bottom' && styles.active)}
                        onClick={() => setLayout('bottom')}
                        title="AI on Bottom"
                    >
                        <ArrowDown size={14} />
                    </button>
                    <button
                        className={clsx(styles.controlBtn, layout === 'top' && styles.active)}
                        onClick={() => setLayout('top')}
                        title="AI on Top"
                    >
                        <ArrowUp size={14} />
                    </button>
                    <button
                        className={clsx(styles.controlBtn, isAIOpen && styles.active)}
                        onClick={() => setIsAIOpen(!isAIOpen)}
                        title="Toggle AI"
                    >
                        <LayoutTemplate size={14} />
                    </button>
                </div>
            </div>

            <div className={clsx(styles.container, styles[layout], !isAIOpen && styles.aiHidden)}>
                <div className={styles.terminalArea}>
                    <TerminalSession sessionId={sessionId} />
                </div>
                {isAIOpen && (
                    <div className={styles.aiArea}>
                        <AIPanel
                            isOpen={isAIOpen}
                            onClose={() => setIsAIOpen(false)}
                            sessionId={sessionId}
                            isEmbedded={true}
                        />
                    </div>
                )}
            </div>
        </div>
    );
};
