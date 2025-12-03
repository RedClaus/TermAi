import React, { useState, useRef, useEffect, useCallback, memo } from "react";
import styles from "./ModelSelector.module.css";
import { ChevronDown, Check } from "lucide-react";
import { AVAILABLE_MODELS } from "../../data/models";
import type { ModelSpec } from "../../types";

interface ModelSelectorProps {
  selectedModelId: string;
  onSelect: (model: ModelSpec) => void;
  models?: ModelSpec[];
}

/**
 * Model Spec Card - shows model details on hover
 */
const ModelSpecCard = memo<{ model: ModelSpec }>(({ model }) => (
  <div className={styles.specsCard}>
    <div className={styles.specsHeader}>
      <div className={styles.specsTitle}>Model Specs</div>
      <div className={styles.specsDesc}>{model.description}</div>
    </div>

    <div className={styles.specRow}>
      <span className={styles.specLabel}>Intelligence</span>
      <div className={styles.specBarContainer}>
        <div
          className={styles.specBar}
          style={{ width: `${model.intelligence}%` }}
        />
      </div>
    </div>
    <div className={styles.specRow}>
      <span className={styles.specLabel}>Speed</span>
      <div className={styles.specBarContainer}>
        <div className={styles.specBar} style={{ width: `${model.speed}%` }} />
      </div>
    </div>
    <div className={styles.specRow}>
      <span className={styles.specLabel}>Cost</span>
      <div className={styles.specBarContainer}>
        <div className={styles.specBar} style={{ width: `${model.cost}%` }} />
      </div>
    </div>
    <div
      style={{
        marginTop: "8px",
        fontSize: "10px",
        color: "var(--text-secondary)",
      }}
    >
      Context Window: {model.contextWindow}
    </div>
  </div>
));

ModelSpecCard.displayName = "ModelSpecCard";

/**
 * Model Option - single model in dropdown
 */
const ModelOption = memo<{
  model: ModelSpec;
  isSelected: boolean;
  onSelect: () => void;
  onHover: () => void;
}>(({ model, isSelected, onSelect, onHover }) => (
  <div
    className={`${styles.option} ${isSelected ? styles.selected : ""}`}
    onClick={onSelect}
    onMouseEnter={onHover}
  >
    <span>{model.name}</span>
    {isSelected && <Check size={12} />}
  </div>
));

ModelOption.displayName = "ModelOption";

/**
 * ModelSelector Component
 * Dropdown for selecting AI models with specs preview
 */
export const ModelSelector = memo<ModelSelectorProps>(
  ({ selectedModelId, onSelect, models = AVAILABLE_MODELS }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [hoveredModel, setHoveredModel] = useState<ModelSpec | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const activeModels = models || AVAILABLE_MODELS;
    const selectedModel =
      activeModels.find((m) => m.id === selectedModelId) || activeModels[0];

    // Close dropdown on outside click
    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (
          containerRef.current &&
          !containerRef.current.contains(event.target as Node)
        ) {
          setIsOpen(false);
          setHoveredModel(null);
        }
      };

      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleToggle = useCallback(() => {
      setIsOpen((prev) => !prev);
    }, []);

    const handleSelect = useCallback(
      (model: ModelSpec) => {
        onSelect(model);
        setIsOpen(false);
        setHoveredModel(null);
      },
      [onSelect],
    );

    const handleHover = useCallback((model: ModelSpec) => {
      setHoveredModel(model);
    }, []);

    return (
      <div className={styles.container} ref={containerRef}>
        <button className={styles.trigger} onClick={handleToggle} type="button">
          {selectedModel.name}
          <ChevronDown size={12} />
        </button>

        {isOpen && (
          <div className={styles.dropdown}>
            {activeModels.map((model) => (
              <ModelOption
                key={model.id}
                model={model}
                isSelected={model.id === selectedModelId}
                onSelect={() => handleSelect(model)}
                onHover={() => handleHover(model)}
              />
            ))}
          </div>
        )}

        {isOpen && hoveredModel && <ModelSpecCard model={hoveredModel} />}
      </div>
    );
  },
);

ModelSelector.displayName = "ModelSelector";
