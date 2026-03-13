#!/usr/bin/env bash
# ─── ggcoder upstream sync ────────────────────────────────────
# Fetches Ken's upstream/main, merges into local fork, and rebuilds.
# Designed to run via launchd or manually. Safe — aborts on conflicts.
#
# Usage:
#   ./scripts/sync-upstream.sh          # normal run
#   ./scripts/sync-upstream.sh --force  # skip the cooldown timer
# ──────────────────────────────────────────────────────────────

set -euo pipefail

REPO_DIR="/Users/imorgado/Projects/gg-framework"
STATE_FILE="$HOME/.gg/sync-state.json"
LOG_FILE="$HOME/.gg/sync.log"
COOLDOWN_SECS=3600  # 1 hour between checks

# ── Logging ───────────────────────────────────────────────────
log() {
  local ts
  ts=$(date '+%Y-%m-%d %H:%M:%S')
  echo "[$ts] $*" >> "$LOG_FILE"
}

notify() {
  # macOS notification (non-blocking, best-effort)
  osascript -e "display notification \"$1\" with title \"GGCoder Sync\"" 2>/dev/null || true
}

# ── Cooldown check ────────────────────────────────────────────
if [[ "${1:-}" != "--force" ]] && [[ -f "$STATE_FILE" ]]; then
  last_check=$(python3 -c "import json,sys; print(json.load(open('$STATE_FILE')).get('lastSyncAt',0))" 2>/dev/null || echo 0)
  now=$(date +%s)
  elapsed=$(( now - last_check ))
  if (( elapsed < COOLDOWN_SECS )); then
    exit 0
  fi
fi

log "Starting upstream sync..."

# ── Ensure repo exists ────────────────────────────────────────
if [[ ! -d "$REPO_DIR/.git" ]]; then
  log "ERROR: Repo not found at $REPO_DIR"
  exit 1
fi

cd "$REPO_DIR"

# ── Check for dirty working tree ──────────────────────────────
if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
  log "SKIP: Working tree has uncommitted changes. Commit or stash first."
  exit 0
fi

# ── Fetch upstream ────────────────────────────────────────────
if ! git fetch upstream --quiet 2>/dev/null; then
  log "ERROR: Failed to fetch origin (network issue?)"
  # Record the attempt so we don't spam
  mkdir -p "$(dirname "$STATE_FILE")"
  python3 -c "
import json, time, os
state = {}
if os.path.exists('$STATE_FILE'):
    try: state = json.load(open('$STATE_FILE'))
    except: pass
state['lastSyncAt'] = int(time.time())
state['lastResult'] = 'fetch_failed'
json.dump(state, open('$STATE_FILE', 'w'))
"
  exit 1
fi

# ── Check if there are new commits ───────────────────────────
LOCAL_HEAD=$(git rev-parse HEAD)
REMOTE_HEAD=$(git rev-parse upstream/main)

if [[ "$LOCAL_HEAD" == "$REMOTE_HEAD" ]] || git merge-base --is-ancestor upstream/main HEAD 2>/dev/null; then
  log "Already up to date (local: ${LOCAL_HEAD:0:8}, origin: ${REMOTE_HEAD:0:8})"
  mkdir -p "$(dirname "$STATE_FILE")"
  python3 -c "
import json, time, os
state = {}
if os.path.exists('$STATE_FILE'):
    try: state = json.load(open('$STATE_FILE'))
    except: pass
state['lastSyncAt'] = int(time.time())
state['lastResult'] = 'up_to_date'
state['localHead'] = '$LOCAL_HEAD'
json.dump(state, open('$STATE_FILE', 'w'))
"
  exit 0
fi

log "New commits found: local=${LOCAL_HEAD:0:8} origin=${REMOTE_HEAD:0:8}"

# ── Attempt merge ─────────────────────────────────────────────
if ! git merge upstream/main --no-edit 2>>"$LOG_FILE"; then
  log "ERROR: Merge conflict! Aborting merge."
  git merge --abort 2>/dev/null || true
  notify "⚠️ Upstream merge has conflicts — manual resolution needed"

  mkdir -p "$(dirname "$STATE_FILE")"
  python3 -c "
import json, time, os
state = {}
if os.path.exists('$STATE_FILE'):
    try: state = json.load(open('$STATE_FILE'))
    except: pass
state['lastSyncAt'] = int(time.time())
state['lastResult'] = 'conflict'
state['conflictOriginHead'] = '$REMOTE_HEAD'
json.dump(state, open('$STATE_FILE', 'w'))
"
  exit 1
fi

log "Merge successful"

# ── Rebuild ───────────────────────────────────────────────────
export PATH="/opt/homebrew/bin:$PATH"

log "Running pnpm install..."
if ! pnpm install --frozen-lockfile 2>>"$LOG_FILE"; then
  # Lockfile may need updating after merge
  log "Frozen lockfile failed, running pnpm install..."
  if ! pnpm install 2>>"$LOG_FILE"; then
    log "ERROR: pnpm install failed"
    notify "⚠️ GGCoder build failed after merge — pnpm install error"
    exit 1
  fi
fi

log "Building ggcoder..."
if ! pnpm --filter @kenkaiiii/ggcoder run build 2>>"$LOG_FILE"; then
  log "ERROR: Build failed"
  notify "⚠️ GGCoder build failed after merge — TypeScript errors"
  exit 1
fi

# ── Verify link is still intact ───────────────────────────────
LINKED_PATH=$(readlink -f "$(which ggcoder)" 2>/dev/null || echo "")
EXPECTED_PATH="$REPO_DIR/packages/ggcoder/dist/cli.js"

if [[ "$LINKED_PATH" != "$EXPECTED_PATH" ]]; then
  log "Re-linking ggcoder (was: $LINKED_PATH)"
  cd "$REPO_DIR/packages/ggcoder"
  npm link 2>>"$LOG_FILE"
  cd "$REPO_DIR"
fi

# ── Extract version from merged package.json ──────────────────
NEW_VERSION=$(python3 -c "import json; print(json.load(open('$REPO_DIR/packages/ggcoder/package.json'))['version'])" 2>/dev/null || echo "unknown")

log "SUCCESS: Updated to $NEW_VERSION (${REMOTE_HEAD:0:8})"
notify "✅ GGCoder synced to v$NEW_VERSION"

# ── Record state ──────────────────────────────────────────────
mkdir -p "$(dirname "$STATE_FILE")"
python3 -c "
import json, time, os
state = {}
if os.path.exists('$STATE_FILE'):
    try: state = json.load(open('$STATE_FILE'))
    except: pass
state['lastSyncAt'] = int(time.time())
state['lastResult'] = 'updated'
state['localHead'] = '$(git rev-parse HEAD)'
state['version'] = '$NEW_VERSION'
json.dump(state, open('$STATE_FILE', 'w'))
"
