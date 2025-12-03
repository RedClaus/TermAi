import React, { useState, useCallback, useEffect, useRef } from "react";
import { Workspace } from "../Workspace/Workspace";
import styles from "./TerminalTabs.module.css";
import { Plus, X, Terminal } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import clsx from "clsx";
import { useTermAiEvent } from "../../hooks/useTermAiEvent";
import type { RestoreSessionPayload } from "../../events/types";
import { SessionManager } from "../../services/SessionManager";

interface Tab {
  id: string;
  title: string;
}

const TABS_STORAGE_KEY = "termai_tabs";
const ACTIVE_TAB_STORAGE_KEY = "termai_active_tab";

/**
 * Load persisted tabs from localStorage
 */
const loadPersistedTabs = (): { tabs: Tab[]; activeTabId: string } => {
  try {
    const storedTabs = localStorage.getItem(TABS_STORAGE_KEY);
    const storedActiveTab = localStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
    
    if (storedTabs) {
      const tabs = JSON.parse(storedTabs) as Tab[];
      if (tabs.length > 0) {
        // Validate activeTabId exists in tabs
        const activeTabId = storedActiveTab && tabs.some(t => t.id === storedActiveTab)
          ? storedActiveTab
          : tabs[0].id;
        return { tabs, activeTabId };
      }
    }
  } catch (e) {
    console.error("Failed to load persisted tabs:", e);
  }
  
  // Default: single terminal tab
  return {
    tabs: [{ id: "default", title: "Terminal 1" }],
    activeTabId: "default"
  };
};

/**
 * Save tabs to localStorage
 */
const persistTabs = (tabs: Tab[], activeTabId: string) => {
  try {
    localStorage.setItem(TABS_STORAGE_KEY, JSON.stringify(tabs));
    localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTabId);
  } catch (e) {
    console.error("Failed to persist tabs:", e);
  }
};

export const TerminalTabs: React.FC = () => {
  // Load persisted state on initial render
  const initialState = useRef(loadPersistedTabs());
  const [tabs, setTabs] = useState<Tab[]>(initialState.current.tabs);
  const [activeTabId, setActiveTabId] = useState(initialState.current.activeTabId);
  const initialized = useRef(false);

  // Start backend sessions for all tabs on mount (only once)
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    
    // Start sessions for all persisted tabs
    tabs.forEach(tab => {
      SessionManager.startSession(tab.id, tab.title);
    });
    
    console.log(`[TerminalTabs] Restored ${tabs.length} tab(s), active: ${activeTabId}`);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist tabs whenever they change
  useEffect(() => {
    if (initialized.current) {
      persistTabs(tabs, activeTabId);
    }
  }, [tabs, activeTabId]);

  const addTab = useCallback(() => {
    const newId = uuidv4();
    const newTabs = [...tabs];
    const title = `Terminal ${newTabs.length + 1}`;
    
    // Start backend session
    SessionManager.startSession(newId, title);
    
    newTabs.push({ id: newId, title });
    setTabs(newTabs);
    setActiveTabId(newId);
    
    // Persist immediately
    persistTabs(newTabs, newId);
  }, [tabs]);

  // Handle new tab events
  useTermAiEvent("termai-new-tab", addTab, [addTab]);

  // Handle restore session events
  useTermAiEvent(
    "termai-restore-session",
    (payload: RestoreSessionPayload) => {
      const { sessionId } = payload;
      
      // Check if tab already exists
      const existingTab = tabs.find((t) => t.id === sessionId);
      if (existingTab) {
        setActiveTabId(sessionId);
        persistTabs(tabs, sessionId);
        return;
      }
      
      // Create new tab for the restored session
      const savedSession = SessionManager.getSession(sessionId);
      const title = savedSession?.name || `Session ${sessionId.substring(0, 6)}`;
      const newTabs = [...tabs, { id: sessionId, title }];
      
      // Start backend session
      SessionManager.startSession(sessionId, title);
      
      setTabs(newTabs);
      setActiveTabId(sessionId);
      persistTabs(newTabs, sessionId);
    },
    [tabs],
  );

  // Handle tab click - persist active tab
  const handleTabClick = useCallback((tabId: string) => {
    setActiveTabId(tabId);
    persistTabs(tabs, tabId);
  }, [tabs]);

  const closeTab = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (tabs.length === 1) return;

    // End backend session
    SessionManager.endSession(id);

    const newTabs = tabs.filter((t) => t.id !== id);
    setTabs(newTabs);

    const newActiveId = activeTabId === id 
      ? newTabs[newTabs.length - 1].id 
      : activeTabId;
    
    if (activeTabId === id) {
      setActiveTabId(newActiveId);
    }
    
    // Persist immediately
    persistTabs(newTabs, newActiveId);
  }, [tabs, activeTabId]);

  return (
    <div className={styles.container}>
      <div className={styles.tabBar}>
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={clsx(
              styles.tab,
              activeTabId === tab.id && styles.active,
            )}
            onClick={() => handleTabClick(tab.id)}
          >
            <Terminal size={12} />
            <span className={styles.tabTitle}>{tab.title}</span>
            {tabs.length > 1 && (
              <div
                className={styles.closeBtn}
                onClick={(e) => closeTab(e, tab.id)}
              >
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
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={clsx(
              styles.tabContent,
              activeTabId === tab.id && styles.active,
            )}
          >
            <Workspace sessionId={tab.id} isActive={activeTabId === tab.id} />
          </div>
        ))}
      </div>
    </div>
  );
};
