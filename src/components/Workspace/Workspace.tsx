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

export const Workspace: React.FC<WorkspaceProps> = ({ sessionId, isActive }) => {
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

    const [aiSize, setAiSize] = useState(350);
    const [isDragging, setIsDragging] = useState(false);
    const containerRef = React.useRef<HTMLDivElement>(null);

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        e.preventDefault();
    };

    React.useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging || !containerRef.current) return;

            const containerRect = containerRef.current.getBoundingClientRect();
            let newSize = aiSize;

            if (layout === 'side-right') {
                newSize = containerRect.right - e.clientX;
            } else if (layout === 'side-left') {
                newSize = e.clientX - containerRect.left;
            } else if (layout === 'bottom') {
                newSize = containerRect.bottom - e.clientY;
            } else if (layout === 'top') {
                newSize = e.clientY - containerRect.top;
            }

            // Constraints
            if (layout.includes('side')) {
                newSize = Math.max(250, Math.min(newSize, containerRect.width - 200));
            } else {
                newSize = Math.max(150, Math.min(newSize, containerRect.height - 100));
            }

            setAiSize(newSize);
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

        if (isDragging) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, layout, aiSize]);

    // Reset size when switching orientation
    React.useEffect(() => {
        if (layout.includes('side')) {
            setAiSize(350);
        } else {
            setAiSize(300);
        }
    }, [layout]);

    const getResizerStyle = () => {
        const baseStyle: React.CSSProperties = {
            background: isDragging ? 'var(--accent-primary)' : 'transparent',
            zIndex: 10,
            transition: 'background 0.2s',
        };

        if (layout === 'side-right') {
            return { ...baseStyle, width: '4px', cursor: 'col-resize', position: 'absolute', left: '-2px', top: 0, bottom: 0 };
        } else if (layout === 'side-left') {
            return { ...baseStyle, width: '4px', cursor: 'col-resize', position: 'absolute', right: '-2px', top: 0, bottom: 0 };
        } else if (layout === 'bottom') {
            return { ...baseStyle, height: '4px', cursor: 'row-resize', position: 'absolute', top: '-2px', left: 0, right: 0 };
        } else if (layout === 'top') {
            return { ...baseStyle, height: '4px', cursor: 'row-resize', position: 'absolute', bottom: '-2px', left: 0, right: 0 };
        }
        return baseStyle;
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

            <div className={clsx(styles.container, styles[layout], !isAIOpen && styles.aiHidden)} ref={containerRef}>
                <div className={styles.terminalArea}>
                    <TerminalSession sessionId={sessionId} />
                </div>
                {isAIOpen && (
                    <div
                        className={styles.aiArea}
                        style={{
                            width: layout.includes('side') ? `${aiSize}px` : '100%',
                            height: !layout.includes('side') ? `${aiSize}px` : '100%',
                            position: 'relative'
                        }}
                    >
                        <div
                            onMouseDown={handleMouseDown}
                            style={getResizerStyle() as React.CSSProperties}
                        />
                        <AIPanel
                            isOpen={isAIOpen}
                            onClose={() => setIsAIOpen(false)}
                            sessionId={sessionId}
                            isEmbedded={true}
                            isActive={isActive}
                        />
                    </div>
                )}
            </div>
        </div>
    );
};
