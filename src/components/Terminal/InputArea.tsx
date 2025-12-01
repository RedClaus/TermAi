import React, { useState, useRef, useEffect } from 'react';
import styles from './InputArea.module.css';
import { Play, Sparkles } from 'lucide-react';

interface InputAreaProps {
    onExecute: (command: string) => void;
    cwd: string;
}

export const InputArea: React.FC<InputAreaProps> = ({ onExecute, cwd }) => {
    const [value, setValue] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (value.trim()) {
                onExecute(value);
                setValue('');
            }
        }
    };

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
        }
    }, [value]);

    return (
        <div className={styles.container}>
            <div className={styles.inputWrapper}>
                <div className={styles.prompt}>{cwd} $</div>
                <textarea
                    ref={textareaRef}
                    className={styles.input}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a command..."
                    rows={1}
                    autoFocus
                />
                <div className={styles.actions}>
                    <button className={styles.actionBtn} title="AI Command Search">
                        <Sparkles size={16} />
                    </button>
                    <button
                        className={styles.actionBtn}
                        title="Run Command"
                        onClick={() => {
                            if (value.trim()) {
                                onExecute(value);
                                setValue('');
                            }
                        }}
                    >
                        <Play size={16} fill="currentColor" />
                    </button>
                </div>
            </div>
        </div>
    );
};
