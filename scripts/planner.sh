#!/usr/bin/env bash
# Launch the Upload Planner Next.js dev server.
#
# Behavior:
#   - cd's into the project directory
#   - Frees the dev port (kills any stale dev server)
#   - Runs `npm install` if node_modules is missing
#   - Optionally clears the .next cache (--clean / -c)
#   - Starts `npm run dev`
#
# Usage:
#   planner                # normal start
#   planner --clean        # wipe .next first (recovers from stale Turbopack state)
#   planner --build        # production build instead of dev
#   PLANNER_PORT=4000 planner   # use a different port

set -euo pipefail

# Resolve the project dir from the script location so this works no matter
# where you call it from (and whether the alias uses an absolute path or not).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PORT="${PLANNER_PORT:-3000}"

cyan()  { printf '\033[36m→\033[0m %s\n' "$1"; }
green() { printf '\033[32m✓\033[0m %s\n' "$1"; }
red()   { printf '\033[31m✗\033[0m %s\n' "$1" >&2; }

cd "$PROJECT_DIR"

# Parse flags.
CLEAN=0
MODE="dev"
for arg in "$@"; do
  case "$arg" in
    --clean|-c) CLEAN=1 ;;
    --build|-b) MODE="build" ;;
    --help|-h)
      sed -n '2,15p' "$0"
      exit 0
      ;;
    *)
      red "Unknown option: $arg"
      exit 1
      ;;
  esac
done

# Bootstrap node_modules if missing.
if [[ ! -d node_modules ]]; then
  cyan "node_modules missing — running npm install…"
  npm install
fi

# Wipe Next.js cache on request.
if [[ "$CLEAN" == "1" ]]; then
  cyan "Clearing .next cache…"
  rm -rf .next
fi

if [[ "$MODE" == "build" ]]; then
  cyan "Building production bundle…"
  exec npm run build
fi

# Free the dev port if something is squatting on it.
if lsof -ti:"$PORT" >/dev/null 2>&1; then
  cyan "Port $PORT is busy — killing the squatter…"
  lsof -ti:"$PORT" | xargs kill 2>/dev/null || true
  sleep 1
  if lsof -ti:"$PORT" >/dev/null 2>&1; then
    cyan "Still busy — sending SIGKILL…"
    lsof -ti:"$PORT" | xargs kill -9 2>/dev/null || true
    sleep 1
  fi
fi

green "Starting dev server on http://localhost:$PORT"
exec npm run dev
