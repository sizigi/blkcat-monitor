#!/bin/bash
# blkcat-hook.sh — Claude Code hook script that forwards events to blkcat agent.
# Receives hook event JSON on stdin, adds $TMUX_PANE, POSTs to agent.
EVENT=$(cat)
PAYLOAD=$(echo "$EVENT" | jq -c --arg pane "${TMUX_PANE:-}" '. + {tmux_pane: $pane}')
curl -s -X POST "http://localhost:${BLKCAT_HOOKS_PORT:-3001}/hooks" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" >/dev/null 2>&1 &
