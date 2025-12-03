import { useState, useRef, useEffect, useCallback, memo, useMemo } from "react";
import styles from "./ModelSelector.module.css";
import { ChevronDown, ChevronRight, Check, Cpu, Cloud, Server, Zap, Globe } from "lucide-react";
import { AVAILABLE_MODELS } from "../../data/models";
import type { ModelSpec } from "../../data/models";

interface ModelSelectorProps {
  selectedModelId: string;
  onSelect: (model: ModelSpec) => void;
  models?: ModelSpec[];
}

// Provider metadata for display
const PROVIDER_INFO: Record<string, { name: string; icon: typeof Cloud; color: string; description: string }> = {
  openai: {
    name: "OpenAI",
    icon: Zap,
    color: "#10a37f",
    description: "GPT-4, GPT-4o, and more",
  },
  anthropic: {
    name: "Anthropic",
    icon: Cloud,
    color: "#d4a574",
    description: "Claude 3.5 Sonnet, Opus",
  },
  gemini: {
    name: "Google Gemini",
    icon: Globe,
    color: "#4285f4",
    description: "Gemini Pro, Flash",
  },
  openrouter: {
    name: "OpenRouter",
    icon: Server,
    color: "#6366f1",
    description: "Access 100+ models",
  },
  ollama: {
    name: "Ollama (Local)",
    icon: Cpu,
    color: "#22c55e",
    description: "Run models locally",
  },
  meta: {
    name: "Meta",
    icon: Cloud,
    color: "#0668e1",
    description: "Llama models",
  },
};

/**
 * Model Spec Card - shows model details on hover
 */
const ModelSpecCard = memo<{ model: ModelSpec }>(({ model }) => (
  <div className={styles.specsCard}>
    <div className={styles.specsHeader}>
      <div className={styles.specsTitle}>{model.name}</div>
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
    <div className={styles.contextInfo}>
      Context: {model.contextWindow}
    </div>
  </div>
));

ModelSpecCard.displayName = "ModelSpecCard";

/**
 * Provider Group - shows provider with expandable models
 */
