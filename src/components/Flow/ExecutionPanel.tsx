/**
 * ExecutionPanel - Shows real-time execution output and node results
 * 
 * Displays:
 * - Live stdout/stderr from command nodes
 * - AI responses from reasoning nodes
 * - Condition evaluation results
 * - File operation results
 * - Timing information
 */

import { useState, useEffect, useRef } from 'react';
import { X, ChevronDown, ChevronRight, CheckCircle, XCircle, Clock, Loader2, Terminal, Brain, GitBranch, FileText, Sparkles } from 'lucide-react';
import { flowExecutionManager, type FlowExecutionEvent } from '../../services/FlowService';
import type { NodeResult, NodeStatus } from '../../types/flow';
import styles from './ExecutionPanel.module.css';

interface ExecutionPanelProps {
  isOpen: boolean;
  onClose: () => void;
  nodeLabels: Record<string, string>; // nodeId -> label mapping
  nodeTypes?: Record<string, string>; // nodeId -> type mapping
}

interface NodeOutput {
  nodeId: string;
  label: string;
  type: string;
  status: NodeStatus;
  result?: NodeResult | undefined;
  startTime?: number | undefined;
  endTime?: number | undefined;
}

/**
 * Get icon for node type
 */
const getNodeIcon = (type: string) => {
  switch (type) {
    case 'command': return <Terminal size={14} />;
    case 'ai-reasoning': return <Brain size={14} />;
    case 'condition': return <GitBranch size={14} />;
    case 'file-op': return <FileText size={14} />;
    case 'learned-skill': return <Sparkles size={14} />;
    default: return <Terminal size={14} />;
  }
};

/**
 * Get status icon
 */
const getStatusIcon = (status: NodeStatus) => {
  switch (status) {
    case 'running': return <Loader2 size={14} className={styles.spinning} />;
    case 'success': return <CheckCircle size={14} className={styles.successIcon} />;
    case 'failed': return <XCircle size={14} className={styles.errorIcon} />;
    case 'skipped': return <Clock size={14} className={styles.skippedIcon} />;
    default: return <Clock size={14} className={styles.pendingIcon} />;
  }
};

/**
 * Format duration in ms to human readable
 */
const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
};

/**
 * NodeOutputCard - Expandable card showing node execution result
 */
