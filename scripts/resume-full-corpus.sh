#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PORTAL_URL="https://pgrweb.go.cr/scij/"

manifest_count() {
  node -e "const fs=require('fs');const p='data/source/scij-full-corpus-ids.json';if(!fs.existsSync(p)){console.log(0);process.exit(0)}const m=JSON.parse(fs.readFileSync(p,'utf8'));console.log((m.ids||[]).length);"
}

seed_count() {
  find data/seed -maxdepth 1 -type f -name '*.json' | wc -l | tr -d ' '
}

portal_ready() {
  if curl -I -m 20 -sS "$PORTAL_URL" >/dev/null 2>&1; then
    return 0
  fi
  return 1
}

ATTEMPT=0
while true; do
  ATTEMPT=$((ATTEMPT + 1))
  TS="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  EXPECTED="$(manifest_count)"
  CURRENT="$(seed_count)"

  echo "[$TS] attempt=$ATTEMPT seed_files=$CURRENT expected=$EXPECTED"

  if [ "$EXPECTED" -gt 0 ] && [ "$CURRENT" -ge "$EXPECTED" ]; then
    echo "Full-corpus seed target reached."
    break
  fi

  if portal_ready; then
    echo "Portal reachable. Running resume ingestion pass..."
    MCP_FETCH_DELAY_MS="${MCP_FETCH_DELAY_MS:-1000}" \
    MCP_FETCH_TIMEOUT_SEC="${MCP_FETCH_TIMEOUT_SEC:-20}" \
    MCP_FETCH_MAX_RETRIES="${MCP_FETCH_MAX_RETRIES:-1}" \
      npm run ingest -- --full-corpus --resume || true
  else
    echo "Portal unreachable, waiting for next retry window."
  fi

  sleep "${SLEEP_SECONDS:-60}"
done