const ProviderGroup = memo<{
  provider: string;
  models: ModelSpec[];
  selectedModelId: string;
  isExpanded: boolean;
  onExpand: () => void;
  onSelect: (model: ModelSpec) => void;
  onHoverModel: (model: ModelSpec | null) => void;
}>(({ provider, models, selectedModelId, isExpanded, onExpand, onSelect, onHoverModel }) => {
  const info = PROVIDER_INFO[provider] || {
    name: provider,
    icon: Cloud,
    color: "#888",
    description: "",
  };
  const Icon = info.icon;
  const hasSelectedModel = models.some((m) => m.id === selectedModelId);

  return (
    <div className={styles.providerGroup}>
      <div
        className={`${styles.providerHeader} ${isExpanded ? styles.expanded : ""} ${hasSelectedModel ? styles.hasSelected : ""}`}
        onClick={onExpand}
        onMouseEnter={onExpand}
      >
        <div className={styles.providerInfo}>
          <Icon size={14} style={{ color: info.color }} />
          <span className={styles.providerName}>{info.name}</span>
        </div>
        <div className={styles.providerMeta}>
          <span className={styles.modelCount}>{models.length}</span>
          <ChevronRight size={12} className={`${styles.expandIcon} ${isExpanded ? styles.rotated : ""}`} />
        </div>
      </div>

      {isExpanded && (
        <div className={styles.modelSubmenu}>
          {models.map((model) => (
            <div
              key={model.id}
              className={`${styles.modelOption} ${model.id === selectedModelId ? styles.selected : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(model);
              }}
              onMouseEnter={() => onHoverModel(model)}
              onMouseLeave={() => onHoverModel(null)}
            >
              <span className={styles.modelName}>{model.name.replace(` (${info.name})`, "").replace(" (OpenRouter)", "")}</span>
              {model.id === selectedModelId && <Check size={12} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

ProviderGroup.displayName = "ProviderGroup";

/**
 * ModelSelector Component
 * Hierarchical dropdown: Provider -> Models
 */
export const ModelSelector = memo<ModelSelectorProps>(
  ({ selectedModelId, onSelect, models = AVAILABLE_MODELS }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
    const [hoveredModel, setHoveredModel] = useState<ModelSpec | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const activeModels = models || AVAILABLE_MODELS;
    const selectedModel = activeModels.find((m) => m.id === selectedModelId) || activeModels[0];

    // Group models by provider
    const modelsByProvider = useMemo(() => {
      const grouped: Record<string, ModelSpec[]> = {};
      
      // Define provider order
      const providerOrder = ["ollama", "openrouter", "gemini", "anthropic", "openai", "meta"];
      
      activeModels.forEach((model) => {
        if (!grouped[model.provider]) {
          grouped[model.provider] = [];
        }
        grouped[model.provider].push(model);
      });

      // Sort providers by defined order
      const sortedProviders: [string, ModelSpec[]][] = [];
      providerOrder.forEach((provider) => {
        if (grouped[provider]) {
          sortedProviders.push([provider, grouped[provider]]);
        }
      });
      
      // Add any remaining providers not in the order
      Object.keys(grouped).forEach((provider) => {
        if (!providerOrder.includes(provider)) {
          sortedProviders.push([provider, grouped[provider]]);
        }
      });

      return sortedProviders;
    }, [activeModels]);

    // Auto-expand the provider of the selected model when opening
    useEffect(() => {
      if (isOpen && selectedModel) {
        setExpandedProvider(selectedModel.provider);
      }
    }, [isOpen, selectedModel]);

    // Close dropdown on outside click
    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (
          containerRef.current &&
          !containerRef.current.contains(event.target as Node)
        ) {
          setIsOpen(false);
          setExpandedProvider(null);
          setHoveredModel(null);
        }
      };

      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleToggle = useCallback(() => {
      setIsOpen((prev) => !prev);
    }, []);

    const handleSelect = useCallback(
      (model: ModelSpec) => {
        onSelect(model);
        setIsOpen(false);
        setExpandedProvider(null);
        setHoveredModel(null);
      },
      [onSelect],
    );

    const handleExpandProvider = useCallback((provider: string) => {
      setExpandedProvider(provider);
    }, []);

    const handleHoverModel = useCallback((model: ModelSpec | null) => {
      setHoveredModel(model);
    }, []);

    // Get display name for the trigger button
    const getDisplayName = () => {
      const providerInfo = PROVIDER_INFO[selectedModel.provider];
      const providerPrefix = providerInfo ? providerInfo.name.split(" ")[0] : selectedModel.provider;
      
      // Shorten the model name for display
      let modelName = selectedModel.name
        .replace(` (${providerInfo?.name || ""})`, "")
        .replace(" (OpenRouter)", "")
        .replace(" (Ollama)", "");
      
      // Truncate if too long
      if (modelName.length > 20) {
        modelName = modelName.substring(0, 18) + "...";
      }
      
      return `${providerPrefix}: ${modelName}`;
    };

    return (
      <div className={styles.container} ref={containerRef}>
        <button className={styles.trigger} onClick={handleToggle} type="button">
          <span className={styles.triggerText}>{getDisplayName()}</span>
          <ChevronDown size={12} className={isOpen ? styles.triggerIconOpen : ""} />
        </button>

        {isOpen && (
          <div className={styles.dropdown}>
            <div className={styles.dropdownHeader}>Select Model</div>
            {modelsByProvider.map(([provider, providerModels]) => (
              <ProviderGroup
                key={provider}
                provider={provider}
                models={providerModels}
                selectedModelId={selectedModelId}
                isExpanded={expandedProvider === provider}
                onExpand={() => handleExpandProvider(provider)}
                onSelect={handleSelect}
                onHoverModel={handleHoverModel}
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
