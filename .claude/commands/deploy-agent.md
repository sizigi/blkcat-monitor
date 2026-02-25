---
name: deploy-agent
description: Deploy a blkcat agent to a remote server via SSH using reverse (listener) mode
user-invocable: false
---

# Deploy Agent

Deploy a blkcat monitoring agent to a remote server. Uses reverse (listener) mode — the agent listens on a port and the server connects to it.

## Arguments
- $ARGUMENTS: `<host>` or `<host> <listen-port>`. Default listen port is 4000.

## Instructions

### 1. Resolve Host

Use the `remote` skill's host resolution logic:
1. Check `~/.remote/credentials.yaml` for a matching entry (provides hostname, user, and optionally password).
2. If not found, check `~/.ssh/config` for a matching `Host` entry (provides HostName and User).

Extract the **alias** (the argument), **hostname** (IP/DNS), and **user**.

**Important:** All `ssh` commands in this guide MUST use `-A` (agent forwarding) so the remote machine can authenticate with GitHub using the local SSH key. This is critical for machines that don't have their own GitHub SSH key configured.

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

### 4. Pull latest code and install dependencies

```
ssh -A <alias> 'tmux send-keys -t claude "cd ~/blkcat-monitor && git pull && ~/.bun/bin/bun install" Enter'
```
Wait ~15 seconds, then capture output to confirm success.

### 5. Kill existing agent (if any)

Send Ctrl-C to stop any running agent process:
```
ssh -A <alias> 'tmux send-keys -t claude C-c'
```
Wait 1 second.

### 6. Start agent in listener mode

```
ssh -A <alias> 'tmux send-keys -t claude "BLKCAT_LISTEN_PORT=<port> ~/.bun/bin/bun packages/agent/src/index.ts" Enter'
```
Wait ~3 seconds, then capture output:
```
ssh -A <alias> 'tmux capture-pane -t claude -p -S -5'
```

Verify the output contains `Listening on port <port>`. If it shows `EADDRINUSE`, increment the port by 1 and retry (up to 3 attempts).

### 7. Connect the server to the agent

Use the REST API to tell the local server to connect:
```
curl -s -X POST http://localhost:3000/api/agents \
  -H 'Content-Type: application/json' \
  -d '{"address":"<hostname>:<port>"}'
```

### 8. Verify

Wait 3 seconds, then check the sessions API:
```
curl -s http://localhost:3000/api/sessions
```

Confirm the new machine appears in the response. Report the machine ID, number of sessions discovered, and the listen port to the user.

### 9. Error handling

- If SSH fails, report the connectivity issue.
- If bun install fails, suggest the user install it manually.
- If git pull fails (e.g. merge conflicts), report the error.
- If all 3 port attempts fail with EADDRINUSE, report which ports were tried and suggest the user free a port or specify a different one.
- If the server API returns an error (e.g. 409 agent already exists), report it and suggest removing the old agent first via the dashboard or `curl -X DELETE http://localhost:3000/api/agents/<address>`.