const NodeOutputCard: React.FC<{ output: NodeOutput }> = ({ output }) => {
  const [isExpanded, setIsExpanded] = useState(output.status === 'running' || output.status === 'failed');

  const duration = output.startTime && output.endTime 
    ? formatDuration(output.endTime - output.startTime)
    : output.startTime 
      ? 'Running...'
      : null;

  const hasContent = output.result && (
    output.result.stdout ||
    output.result.stderr ||
    output.result.response ||
    output.result.content ||
    output.result.error ||
    output.result.conditionResult !== undefined
  );

  return (
    <div className={`${styles.nodeCard} ${styles[output.status]}`}>
      <div 
        className={styles.nodeHeader}
        onClick={() => hasContent && setIsExpanded(!isExpanded)}
        style={{ cursor: hasContent ? 'pointer' : 'default' }}
      >
        <div className={styles.nodeHeaderLeft}>
          {hasContent && (
            isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
          )}
          {getStatusIcon(output.status)}
          <span className={styles.nodeIcon}>{getNodeIcon(output.type)}</span>
          <span className={styles.nodeLabel}>{output.label}</span>
        </div>
        <div className={styles.nodeHeaderRight}>
          {duration && <span className={styles.duration}>{duration}</span>}
          {output.result?.exitCode !== undefined && (
            <span className={`${styles.exitCode} ${output.result.exitCode === 0 ? styles.exitSuccess : styles.exitError}`}>
              exit: {output.result.exitCode}
            </span>
          )}
        </div>
      </div>

      {isExpanded && hasContent && output.result && (
        <div className={styles.nodeContent}>
          {/* Command stdout */}
          {output.result.stdout && (
            <div className={styles.outputSection}>
              <div className={styles.outputLabel}>stdout</div>
              <pre className={styles.outputPre}>{output.result.stdout}</pre>
            </div>
          )}

          {/* Command stderr */}
          {output.result.stderr && (
            <div className={styles.outputSection}>
              <div className={`${styles.outputLabel} ${styles.stderrLabel}`}>stderr</div>
              <pre className={`${styles.outputPre} ${styles.stderrPre}`}>{output.result.stderr}</pre>
            </div>
          )}

          {/* AI response */}
          {output.result.response && (
            <div className={styles.outputSection}>
              <div className={styles.outputLabel}>AI Response</div>
              <pre className={styles.outputPre}>{output.result.response}</pre>
            </div>
          )}

          {/* Condition result */}
          {output.result.conditionResult !== undefined && (
            <div className={styles.outputSection}>
              <div className={styles.outputLabel}>Condition</div>
              <div className={styles.conditionResult}>
                <span className={output.result.conditionResult ? styles.condTrue : styles.condFalse}>
                  {output.result.conditionResult ? 'TRUE' : 'FALSE'}
                </span>
                {output.result.evaluatedCondition && (
                  <code className={styles.evaluatedCond}>{output.result.evaluatedCondition}</code>
                )}
              </div>
            </div>
          )}

          {/* File content */}
          {output.result.content && (
            <div className={styles.outputSection}>
              <div className={styles.outputLabel}>File Content</div>
              <pre className={styles.outputPre}>{output.result.content}</pre>
            </div>
          )}

          {/* File operation info */}
          {output.result.filePath && (
            <div className={styles.outputSection}>
              <div className={styles.outputLabel}>File</div>
              <code className={styles.filePath}>{output.result.filePath}</code>
              {output.result.bytesWritten !== undefined && (
                <span className={styles.bytesWritten}> ({output.result.bytesWritten} bytes written)</span>
              )}
            </div>
          )}

          {/* Error */}
          {output.result.error && (
            <div className={styles.outputSection}>
              <div className={`${styles.outputLabel} ${styles.errorLabel}`}>Error</div>
              <pre className={`${styles.outputPre} ${styles.errorPre}`}>{output.result.error}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * ExecutionPanel Component
 */
export const ExecutionPanel: React.FC<ExecutionPanelProps> = ({
  isOpen,
  onClose,
  nodeLabels,
  nodeTypes = {},
}) => {
  const [outputs, setOutputs] = useState<NodeOutput[]>([]);
  const [executionStatus, setExecutionStatus] = useState<'idle' | 'running' | 'completed' | 'error'>('idle');
  const [totalDuration, setTotalDuration] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Subscribe to execution events
  useEffect(() => {
    const unsubscribe = flowExecutionManager.subscribe((event: FlowExecutionEvent) => {
      switch (event.type) {
        case 'started':
          setOutputs([]);
          setExecutionStatus('running');
          setTotalDuration(null);
          break;

        case 'node-update':
          setOutputs(prev => {
            const existing = prev.find(o => o.nodeId === event.nodeId);
            if (existing) {
              return prev.map(o => {
                if (o.nodeId === event.nodeId) {
                  const updated: NodeOutput = { 
                    ...o, 
                    status: event.status, 
                    result: event.result,
                  };
                  if (event.status !== 'running') {
                    updated.endTime = Date.now();
                  }
                  return updated;
                }
                return o;
              });
            } else {
              const newOutput: NodeOutput = {
                nodeId: event.nodeId,
                label: nodeLabels[event.nodeId] || event.nodeId,
                type: nodeTypes[event.nodeId] || 'command',
                status: event.status,
                result: event.result,
                startTime: Date.now(),
              };
              return [...prev, newOutput];
            }
          });
          break;

        case 'completed':
          setExecutionStatus('completed');
          if (event.duration) {
            setTotalDuration(event.duration);
          }
          break;

        case 'error':
          setExecutionStatus('error');
          break;
      }
    });

    return () => unsubscribe();
  }, [nodeLabels]);

  // Auto-scroll to bottom when new output arrives
  useEffect(() => {
    if (scrollRef.current && executionStatus === 'running') {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [outputs, executionStatus]);

  if (!isOpen) return null;

  const successCount = outputs.filter(o => o.status === 'success').length;
  const failedCount = outputs.filter(o => o.status === 'failed').length;

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.headerTitle}>
          <span>Execution Log</span>
          {executionStatus === 'running' && (
            <Loader2 size={16} className={styles.spinning} />
          )}
        </div>
        <div className={styles.headerStats}>
          {outputs.length > 0 && (
            <>
              <span className={styles.statSuccess}>{successCount} passed</span>
              {failedCount > 0 && <span className={styles.statFailed}>{failedCount} failed</span>}
              {totalDuration && <span className={styles.statDuration}>{formatDuration(totalDuration)}</span>}
            </>
          )}
        </div>
        <button className={styles.closeBtn} onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      <div className={styles.content} ref={scrollRef}>
        {outputs.length === 0 ? (
          <div className={styles.emptyState}>
            {executionStatus === 'idle' 
              ? 'Run a flow to see execution output here'
              : 'Waiting for nodes to execute...'
            }
          </div>
        ) : (
          <div className={styles.outputList}>
            {outputs.map((output) => (
              <NodeOutputCard key={output.nodeId} output={output} />
            ))}
          </div>
        )}
      </div>

      {executionStatus !== 'idle' && (
        <div className={`${styles.footer} ${styles[executionStatus]}`}>
          {executionStatus === 'running' && 'Executing flow...'}
          {executionStatus === 'completed' && `Flow completed successfully (${successCount} nodes)`}
          {executionStatus === 'error' && `Flow execution failed (${failedCount} errors)`}
        </div>
      )}
    </div>
  );
};
