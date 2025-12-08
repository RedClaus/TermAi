import React, { useEffect, useRef, useState } from "react";
import { Terminal, FitAddon } from "ghostty-web";
import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import styles from "./InteractiveBlock.module.css";
import { config } from "../../config";
import { initGhostty } from "../../services/GhosttyService";

interface InteractiveBlockProps {
  command: string;
  cwd: string;
  onExit: (exitCode: number) => void;
}

export const InteractiveBlock: React.FC<InteractiveBlockProps> = ({
  command,
  cwd,
  onExit,
}) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    let mounted = true;
    let cleanupFn: (() => void) | undefined;

    const setupTerminal = async () => {
      try {
        // Initialize ghostty WASM (idempotent)
        await initGhostty();

        if (!mounted || !terminalRef.current) return;

        // Create ghostty terminal (xterm.js compatible API)
        const term = new Terminal({
          cursorBlink: true,
          fontFamily: 'Menlo, Monaco, "Courier New", monospace',
          fontSize: 14,
          theme: {
            background: "#1e1e1e",
            foreground: "#ffffff",
          },
          rows: 24,
          cols: 80,
        });

        // Load FitAddon for auto-sizing
        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        
        // Open terminal in DOM
        term.open(terminalRef.current);
        fitAddon.fit();

        termRef.current = term;
        fitAddonRef.current = fitAddon;
        setIsInitializing(false);

        // Connect to backend PTY
        const socket = io(config.wsUrl);
        socketRef.current = socket;

        socket.on("connect", () => {
          // Spawn PTY with command
          socket.emit("spawn", {
            command,
            cwd,
            cols: term.cols,
            rows: term.rows,
          });
        });

        socket.on("output", (data: string) => {
          term.write(data);
        });

        socket.on("exit", ({ exitCode }: { exitCode: number }) => {
          onExit(exitCode);
          socket.disconnect();
        });

        // Forward user input to PTY
        term.onData((data: string) => {
          socket.emit("input", data);
        });

        // Handle window resize
        const handleResize = () => {
          if (fitAddonRef.current && termRef.current) {
            fitAddonRef.current.fit();
            socket.emit("resize", { 
              cols: termRef.current.cols, 
              rows: termRef.current.rows 
            });
          }
        };
        window.addEventListener("resize", handleResize);

        // Store cleanup function
        cleanupFn = () => {
          window.removeEventListener("resize", handleResize);
          socket.disconnect();
          term.dispose();
        };
      } catch (error) {
        console.error("[InteractiveBlock] Failed to initialize terminal:", error);
        if (mounted) {
          setInitError(error instanceof Error ? error.message : "Failed to initialize terminal");
          setIsInitializing(false);
        }
      }
    };

    setupTerminal();

    return () => {
      mounted = false;
      cleanupFn?.();
    };
  }, [command, cwd, onExit]);

  return (
    <div className={styles.wrapper}>
      {/* Context Row */}
      <div className={styles.contextRow}>
        <span className={styles.contextPath}>{cwd}</span>
        <span className={styles.contextGit}>git:(main)</span>
        <span className={styles.contextTime}>(0.032s)</span>
      </div>

      {/* Command Row */}
      <div className={styles.commandRow}>
        <span className={styles.commandText}>{command}</span>
      </div>

      {/* Terminal Output */}
      <div className={styles.terminalContainer}>
        {isInitializing && (
          <div className={styles.initMessage}>Initializing terminal...</div>
        )}
        {initError && (
          <div className={styles.errorMessage}>Error: {initError}</div>
        )}
        <div 
          className={styles.terminal} 
          ref={terminalRef} 
          style={{ display: isInitializing || initError ? 'none' : 'block' }}
        />
      </div>

      {/* Footer */}
      <div className={styles.footer}>
        <div className={styles.footerHeader}>
          <span className={styles.footerIcon}>⚡</span>
          <span className={styles.footerTitle}>Interactive Session (Ghostty)</span>
          <a href="#" className={styles.footerLink}>
            Learn more
          </a>
        </div>
        <div className={styles.successBlock}>
          <div className={styles.checkIcon}>✓</div>
          <span className={styles.successText}>{command}</span>
        </div>
      </div>
    </div>
  );
};
