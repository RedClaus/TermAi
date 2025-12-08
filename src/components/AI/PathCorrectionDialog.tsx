
import React from 'react';
import { Terminal, Download, FolderGit2 } from 'lucide-react';
import styles from './dialogs.module.css';

interface PathCorrectionDialogProps {
  originalPath: string;
  serverPath: string;
  reason: string;
  onDismiss: () => void;
  onClone: () => void;
  onUseLocalAgent: () => void;
}

export const PathCorrectionDialog: React.FC<PathCorrectionDialogProps> = ({
  originalPath,
  serverPath,
  reason,
  onDismiss,
  onClone,
  onUseLocalAgent,
}) => {
  return (
    <div className={styles.overlay} onClick={onDismiss}>
      <div className={styles.dialog} onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
        <div className={styles.header}>
          <h3>⚠️ Directory Not Found</h3>
        </div>
        
        <div className={styles.content}>
          <p className="text-gray-300 mb-4">
            The directory <code>{originalPath}</code> does not exist on this server.
          </p>
          
          <div className="bg-red-500/10 border border-red-500/20 rounded-md p-3 mb-4 text-sm text-red-200">
            <strong>Reason:</strong> {reason}
            <div className="mt-1">
              Resetting working directory to: <code>{serverPath}</code>
            </div>
          </div>
          
          <div className="grid gap-4 mt-6">
            <div 
              className="bg-[#1a1a1a] p-4 rounded-lg border border-gray-700 hover:border-purple-500 cursor-pointer transition-colors"
              onClick={onClone}
            >
              <div className="flex items-start gap-3">
                <div className="p-2 bg-purple-500/20 text-purple-400 rounded-md">
                  <FolderGit2 size={24} />
                </div>
                <div>
                  <h4 className="font-semibold text-gray-200 mb-1">Option 1: Clone Repository Here</h4>
                  <p className="text-sm text-gray-400">
                    Run <code>git clone</code> to download the code to this server so you can work on it here.
                  </p>
                </div>
              </div>
            </div>

            <div 
              className="bg-[#1a1a1a] p-4 rounded-lg border border-gray-700 hover:border-emerald-500 cursor-pointer transition-colors"
              onClick={onUseLocalAgent}
            >
              <div className="flex items-start gap-3">
                <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-md">
                  <Terminal size={24} />
                </div>
                <div>
                  <h4 className="font-semibold text-gray-200 mb-1">Option 2: Use Local Agent</h4>
                  <p className="text-sm text-gray-400">
                    Connect to your local machine (Mac/Windows) to control files there.
                  </p>
                  <div className="flex items-center gap-2 mt-2 text-xs text-emerald-400 font-mono bg-emerald-950/30 px-2 py-1 rounded w-fit">
                    <Download size={12} />
                    Download local-agent.cjs
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div className={styles.footer}>
          <button className={styles.secondaryButton} onClick={onDismiss}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};
