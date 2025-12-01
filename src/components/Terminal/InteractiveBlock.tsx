import React, { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { io, Socket } from 'socket.io-client';
import 'xterm/css/xterm.css';
import styles from './InteractiveBlock.module.css';

interface InteractiveBlockProps {
    command: string;
    cwd: string;
    onExit: (exitCode: number) => void;
}

export const InteractiveBlock: React.FC<InteractiveBlockProps> = ({ command, cwd, onExit }) => {
    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<Terminal | null>(null);
    const socketRef = useRef<Socket | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);

    useEffect(() => {
        if (!terminalRef.current) return;

        // Initialize xterm
        const term = new Terminal({
            cursorBlink: true,
            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
            fontSize: 14,
            theme: {
                background: '#1e1e1e',
                foreground: '#ffffff',
            },
            rows: 24,
            cols: 80
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(terminalRef.current);
        fitAddon.fit();

        xtermRef.current = term;
        fitAddonRef.current = fitAddon;

        // Connect to backend
        const socket = io('http://localhost:3001');
        socketRef.current = socket;

        socket.on('connect', () => {
            // Spawn PTY
            socket.emit('spawn', {
                command,
                cwd,
                cols: term.cols,
                rows: term.rows
            });
        });

        socket.on('output', (data: string) => {
            term.write(data);
        });

        socket.on('exit', ({ exitCode }: { exitCode: number }) => {
            onExit(exitCode);
            socket.disconnect();
        });

        // Handle input
        term.onData((data) => {
            socket.emit('input', data);
        });

        // Handle resize
        const handleResize = () => {
            fitAddon.fit();
            socket.emit('resize', { cols: term.cols, rows: term.rows });
        };
        window.addEventListener('resize', handleResize);

        return () => {
            socket.disconnect();
            term.dispose();
            window.removeEventListener('resize', handleResize);
        };
    }, []);

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
                <div className={styles.terminal} ref={terminalRef} />
            </div>

            {/* Footer */}
            <div className={styles.footer}>
                <div className={styles.footerHeader}>
                    <span className={styles.footerIcon}>⚡</span>
                    <span className={styles.footerTitle}>Session Warped</span>
                    <a href="#" className={styles.footerLink}>Learn more</a>
                </div>
                <div className={styles.successBlock}>
                    <div className={styles.checkIcon}>✓</div>
                    <span className={styles.successText}>{command}</span>
                </div>
            </div>
        </div>
    );
};
