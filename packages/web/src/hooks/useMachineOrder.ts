import { useState, useCallback } from "react";

const STORAGE_KEY = "blkcat:machineOrder";

function loadOrder(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveOrder(order: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
  } catch {}
}

export function useMachineOrder() {
  const [order, setOrder] = useState<string[]>(loadOrder);

  const getOrderedMachines = useCallback(<T extends { machineId: string }>(
    machines: T[],
  ): T[] => {
    if (order.length === 0) return machines;

    const indexMap = new Map(order.map((id, i) => [id, i]));
    return [...machines].sort((a, b) => {
      const ai = indexMap.get(a.machineId) ?? Infinity;
      const bi = indexMap.get(b.machineId) ?? Infinity;
      return ai - bi;
    });
  }, [order]);

  const setMachineOrder = useCallback((machineIds: string[]) => {
    setOrder(machineIds);
    saveOrder(machineIds);
  }, []);

  return { getOrderedMachines, setMachineOrder };
}
