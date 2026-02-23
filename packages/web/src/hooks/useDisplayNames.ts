import { useState, useCallback, useEffect } from "react";
import type { DisplayNamesData } from "./useSocket";

interface UseDisplayNamesOptions {
  /** Send a display name change to the server. */
  sendDisplayName: (target: "machine" | "session", machineId: string, sessionId: string | undefined, name: string) => void;
  /** Subscribe to display name updates from the server (snapshot + broadcast). */
  subscribeDisplayNames: (cb: (names: DisplayNamesData) => void) => () => void;
}

export function useDisplayNames(opts: UseDisplayNamesOptions) {
  const [names, setNames] = useState<DisplayNamesData>({ machines: {}, sessions: {} });

  useEffect(() => {
    return opts.subscribeDisplayNames((incoming) => {
      setNames(incoming);
    });
  }, [opts.subscribeDisplayNames]);

  const setMachineName = useCallback((machineId: string, name: string) => {
    setNames((prev) => {
      const next = { ...prev, machines: { ...prev.machines, [machineId]: name } };
      if (!name) delete next.machines[machineId];
      return next;
    });
    opts.sendDisplayName("machine", machineId, undefined, name);
  }, [opts.sendDisplayName]);

  const setSessionName = useCallback((machineId: string, sessionId: string, name: string) => {
    const key = `${machineId}:${sessionId}`;
    setNames((prev) => {
      const next = { ...prev, sessions: { ...prev.sessions, [key]: name } };
      if (!name) delete next.sessions[key];
      return next;
    });
    opts.sendDisplayName("session", machineId, sessionId, name);
  }, [opts.sendDisplayName]);

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
