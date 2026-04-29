---
title: "ZIP Handling Field Guide for ChatGPT Sessions"
type: session-handoff-guide
status: ready-to-share
created: 2026-04-29
context: "KS2 Mastery lean/main ZIP review workflow"
---

# ZIP Handling Field Guide for ChatGPT Sessions

This guide captures practical lessons from handling KS2 Mastery ZIP bundles in the ChatGPT execution environment. It is written for future sessions so they can inspect uploaded ZIPs quickly, avoid false assumptions, and use GitHub/API access only where it genuinely helps.

## Core rule

When the user uploads a ZIP, treat the ZIP as a filesystem artefact under `/mnt/data`. Do not assume it is searchable through the normal file-search/browser tools. For ZIP bundles, the fastest reliable path is usually shell inspection with `unzip`, `find`, `rg`, `sed`, `jq`, `node`, or `python`.

In this environment, uploaded ZIPs may be described as “not accessible with myfiles_browser”, but they are still normally available directly at paths such as:

```bash
/mnt/data/ks2-mastery-lean.zip
/mnt/data/ks2-mastery-main.zip
```

So the first move is not to apologise. The first move is to list `/mnt/data`.

```bash
ls -lah /mnt/data
```

## Fast start checklist

Use this sequence before doing any deep analysis.

```bash
# 1. Locate the ZIPs and check sizes.
ls -lah /mnt/data

# 2. Check that the ZIP is readable without extracting everything.
unzip -t /mnt/data/ks2-mastery-lean.zip | tail -20

# 3. List the archive root and first entries.
unzip -l /mnt/data/ks2-mastery-lean.zip | sed -n '1,80p'

# 4. Extract only the orientation files first.
WORK=/mnt/data/zip-inspect
rm -rf "$WORK"
mkdir -p "$WORK"
unzip -q /mnt/data/ks2-mastery-lean.zip \
  README.md \
  LEAN_ZIP_MANIFEST.txt \
  scripts/create-lean-zip.README.md \
  package.json \
  -d "$WORK" 2>/tmp/unzip-selected.err || true

# 5. Read those files before searching randomly.
sed -n '1,180p' "$WORK/README.md" 2>/dev/null || true
sed -n '1,180p' "$WORK/LEAN_ZIP_MANIFEST.txt" 2>/dev/null || true
sed -n '1,180p' "$WORK/scripts/create-lean-zip.README.md" 2>/dev/null || true
sed -n '1,220p' "$WORK/package.json" 2>/dev/null || true
```

Why this order matters: `README.md` tells you the repo architecture and operating assumptions; `LEAN_ZIP_MANIFEST.txt` tells you which files are intentionally omitted or replaced; `package.json` tells you the safe project scripts; `scripts/create-lean-zip.README.md` tells you how to interpret the lean archive.

## Understand lean ZIP semantics

For this project, the lean ZIP is a review/development package, not a production-complete asset bundle.

The lean ZIP script keeps repository structure visible, excludes heavy asset payloads, and usually replaces excluded files with 0-byte placeholders. That means a 0-byte file under `assets/**` is not automatically corruption. It is probably intentional.

From the current KS2 lean bundle, the manifest pattern was:

```text
mode=placeholder
exclude_globs=assets/**
tracked_total=2293
copied=1510
omitted=783
placeholders=783
```

Practical implication: do not open a 0-byte WebP/PNG and conclude the app has broken assets. Read the manifest first. If a test or visual build depends on real assets, the lean ZIP may not be enough.

## Safe extraction pattern

Never extract a large ZIP straight into an active working directory. Create a clean folder under `/mnt/data`.

```bash
ZIP=/mnt/data/ks2-mastery-lean.zip
WORK=/mnt/data/ks2-mastery-lean-work
rm -rf "$WORK"
mkdir -p "$WORK"
unzip -q "$ZIP" -d "$WORK"
```

Then confirm whether the archive has a top-level repo directory or files directly at root.

```bash
find "$WORK" -maxdepth 2 -type f | sed -n '1,80p'
find "$WORK" -maxdepth 2 -type d | sed -n '1,80p'
```

The KS2 lean ZIP is rootless: files such as `README.md`, `worker/`, `src/`, `docs/`, `tests/`, and `scripts/` appear directly in the extraction folder. Do not assume there will be a `ks2-mastery/` parent directory.

## Build a quick file index

After extraction, create a cheap mental map before searching content.

```bash
cd /mnt/data/ks2-mastery-lean-work

# Top-level shape.
find . -maxdepth 2 -type d | sort | sed -n '1,160p'

# File count by top-level folder.
python - <<'PY'
from pathlib import Path
from collections import Counter
root = Path('.')
counts = Counter()
for p in root.rglob('*'):
    if p.is_file():
        top = p.parts[0] if len(p.parts) > 1 else '.'
        counts[top] += 1
for name, count in sorted(counts.items()):
    print(f'{name:24} {count}')
PY

# Searchable file index.
rg --files > /tmp/ks2-files.txt
sed -n '1,120p' /tmp/ks2-files.txt
```

