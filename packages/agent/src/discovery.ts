import { TmuxCapture, type ExecFn, bunExec } from "./capture";
import type { SessionInfo } from "@blkcat/shared";

export function discoverClaudeSessions(exec: ExecFn = bunExec): SessionInfo[] {
  const capture = new TmuxCapture(exec);
  const sessions = capture.listSessions();
  const found: SessionInfo[] = [];

  for (const session of sessions) {
    const panes = capture.listPanes(session);
    for (const pane of panes) {
      const lines = capture.capturePane(pane);
      const content = lines.join("\n").toLowerCase();
      if (content.includes("claude")) {
        found.push({ id: pane, name: session, target: "local" });
        break;
      }
    }
  }

  return found;
}
