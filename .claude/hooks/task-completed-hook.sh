#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKTREE_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$SCRIPT_DIR/_claustre-common.sh"

SESSION_ID=$(cat "$WORKTREE_ROOT/.claustre_session_id" 2>/dev/null)
if [ -z "$SESSION_ID" ]; then
    echo "$(date -u +%FT%TZ) SKIP task-completed: no session id at WORKTREE_ROOT=$WORKTREE_ROOT" >> "$LOG"
    exit 0
fi

sync_progress

echo "$(date -u +%FT%TZ) task-completed sid=$SESSION_ID" >> "$LOG"
claustre session-update --session-id "$SESSION_ID" 2>> "$LOG"
echo "$(date -u +%FT%TZ) task-completed sid=$SESSION_ID exit=$?" >> "$LOG"
exit 0
