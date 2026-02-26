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
    // Don't store locally — the name lives in tmux (windowName).
    // Sending the message triggers a tmux rename-window on the agent.
    opts.sendDisplayName("session", machineId, sessionId, name);
  }, [opts.sendDisplayName]);

  const getMachineName = useCallback(
    (machineId: string) => names.machines[machineId] || machineId,
    [names],
  );

  const getSessionName = useCallback(
    (_machineId: string, _sessionId: string, defaultName: string) =>
      defaultName,
    [],
  );

  return { getMachineName, getSessionName, setMachineName, setSessionName };
}
