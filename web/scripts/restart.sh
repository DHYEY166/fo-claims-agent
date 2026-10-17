#!/usr/bin/env bash
# Restart the dev server on :3100 in the background. Usage: scripts/restart.sh [API_BASE]
cd "$(dirname "$0")/.."
PID=$(ss -ltnp 2>/dev/null | awk '/:3100 /' | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2)
[ -n "$PID" ] && kill "$PID" && sleep 1
rm -rf .next
NEXT_PUBLIC_API_BASE="${1:-}" setsid nohup npm run dev > /tmp/gsd-web-dev.log 2>&1 < /dev/null &
for i in $(seq 1 30); do curl -s -o /dev/null localhost:3100/ && break; sleep 1; done
echo "dev server up on http://localhost:3100 (API_BASE=${1:-<mock>})"
