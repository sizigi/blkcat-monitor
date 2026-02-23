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
    const hex = Array.from(data).map((c) =>
      c.charCodeAt(0).toString(16).padStart(2, "0")
    ).join(" ");
    const cmd = [...this.sshPrefix, "tmux", "send-keys", "-H", "-t", target, ...hex.split(" ")];
    this.exec(cmd);
  }

  resizePane(target: string, cols: number, rows: number): boolean {
    // Extract window target from pane target (e.g., "sess:0.0" → "sess:0")
    const window = target.replace(/\.\d+$/, "");
    const cmd = [...this.sshPrefix, "tmux", "resize-window", "-x", String(cols), "-y", String(rows), "-t", window];
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

  startSession(args?: string, cwd?: string): string | null {
    const claudeCmd = args ? `claude ${args}` : "claude";
    // Resolve ~ since Bun.spawnSync doesn't invoke a shell for tilde expansion
    const resolvedCwd = cwd?.startsWith("~")
      ? cwd.replace("~", process.env.HOME ?? "/root")
      : cwd;
    // Create window with no command — starts an interactive shell that
    // sources .bashrc/.zshrc so env vars are available regardless of shell
    const cmd = [...this.sshPrefix, "tmux", "new-window", "-P", "-F", "#{session_name}:#{window_index}.#{pane_index}"];
    if (resolvedCwd) cmd.push("-c", resolvedCwd);
    const result = this.exec(cmd);
    if (!result.success) return null;
    const target = result.stdout.trim();
    // Send the claude command to the interactive shell
    this.sendText(target, claudeCmd);
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
