#!/usr/bin/env bash
# Auto-restart wrapper for blkcat agent.
# Usage: BLKCAT_LISTEN_PORT=4000 ./scripts/agent-loop.sh
set -u
cd "$(dirname "$0")/.." || exit 1

BUN="${HOME}/.bun/bin/bun"
RESTART_DELAY="${BLKCAT_RESTART_DELAY:-5}"

while true; do
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting agent on port ${BLKCAT_LISTEN_PORT:-4000}..."
  "$BUN" packages/agent/src/index.ts
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Agent exited (code $?), restarting in ${RESTART_DELAY}s..."
  sleep "$RESTART_DELAY"
done
