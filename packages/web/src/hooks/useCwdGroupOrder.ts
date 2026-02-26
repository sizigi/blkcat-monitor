import { useState, useCallback } from "react";

const STORAGE_KEY = "blkcat:cwdGroupOrder";

/** Map of machineId → ordered list of cwdRoot strings */
type OrderMap = Record<string, string[]>;

function loadOrder(): OrderMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveOrder(map: OrderMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {}
}

export function useCwdGroupOrder() {
  const [order, setOrder] = useState<OrderMap>(loadOrder);

  const getOrderedGroups = useCallback(<T extends { cwdRoot: string }>(
    machineId: string,
    groups: T[],
  ): T[] => {
    const saved = order[machineId];
    if (!saved || saved.length === 0) return groups;

    // Sort groups by their position in saved order; unseen groups go to the end
    const indexMap = new Map(saved.map((root, i) => [root, i]));
    return [...groups].sort((a, b) => {
      const ai = indexMap.get(a.cwdRoot) ?? Infinity;
      const bi = indexMap.get(b.cwdRoot) ?? Infinity;
      return ai - bi;
    });
  }, [order]);

  const setGroupOrder = useCallback((machineId: string, cwdRoots: string[]) => {
    setOrder((prev) => {
      const next = { ...prev, [machineId]: cwdRoots };
      saveOrder(next);
      return next;
    });
  }, []);

  return { getOrderedGroups, setGroupOrder };
}