Use `rg --files` rather than `git ls-files` unless `.git` exists. Lean ZIPs often do not include Git metadata.

## Search strategy

Start with exact path reads when the user gives paths. Use broad search only after that.

```bash
# Exact file read.
sed -n '1,240p' docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p1-completion-report.md

# Find related files by name.
rg --files | rg 'sys-hardening|capacity|bootstrap|worker-log|ledger'

# Search code and docs, excluding omitted/heavy asset paths.
rg -n "bootstrap|workerLogJoin|capacity.request|rowsRead|rowsWritten|phaseTimings" \
  docs scripts worker tests reports \
  --glob '!assets/**'
```

For JSON reports, prefer `jq` or Python rather than manual scrolling.

```bash
jq '.status, .summary, .diagnostics' reports/capacity/latest-1000-learner-budget.json 2>/dev/null || true
```

## Targeted extraction for very large ZIPs

If the ZIP is large, do not extract everything immediately. First list paths and extract only the files needed.

```bash
ZIP=/mnt/data/ks2-mastery-main.zip
unzip -l "$ZIP" | rg 'README.md|sys-hardening|capacity|package.json' | sed -n '1,120p'

WORK=/mnt/data/main-zip-targeted
rm -rf "$WORK"
mkdir -p "$WORK"
unzip -q "$ZIP" \
  README.md \
  package.json \
  'docs/plans/james/sys-hardening/*' \
  'docs/operations/capacity*' \
  'scripts/*capacity*' \
  'scripts/join-capacity-worker-logs.mjs' \
  -d "$WORK" 2>/tmp/unzip-targeted.err || true
```

Note: shell globbing and ZIP path matching can be awkward. If a wildcard extract misses files, use `unzip -l` first, copy exact paths, then extract exact names.

## Handling 0-byte placeholders

Find placeholders quickly.

```bash
find . -type f -size 0 | sed -n '1,120p'
```

Interpret them using `LEAN_ZIP_MANIFEST.txt`. In KS2 lean ZIPs, most 0-byte files under `assets/**` are deliberate placeholder files. Treat them as “intentionally omitted payload visible by path”, not as empty source files.

Bad conclusion:

> The monster assets are broken because many WebP files are 0 bytes.

Better conclusion:

> The lean ZIP intentionally replaced omitted assets with 0-byte placeholders. Code review can continue, but visual asset completeness cannot be certified from this bundle.

## Testing from a lean ZIP

A lean ZIP may be good enough for static analysis and some tests, but not always for full build or visual validation.

Before running anything heavy:

```bash
node --version
npm --version
cat package.json | jq '.scripts' 2>/dev/null || sed -n '/"scripts"/,/}/p' package.json
```

Prefer focused tests or repo-provided verification scripts. For this KS2 project, capacity evidence verification can need a Git-history bypass when running from a ZIP without `.git`:

```bash
CAPACITY_VERIFY_SKIP_ANCESTRY=1 npm run capacity:verify-evidence
```

Do not treat a Git ancestry warning as a product failure when the archive simply does not contain `.git` metadata. Record it as a ZIP-context limitation.

Be cautious with full `npm test` or `npm run check` from a lean ZIP:

- `node_modules` may not exist.
- Real assets may be omitted.
- Cloudflare/Wrangler scripts may expect environment configuration.
- Browser/golden tests may depend on assets that the lean archive intentionally replaced.
- Some scripts may rely on Git history unless the project provides a ZIP-safe bypass.

## When to use GitHub API as a supplement

Use the uploaded ZIP as the primary evidence for the user’s supplied state. Use GitHub/API access as a supplement when:

- the user explicitly refers to a path that is missing from the ZIP;
- the ZIP is lean and intentionally omits something;
- you need to compare local bundle state with `main`;
- you need PR/merge metadata not present in the ZIP;
- you need to fetch a small exact file faster than extracting a huge archive.

Keep the boundary honest. GitHub `main` can be ahead of, behind, or different from the uploaded ZIP. When mixing sources, say so.

Good wording:

> I used the lean ZIP as the primary code source and GitHub API only to supplement the official lean-ZIP README / latest report path.

Bad wording:

> The uploaded ZIP proves this file is on main.

The ZIP proves what is inside the ZIP. GitHub proves what is in the fetched ref. They are related but not identical evidence sources.

## Useful GitHub/API supplement pattern

When an API tool is available, fetch exact files rather than browsing broadly. Useful targets for KS2 ZIP review are:

```text
README.md
scripts/create-lean-zip.README.md
docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p1-completion-report.md
docs/operations/capacity.md
package.json
```

Use API output for confirmation, not as a substitute for local inspection unless the user asked for latest `main` specifically.

## KS2-specific orientation paths

For system hardening and Cloudflare optimisation work, these are usually the first paths to inspect:

