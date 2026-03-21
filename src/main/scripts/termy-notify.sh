#!/bin/bash
# Termy notification hook for Claude Code
# Claude Code calls this on Notification events with JSON on stdin.
# Forwards to the Termy main process via Unix socket.

TERMY_SOCK="${TERMY_NOTIFICATION_SOCKET}"
if [ -z "$TERMY_SOCK" ] || [ ! -S "$TERMY_SOCK" ]; then
  exit 0
fi

INPUT=$(cat)
echo "$INPUT" | nc -U "$TERMY_SOCK" 2>/dev/null
exit 0
