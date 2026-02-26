import { useState, useCallback } from "react";

const STORAGE_KEY = "blkcat:attachedTerminals";
const HIDDEN_KEY = "blkcat:hiddenTerminals";

/** Map of "machineId:terminalId" → "cliSessionId" */
type AttachedMap = Record<string, string>;

function loadAttached(): AttachedMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveAttached(map: AttachedMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {}
}

function loadHidden(): string[] {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHidden(list: string[]) {
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(list));
  } catch {}
}

export function useAttachedTerminals() {
  const [attached, setAttached] = useState<AttachedMap>(loadAttached);
  const [hidden, setHidden] = useState<string[]>(loadHidden);

  const attachTerminal = useCallback((machineId: string, terminalId: string, cliSessionId: string) => {
    setAttached((prev) => {
      const key = `${machineId}:${terminalId}`;
      const next = { ...prev, [key]: cliSessionId };
      saveAttached(next);
      return next;
    });
  }, []);

  const detachTerminal = useCallback((machineId: string, terminalId: string) => {
    const key = `${machineId}:${terminalId}`;
    setAttached((prev) => {
      const next = { ...prev };
      delete next[key];
      saveAttached(next);
      return next;
    });
  }, []);

  const getAttachedTo = useCallback((machineId: string, terminalId: string): string | null => {
    return attached[`${machineId}:${terminalId}`] ?? null;
  }, [attached]);

  const isAttached = useCallback((machineId: string, terminalId: string): boolean => {
    return `${machineId}:${terminalId}` in attached;
  }, [attached]);

  // --- Hide/show any terminal session (not just attached) ---

  const hideTerminal = useCallback((machineId: string, sessionId: string) => {
    const key = `${machineId}:${sessionId}`;
    setHidden((prev) => {
      if (prev.includes(key)) return prev;
      const next = [...prev, key];
      saveHidden(next);
      return next;
    });
  }, []);

  const showTerminal = useCallback((machineId: string, sessionId: string) => {
    const key = `${machineId}:${sessionId}`;
    setHidden((prev) => {
      const next = prev.filter((k) => k !== key);
      saveHidden(next);
      return next;
    });
  }, []);

  const isHidden = useCallback((machineId: string, sessionId: string): boolean => {
    return hidden.includes(`${machineId}:${sessionId}`);
  }, [hidden]);

  const getHiddenList = useCallback((): string[] => {
    return hidden;
  }, [hidden]);

  return {
    attachTerminal,
    detachTerminal,
    getAttachedTo,
    isAttached,
    hideTerminal,
    showTerminal,
    isHidden,
    getHiddenList,
  };
}
