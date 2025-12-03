import React, { useState, useCallback } from "react";
import { Workspace } from "../Workspace/Workspace";
import styles from "./TerminalTabs.module.css";
import { Plus, X, Terminal } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import clsx from "clsx";
import { useTermAiEvent } from "../../hooks/useTermAiEvent";
import type { RestoreSessionPayload } from "../../events/types";

interface Tab {
  id: string;
  title: string;
}

export const TerminalTabs: React.FC = () => {
  const [tabs, setTabs] = useState<Tab[]>([
    { id: "default", title: "Terminal 1" },
  ]);
  const [activeTabId, setActiveTabId] = useState("default");

  const addTab = useCallback(() => {
    const newId = uuidv4();
    setTabs((prev) => [
      ...prev,
      { id: newId, title: `Terminal ${prev.length + 1}` },
    ]);
    setActiveTabId(newId);
  }, []);

  // Handle new tab events
  useTermAiEvent("termai-new-tab", addTab, [addTab]);

  // Handle restore session events
  useTermAiEvent(
    "termai-restore-session",
    (payload: RestoreSessionPayload) => {
      const { sessionId } = payload;
      setTabs((prevTabs) => {
        const existingTab = prevTabs.find((t) => t.id === sessionId);
        if (existingTab) {
          setActiveTabId(sessionId);
          return prevTabs;
        }
        setActiveTabId(sessionId);
        return [
          ...prevTabs,
          { id: sessionId, title: `Session ${sessionId.substring(0, 4)}` },
        ];
      });
    },
    [],
  );

  const closeTab = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (tabs.length === 1) return;

    const newTabs = tabs.filter((t) => t.id !== id);
    setTabs(newTabs);

    if (activeTabId === id) {
      setActiveTabId(newTabs[newTabs.length - 1].id);
    }
  };

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
            onClick={() => setActiveTabId(tab.id)}
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
