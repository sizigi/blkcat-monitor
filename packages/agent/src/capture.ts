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

  killPane(target: string): boolean {
    const cmd = [...this.sshPrefix, "tmux", "kill-pane", "-t", target];
    return this.exec(cmd).success;
  }

  startSession(args?: string): string | null {
    const claudeCmd = args ? `claude ${args}` : "claude";
    const cmd = [...this.sshPrefix, "tmux", "new-window", "-P", "-F", "#{session_name}:#{window_index}.#{pane_index}", claudeCmd];
    const result = this.exec(cmd);
    if (!result.success) return null;
    return result.stdout.trim();
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
