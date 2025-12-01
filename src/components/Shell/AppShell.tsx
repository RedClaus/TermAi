import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { SettingsModal } from '../Settings/SettingsModal';
import styles from './AppShell.module.css';

interface AppShellProps {
    children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ children }) => {
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    return (
        <div className={styles.shell}>
            <Sidebar onOpenSettings={() => setIsSettingsOpen(true)} />
            <main className={styles.main}>
                {children}
            </main>
            <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
        </div>
    );
};
