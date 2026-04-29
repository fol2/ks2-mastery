---
title: "ZIP + GitHub Cross-Validation SOP for KS2 Review Sessions"
type: "session-working-standard"
status: "ready-to-use"
created: 2026-04-29
context: "KS2 Mastery lean ZIP, GitHub API supplement, evidence-bound review workflow"
---

# ZIP + GitHub Cross-Validation SOP for KS2 Review Sessions

This SOP upgrades the existing ZIP field guide into a stricter evidence workflow. It is designed for KS2 Mastery review sessions where the user provides a lean ZIP bundle and GitHub API access may also be available.

The main rule is simple: **the uploaded ZIP is the primary evidence for the state the user handed over; GitHub is a supplement unless the user explicitly asks for latest `main`, a PR branch, or a named ref.**

Do not collapse those two sources into one claim. A file can be present in the ZIP but absent or different on GitHub. A file can be present on GitHub but missing from the ZIP. Both are useful facts, but they prove different things.

## 1. Evidence hierarchy

Use this hierarchy unless the user says otherwise.

1. **Uploaded ZIP**: proves what is in the supplied review snapshot.
2. **ZIP manifest / README / lean-ZIP README**: explains intentional omissions, placeholder mode, and review limits.
3. **Local checks from extracted ZIP**: prove code/report shape, static evidence, and ZIP-safe test results.
4. **GitHub exact-file API reads**: supplement missing paths, compare with `main` or a named ref, and provide repo display URLs.
5. **GitHub PR / commit metadata**: useful for merge state, but it does not prove the uploaded ZIP is the same unless the ref/commit is matched.
6. **Live production evidence**: only proves production behaviour if the artefacts/logs/results are actually present and inspected.

Useful wording:

> I used the uploaded lean ZIP as the primary snapshot. GitHub `main` was used only to compare exact paths and identify whether the ZIP is behind, ahead, or divergent.

Avoid:

> The ZIP proves this is on GitHub main.

## 2. Intake sequence

Start every ZIP review with these commands.

```bash
ls -lah /mnt/data

ZIP=/mnt/data/ks2-mastery-lean.zip
unzip -t "$ZIP" | tail -20
unzip -l "$ZIP" | sed -n '1,100p'
```

Then extract only orientation files.

```bash
WORK=/mnt/data/ks2-orient
rm -rf "$WORK"
mkdir -p "$WORK"

unzip -q "$ZIP" \
  README.md \
  LEAN_ZIP_MANIFEST.txt \
  scripts/create-lean-zip.README.md \
  package.json \
  -d "$WORK" 2>/tmp/unzip-orient.err || true

sed -n '1,220p' "$WORK/README.md" 2>/dev/null || true
sed -n '1,220p' "$WORK/LEAN_ZIP_MANIFEST.txt" 2>/dev/null || true
sed -n '1,220p' "$WORK/scripts/create-lean-zip.README.md" 2>/dev/null || true
jq '.scripts' "$WORK/package.json" 2>/dev/null || sed -n '/"scripts"/,/}/p' "$WORK/package.json"
```

Only after this should you do a full extract.

```bash
WORK=/mnt/data/ks2-lean-work
rm -rf "$WORK"
mkdir -p "$WORK"
unzip -q "$ZIP" -d "$WORK"
cd "$WORK"

find . -maxdepth 2 -type d | sort | sed -n '1,160p'
rg --files > /tmp/ks2-files.txt
find . -type f -size 0 | sed -n '1,120p'
```

## 3. Lean ZIP interpretation rules

For KS2 lean ZIPs, 0-byte files under `assets/**` are normally deliberate placeholders, not automatic corruption.

Before making any asset claim, read `LEAN_ZIP_MANIFEST.txt` and `scripts/create-lean-zip.README.md`.

Acceptable claim:

> The lean ZIP preserves asset paths as 0-byte placeholders, so code-level asset path review is possible, but visual asset completeness is not certified from this bundle.

Unacceptable claim:

> The monster art is broken because the WebP files are 0 bytes.

## 4. Build a source ledger before judging claims

For every important report or code path, keep a simple mental or written ledger.

