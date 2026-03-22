#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKTREE_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOG="$HOME/.claustre/hook-debug.log"

SESSION_ID=$(cat "$WORKTREE_ROOT/.claustre_session_id" 2>/dev/null)
if [ -z "$SESSION_ID" ]; then
    exit 0
fi

echo "$(date -u +%FT%TZ) user-prompt sid=$SESSION_ID" >> "$LOG"
claustre session-update --session-id "$SESSION_ID" --resumed 2>> "$LOG"
exit 0
