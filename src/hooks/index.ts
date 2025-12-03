/**
 * Hooks barrel export
 */
export { useAutoRun } from "./useAutoRun";
export { useSafetyCheck, SAFETY_RULES } from "./useSafetyCheck";
export { useChatHistory, DEFAULT_WELCOME_MESSAGE } from "./useChatHistory";
export {
  useTermAiEvent,
  useTermAiEvents,
  useTermAiEmit,
} from "./useTermAiEvent";
export {
  useDebounce,
  useDebouncedCallback,
  useDebouncedState,
} from "./useDebounce";
export { useThrottle, useThrottledCallback } from "./useThrottle";
export {
  useKeyboardNavigation,
  useGlobalShortcut,
  useFocusTrap,
} from "./useKeyboardNavigation";
export { useCommandHistory } from "./useCommandHistory";

// New consolidated hooks
export { useSettingsLoader } from "./useSettingsLoader";
export type { SettingsLoaderOptions, SettingsLoaderResult } from "./useSettingsLoader";

export { useAutoRunMachine } from "./useAutoRunMachine";
export type { StopReason, Message as AutoRunMessage, AutoRunConfig } from "./useAutoRunMachine";
export {
  MAX_AUTO_STEPS,
  MAX_STALLS_BEFORE_ASK,
  APP_SUCCESS_INDICATORS,
  SERVER_PATTERNS,
  extractPort,
  buildTaskSummary,
  formatOutputMessage,
  isCodingCommand,
  processResponseForCommand,
  detectResponseLoop,
} from "./useAutoRunMachine";

export { useUIState, shouldShowComplexDialog } from "./useUIState";
export type { UIState, UIStateActions, UseUIStateOptions } from "./useUIState";
