#!/usr/bin/env bash
# Ensure all agents are connected to the server.
# Checks /api/sessions for expected machines; reconnects missing ones.
set -u

SERVER="https://100.74.89.42:3000"

# machine-id → agent address
declare -A AGENTS=(
  [iad-mj-login]="100.81.253.95:4003"
  [lambda-b200-login-001]="lambda-b200-login-001.tailefdd7.ts.net:4000"
  [slurm-login-0]="localhost:4000"
)

machines=$(curl -sk "$SERVER/api/sessions" 2>/dev/null)
if [ -z "$machines" ]; then
  echo "[$(date '+%H:%M:%S')] ERROR: Cannot reach server at $SERVER"
  exit 1
fi

for machine_id in "${!AGENTS[@]}"; do
  addr="${AGENTS[$machine_id]}"
  if echo "$machines" | python3 -c "import json,sys; d=json.load(sys.stdin); sys.exit(0 if any(m['machineId']=='$machine_id' for m in d['machines']) else 1)" 2>/dev/null; then
    : # connected
  else
    echo "[$(date '+%H:%M:%S')] $machine_id missing, reconnecting via $addr..."
    # Remove stale entry then re-add
    curl -sk -X DELETE "$SERVER/api/agents/$addr" >/dev/null 2>&1
    result=$(curl -sk -X POST "$SERVER/api/agents" -H 'Content-Type: application/json' -d "{\"address\":\"$addr\"}" 2>&1)
    echo "[$(date '+%H:%M:%S')] $machine_id: $result"
  fi
done
