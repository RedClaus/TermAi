import React, { useState, useEffect } from 'react';
import { Workspace } from '../Workspace/Workspace';
import styles from './TerminalTabs.module.css';
import { Plus, X, Terminal } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import clsx from 'clsx';

interface Tab {
    id: string;
    title: string;
}

export const TerminalTabs: React.FC = () => {
    const [tabs, setTabs] = useState<Tab[]>([{ id: 'default', title: 'Terminal 1' }]);
    const [activeTabId, setActiveTabId] = useState('default');

    useEffect(() => {
        const handleNewTab = () => {
            const newId = uuidv4();
            setTabs(prev => [...prev, { id: newId, title: `Terminal ${prev.length + 1}` }]);
            setActiveTabId(newId);
        };

        const handleRestoreSession = (e: CustomEvent<{ sessionId: string }>) => {
            const { sessionId } = e.detail;
            const existingTab = tabs.find(t => t.id === sessionId);
            if (existingTab) {
                setActiveTabId(sessionId);
            } else {
                // Open new tab with this session ID
                // We need to fetch the name potentially, or just use ID
                // For now, let's just use "Restored Session" or similar
                setTabs(prev => [...prev, { id: sessionId, title: `Session ${sessionId.substring(0, 4)}` }]);
                setActiveTabId(sessionId);
            }
        };

        window.addEventListener('termai-new-tab', handleNewTab);
        window.addEventListener('termai-restore-session' as any, handleRestoreSession as any);
        return () => {
            window.removeEventListener('termai-new-tab', handleNewTab);
            window.removeEventListener('termai-restore-session' as any, handleRestoreSession as any);
        };
    }, [tabs]);

    const addTab = () => {
        const newId = uuidv4();
        setTabs(prev => [...prev, { id: newId, title: `Terminal ${prev.length + 1}` }]);
        setActiveTabId(newId);
    };

    const closeTab = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (tabs.length === 1) return; // Don't close last tab

        const newTabs = tabs.filter(t => t.id !== id);
        setTabs(newTabs);

        if (activeTabId === id) {
            setActiveTabId(newTabs[newTabs.length - 1].id);
        }
    };

    return (
        <div className={styles.container}>
            <div className={styles.tabBar}>
                {tabs.map(tab => (
                    <div
                        key={tab.id}
                        className={clsx(styles.tab, activeTabId === tab.id && styles.active)}
                        onClick={() => setActiveTabId(tab.id)}
                    >
                        <Terminal size={12} />
                        <span className={styles.tabTitle}>{tab.title}</span>
                        {tabs.length > 1 && (
                            <div className={styles.closeBtn} onClick={(e) => closeTab(e, tab.id)}>
                                <X size={12} />
                            </div>
                        )}
                    </div>
                ))}
                <div className={styles.addBtn} onClick={addTab} title="New Terminal">
                    <Plus size={16} />
                </div>
            </div>
            <div className={styles.content}>
                {tabs.map(tab => (
                    <div key={tab.id} className={clsx(styles.tabContent, activeTabId === tab.id && styles.active)}>
                        <Workspace sessionId={tab.id} isActive={activeTabId === tab.id} />
                    </div>
                ))}
            </div>
        </div>
    );
};
