/**
 * CommandPreview Component
 * Shows a command preview with countdown before execution in auto-run mode
 */
import React, { useEffect, useState, useCallback } from "react";
import { Play, SkipForward, Clock } from "lucide-react";
import styles from "./AIPanel.module.css";

interface CommandPreviewProps {
  command: string;
  delay?: number; // Delay in milliseconds before auto-execution (default: 2000)
  onExecute: () => void;
  onSkip: () => void;
}

export const CommandPreview: React.FC<CommandPreviewProps> = ({
  command,
  delay = 2000,
  onExecute,
  onSkip,
}) => {
  const [timeLeft, setTimeLeft] = useState(delay);
  const [progress, setProgress] = useState(100);

  // Countdown timer
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        const newTime = prev - 100;
        setProgress((newTime / delay) * 100);
        if (newTime <= 0) {
          clearInterval(interval);
          onExecute();
          return 0;
        }
        return newTime;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [delay, onExecute]);

  const handleRunNow = useCallback(() => {
    setTimeLeft(0);
    onExecute();
  }, [onExecute]);

  // Truncate long commands for display
  const displayCommand = command.length > 100 
    ? command.substring(0, 100) + "..." 
    : command;

  return (
    <div className={styles.commandPreview}>
      <div className={styles.commandPreviewHeader}>
        <span className={styles.commandPreviewLabel}>Next Command</span>
        <span className={styles.commandPreviewTimer}>
          <Clock size={12} />
          {Math.ceil(timeLeft / 1000)}s
        </span>
      </div>
      
      <div className={styles.commandPreviewCode}>
        {displayCommand}
      </div>
      
      <div className={styles.progressBar}>
        <div 
          className={styles.progressFill} 
          style={{ width: `${progress}%` }}
        />
      </div>
      
      <div className={styles.commandPreviewActions}>
        <button 
          className={styles.skipButton}
          onClick={onSkip}
          title="Skip this command"
        >
          <SkipForward size={14} />
          Skip
        </button>
        <button 
          className={styles.runNowButton}
          onClick={handleRunNow}
          title="Run immediately"
        >
          <Play size={14} />
          Run Now
        </button>
      </div>
    </div>
  );
};
