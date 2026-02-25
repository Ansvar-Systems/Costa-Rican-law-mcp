# Handover (Costa-Rican-law-mcp)

Timestamp (UTC): 2026-02-25T13:52:45Z

## Current State

- Repo path: `/home/ansvar/Projects/mcps/law-mcps/Costa-Rican-law-mcp`
- Active branch: `main` (tracks `origin/main`)
- `dev` branch exists locally at `a5d1a67`
- Ingestion process is running:
  - PID chain: `238544` (`sh -c ...`) -> `238547` (`node --import tsx scripts/ingest.ts --full-corpus --resume`)
  - Log: `/tmp/cr_ingest_resume_daemon4_20260222T081449Z.log`

## Full-Corpus Progress

- Seed files present: `11885`
- Manifest IDs total: `18761`
- Coverage: `63.35%` (`11885 / 18761`)
- Remaining IDs: `6876`

## Worktree Status

- Worktree is very dirty due newly ingested seed files:
  - `git status` reports many `?? data/seed/*.json` files
- No code edits were made in this handover step.

## Recent Failure Pattern (from live log tail)

- Dominant failures:
  - `SCIJ returned PagError for nrm_texto_completo; no static TextoCompleto URL found in ficha`
  - `No provisions parsed from fetched source text`
  - occasional network/curl failures on `nrm_texto_completo.aspx`
- Fallback route is being used on some IDs (`source=network+network:texto-completo`), but not available for all failures.

## Known Branch/Policy Mismatch

- Assignment policy required committing ingestion work on `dev`, not `main`.
- Current long-running ingestion is executing on `main`.
- Next agent should decide whether to:
  - keep ingestion running on `main` and later port to `dev`, or
  - stop/restart from `dev` using `--resume`.

## Resume / Monitoring Commands

```bash
# check process
pgrep -af "scripts/ingest.ts --full-corpus --resume"

# monitor live log
tail -f /tmp/cr_ingest_resume_daemon4_20260222T081449Z.log

# quick progress snapshot
ls data/seed/*.json 2>/dev/null | wc -l
node - <<'NODE'
const fs=require('fs');
const done=require('fs').readdirSync('data/seed').filter(f=>f.endsWith('.json')).length;
const total=JSON.parse(fs.readFileSync('data/source/scij-full-corpus-ids.json','utf8')).ids.length;
console.log(`${done}/${total} ${(done/total*100).toFixed(2)}%`);
NODE
```

## Notes for Next Agent

- Do not fabricate legal text; failed IDs must remain failed with reason.
- Respect request pacing/rate limit behavior already implemented in fetcher.
- If switching branches, preserve in-progress seed artifacts and avoid destructive git commands.
