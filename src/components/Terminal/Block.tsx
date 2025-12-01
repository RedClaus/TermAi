import React from 'react';
import type { BlockData } from '../../types';
import styles from './Block.module.css';
import clsx from 'clsx';
import { ChevronRight } from 'lucide-react';

interface BlockProps {
    data: BlockData;
    isSelected?: boolean;
    onClick?: () => void;
}

export const Block: React.FC<BlockProps> = ({ data, isSelected, onClick }) => {
    return (
        <div
            className={clsx(styles.block, isSelected && styles.selected)}
            onClick={onClick}
        >
            <div className={styles.header}>
                <ChevronRight size={14} className={styles.prompt} />
                <div className={styles.command}>{data.command}</div>
                <div className={styles.meta}>
                    {new Date(data.timestamp).toLocaleTimeString()} • {data.cwd}
                </div>
            </div>
            <div className={clsx(styles.output, data.exitCode !== 0 && styles.error)}>
                {data.isLoading ? (
                    <div className={styles.loading}>
                        <span className={styles.dot}>.</span>
                        <span className={styles.dot}>.</span>
                        <span className={styles.dot}>.</span>
                    </div>
                ) : (
                    data.output
                )}
            </div>
        </div>
    );
};
