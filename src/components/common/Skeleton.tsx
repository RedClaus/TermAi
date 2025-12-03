/**
 * Skeleton Component
 * Loading placeholder with animation
 */
import React, { memo } from "react";
import styles from "./Skeleton.module.css";
import clsx from "clsx";

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  variant?: "text" | "circular" | "rectangular";
  animation?: "pulse" | "wave" | "none";
  className?: string;
}

/**
 * Single Skeleton element
 */
export const Skeleton = memo<SkeletonProps>(
  ({ width, height, variant = "text", animation = "pulse", className }) => {
    const style: React.CSSProperties = {
      width: typeof width === "number" ? `${width}px` : width,
      height: typeof height === "number" ? `${height}px` : height,
    };

    return (
      <div
        className={clsx(
          styles.skeleton,
          styles[variant],
          styles[animation],
          className,
        )}
        style={style}
      />
    );
  },
);

Skeleton.displayName = "Skeleton";

/**
 * Message Skeleton - loading placeholder for chat messages
 */
export const MessageSkeleton = memo(() => (
  <div className={styles.messageSkeleton}>
    <Skeleton variant="circular" width={32} height={32} />
    <div className={styles.messageContent}>
      <Skeleton width="60%" height={16} />
      <Skeleton width="80%" height={14} />
      <Skeleton width="40%" height={14} />
    </div>
  </div>
));

MessageSkeleton.displayName = "MessageSkeleton";

/**
 * Block Skeleton - loading placeholder for command blocks
 */
export const BlockSkeleton = memo(() => (
  <div className={styles.blockSkeleton}>
    <div className={styles.blockHeader}>
      <Skeleton width={14} height={14} variant="circular" />
      <Skeleton width="40%" height={14} />
      <Skeleton width="20%" height={12} />
    </div>
    <div className={styles.blockOutput}>
      <Skeleton width="100%" height={12} />
      <Skeleton width="90%" height={12} />
      <Skeleton width="70%" height={12} />
    </div>
  </div>
));

BlockSkeleton.displayName = "BlockSkeleton";

/**
 * List of skeletons
 */
export const SkeletonList = memo<{
  count: number;
  component: React.ComponentType;
}>(({ count, component: Component }) => (
  <>
    {Array.from({ length: count }, (_, i) => (
      <Component key={i} />
    ))}
  </>
));

SkeletonList.displayName = "SkeletonList";
