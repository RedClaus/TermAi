/**
 * FlowExecutionBanner - Overlay banner shown when a flow is executing
 * 
 * Prevents terminal input during workflow execution by showing
 * a visual indicator and blocking keyboard input.
 */

import { useState, useEffect } from 'react';
import { Loader2, Workflow, X, Eye } from 'lucide-react';
import { flowExecutionManager, type FlowExecutionEvent } from '../../services/FlowService';
import styles from './FlowExecutionBanner.module.css';

interface FlowExecutionBannerProps {
  onViewExecution?: () => void;
}

export const FlowExecutionBanner: React.FC<FlowExecutionBannerProps> = ({
  onViewExecution,
}) => {
  const [isExecuting, setIsExecuting] = useState(false);
  const [currentNode, setCurrentNode] = useState<string | null>(null);
  const [nodeCount, setNodeCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);

  useEffect(() => {
    const unsubscribe = flowExecutionManager.subscribe((event: FlowExecutionEvent) => {
      switch (event.type) {
        case 'started':
          setIsExecuting(true);
          setCurrentNode(null);
          setNodeCount(0);
          setCompletedCount(0);
          break;

        case 'node-update':
          if (event.status === 'running') {
            setCurrentNode(event.nodeId);
            setNodeCount(prev => prev + 1);
          } else if (event.status === 'success' || event.status === 'failed') {
            setCompletedCount(prev => prev + 1);
          }
          break;

        case 'completed':
        case 'error':
          setIsExecuting(false);
          setCurrentNode(null);
          break;
      }
    });

    return () => unsubscribe();
  }, []);

  if (!isExecuting) return null;

  return (
    <div className={styles.banner}>
      <div className={styles.content}>
        <div className={styles.iconContainer}>
          <Workflow size={20} className={styles.workflowIcon} />
          <Loader2 size={16} className={styles.spinner} />
        </div>
        
        <div className={styles.info}>
          <div className={styles.title}>Flow Executing</div>
          <div className={styles.subtitle}>
            {currentNode 
              ? `Running: ${currentNode}`
              : nodeCount > 0 
                ? `${completedCount}/${nodeCount} nodes completed`
                : 'Starting...'
            }
          </div>
        </div>

        <div className={styles.actions}>
          {onViewExecution && (
            <button 
              className={styles.viewBtn}
              onClick={onViewExecution}
              title="View Execution Log"
            >
              <Eye size={16} />
              <span>View</span>
            </button>
          )}
          <button 
            className={styles.cancelBtn}
            onClick={() => flowExecutionManager.reset()}
            title="Cancel Execution"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className={styles.progress}>
        <div 
          className={styles.progressBar} 
          style={{ 
            width: nodeCount > 0 ? `${(completedCount / nodeCount) * 100}%` : '0%' 
          }}
        />
      </div>
    </div>
  );
};
