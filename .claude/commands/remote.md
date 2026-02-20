---
name: remote
description: Execute commands on local or remote hosts using stored credentials with SSH and tmux
user-invocable: false
---

# Remote Command Execution

Execute commands on local or remote hosts using credentials from `~/.remote/credentials.yaml` and SSH config.

## Arguments
- $ARGUMENTS: The host and command to run. Format: `<host> <command>` or `<host> sudo <command>`

## Instructions

### 1. Resolve Host

**Step 1 — Check credentials file:**
Read `~/.remote/credentials.yaml` for a matching host entry. Entries contain `user`, `hostname`, and optionally `password` and `nopasswd_sudo` fields.

**Step 2 — Check SSH config:**
If no match in credentials, read `~/.ssh/config` for a matching `Host` entry. SSH config provides `HostName` and `User` but no password (key-based auth assumed).

**Step 3 — Determine host type:**
- If the host is `local`, run the command directly on this machine.
- Otherwise, use SSH (credentials file entry takes priority over SSH config if both match).

### 2. Local Commands

**Without sudo:**
```
<command>
```

**With sudo (nopasswd_sudo or no password set):**
```
sudo <command>
```

**With sudo (password available):**
```
echo "<password>" | sudo -S <command> 2>/dev/null
```

### 3. Remote Commands (SSH + tmux)

For ALL remote server access, always use a tmux session:

**Step 1 — Ensure tmux session exists:**
```
ssh <hostname> 'tmux has-session -t claude 2>/dev/null || tmux new-session -d -s claude'
```

**Step 2 — Send command to tmux session:**

Without sudo:
```
ssh <hostname> 'tmux send-keys -t claude "<command>" Enter'
```

With sudo (nopasswd_sudo is true, or no password available — passwordless sudo assumed):
```
ssh <hostname> 'tmux send-keys -t claude "sudo <command>" Enter'
```

With sudo (password available from credentials file and nopasswd_sudo is not true):
```
ssh <hostname> 'tmux send-keys -t claude "echo \"<password>\" | sudo -S <command> 2>/dev/null" Enter'
```

**Step 3 — Wait briefly then capture output:**
```
sleep 2
ssh <hostname> 'tmux capture-pane -t claude -p -S -50'
```

If the output looks incomplete (command still running), wait longer and capture again.

### 4. Output
Display the command output to the user. If the command failed, show the error and suggest fixes.

### 5. Security Notes
- Never echo passwords in plain text to the user
- Always use `2>/dev/null` after sudo -S to suppress password prompts from output
- The credentials file should have 600 permissions
