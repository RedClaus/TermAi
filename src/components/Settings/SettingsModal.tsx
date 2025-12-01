import React, { useState, useEffect } from 'react';
import styles from './SettingsModal.module.css';
import { X } from 'lucide-react';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
    const [provider, setProvider] = useState('gemini');
    const [geminiKey, setGeminiKey] = useState('');
    const [openAIKey, setOpenAIKey] = useState('');
    const [anthropicKey, setAnthropicKey] = useState('');
    const [ollamaEndpoint, setOllamaEndpoint] = useState('http://localhost:11434');

    useEffect(() => {
        if (isOpen) {
            const storedProvider = localStorage.getItem('termai_provider') || 'gemini';
            setProvider(storedProvider);
            setGeminiKey(localStorage.getItem('termai_gemini_key') || '');
            setOpenAIKey(localStorage.getItem('termai_openai_key') || '');
            setAnthropicKey(localStorage.getItem('termai_anthropic_key') || '');
            setOllamaEndpoint(localStorage.getItem('termai_ollama_key') || 'http://localhost:11434');
        }
    }, [isOpen]);

    const handleSave = () => {
        localStorage.setItem('termai_provider', provider);
        if (geminiKey) localStorage.setItem('termai_gemini_key', geminiKey);
        if (openAIKey) localStorage.setItem('termai_openai_key', openAIKey);
        if (anthropicKey) localStorage.setItem('termai_anthropic_key', anthropicKey);
        if (ollamaEndpoint) localStorage.setItem('termai_ollama_key', ollamaEndpoint);

        // Notify other components that settings have changed
        window.dispatchEvent(new Event('termai-settings-changed'));

        if (provider === 'ollama') {
            window.dispatchEvent(new CustomEvent('termai-fetch-models', { detail: { endpoint: ollamaEndpoint } }));
        }

        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className={styles.overlay}>
            <div className={styles.modal}>
                <div className={styles.header}>
                    <div className={styles.title}>Settings</div>
                    <button className={styles.closeBtn} onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>

                <div className={styles.content}>
                    <div className={styles.section}>
                        <div className={styles.sectionTitle}>AI Provider</div>
                        <div className={styles.inputGroup}>
                            <label className={styles.label}>Select Active Provider</label>
                            <select
                                className={styles.select}
                                value={provider}
                                onChange={(e) => setProvider(e.target.value)}
                            >
                                <option value="gemini">Google Gemini</option>
                                <option value="openai">OpenAI (GPT-4)</option>
                                <option value="anthropic">Anthropic (Opus 4.5)</option>
                                <option value="ollama">Ollama (Local)</option>
                            </select>
                        </div>
                    </div>

                    <div className={styles.section}>
                        <div className={styles.sectionTitle}>API Keys</div>

                        {provider === 'gemini' && (
                            <div className={styles.inputGroup}>
                                <label className={styles.label}>Google Gemini API Key</label>
                                <input
                                    type="password"
                                    className={styles.input}
                                    value={geminiKey}
                                    onChange={(e) => setGeminiKey(e.target.value)}
                                    placeholder="Enter your Gemini API Key"
                                />
                            </div>
                        )}

                        {provider === 'openai' && (
                            <div className={styles.inputGroup}>
                                <label className={styles.label}>OpenAI API Key</label>
                                <input
                                    type="password"
                                    className={styles.input}
                                    value={openAIKey}
                                    onChange={(e) => setOpenAIKey(e.target.value)}
                                    placeholder="Enter your OpenAI API Key"
                                />
                            </div>
                        )}

                        {provider === 'anthropic' && (
                            <div className={styles.inputGroup}>
                                <label className={styles.label}>Anthropic API Key</label>
                                <input
                                    type="password"
                                    className={styles.input}
                                    value={anthropicKey}
                                    onChange={(e) => setAnthropicKey(e.target.value)}
                                    placeholder="Enter your Anthropic API Key"
                                />
                            </div>
                        )}

                        {provider === 'ollama' && (
                            <div className={styles.inputGroup}>
                                <label className={styles.label}>Ollama Endpoint URL</label>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <input
                                        type="text"
                                        className={styles.input}
                                        value={ollamaEndpoint}
                                        onChange={(e) => setOllamaEndpoint(e.target.value)}
                                        placeholder="http://localhost:11434"
                                    />
                                </div>
                                <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                                    Default is http://localhost:11434. Click Save to fetch models.
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                <div className={styles.footer}>
                    <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={onClose}>
                        Cancel
                    </button>
                    <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleSave}>
                        Save Changes
                    </button>
                </div>
            </div>
        </div>
    );
};
