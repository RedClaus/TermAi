/**
 * Background Terminals Panel
 * Shows running background processes and interactive terminals
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Terminal,
  X,
  Square,
  ChevronDown,
  ChevronRight,
  Maximize2,
  Minimize2,
  Loader,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { BackgroundTerminalService, type BackgroundTerminal } from '../../services/BackgroundTerminalService';
import './BackgroundTerminals.module.css';

interface BackgroundTerminalsProps {
  isExpanded: boolean;
  onToggle: () => void;
}

export const BackgroundTerminals: React.FC<BackgroundTerminalsProps> = ({
  isExpanded,
  onToggle,
}) => {
  const [terminals, setTerminals] = useState<BackgroundTerminal[]>([]);
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);
  const [terminalOutput, setTerminalOutput] = useState<Map<string, string>>(new Map());
  const outputRef = useRef<HTMLDivElement>(null);

  // Subscribe to terminal updates
  useEffect(() => {
    const updateTerminals = () => {
      setTerminals(BackgroundTerminalService.getAll());
    };

    // Initial load
    updateTerminals();

    // Subscribe to events
    const unsubSpawn = BackgroundTerminalService.on('spawn', updateTerminals);
    const unsubStatus = BackgroundTerminalService.on('status', updateTerminals);
    const unsubExit = BackgroundTerminalService.on('exit', updateTerminals);
    const unsubRemove = BackgroundTerminalService.on('remove', updateTerminals);
    const unsubError = BackgroundTerminalService.on('error', updateTerminals);

    return () => {
      unsubSpawn();
      unsubStatus();
      unsubExit();
      unsubRemove();
      unsubError();
    };
  }, []);

  // Subscribe to output for active terminal
  useEffect(() => {
    if (!activeTerminalId) return;

    // Load existing output
    const existingOutput = BackgroundTerminalService.getOutput(activeTerminalId);
    setTerminalOutput(prev => new Map(prev).set(activeTerminalId, existingOutput));

    // Subscribe to new output
    const unsub = BackgroundTerminalService.onOutput(activeTerminalId, (output) => {
      setTerminalOutput(prev => {
        const newMap = new Map(prev);
        const current = newMap.get(activeTerminalId) || '';
        newMap.set(activeTerminalId, current + output);
        return newMap;
      });
    });

    return unsub;
  }, [activeTerminalId]);

  // Auto-scroll output
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [terminalOutput, activeTerminalId]);

  const handleStop = useCallback((terminalId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    BackgroundTerminalService.stop(terminalId);
  }, []);

  const handleRemove = useCallback((terminalId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    BackgroundTerminalService.remove(terminalId);
    if (activeTerminalId === terminalId) {
      setActiveTerminalId(null);
    }
  }, [activeTerminalId]);

  const handleTerminalClick = useCallback((terminalId: string) => {
    setActiveTerminalId(prev => prev === terminalId ? null : terminalId);
  }, []);

  const getStatusIcon = (status: BackgroundTerminal['status']) => {
    switch (status) {
      case 'starting':
        return <Loader size={12} className="animate-spin text-blue-400" />;
      case 'running':
        return <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />;
      case 'stopped':
        return <CheckCircle2 size={12} className="text-slate-500" />;
      case 'error':
        return <XCircle size={12} className="text-red-500" />;
      default:
        return null;
    }
  };

  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  };

  const runningCount = terminals.filter(t => t.status === 'running').length;

  if (terminals.length === 0) {
    return null;
  }

  return (
    <div className="bg-terminals-panel">
      {/* Header */}
      <div 
        className="bg-terminals-header"
        onClick={onToggle}
      >
        <div className="bg-terminals-header-left">
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <Terminal size={14} />
          <span className="bg-terminals-title">Background Terminals</span>
          {runningCount > 0 && (
            <span className="bg-terminals-badge">{runningCount} running</span>
          )}
        </div>
        <button 
          className="bg-terminals-expand-btn"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        >
          {isExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
      </div>

      {/* Terminal List */}
      {isExpanded && (
        <div className="bg-terminals-content">
          <div className="bg-terminals-list">
            {terminals.map((terminal) => (
              <div 
                key={terminal.id}
                className={`bg-terminal-item ${activeTerminalId === terminal.id ? 'active' : ''} ${terminal.status}`}
                onClick={() => handleTerminalClick(terminal.id)}
              >
                <div className="bg-terminal-info">
                  {getStatusIcon(terminal.status)}
                  <span className="bg-terminal-name">{terminal.name}</span>
                  <span className="bg-terminal-duration">
                    {formatDuration(
                      (terminal.stoppedAt || Date.now()) - terminal.startedAt
                    )}
                  </span>
                </div>
                <div className="bg-terminal-actions">
                  {terminal.status === 'running' ? (
                    <button
                      className="bg-terminal-btn stop"
                      onClick={(e) => handleStop(terminal.id, e)}
                      title="Stop"
                    >
                      <Square size={12} />
                    </button>
                  ) : (
                    <button
                      className="bg-terminal-btn remove"
                      onClick={(e) => handleRemove(terminal.id, e)}
                      title="Remove"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Output Panel */}
          {activeTerminalId && (
            <div className="bg-terminal-output" ref={outputRef}>
              <pre>
                {terminalOutput.get(activeTerminalId) || 'No output yet...'}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BackgroundTerminals;
