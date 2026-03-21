#!/bin/bash
# Termy status line script for Claude Code
# Receives JSON session data on stdin from Claude Code's status line feature.
# Emits it as a custom OSC 7701 sequence that flows through the PTY
# back to xterm.js where Termy's custom handler intercepts it.

INPUT=$(cat)
printf '\033]7701;%s\a' "$INPUT"
