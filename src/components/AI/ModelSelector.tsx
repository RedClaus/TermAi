import React, { useState, useRef, useEffect } from 'react';
import styles from './ModelSelector.module.css';
import { ChevronDown, Check } from 'lucide-react';
import { AVAILABLE_MODELS } from '../../data/models';
import type { ModelSpec } from '../../data/models';

interface ModelSelectorProps {
    selectedModelId: string;
    onSelect: (model: ModelSpec) => void;
    models?: ModelSpec[];
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({ selectedModelId, onSelect, models = AVAILABLE_MODELS }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [hoveredModel, setHoveredModel] = useState<ModelSpec | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const activeModels = models || AVAILABLE_MODELS;
    const selectedModel = activeModels.find(m => m.id === selectedModelId) || activeModels[0];

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                setHoveredModel(null);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className={styles.container} ref={containerRef}>
            <button
                className={styles.trigger}
                onClick={() => setIsOpen(!isOpen)}
            >
                {selectedModel.name}
                <ChevronDown size={12} />
            </button>

            {isOpen && (
                <div className={styles.dropdown}>
                    {activeModels.map(model => (
                        <div
                            key={model.id}
                            className={`${styles.option} ${model.id === selectedModelId ? styles.selected : ''}`}
                            onClick={() => {
                                onSelect(model);
                                setIsOpen(false);
                                setHoveredModel(null);
                            }}
                            onMouseEnter={() => setHoveredModel(model)}
                        >
                            <span>{model.name}</span>
                            {model.id === selectedModelId && <Check size={12} />}
                        </div>
                    ))}
                </div>
            )}

            {isOpen && hoveredModel && (
                <div className={styles.specsCard}>
                    <div className={styles.specsHeader}>
                        <div className={styles.specsTitle}>Model Specs</div>
                        <div className={styles.specsDesc}>{hoveredModel.description}</div>
                    </div>

                    <div className={styles.specRow}>
                        <span className={styles.specLabel}>Intelligence</span>
                        <div className={styles.specBarContainer}>
                            <div className={styles.specBar} style={{ width: `${hoveredModel.intelligence}%` }}></div>
                        </div>
                    </div>
                    <div className={styles.specRow}>
                        <span className={styles.specLabel}>Speed</span>
                        <div className={styles.specBarContainer}>
                            <div className={styles.specBar} style={{ width: `${hoveredModel.speed}%` }}></div>
                        </div>
                    </div>
                    <div className={styles.specRow}>
                        <span className={styles.specLabel}>Cost</span>
                        <div className={styles.specBarContainer}>
                            <div className={styles.specBar} style={{ width: `${hoveredModel.cost}%` }}></div>
                        </div>
                    </div>
                    <div style={{ marginTop: '8px', fontSize: '10px', color: 'var(--text-secondary)' }}>
                        Context Window: {hoveredModel.contextWindow}
                    </div>
                </div>
            )}
        </div>
    );
};
