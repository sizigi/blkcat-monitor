import { useState, useEffect } from "react";
import type { OutputLine } from "./useSocket";

/** Subscribe to output changes for a specific session. Only triggers a
 *  re-render when the selected session's output changes — not when any
 *  other session receives new data. */
export function useSessionOutput(
  outputMapRef: React.RefObject<Map<string, OutputLine>>,
  subscribeOutput: (cb: (key: string) => void) => () => void,
  machineId?: string,
  sessionId?: string,
): { lines: string[]; cursor?: { x: number; y: number } } {
  const [output, setOutput] = useState<{ lines: string[]; cursor?: { x: number; y: number } }>({ lines: [] });
  const targetKey = machineId && sessionId ? `${machineId}:${sessionId}` : "";

  useEffect(() => {
    if (!targetKey) { setOutput({ lines: [] }); return; }

    const current = outputMapRef.current?.get(targetKey);
    if (current) setOutput({ lines: current.lines, cursor: current.cursor });

    return subscribeOutput((key) => {
      if (key === targetKey) {
        const o = outputMapRef.current?.get(key);
        if (o) setOutput({ lines: o.lines, cursor: o.cursor });
      }
    });
  }, [targetKey, outputMapRef, subscribeOutput]);

  return output;
}
