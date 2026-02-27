import type { CliTool } from "@blkcat/shared";

export interface ExecResult {
  success: boolean;
  stdout: string;
}

export type ExecFn = (cmd: string[]) => ExecResult;

export function bunExec(cmd: string[]): ExecResult {
  const result = Bun.spawnSync(cmd);
  return {
    success: result.exitCode === 0,
    stdout: result.stdout?.toString() ?? "",
  };
}

export class TmuxCapture {
  constructor(
    private exec: ExecFn = bunExec,
    private sshPrefix: string[] = [],
  ) {}

  capturePane(target: string): string[] {
    const cmd = [...this.sshPrefix, "tmux", "capture-pane", "-p", "-e", "-t", target];
    const result = this.exec(cmd);
    if (!result.success) return [];
    // Split and remove trailing empty line from the final newline
    const lines = result.stdout.split("\n");
    while (lines.length > 0 && lines[lines.length - 1] === "") {
      lines.pop();
    }
    return lines;
  }

  /** Get the cursor position (0-based x, y) in the pane. */
  getCursorPos(target: string): { x: number; y: number } | null {
    const cmd = [...this.sshPrefix, "tmux", "display-message", "-p", "-t", target, "#{cursor_x},#{cursor_y}"];
    const result = this.exec(cmd);
    if (!result.success) return null;
    const [xStr, yStr] = result.stdout.trim().split(",");
    const x = parseInt(xStr);
    const y = parseInt(yStr);
    if (isNaN(x) || isNaN(y)) return null;
    return { x, y };
  }

  captureScrollback(target: string): string[] {
    const cmd = [...this.sshPrefix, "tmux", "capture-pane", "-p", "-e", "-S", "-", "-t", target];
    const result = this.exec(cmd);
    if (!result.success) return [];
    const lines = result.stdout.split("\n");
    while (lines.length > 0 && lines[lines.length - 1] === "") {
      lines.pop();
    }
    return lines;
  }

  listSessions(): string[] {
    const cmd = [...this.sshPrefix, "tmux", "list-sessions", "-F", "#{session_name}"];
    const result = this.exec(cmd);
    if (!result.success) return [];
    return result.stdout.trim().split("\n").filter(Boolean);
  }

  listPanes(session: string): string[] {
    const cmd = [...this.sshPrefix, "tmux", "list-panes", "-s", "-t", session,
      "-F", "#{session_name}:#{window_index}.#{pane_index}"];
    const result = this.exec(cmd);
    if (!result.success) return [];
    return result.stdout.trim().split("\n").filter(Boolean);
  }

  sendText(target: string, text: string): void {
    const cmd = [...this.sshPrefix, "tmux", "send-keys", "-l", "-t", target, text];
    this.exec(cmd);
  }

  sendKey(target: string, key: string): void {
    const cmd = [...this.sshPrefix, "tmux", "send-keys", "-t", target, key];
    this.exec(cmd);
  }

  sendRaw(target: string, data: string): void {
    // For large data, use load-buffer + paste-buffer which is O(1) vs O(n) for send-keys -H
    if (data.length > 512) {
      // Write data to a temp file, load into tmux buffer, then paste into target pane
      const tmpPath = `/tmp/blkcat-paste-${process.pid}`;
      try {
        Bun.spawnSync(["bash", "-c", `cat > ${tmpPath}`], { stdin: new TextEncoder().encode(data) });
        this.exec([...this.sshPrefix, "tmux", "load-buffer", tmpPath]);
        this.exec([...this.sshPrefix, "tmux", "paste-buffer", "-d", "-t", target]);
      } finally {
        try { Bun.spawnSync(["rm", "-f", tmpPath]); } catch {}
      }
      return;
    }
    const bytes = new TextEncoder().encode(data);
    const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0"));
    const cmd = [...this.sshPrefix, "tmux", "send-keys", "-H", "-t", target, ...hex];
    this.exec(cmd);
  }

  resizePane(target: string, cols: number, rows: number): boolean {
    // Extract window target from pane target (e.g., "sess:0.0" → "sess:0")
    const window = target.replace(/\.\d+$/, "");
    const session = window.replace(/:.*$/, "");

    // For multi-pane windows, compute the window size needed so this pane
    // gets the requested cols/rows. Query current pane and window dimensions
    // to derive the ratio, then scale accordingly.
    let targetCols = cols;
    let targetRows = rows;
    const paneSizeResult = this.exec([...this.sshPrefix, "tmux", "display-message", "-p", "-t", target, "#{pane_width},#{pane_height}"]);
    const winSizeResult = this.exec([...this.sshPrefix, "tmux", "display-message", "-p", "-t", window, "#{window_width},#{window_height}"]);
    if (paneSizeResult.success && winSizeResult.success) {
      const [paneW, paneH] = paneSizeResult.stdout.trim().split(",").map(Number);
      const [winW, winH] = winSizeResult.stdout.trim().split(",").map(Number);
      if (paneW > 0 && paneH > 0 && (paneW !== winW || paneH !== winH)) {
        // Multi-pane window: scale the requested size by window/pane ratio
        targetCols = Math.round(cols * (winW / paneW));
        targetRows = Math.round(rows * (winH / paneH));
      }
    }

    const ok = this.exec([...this.sshPrefix, "tmux", "resize-window", "-x", String(targetCols), "-y", String(targetRows), "-t", window]).success;
    if (ok) {
      // Verify resize took effect — attached clients can constrain window size
      const sizeResult = this.exec([...this.sshPrefix, "tmux", "display-message", "-p", "-t", target, "#{pane_width},#{pane_height}"]);
      if (sizeResult.success) {
        const [w, h] = sizeResult.stdout.trim().split(",").map(Number);
        if (w !== cols || h !== rows) {
          // Resize was overridden by client constraint — set window-size manual and retry
          this.exec([...this.sshPrefix, "tmux", "set-option", "-t", session, "window-size", "manual"]);
          this.exec([...this.sshPrefix, "tmux", "resize-window", "-x", String(targetCols), "-y", String(targetRows), "-t", window]);
        }
      }
      // Force tmux to deliver SIGWINCH to processes in background windows
      // by briefly selecting the target window then switching back.
      // Without this, pty dimensions stay stale for non-active windows.
      this.exec([...this.sshPrefix, "tmux", "select-window", "-t", window]);
      this.exec([...this.sshPrefix, "tmux", "last-window", "-t", session]);
    }
    return ok;
  }

