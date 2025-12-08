import React, { useState, useRef, useEffect, useCallback } from 'react';
import { TerminalSession } from '../Terminal/TerminalSession';
import { AIPanel } from '../AI/AIPanel';
import { SystemOverseer } from './SystemOverseer';
import { FlowCanvas } from '../Flow/FlowCanvas';
import { FlowExecutionBanner } from '../Flow/FlowExecutionBanner';
import { Moon, Sun, GripHorizontal, Terminal, Workflow } from 'lucide-react';

interface WorkspaceProps {
    sessionId: string;
    isActive: boolean;
}

type WorkspaceView = 'terminal' | 'flow';

const MIN_TERMINAL_HEIGHT = 150;
const MIN_AI_HEIGHT = 200;
const DEFAULT_AI_HEIGHT_PERCENT = 40; // AI takes 40% of container by default

export const Workspace: React.FC<WorkspaceProps> = ({ sessionId, isActive }) => {
    const [theme, setTheme] = useState<'dark' | 'light'>('dark');
    const [activeView, setActiveView] = useState<WorkspaceView>('terminal');
    const [aiHeightPercent, setAiHeightPercent] = useState(() => {
        const saved = localStorage.getItem('termai_ai_height_percent');
        return saved ? parseFloat(saved) : DEFAULT_AI_HEIGHT_PERCENT;
    });
    const [isDragging, setIsDragging] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Load theme
    useEffect(() => {
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

    // Handle resize drag
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    useEffect(() => {
        if (!isDragging) return;

        const handleMouseMove = (e: MouseEvent) => {
            if (!containerRef.current) return;
            
            const containerRect = containerRef.current.getBoundingClientRect();
            const containerHeight = containerRect.height;
            
            // Calculate where the mouse is relative to the container
            const mouseY = e.clientY - containerRect.top;
            
            // Terminal height is from top to mouse position
            const terminalHeight = mouseY;
            // AI height is from mouse position to bottom
            const aiHeight = containerHeight - mouseY;
            
            // Enforce minimum heights
            if (terminalHeight < MIN_TERMINAL_HEIGHT || aiHeight < MIN_AI_HEIGHT) {
                return;
            }
            
            // Calculate AI height as percentage
            const newAiPercent = (aiHeight / containerHeight) * 100;
            setAiHeightPercent(newAiPercent);
        };

        const handleMouseUp = () => {
            setIsDragging(false);
            localStorage.setItem('termai_ai_height_percent', aiHeightPercent.toString());
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, aiHeightPercent]);

    return (
        <div className="flex flex-col h-full w-full bg-[#0a0a0a] overflow-hidden">
            {/* Toolbar - Minimal header with theme toggle */}
            <div className="h-12 border-b border-gray-800 flex items-center px-5 bg-[#111111] justify-between flex-shrink-0">
                <div className="flex items-center gap-4">
                    <SystemOverseer sessionId={sessionId} />
                </div>
                <div className="flex items-center gap-3">
                    {/* View Toggle Tabs */}
                    <div className="flex rounded-lg border border-gray-700 overflow-hidden">
                        <button
                            className={`
                                flex items-center gap-2 px-3 py-1.5 text-[13px] font-medium transition-all
                                ${activeView === 'terminal' 
                                    ? 'bg-cyan-400/20 text-cyan-400 border-r border-gray-700' 
                                    : 'bg-transparent text-gray-400 hover:text-gray-200 border-r border-gray-700'
                                }
                            `}
                            onClick={() => setActiveView('terminal')}
                            title="Terminal View"
                        >
                            <Terminal size={16} />
                            <span>Terminal</span>
                        </button>
                        <button
                            className={`
                                flex items-center gap-2 px-3 py-1.5 text-[13px] font-medium transition-all
                                ${activeView === 'flow' 
                                    ? 'bg-purple-400/20 text-purple-400' 
                                    : 'bg-transparent text-gray-400 hover:text-gray-200'
                                }
                            `}
                            onClick={() => setActiveView('flow')}
                            title="Flow Editor"
                        >
                            <Workflow size={16} />
                            <span>Flows</span>
                        </button>
                    </div>

                    {/* Theme Toggle Button */}
                    <button
                        className={`
                            flex items-center gap-2 px-4 py-2 rounded-lg min-h-[44px]
                            border transition-all duration-200 text-[14px] font-medium
                            ${theme === 'dark' 
                                ? 'bg-[#1a1a1a] border-gray-700 text-gray-300 hover:bg-[#222222] hover:text-cyan-400 hover:border-cyan-400/40' 
                                : 'bg-amber-100 border-amber-300 text-amber-700 hover:bg-amber-200'
                            }
                        `}
                        onClick={toggleTheme}
                        title={theme === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}
                    >
                        {theme === 'dark' ? (
                            <>
                                <Moon size={18} />
                                <span>Dark</span>
                            </>
                        ) : (
                            <>
                                <Sun size={18} />
                                <span>Light</span>
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Main Container */}
            <div className="flex-1 flex flex-col overflow-hidden relative" ref={containerRef}>
                {activeView === 'terminal' ? (
                    <>
                        {/* Flow Execution Banner (shown when flow is running) */}
                        <FlowExecutionBanner onViewExecution={() => setActiveView('flow')} />
                        
                        {/* Terminal Area (top) */}
                        <div 
                            className="min-h-[150px] overflow-hidden flex flex-col bg-[#0a0a0a]"
                            style={{ flex: `1 1 ${100 - aiHeightPercent}%` }}
                        >
                            <TerminalSession sessionId={sessionId} />
                        </div>

                        {/* Resize Handle - Cyan accent on drag */}
                        <div 
                            className={`
                                h-2.5 bg-[#111111] border-y border-gray-800 cursor-row-resize
                                flex items-center justify-center flex-shrink-0 select-none
                                transition-colors duration-200
                                ${isDragging 
                                    ? 'bg-cyan-400 text-[#0a0a0a]' 
                                    : 'text-gray-600 hover:bg-[#1a1a1a] hover:text-gray-400'
                                }
                            `}
                            onMouseDown={handleMouseDown}
                        >
                            <GripHorizontal size={16} />
                        </div>

                        {/* AI Area (bottom) */}
                        <div 
                            className="min-h-[200px] overflow-hidden flex flex-col bg-[#0d0d0d] border-t border-gray-800"
                            style={{ flex: `0 0 ${aiHeightPercent}%` }}
                        >
                            <AIPanel
                                isOpen={true}
                                onClose={() => {}} // No-op since AI is always visible
                                sessionId={sessionId}
                                isEmbedded={true}
                                isActive={isActive}
                            />
                        </div>
                    </>
                ) : (
                    /* Flow Editor View */
                    <div className="flex-1 overflow-hidden bg-[#0a0a0a]">
                        <FlowCanvas sessionId={sessionId} />
                    </div>
                )}
            </div>
        </div>
    );
};
