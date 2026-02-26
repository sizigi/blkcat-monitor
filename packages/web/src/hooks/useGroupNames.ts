import { useState, useCallback } from "react";

const STORAGE_KEY = "blkcat:groupNames";

/** Shape: { "machineId:cwdRoot": "display name" } */
type GroupNamesMap = Record<string, string>;

function loadNames(): GroupNamesMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function persistNames(names: GroupNamesMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(names));
  } catch {}
}

export function useGroupNames() {
  const [names, setNames] = useState<GroupNamesMap>(loadNames);

  const getGroupName = useCallback(
    (machineId: string, cwdRoot: string, defaultName: string): string => {
      const key = `${machineId}:${cwdRoot}`;
      return names[key] || defaultName;
    },
    [names],
  );

  const setGroupName = useCallback(
    (machineId: string, cwdRoot: string, name: string) => {
      const key = `${machineId}:${cwdRoot}`;
      setNames((prev) => {
        const next = { ...prev };
        if (name) {
          next[key] = name;
        } else {
          delete next[key];
        }
        persistNames(next);
        return next;
      });
    },
    [],
  );

  return { getGroupName, setGroupName };
}