  renameWindow(target: string, name: string): boolean {
    // target is "session:window.pane" — extract "session:window" for rename
    const window = target.replace(/\.\d+$/, "");
    const cmd = [...this.sshPrefix, "tmux", "rename-window", "-t", window, name];
    return this.exec(cmd).success;
  }

  swapPane(target1: string, target2: string): boolean {
    const cmd = [...this.sshPrefix, "tmux", "swap-pane", "-s", target1, "-t", target2];
    return this.exec(cmd).success;
  }

  /** Swap two tmux windows by their session:window targets (e.g. "main:0", "main:1"). */
  swapWindow(target1: string, target2: string): boolean {
    const cmd = [...this.sshPrefix, "tmux", "swap-window", "-s", target1, "-t", target2];
    return this.exec(cmd).success;
  }

  killPane(target: string): boolean {
    const cmd = [...this.sshPrefix, "tmux", "kill-pane", "-t", target];
    return this.exec(cmd).success;
  }

  respawnPane(target: string, shellCommand: string): boolean {
    // Wrap in an interactive shell so ~/.bashrc / ~/.zshrc are sourced
    const shell = process.env.SHELL || "/bin/bash";
    const cmd = [...this.sshPrefix, "tmux", "respawn-pane", "-k", "-t", target, shell, "-ic", shellCommand];
    return this.exec(cmd).success;
  }

  startPlainSession(cwd?: string): string | null {
    const resolvedCwd = cwd?.startsWith("~")
      ? cwd.replace("~", process.env.HOME ?? "/root")
      : cwd;
    const hasTmux = this.exec([...this.sshPrefix, "tmux", "has-session"]).success;
    const tmuxCmd = hasTmux ? "new-window" : "new-session";
    const shell = process.env.SHELL || "/bin/bash";
    const cmd = [...this.sshPrefix, "tmux", tmuxCmd, "-P", "-F", "#{session_name}:#{window_index}.#{pane_index}"];
    if (!hasTmux) cmd.push("-d");
    if (resolvedCwd) cmd.push("-c", resolvedCwd);
    cmd.push(shell, "-l");
    const result = this.exec(cmd);
    if (!result.success) return null;
    return result.stdout.trim();
  }

  startSession(args?: string, cwd?: string, cliTool: CliTool = "claude"): string | null {
    const command = cliTool;
    const fullCmd = args ? `${command} ${args}` : command;
    // Resolve ~ since Bun.spawnSync doesn't invoke a shell for tilde expansion
    const resolvedCwd = cwd?.startsWith("~")
      ? cwd.replace("~", process.env.HOME ?? "/root")
      : cwd;
    // Create window with no command — starts an interactive shell that
    // sources .bashrc/.zshrc so env vars are available regardless of shell.
    // If no tmux server is running, fall back to new-session which creates one.
    const hasTmux = this.exec([...this.sshPrefix, "tmux", "has-session"]).success;
    const tmuxCmd = hasTmux ? "new-window" : "new-session";
    const cmd = [...this.sshPrefix, "tmux", tmuxCmd, "-P", "-F", "#{session_name}:#{window_index}.#{pane_index}"];
    if (!hasTmux) cmd.push("-d");
    if (resolvedCwd) cmd.push("-c", resolvedCwd);
    const result = this.exec(cmd);
    if (!result.success) return null;
    const target = result.stdout.trim();
    // Unset CLAUDECODE so Claude Code doesn't refuse to start when blkcat
    // itself is running inside a Claude Code session.
    this.sendText(target, `unset CLAUDECODE; ${fullCmd}`);
    this.sendKey(target, "Enter");
    return target;
  }

  listDirectory(path: string): { entries: { name: string; isDir: boolean }[] } | { error: string } {
    const resolved = path.startsWith("~")
      ? path.replace("~", process.env.HOME ?? "/root")
      : path;
    const cmd = [...this.sshPrefix, "ls", "-1", "-p", resolved];
    const result = this.exec(cmd);
    if (!result.success) return { error: "Failed to list directory" };
    const entries = result.stdout.split("\n").filter(Boolean).map((entry) => {
      const isDir = entry.endsWith("/");
      return { name: isDir ? entry.slice(0, -1) : entry, isDir };
    });
    return { entries };
  }

  createDirectory(path: string): { success: boolean; error?: string } {
    const resolved = path.startsWith("~")
      ? path.replace("~", process.env.HOME ?? "/root")
      : path;
    const cmd = [...this.sshPrefix, "mkdir", "-p", resolved];
    const result = this.exec(cmd);
    if (!result.success) return { success: false, error: "Failed to create directory" };
    return { success: true };
  }

  static forSSH(host: string, key?: string): TmuxCapture {
    const sshCmd = ["ssh", "-o", "ControlMaster=auto",
      "-o", "ControlPath=~/.ssh/blkcat-%r@%h:%p",
      "-o", "ControlPersist=60",
      "-o", "StrictHostKeyChecking=no"];
    if (key) sshCmd.push("-i", key);
    sshCmd.push(host);
    return new TmuxCapture(bunExec, sshCmd);
  }
}
