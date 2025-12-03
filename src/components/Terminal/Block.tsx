import React, { memo } from "react";
import type { BlockData } from "../../types";
import styles from "./Block.module.css";
import clsx from "clsx";
import { ChevronRight } from "lucide-react";

interface BlockProps {
  data: BlockData;
  isSelected?: boolean;
  onClick?: () => void;
}

/**
 * Block Component
 * Displays a single command block with output
 * Memoized to prevent unnecessary re-renders
 */
export const Block = memo<BlockProps>(
  ({ data, isSelected, onClick }) => {
    const formattedTime = new Date(data.timestamp).toLocaleTimeString();

    return (
      <div
        className={clsx(styles.block, isSelected && styles.selected)}
        onClick={onClick}
      >
        <div className={styles.header}>
          <ChevronRight size={14} className={styles.prompt} />
          <div className={styles.command}>{data.command}</div>
          <div className={styles.meta}>
            {formattedTime} • {data.cwd}
          </div>
        </div>
        <div
          className={clsx(styles.output, data.exitCode !== 0 && styles.error)}
        >
          {data.isLoading ? (
            <div className={styles.loading}>
              <span className={styles.dot}>.</span>
              <span className={styles.dot}>.</span>
              <span className={styles.dot}>.</span>
            </div>
          ) : (
            data.output
          )}
        </div>
      </div>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison for better performance
    return (
      prevProps.data.id === nextProps.data.id &&
      prevProps.data.output === nextProps.data.output &&
      prevProps.data.isLoading === nextProps.data.isLoading &&
      prevProps.data.exitCode === nextProps.data.exitCode &&
      prevProps.isSelected === nextProps.isSelected
    );
  },
);

Block.displayName = "Block";
