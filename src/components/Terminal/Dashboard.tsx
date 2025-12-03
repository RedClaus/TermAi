import React from "react";
import { Plus, Folder, Copy, Clock } from "lucide-react";
import styles from "./Dashboard.module.css";
import { AIInputBox } from "./AIInputBox";

interface DashboardProps {
  onCommand: (cmd: string) => void;
  sessionId?: string | undefined;
  cwd?: string | undefined;
}

export const Dashboard: React.FC<DashboardProps> = ({
  onCommand,
  sessionId,
  cwd,
}) => {
  return (
    <div className={styles.container}>
      {/* AI Input Area */}
      <AIInputBox onCommand={onCommand} sessionId={sessionId} cwd={cwd} />

      {/* Quick Actions */}
      <div className={styles.actionsGrid}>
        <button
          className={styles.actionCard}
          onClick={() => onCommand("mkdir new-project")}
        >
          <div className={styles.iconWrapper}>
            <Plus size={24} />
          </div>
          <span className={styles.actionLabel}>Create new project</span>
        </button>
        <button
          className={styles.actionCard}
          onClick={() => onCommand("open .")}
        >
          <div className={styles.iconWrapper}>
            <Folder size={24} />
          </div>
          <span className={styles.actionLabel}>Open repository</span>
        </button>
        <button
          className={styles.actionCard}
          onClick={() => onCommand("git clone ")}
        >
          <div className={styles.iconWrapper}>
            <Copy size={24} />
          </div>
          <span className={styles.actionLabel}>Clone repository</span>
        </button>
      </div>

      {/* Recent Projects */}
      <div className={styles.recentSection}>
        <div className={styles.recentHeader}>
          <span>Recent</span>
          <button className={styles.viewAllBtn}>View all</button>
        </div>
        <div className={styles.recentList}>
          <div
            className={styles.recentItem}
            onClick={() => onCommand("cd ~/Documents/GitHub/blast")}
          >
            <div className={styles.recentLeft}>
              <Folder size={16} className={styles.recentIcon} />
              <span className={styles.recentName}>blast</span>
            </div>
            <span className={styles.recentPath}>~/Documents/GitHub</span>
          </div>
          <div
            className={styles.recentItem}
            onClick={() => onCommand("# Find Largest Files On Machine")}
          >
            <div className={styles.recentLeft}>
              <Clock size={16} className={styles.recentIcon} />
              <span className={styles.recentName}>
                Find Largest Files On Machine
              </span>
            </div>
          </div>
          <div
            className={styles.recentItem}
            onClick={() => onCommand("# Check App Status")}
          >
            <div className={styles.recentLeft}>
              <Clock size={16} className={styles.recentIcon} />
              <span className={styles.recentName}>
                Check App Status and URL
              </span>
            </div>
            <span className={styles.recentPath}>
              /home/normanking/github/n8n
            </span>
          </div>
          <div
            className={styles.recentItem}
            onClick={() => onCommand("# Install Claude Code")}
          >
            <div className={styles.recentLeft}>
              <Clock size={16} className={styles.recentIcon} />
              <span className={styles.recentName}>
                Install Claude Code on Ubuntu
              </span>
            </div>
            <span className={styles.recentPath}>/home/normanking</span>
          </div>
        </div>
      </div>
    </div>
  );
};
