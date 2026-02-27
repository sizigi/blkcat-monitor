---
name: deploy-agent
description: Deploy a blkcat agent to a remote server via SSH using reverse (listener) mode
user-invocable: false
---

# Deploy Agent

Deploy a blkcat monitoring agent to a remote server. Uses reverse (listener) mode — the agent listens on a port and the server connects to it.

## Arguments
- $ARGUMENTS: `<host>` or `<host> <listen-port>`. Default listen port is 4000.

## CRITICAL: Always run agents inside tmux

The blkcat agent MUST always run inside a tmux session, never via `nohup &` or bare background processes. This applies to both fresh deploys and restarts/updates. Use `tmux send-keys` to start the agent process.

When restarting an existing agent (e.g. after `git pull`):
1. Find the tmux session running the agent: `ssh -A <alias> 'tmux list-sessions'`
2. Send Ctrl-C to stop it: `ssh -A <alias> 'tmux send-keys -t <session> C-c'`
3. Wait 1 second
4. Start it again: `ssh -A <alias> 'tmux send-keys -t <session> "BLKCAT_LISTEN_PORT=<port> ~/.bun/bin/bun packages/agent/src/index.ts" Enter'`

## Instructions

### 1. Resolve Host

Use the `remote` skill's host resolution logic:
1. Check `~/.remote/credentials.yaml` for a matching entry (provides hostname, user, and optionally password).
2. If not found, check `~/.ssh/config` for a matching `Host` entry (provides HostName and User).

Extract the **alias** (the argument), **hostname** (IP/DNS), and **user**.

**Important:** All `ssh` commands in this guide MUST use `-A` (agent forwarding) so the remote machine can authenticate with GitHub using the local SSH key. This is critical for machines that don't have their own GitHub SSH key configured.

### 1b. Ensure SSH agent forwarding works

Agent forwarding requires a working local SSH agent. Check and fix before proceeding:

```
ssh -A <alias> 'ssh-add -l'
```

If this fails with "Could not open a connection to your authentication agent", the local SSH agent socket is likely stale (common with byobu/tmux). Fix it:

```
eval "$(ssh-agent -s)" && ssh-add ~/.ssh/id_ed25519
# Update the byobu symlink if it exists:
ln -sf "$SSH_AUTH_SOCK" ~/.byobu/.ssh-agent
```

Then re-test `ssh -A <alias> 'ssh-add -l'` to confirm the key is visible on the remote.

### 2. Ensure tmux session exists on remote

```
ssh -A <alias> "tmux has-session -t claude 2>/dev/null || tmux new-session -d -s claude"
```

### 3. Install bun if missing

Check if bun is installed:
```
ssh -A <alias> "which bun 2>/dev/null || ~/.bun/bin/bun --version 2>/dev/null"
```

If not found, install via tmux:
```
ssh -A <alias> 'tmux send-keys -t claude "curl -fsSL https://bun.sh/install | bash" Enter'
```
Wait ~15 seconds, then capture output to confirm installation succeeded.

### 4. Clone or pull latest code and install dependencies

**CRITICAL: Git operations requiring GitHub auth (clone/pull) MUST be run directly via `ssh -A`, NOT through `tmux send-keys`.** The SSH agent forwarding socket is per-connection and is NOT accessible from a pre-existing tmux session.

First, get the actual repo URL from the local checkout:
```
git remote get-url origin
# e.g. git@github.com:sizigi/blkcat-monitor.git
```

If repo doesn't exist on remote:
```
ssh -A <alias> 'git clone <repo-url> ~/blkcat-monitor'
```

If repo already exists:
```
ssh -A <alias> 'cd ~/blkcat-monitor && git pull'
```

Then install dependencies (can be via tmux or direct):
```
ssh -A <alias> 'cd ~/blkcat-monitor && ~/.bun/bin/bun install'
```

### 5. Kill existing agent (if any)

Send Ctrl-C to stop any running agent process:
```
ssh -A <alias> 'tmux send-keys -t claude C-c'
```
Wait 1 second.

### 6. Start agent in listener mode

```
ssh -A <alias> 'tmux send-keys -t claude "BLKCAT_LISTEN_PORT=<port> BLKCAT_HOOKS_PORT=<hooks-port> ~/.bun/bin/bun packages/agent/src/index.ts" Enter'
```
Default hooks port is 3001 (listen port - 999). If either port is in use, both must be set explicitly.

Wait ~3 seconds, then capture output:
```
ssh -A <alias> 'tmux capture-pane -t claude -p -S -5'
```

Verify the output contains `Listening on port <port>`. If it shows `EADDRINUSE`, check which port failed (listen or hooks), increment that port by 1, and retry (up to 3 attempts). Always set both `BLKCAT_LISTEN_PORT` and `BLKCAT_HOOKS_PORT` to avoid collisions.

### 7. Connect the server to the agent

First, discover the running server's address and protocol. The server may be bound to a specific IP (not localhost) and may use HTTPS:

```
ss -tlnp | grep bun
# Look for the port and bind address, e.g. 100.103.229.39:3000
```

Test connectivity (try HTTPS first, then HTTP):
```
curl -sk https://<server-address>/api/agents
# If that fails, try:
curl -s http://<server-address>/api/agents
```

**If the server cannot directly reach the remote host's listen port** (e.g. firewalled, no direct route), set up an SSH tunnel first:
```
ssh -fNL <port>:localhost:<port> <alias>
```
Then use `localhost:<port>` (or `127.0.0.1:<port>`) as the agent address instead of `<hostname>:<port>`.

Connect the agent:
```
curl -sk -X POST https://<server-address>/api/agents \
  -H 'Content-Type: application/json' \
  -d '{"address":"<agent-address>:<port>"}'
```

### 8. Verify

Wait 3 seconds, then check the sessions API:
```
curl -sk https://<server-address>/api/sessions
```

Confirm the new machine appears in the response. Report the machine ID, number of sessions discovered, and the listen port to the user.

### 9. Error handling

- If SSH fails, report the connectivity issue.
- If bun install fails, suggest the user install it manually.
- If git pull fails (e.g. merge conflicts), report the error.
- If all 3 port attempts fail with EADDRINUSE, report which ports were tried and suggest the user free a port or specify a different one.
- If the server API returns an error (e.g. 409 agent already exists), report it and suggest removing the old agent first via the dashboard or `curl -X DELETE http://localhost:3000/api/agents/<address>`.