```text
README.md
LEAN_ZIP_MANIFEST.txt
scripts/create-lean-zip.README.md
package.json

docs/plans/james/sys-hardening/
docs/plans/james/sys-hardening/A/
docs/operations/capacity.md
docs/operations/capacity-cpu-d1-evidence.md
docs/operations/capacity-tail-latency.md
docs/operations/capacity-1000-learner-free-tier-budget.md

reports/capacity/
scripts/join-capacity-worker-logs.mjs
scripts/build-capacity-statement-map.mjs
scripts/build-capacity-budget-ledger.mjs
scripts/verify-capacity-evidence.mjs

worker/
worker/src/
tests/worker-capacity-round1.test.js
tests/worker-bootstrap-query-budget.test.js
```

For subject/product route work, start with:

```text
src/platform/core/subject-registry.js
worker/src/subjects/runtime.js
src/subjects/
worker/src/subjects/
tests/helpers/subject-expansion-harness.js
docs/subject-expansion.md
```

## Common traps and how to avoid them

### Trap 1: Saying the ZIP is inaccessible

If file-search tools cannot read the ZIP, that does not mean the ZIP is inaccessible. Check `/mnt/data` and use shell tools.

### Trap 2: Trusting missing assets as evidence of broken product state

Lean ZIPs often omit assets intentionally. Check `LEAN_ZIP_MANIFEST.txt` and placeholder mode before making any claim.

### Trap 3: Using `git` commands inside a ZIP extraction

A ZIP extraction usually lacks `.git`. Use `rg`, `find`, and direct file reads. Only use `git` if `.git` exists.

```bash
test -d .git && git status --short || echo "No .git in this ZIP extraction"
```

### Trap 4: Overwriting extracted work folders

Use separate work folders per ZIP or task:

```bash
/mnt/data/ks2-lean-work
/mnt/data/ks2-main-work
/mnt/data/zip-targeted-report-work
```

This prevents accidental cross-contamination between a lean bundle and a main/full bundle.

### Trap 5: Making certification claims from implementation reports

A completion report may say implementation is merged, but evidence acceptance or capacity certification may still be open. Read tables carefully. In the P1 hardening case, the important distinction was:

```text
implementation delivered != capacity certified
```

### Trap 6: Assuming one successful local script means production-ready

A local verifier pass proves the evidence file shape and local checks passed. It does not prove Cloudflare production CPU, D1 queueing, or live user capacity unless the evidence file actually contains those live measurements.

### Trap 7: Running heavy commands before reading the README

The README often tells you the correct scripts, environment assumptions, and warnings. For KS2, the README explicitly points reviewers to `scripts/create-lean-zip.README.md` for lean ZIP interpretation.

## Recommended answer pattern after ZIP analysis

When reporting back to the user, separate four layers:

1. What the ZIP contains.
2. What was verified locally from the ZIP.
3. What was supplemented from GitHub/API or other sources.
4. What remains unverified because the ZIP is lean, lacks assets, lacks `.git`, or lacks live production artefacts.

A useful phrasing:

> I used the uploaded lean ZIP as the primary source. I confirmed the manifest marks omitted assets as placeholders, so I did not treat 0-byte asset files as broken code. I used GitHub API only to cross-check the official lean-ZIP README. Local checks can validate scripts and reports, but they cannot certify production capacity without live Cloudflare evidence.

## Minimal command crib sheet

```bash
# Locate uploads.
ls -lah /mnt/data

# Inspect ZIP without extraction.
unzip -t /mnt/data/name.zip | tail -20
unzip -l /mnt/data/name.zip | sed -n '1,120p'

# Extract selected files.
mkdir -p /mnt/data/zip-selected
unzip -q /mnt/data/name.zip README.md package.json LEAN_ZIP_MANIFEST.txt -d /mnt/data/zip-selected || true

# Full extract to clean folder.
rm -rf /mnt/data/zip-work && mkdir -p /mnt/data/zip-work
unzip -q /mnt/data/name.zip -d /mnt/data/zip-work

# Inspect root.
cd /mnt/data/zip-work
find . -maxdepth 2 -type d | sort | sed -n '1,120p'
rg --files | sed -n '1,120p'

# Find placeholders.
find . -type f -size 0 | sed -n '1,120p'

# Search code/docs.
rg -n "search term" docs scripts worker src tests --glob '!assets/**'

# Read specific file sections.
sed -n '1,220p' path/to/file.md

# JSON report inspection.
jq '.' path/to/report.json | sed -n '1,200p'

# Git-safe check.
test -d .git && git status --short || echo "No .git metadata in this ZIP"
```

## Final principle

Lean ZIP handling is mostly about disciplined evidence boundaries. The ZIP gives you a compact code/review snapshot. The manifest tells you what is intentionally missing. Local shell tools give you fast inspection. GitHub/API can supplement exact missing or latest files. None of those automatically proves live production behaviour unless the relevant production evidence artefacts are actually present and verified.
