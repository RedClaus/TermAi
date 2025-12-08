/**
 * BaseNode - Shared node component wrapper for all flow node types
 * 
 * Provides consistent styling, status indicators, and handle positioning.
 */

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeStatus } from '../../../types/flow';
import styles from './BaseNode.module.css';

export interface BaseNodeProps {
  id: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  status?: NodeStatus | undefined;
  selected?: boolean | undefined;
  children?: React.ReactNode;
  hasConditionalOutputs?: boolean | undefined;
}

/**
 * Status indicator colors
 */
const STATUS_COLORS: Record<NodeStatus, string> = {
  pending: '#6b7280',    // gray
  running: '#3b82f6',    // blue
  success: '#22c55e',    // green
  failed: '#ef4444',     // red
  skipped: '#f59e0b',    // amber
};

/**
 * BaseNode Component
 */
export const BaseNode = memo<BaseNodeProps>(({
  label,
  icon,
  color,
  status,
  selected,
  children,
  hasConditionalOutputs = false,
}) => {
  const statusColor = status ? STATUS_COLORS[status] : undefined;
  const isRunning = status === 'running';

  return (
    <div 
      className={`${styles.node} ${selected ? styles.selected : ''} ${isRunning ? styles.running : ''}`}
      style={{ 
        '--node-color': color,
        '--status-color': statusColor,
      } as React.CSSProperties}
    >
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Top}
        className={styles.handle}
      />

      {/* Node Header */}
      <div className={styles.header}>
        <div className={styles.iconWrapper} style={{ backgroundColor: color }}>
          {icon}
        </div>
        <span className={styles.label}>{label}</span>
        {status && (
          <div 
            className={`${styles.statusDot} ${isRunning ? styles.pulse : ''}`}
            style={{ backgroundColor: statusColor }}
            title={status}
          />
        )}
      </div>

      {/* Node Content */}
      {children && (
        <div className={styles.content}>
          {children}
        </div>
      )}

      {/* Output Handles */}
      {hasConditionalOutputs ? (
        <>
          <Handle
            type="source"
            position={Position.Bottom}
            id="true"
            className={`${styles.handle} ${styles.handleTrue}`}
            style={{ left: '30%' }}
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="false"
            className={`${styles.handle} ${styles.handleFalse}`}
            style={{ left: '70%' }}
          />
          <div className={styles.handleLabels}>
            <span className={styles.handleLabelTrue}>T</span>
            <span className={styles.handleLabelFalse}>F</span>
          </div>
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Bottom}
          className={styles.handle}
        />
      )}
    </div>
  );
});

BaseNode.displayName = 'BaseNode';
