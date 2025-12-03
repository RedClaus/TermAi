import React, { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { SettingsModal } from '../Settings/SettingsModal';
import { SessionLogsModal } from '../Settings/SessionLogsModal';
import { LearnedSkillsModal } from '../Settings/LearnedSkillsModal';
import styles from './AppShell.module.css';

interface AppShellProps {
    children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ children }) => {
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isLogsOpen, setIsLogsOpen] = useState(false);
    const [isSkillsOpen, setIsSkillsOpen] = useState(false);

    useEffect(() => {
        const handleOpenSkills = () => setIsSkillsOpen(true);
        window.addEventListener('termai-show-skills', handleOpenSkills);
        return () => window.removeEventListener('termai-show-skills', handleOpenSkills);
    }, []);

    return (
        <div className={styles.shell}>
            <Sidebar 
                onOpenSettings={() => setIsSettingsOpen(true)} 
                onOpenLogs={() => setIsLogsOpen(true)}
                onOpenSkills={() => setIsSkillsOpen(true)}
            />
            <main className={styles.main}>
                {children}
            </main>
            <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
            <SessionLogsModal isOpen={isLogsOpen} onClose={() => setIsLogsOpen(false)} />
            {isSkillsOpen && <LearnedSkillsModal onClose={() => setIsSkillsOpen(false)} />}
        </div>
    );
};