| Path | ZIP status | ZIP evidence | GitHub status | GitHub ref | Verdict |
|---|---:|---|---:|---|---|
| `docs/.../report.md` | present/missing | lines read / hash / test | present/missing/different | `main` / PR ref / commit | ZIP-primary / GitHub-only / divergent |

This prevents false synthesis. If a pA1 report is missing from the ZIP but present on GitHub, say exactly that:

> The uploaded ZIP does not contain this report path. I used GitHub `main` as a supplement for that report, so the report is GitHub evidence, not ZIP evidence.

## 5. Exact-file cross-validation with GitHub

When GitHub API is available, fetch exact paths rather than browsing broadly.

Good candidates:

```text
README.md
scripts/create-lean-zip.README.md
package.json
wrangler.jsonc
specific docs/plans/... report paths supplied by the user
specific worker/src/... files relevant to the claim
specific tests/... files relevant to the claim
```

Do not compare everything. Compare the files that matter to the claim.

### 5.1 Compare by Git blob SHA where possible

GitHub file APIs often return a Git blob SHA. You can compute the same blob SHA for a local extracted ZIP file.

```bash
python - <<'PY'
from pathlib import Path
import hashlib

paths = [
  'README.md',
  'scripts/create-lean-zip.README.md',
  'package.json',
]

for rel in paths:
    p = Path(rel)
    if not p.exists():
        print(f'{rel}\tMISSING_IN_ZIP')
        continue
    data = p.read_bytes()
    blob = b'blob ' + str(len(data)).encode() + b'\0' + data
    print(f'{rel}\tbytes={len(data)}\tgit_blob_sha={hashlib.sha1(blob).hexdigest()}')
PY
```

Then compare that local `git_blob_sha` with the GitHub API `sha` for the same path and ref.

Verdicts:

- **SHA match**: ZIP file and GitHub file are byte-identical for that ref.
- **SHA mismatch**: both exist, but content differs. Treat as divergence.
- **ZIP missing / GitHub present**: GitHub-only evidence.
- **ZIP present / GitHub missing**: ZIP-only evidence, possibly local branch, unmerged work, or stale path.

### 5.2 If SHA comparison is unavailable

Use size and content snippets as a weaker comparison.

```bash
wc -c README.md scripts/create-lean-zip.README.md package.json
sed -n '1,80p' README.md
```

Be honest: this is weaker than a blob SHA match.

## 6. Missing-path workflow

When the user gives a path and it is missing from the ZIP:

1. Confirm it is really missing with `test -f` and `rg --files`.
2. Search nearby directories in the ZIP.
3. Use GitHub API to fetch the exact path from `main` or the requested ref.
4. Report the boundary clearly.

Commands:

```bash
cd /mnt/data/ks2-lean-work
PATH_TO_CHECK='docs/plans/james/hero-mode/A/hero-pA1-ring2-evidence.md'

test -f "$PATH_TO_CHECK" && echo PRESENT || echo MISSING
rg --files | rg 'hero-pA1|hero-mode/A|ring2|ring3|ring4' || true
```

Good final wording:

> Those pA1 evidence files were not in the uploaded ZIP, so I could not treat them as ZIP evidence. I fetched the exact paths from GitHub `main` and labelled them as GitHub-supplement evidence.

## 7. Divergence workflow

If the ZIP and GitHub disagree, do not try to smooth it over. Classify the divergence.

Common cases:

- **ZIP behind GitHub main**: reports or code exist on GitHub but not in ZIP.
- **ZIP ahead of GitHub main**: local review bundle includes files not yet on main.
- **Different branch/ref**: user supplied a branch bundle, while API fetch used `main`.
- **Generated artefact drift**: report or manifest generated locally but not committed.
- **Lean omission**: expected if the missing/different content is intentionally excluded by manifest.

Use a wording like:

> I found a source split: the ZIP has X, while GitHub `main` has Y. For this review I treated the ZIP as the supplied snapshot and used GitHub only to flag the divergence, not to override the ZIP.

## 8. Test and script discipline from lean ZIPs

Before running tests, inspect available scripts.

```bash
node --version
npm --version
jq '.scripts' package.json
```

