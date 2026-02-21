import { useState, useCallback } from "react";

interface DisplayNames {
  machines: Record<string, string>;
  sessions: Record<string, string>;
}

const STORAGE_KEY = "blkcat-displayNames";

function load(): DisplayNames {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { machines: {}, sessions: {} };
}

function save(names: DisplayNames) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(names));
}

export function useDisplayNames() {
  const [names, setNames] = useState<DisplayNames>(load);

  const setMachineName = useCallback((machineId: string, name: string) => {
    setNames((prev) => {
      const next = { ...prev, machines: { ...prev.machines, [machineId]: name } };
      if (!name) delete next.machines[machineId];
      save(next);
      return next;
    });
  }, []);

  const setSessionName = useCallback((machineId: string, sessionId: string, name: string) => {
    const key = `${machineId}:${sessionId}`;
    setNames((prev) => {
      const next = { ...prev, sessions: { ...prev.sessions, [key]: name } };
      if (!name) delete next.sessions[key];
      save(next);
      return next;
    });
  }, []);

  const getMachineName = useCallback(
    (machineId: string) => names.machines[machineId] || machineId,
    [names],
  );

  const getSessionName = useCallback(
    (machineId: string, sessionId: string, defaultName: string) =>
      names.sessions[`${machineId}:${sessionId}`] || defaultName,
    [names],
  );

  return { getMachineName, getSessionName, setMachineName, setSessionName };
}
