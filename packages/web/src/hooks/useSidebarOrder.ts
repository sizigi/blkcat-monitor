import { useState, useCallback, useMemo } from "react";
import type { MachineSnapshot } from "@blkcat/shared";

interface SidebarOrderData {
  machines: string[];
  sessions: Record<string, string[]>;
}

const STORAGE_KEY = "blkcat:sidebar-order";

function loadOrder(): SidebarOrderData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { machines: [], sessions: {} };
    const data = JSON.parse(raw);
    if (Array.isArray(data.machines) && data.sessions && typeof data.sessions === "object") {
      return data as SidebarOrderData;
    }
  } catch {}
  return { machines: [], sessions: {} };
}

function saveOrder(data: SidebarOrderData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/** Reorder an array by moving the element at `from` to `to`. */
function arrayMove<T>(arr: T[], from: number, to: number): T[] {
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Sort `items` by a stored ID order. Items not in `storedIds` go to the end in original order. */
function sortByStored<T>(items: T[], getId: (item: T) => string, storedIds: string[]): T[] {
  if (storedIds.length === 0) return items;
  const indexMap = new Map(storedIds.map((id, i) => [id, i]));
  const known: T[] = [];
  const unknown: T[] = [];
  for (const item of items) {
    if (indexMap.has(getId(item))) {
      known.push(item);
    } else {
      unknown.push(item);
    }
  }
  known.sort((a, b) => indexMap.get(getId(a))! - indexMap.get(getId(b))!);
  return [...known, ...unknown];
}

export function useSidebarOrder() {
  const [order, setOrder] = useState<SidebarOrderData>(loadOrder);

  const applyOrder = useCallback(
    (serverMachines: MachineSnapshot[]): MachineSnapshot[] => {
      const ordered = sortByStored(serverMachines, (m) => m.machineId, order.machines);
      return ordered.map((machine) => {
        const storedSessionIds = order.sessions[machine.machineId];
        if (!storedSessionIds || storedSessionIds.length === 0) return machine;
        const sortedSessions = sortByStored(machine.sessions, (s) => s.id, storedSessionIds);
        return { ...machine, sessions: sortedSessions };
      });
    },
    [order],
  );

  const reorderMachine = useCallback(
    (fromIndex: number, toIndex: number) => {
      setOrder((prev) => {
        // We need to work with the full current machine list, but we only store IDs.
        // The caller passes indices into the already-ordered view, so we update
        // the stored machines array accordingly.
        const next: SidebarOrderData = {
          ...prev,
          machines: arrayMove(prev.machines, fromIndex, toIndex),
        };
        saveOrder(next);
        return next;
      });
    },
    [],
  );

  const reorderSession = useCallback(
    (machineId: string, fromIndex: number, toIndex: number) => {
      setOrder((prev) => {
        const prevSessionIds = prev.sessions[machineId] ?? [];
        const next: SidebarOrderData = {
          ...prev,
          sessions: {
            ...prev.sessions,
            [machineId]: arrayMove(prevSessionIds, fromIndex, toIndex),
          },
        };
        saveOrder(next);
        return next;
      });
    },
    [],
  );

  // Sync current server machines into stored order so indices stay correct.
  // This is called by App.tsx after applyOrder to keep the ID arrays in sync.
  const syncOrder = useCallback(
    (serverMachines: MachineSnapshot[]) => {
      setOrder((prev) => {
        const serverMachineIds = serverMachines.map((m) => m.machineId);
        const storedSet = new Set(prev.machines);
        // Keep stored order for known machines, append new ones
        const machines = [
          ...prev.machines.filter((id) => serverMachineIds.includes(id)),
          ...serverMachineIds.filter((id) => !storedSet.has(id)),
        ];

        const sessions: Record<string, string[]> = {};
        for (const machine of serverMachines) {
          const storedSessionIds = prev.sessions[machine.machineId] ?? [];
          const serverSessionIds = machine.sessions.map((s) => s.id);
          const storedSessionSet = new Set(storedSessionIds);
          sessions[machine.machineId] = [
            ...storedSessionIds.filter((id) => serverSessionIds.includes(id)),
            ...serverSessionIds.filter((id) => !storedSessionSet.has(id)),
          ];
        }

        const next = { machines, sessions };
        // Only save and update state if something actually changed
        if (JSON.stringify(prev) === JSON.stringify(next)) {
          return prev; // same reference → React skips re-render
        }
        saveOrder(next);
        return next;
      });
    },
    [],
  );

  return { applyOrder, reorderMachine, reorderSession, syncOrder };
}
