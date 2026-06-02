#!/usr/bin/env bash
#
# Restart the demo Playground server.
#   ./restart-demo.sh              # rebuild the demo, then serve on :9009
#   ./restart-demo.sh --serve-only # skip the rebuild, just (re)serve
#   PORT=8080 ./restart-demo.sh    # use a different port
#
set -euo pipefail
cd "$(dirname "$0")"
PORT="${PORT:-9009}"

# Stop any server already running (by script name and by whatever holds the port).
pkill -f "demo/serve.js" 2>/dev/null || true
lsof -ti "tcp:${PORT}" 2>/dev/null | xargs kill -9 2>/dev/null || true
sleep 0.5

if [[ "${1:-}" != "--serve-only" ]]; then
  echo "▸ Building demo…"
  npm run demo:build
fi

echo "▸ Serving on http://localhost:${PORT}  (Ctrl+C to stop)"
exec env PORT="${PORT}" npm run demo:serve