Prefer focused tests tied to the claim.

Examples:

```bash
npm test -- tests/hero-mode-read-model.test.js
npm test -- tests/hero-mode-commands.test.js
npm run check -- --help 2>/dev/null || true
```

Be cautious with full build/test claims from a lean ZIP because:

- `node_modules` may be absent;
- real assets may be intentionally omitted;
- Wrangler/Cloudflare scripts may need environment configuration;
- some verification scripts expect `.git` metadata;
- browser/golden/visual tests may depend on asset payloads not present in the lean ZIP.

If a script has a documented ZIP-safe bypass, use it and record that you used it. Otherwise, call out ZIP-context limits.

## 9. Report validation pattern

When validating a completion report, split the claim into four buckets.

1. **Implementation claims**: code paths, flags, commands, UI, tests present.
2. **Local validation claims**: tests or scripts run locally from the ZIP.
3. **Rollout evidence claims**: staging, multi-day, ring, cohort, production logs.
4. **Operational readiness claims**: dashboards, alerts, runbooks, rollback proof, telemetry sinks.

A completion report can be true for bucket 1 and still unproven for bucket 3.

Use this phrase often:

> Implementation delivered does not equal rollout evidence accepted.

## 10. Recommended final answer structure

For serious reviews, answer in this order:

1. **Source boundary**: ZIP primary, GitHub supplement, named ref used.
2. **What the ZIP contains**: relevant files present/missing, manifest interpretation.
3. **What GitHub added**: exact paths fetched, ref, whether same/different/missing in ZIP.
4. **Validation verdict**: credible claims, false claims, gaps, overclaims.
5. **Unverified limits**: live production, assets, `.git`, external services, missing reports.
6. **Next phase implications**: what must be required before rollout expands.

## 11. Minimal reusable command set

```bash
# Locate and test ZIP.
ls -lah /mnt/data
ZIP=/mnt/data/ks2-mastery-lean.zip
unzip -t "$ZIP" | tail -20
unzip -l "$ZIP" | sed -n '1,120p'

# Extract orientation files.
ORIENT=/mnt/data/ks2-orient
rm -rf "$ORIENT" && mkdir -p "$ORIENT"
unzip -q "$ZIP" README.md LEAN_ZIP_MANIFEST.txt scripts/create-lean-zip.README.md package.json -d "$ORIENT" || true

# Full extract.
WORK=/mnt/data/ks2-lean-work
rm -rf "$WORK" && mkdir -p "$WORK"
unzip -q "$ZIP" -d "$WORK"
cd "$WORK"

# Index.
rg --files > /tmp/ks2-files.txt
find . -maxdepth 2 -type d | sort | sed -n '1,160p'
find . -type f -size 0 | sed -n '1,160p'

# Check exact paths.
for f in \
  README.md \
  scripts/create-lean-zip.README.md \
  package.json \
  docs/plans/james/hero-mode/A/hero-pA1-plan-completion-report.md
  do
    printf '\n--- %s ---\n' "$f"
    test -f "$f" && { wc -l "$f"; sed -n '1,80p' "$f"; } || echo MISSING
  done

# Compute local Git blob SHAs for GitHub comparison.
python - <<'PY'
from pathlib import Path
import hashlib
for rel in Path('/tmp/ks2-files.txt').read_text().splitlines():
    if rel in {'README.md', 'scripts/create-lean-zip.README.md', 'package.json'}:
        data = Path(rel).read_bytes()
        blob = b'blob ' + str(len(data)).encode() + b'\0' + data
        print(f'{rel}\t{hashlib.sha1(blob).hexdigest()}\t{len(data)} bytes')
PY
```

## 12. Strongest discipline rule

Every conclusion should be traceable to one of these labels:

- **ZIP-proven**
- **ZIP-local-test-proven**
- **GitHub-main-proven**
- **GitHub-ref-proven**
- **Cross-validated ZIP = GitHub**
- **Divergent ZIP/GitHub**
- **Not proven from supplied artefacts**

That labelling prevents the two big failure modes: under-using the ZIP because the browser tool cannot read it, and over-claiming GitHub/latest-main evidence as if it came from the user’s uploaded bundle.
