import React from 'react';
import { Terminal, Book, Settings, Search, Rocket, LayoutGrid, Trash2, MessageSquare, FileText, GraduationCap } from 'lucide-react';
import styles from './Sidebar.module.css';
import clsx from 'clsx';
import { SessionManager } from '../../services/SessionManager';
import type { SavedSession } from '../../services/SessionManager';
import { useState, useEffect } from 'react';

interface SidebarProps {
    onOpenSettings?: () => void;
    onOpenLogs?: () => void;
    onOpenSkills?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onOpenSettings, onOpenLogs, onOpenSkills }) => {
    const [sessions, setSessions] = useState<SavedSession[]>([]);

    useEffect(() => {
        const loadSessions = () => {
            setSessions(SessionManager.getSessions());
        };

        loadSessions();
        window.addEventListener('termai-sessions-updated', loadSessions);
        return () => window.removeEventListener('termai-sessions-updated', loadSessions);
    }, []);

    const handleDelete = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (confirm('Are you sure you want to delete this session?')) {
            SessionManager.deleteSession(id);
        }
    };

    const handleSessionClick = (id: string) => {
        // Dispatch event to open/restore session
        window.dispatchEvent(new CustomEvent('termai-restore-session', { detail: { sessionId: id } }));
    };

    return (
        <div className={styles.sidebar}>
            <div className={styles.header}>
                <div className={styles.logo}>
                    <Rocket size={18} className="text-accent-primary" />
                    <span>TermAI</span>
                </div>
            </div>

            <div className={styles.section}>
                <div className={styles.item} onClick={() => { }}>
                    <Search className={styles.icon} />
                    <span>Search</span>
                    <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--text-secondary)' }}>⌘K</span>
                </div>
            </div>

            <div className={styles.section}>
                <div className={styles.sectionTitle}>Sessions</div>
                <div className={clsx(styles.item, styles.active)} onClick={() => window.dispatchEvent(new CustomEvent('termai-new-tab'))}>
                    <Terminal className={styles.icon} />
                    <span>New Terminal</span>
                </div>
                {sessions.map(session => (
                    <div key={session.id} className={styles.item} onClick={() => handleSessionClick(session.id)}>
                        <MessageSquare className={styles.icon} size={14} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.name}</span>
                        <div
                            className={styles.deleteBtn}
                            onClick={(e) => handleDelete(e, session.id)}
                            style={{ marginLeft: 'auto', opacity: 0.5, cursor: 'pointer' }}
                        >
                            <Trash2 size={12} />
                        </div>
                    </div>
                ))}
            </div>

            <div className={styles.section}>
                <div className={styles.sectionTitle}>Tools</div>
                <div className={styles.item} onClick={onOpenSkills}>
                    <GraduationCap className={styles.icon} />
                    <span>Learned Skills</span>
                </div>
                <div className={styles.item}>
                    <Book className={styles.icon} />
                    <span>Notebooks</span>
                </div>
                <div className={styles.item}>
                    <LayoutGrid className={styles.icon} />
                    <span>Workflows</span>
                </div>
            </div>

            <div style={{ marginTop: 'auto' }}>
                <div className={styles.item} onClick={onOpenLogs}>
                    <FileText className={styles.icon} />
                    <span>Session Logs</span>
                </div>
                <div className={styles.item} onClick={onOpenSettings}>
                    <Settings className={styles.icon} />
                    <span>Settings</span>
                </div>
            </div>
        </div>
    );
};
