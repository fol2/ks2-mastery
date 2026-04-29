---
title: "ZIP + GitHub Evidence-Bound Review Field Guide for ChatGPT Sessions"
type: "session-handoff-guide"
status: "ready-to-use"
version: 3
created: 2026-04-29
updated: 2026-04-29
context: "KS2 Mastery lean/main ZIP review workflow with GitHub/API supplementation"
supersedes:
  - zip-handling-field-guide.md
  - zip-handling-field-guide-v2.md
  - zip-github-cross-validation-sop.md
  - zip-github-cross-validation-playbook.md
---

# ZIP + GitHub Evidence-Bound Review Field Guide for ChatGPT Sessions

This is the consolidated, ultimate guide for reviewing KS2 Mastery ZIP bundles in a ChatGPT execution environment while using GitHub/API access responsibly.

The central rule is:

> **The uploaded ZIP proves what is inside the uploaded bundle. GitHub proves what is in a fetched repository ref. Local runs prove behaviour in this environment for that extracted snapshot. Production evidence proves production only when live/deployed artefacts are actually inspected.**

Do not collapse those layers into a vague claim like “the repo says”. Always say which evidence layer proves the point.

## 1. Core stance

When the user uploads a ZIP, treat it as a filesystem artefact under `/mnt/data`. Do not assume it is searchable through normal file-search/browser tools. ZIPs may look inaccessible to a browser-style tool while still being fully available to shell tools.

The first move is not to apologise. The first move is to inspect `/mnt/data`.

```bash
ls -lah /mnt/data
```

Use shell inspection first:

```text
unzip
find
rg
sed
jq
node
python
sha256sum
stat
```

Use GitHub/API access as a supplement unless the user explicitly asks for latest `main`, a PR branch, or a named ref.

## 2. Evidence labels and hierarchy

Use these labels in notes and final answers.

| Label | Meaning | Strength | Limitation |
|---|---|---|---|
| `[ZIP]` | File content extracted from the uploaded bundle under `/mnt/data` | Best evidence for the user-supplied snapshot | May be stale, lean, asset-light, and without `.git` history |
| `[ZIP manifest]` | `LEAN_ZIP_MANIFEST.txt`, README, or lean-ZIP README from the bundle | Explains intentional omissions and archive semantics | Only explains the bundle; does not prove production |
| `[ZIP local-run]` | Test/script/audit run from the extracted ZIP | Proves behaviour in this environment for the ZIP snapshot | May lack assets, env vars, node modules, Cloudflare/D1/live services, or correct Node version |
| `[GitHub main]` | Exact file fetched from repository `main` | Best evidence for current `main`, if fetched successfully | May differ from the uploaded ZIP |
| `[GitHub ref]` | Exact file fetched from a named branch, tag, SHA, or PR ref | Best evidence for that ref | Does not prove the uploaded ZIP contains the same commit unless matched |
| `[GitHub PR]` | PR metadata, merge commit, changed files, checks | Useful for merge/review state | Does not prove the ZIP is the same snapshot |
| `[Production]` | Deployed smoke, live audit, Cloudflare/D1 evidence, release evidence | Best evidence for live readiness | Only valid if the artefact includes origin, timestamp, release ID, and pass/fail result |

Default hierarchy:

1. Uploaded ZIP.
2. ZIP manifest / README / lean-ZIP README.
3. Local checks from the extracted ZIP.
4. GitHub exact-file API reads.
5. GitHub PR / issue / commit metadata.
6. Live production evidence.

Useful wording:

> I used the uploaded lean ZIP as the primary snapshot. GitHub `main` was used only to compare exact paths and identify whether the ZIP is behind, ahead, or divergent.

Avoid:

> The ZIP proves this is on GitHub main.

The ZIP proves the uploaded bundle. GitHub proves the fetched ref. They can agree, but only after comparison.

## 3. Decide the authority before analysis

Before deep analysis, write down the evidence contract.

```text
Primary authority: uploaded ZIP / latest GitHub main / specific PR / specific commit
Supplementary authority: GitHub API exact-file fetches / PR metadata / local ZIP checks
Production authority: live deployed smoke only, if available
```

Default for uploaded review bundles:

```text
Primary authority: uploaded ZIP
Supplementary authority: GitHub exact-file API reads and PR metadata where useful
Production authority: not proven unless live evidence is supplied or checked
```

Decision rules:

- User asks “validate this uploaded ZIP”: ZIP wins; GitHub is supplemental.
- User asks “what is now on main”: GitHub `main` wins; ZIP may be stale.
- User asks “did the report claim match the implementation”: validate the implementation from the same source layer as the report whenever possible.
- User asks “production quality”: ZIP and GitHub are not enough without live/reviewer/production evidence.

## 4. Mandatory fast start

Run this before deep analysis.

```bash
# Locate uploaded files.
ls -lah /mnt/data

# Identify likely ZIPs and Markdown files.
find /mnt/data -maxdepth 1 -type f \( -name '*.zip' -o -name '*.md' \) -printf '%f\t%s bytes\n' | sort

# Optional: hash uploaded ZIPs.
sha256sum /mnt/data/*.zip 2>/dev/null || true
```

For a known KS2 lean ZIP:

```bash
ZIP=/mnt/data/ks2-mastery-lean.zip

# Check integrity without extracting everything.
unzip -t "$ZIP" | tail -20

# List archive root and first entries.
unzip -l "$ZIP" | sed -n '1,120p'
```

Then extract only orientation files.

```bash
ZIP=/mnt/data/ks2-mastery-lean.zip
ORIENT=/mnt/data/ks2-zip-orientation
rm -rf "$ORIENT"
mkdir -p "$ORIENT"

unzip -q "$ZIP" \
  README.md \
  LEAN_ZIP_MANIFEST.txt \
  scripts/create-lean-zip.README.md \
  package.json \
  .nvmrc \
  -d "$ORIENT" 2>/tmp/unzip-orientation.err || true

sed -n '1,220p' "$ORIENT/README.md" 2>/dev/null || true
sed -n '1,220p' "$ORIENT/LEAN_ZIP_MANIFEST.txt" 2>/dev/null || true
sed -n '1,220p' "$ORIENT/scripts/create-lean-zip.README.md" 2>/dev/null || true
sed -n '1,260p' "$ORIENT/package.json" 2>/dev/null || true
cat "$ORIENT/.nvmrc" 2>/dev/null || true
```

Why this order matters:

- `README.md` gives architecture and operating assumptions.
- `LEAN_ZIP_MANIFEST.txt` explains intentional omissions, placeholders, and tracked counts.
- `scripts/create-lean-zip.README.md` explains lean archive semantics.
- `package.json` tells you canonical scripts.
- `.nvmrc` tells you whether local Node can run the checks faithfully.

Only after reading these should you run broad searches or tests.

## 5. Safe extraction patterns

Never extract a large ZIP into an active working directory or a previous task folder. Use a clean folder under `/mnt/data`, named for the task.

```bash
ZIP=/mnt/data/ks2-mastery-lean.zip
WORK=/mnt/data/ks2-mastery-lean-work
rm -rf "$WORK"
mkdir -p "$WORK"
unzip -q "$ZIP" -d "$WORK"
cd "$WORK"
```

Confirm whether the archive is rootless or has a top-level repository directory.

```bash
find "$WORK" -maxdepth 2 -type f | sort | sed -n '1,100p'
find "$WORK" -maxdepth 2 -type d | sort | sed -n '1,160p'
test -d "$WORK/.git" && git -C "$WORK" status --short || echo 'No .git metadata in this ZIP extraction'
```

For KS2 lean ZIPs, expect a rootless archive: `README.md`, `worker/`, `src/`, `scripts/`, `tests/`, `reports/`, and `docs/` appear directly under the extraction directory. Do not assume a `ks2-mastery/` parent folder.

## 6. Targeted extraction for very large ZIPs

If the ZIP is large, do not extract everything immediately. List paths first, then extract exact files or path groups.

```bash
ZIP=/mnt/data/ks2-mastery-main.zip
unzip -l "$ZIP" | rg 'README.md|sys-hardening|capacity|package.json' | sed -n '1,160p'

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

ZIP wildcard extraction can be awkward. If wildcard extraction misses files, use `unzip -l`, copy exact paths, then extract exact names.

## 7. Create a ZIP identity record

Before judging claims, create a small identity record. It makes later reporting cleaner.

```bash
ZIP=/mnt/data/ks2-mastery-lean.zip
WORK=/mnt/data/ks2-mastery-lean-work

printf 'ZIP path: %s\n' "$ZIP"
stat -c 'ZIP size: %s bytes' "$ZIP"
sha256sum "$ZIP"

python - <<'PY'
from pathlib import Path
from zipfile import ZipFile
from collections import Counter

zip_path = Path('/mnt/data/ks2-mastery-lean.zip')
with ZipFile(zip_path) as z:
    infos = z.infolist()
    files = [i for i in infos if not i.is_dir()]
    zero = [i for i in files if i.file_size == 0]
    roots = Counter((i.filename.split('/', 1)[0] if '/' in i.filename else '.') for i in files)
    print(f'entries={len(infos)} files={len(files)} zero_size_files={len(zero)}')
    print('top-level file counts:')
    for name, count in sorted(roots.items()):
        print(f'  {name:32} {count}')
PY
```

When reporting back, include at least:

- ZIP path.
- ZIP size/hash if useful.
- Integrity status.
- Rootless vs parent-folder archive.
- Whether `.git` metadata exists.
- Whether placeholders are intentional.

## 8. Build a local file index

After extraction, create a quick map before searching content.

```bash
cd /mnt/data/ks2-mastery-lean-work

# Top-level directories.
find . -maxdepth 2 -type d | sort | sed -n '1,160p'

# File count by top-level folder.
python - <<'PY'
from pathlib import Path
from collections import Counter

counts = Counter()
for p in Path('.').rglob('*'):
    if p.is_file():
        top = p.parts[0] if len(p.parts) > 1 else '.'
        counts[top] += 1
for name, count in sorted(counts.items()):
    print(f'{name:28} {count}')
PY

# Searchable file index.
rg --files > /tmp/ks2-files.txt
sed -n '1,160p' /tmp/ks2-files.txt

# Git metadata check.
test -d .git && git status --short || echo 'No .git metadata in this ZIP extraction'
```

Prefer `rg --files`, `find`, `sed`, `jq`, `node`, and Python. Do not depend on `git ls-files` unless `.git` is present.

## 9. Lean ZIP semantics and placeholders

A lean ZIP is usually a review/development package, not a production-complete asset bundle.

For KS2 lean ZIPs, heavy assets may be intentionally omitted and replaced with 0-byte placeholders while preserving repository paths. That means a 0-byte file under `assets/**` is not automatically corruption.

Expected manifest pattern:

```text
mode=placeholder
exclude_globs=assets/**
tracked_total=...
copied=...
omitted=...
placeholders=...
```

Check placeholders:

```bash
cd /mnt/data/ks2-mastery-lean-work
find . -type f -size 0 | sed -n '1,160p'
```

Find suspicious zero-byte files outside expected placeholder paths:

```bash
find . -type f -size 0 \
  ! -path './assets/*' \
  ! -path './public/assets/*' \
  | sed -n '1,160p'
```

Decision rule:

- 0-byte under `assets/**` plus manifest `mode=placeholder` means intentional omission, not product corruption.
- 0-byte under `src/`, `worker/`, `scripts/`, `tests/`, `docs/`, or `reports/` should be inspected and flagged unless the manifest explicitly explains it.
- Do not certify visual asset completeness from a lean ZIP unless real asset payloads are included.

Correct conclusion:

> The lean ZIP intentionally replaced omitted assets with 0-byte placeholders. Source and many Node checks can still be reviewed, but visual asset completeness cannot be certified from this bundle.

Wrong conclusion:

> The app has broken WebP/PNG assets because many files are 0 bytes.

## 10. Search strategy inside the ZIP

Start with exact paths supplied by the user. Use broad search only after exact reads.

```bash
cd /mnt/data/ks2-mastery-lean-work

# Exact file read.
sed -n '1,260p' docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p1-completion-report.md

# Find related files by name.
rg --files | rg 'sys-hardening|capacity|bootstrap|worker-log|ledger'

# Search code and docs, excluding heavy/omitted assets.
rg -n "bootstrap|workerLogJoin|capacity.request|rowsRead|rowsWritten|phaseTimings" \
  docs scripts worker tests reports \
  --glob '!assets/**'
```

For JSON reports, prefer `jq` or Python rather than manual scrolling.

```bash
jq '.status, .summary, .diagnostics' reports/capacity/latest-1000-learner-budget.json 2>/dev/null || true
```

For reviewer-pack outputs:

```bash
jq '.summary, .items[0]' /tmp/punctuation-reviewer-pack.json 2>/dev/null || true
```

## 11. Testing and runtime discipline from lean ZIPs

A lean ZIP may be enough for static analysis and focused Node tests, but not necessarily for full product verification.

Before running tests:

```bash
cd /mnt/data/ks2-mastery-lean-work
node --version
npm --version
cat .nvmrc 2>/dev/null || true
jq '.scripts' package.json 2>/dev/null || sed -n '/"scripts"/,/}/p' package.json
```

Be direct about runtime mismatches. If `.nvmrc` says Node 22 and the environment has Node 18, a test using Node 22-only features can fail locally without proving the product code is wrong.

Good wording:

> I could not faithfully run the full verifier in this ZIP environment because the bundle expects Node 22 and this container has Node 18. I still inspected the verifier source and ran targeted static/local checks that do not depend on Node 22 features.

Avoid:

> The verifier failed, so the implementation is false.

That is only justified after checking whether the failure is environmental or product-related.

Prefer focused tests tied to the claim:

```bash
npm test -- tests/hero-mode-read-model.test.js
npm test -- tests/hero-mode-commands.test.js
npm run check -- --help 2>/dev/null || true
```

Be cautious with full `npm test` or `npm run check` from a lean ZIP because:

- `node_modules` may be absent.
- Real assets may be omitted.
- Wrangler/Cloudflare scripts may require environment configuration.
- Browser/golden/visual tests may depend on omitted asset payloads.
- Some scripts may require `.git` metadata.
- Some validators may have ZIP-safe bypasses; use them only when documented.

Example capacity evidence bypass when running from a ZIP without `.git`:

```bash
CAPACITY_VERIFY_SKIP_ANCESTRY=1 npm run capacity:verify-evidence
```

Record that the bypass was used.

## 12. GitHub/API supplementation principles

Use GitHub/API access as a supplement, not a replacement, unless the user asks for latest `main` specifically.

Use GitHub/API when:

- the user asks to compare the ZIP against `main`;
- a path is missing from the lean ZIP;
- the ZIP intentionally omits something;
- PR/merge metadata is needed and not inside the ZIP;
- the latest report on `main` matters;
- a critical ZIP file should be compared with a repository ref;
- asset payloads or Git history are omitted from the lean bundle.

Do not use GitHub/API to paper over ZIP evidence. If GitHub has a fix but the uploaded ZIP does not, report that difference.

Good GitHub supplement targets:

```text
README.md
scripts/create-lean-zip.README.md
package.json
.nvmrc
wrangler.jsonc
specific report path supplied by the user
specific script/test paths involved in a claim
specific worker/src/... files relevant to the claim
PR metadata and merge commit when a report claims a PR/merge
```

For every GitHub fetch, record:

```text
repo: fol2/ks2-mastery
ref: main / branch / SHA / PR merge ref
path: exact path
GitHub blob SHA or returned SHA
fetchedAt: current session time
purpose: compare with ZIP / fill missing PR metadata / check latest main
```

Do not say:

> The ZIP proves this file is on main.

Say:

> The uploaded ZIP contains this file. I separately fetched the same path from GitHub `main` and compared it.

## 13. Source ledger before judging claims

For every important report or code path, keep a simple ledger.

| Path | ZIP status | ZIP evidence | GitHub status | GitHub ref | Verdict |
|---|---:|---|---:|---|---|
| `docs/.../report.md` | present/missing | lines read / hash / test | present/missing/different | `main` / PR ref / commit | ZIP-primary / GitHub-only / divergent |

Example final wording:

> The uploaded ZIP does not contain this report path. I used GitHub `main` as a supplement for that report, so the report is GitHub evidence, not ZIP evidence.

This prevents false synthesis.

## 14. Exact-file cross-validation with GitHub

When the same path exists in ZIP and GitHub, compare content, not just filenames.

### 14.1 Local ZIP fingerprints

```bash
cd /mnt/data/ks2-mastery-lean-work
python - <<'PY'
from pathlib import Path
import hashlib, json

paths = [
    'README.md',
    'package.json',
    '.nvmrc',
    'scripts/create-lean-zip.README.md',
]

for path in paths:
    p = Path(path)
    if not p.exists():
        print(json.dumps({'path': path, 'exists': False}))
        continue
    data = p.read_bytes()
    print(json.dumps({
        'path': path,
        'exists': True,
        'bytes': len(data),
        'sha256': hashlib.sha256(data).hexdigest(),
    }))
PY
```

### 14.2 Compare by Git blob SHA when GitHub content API returns `sha`

GitHub content API file `sha` is normally a Git blob SHA, not a SHA256. Compute the local equivalent like this:

```bash
cd /mnt/data/ks2-mastery-lean-work
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

Verdicts:

- **SHA match**: ZIP file and GitHub file are byte-identical for that ref.
- **SHA mismatch**: both exist, but content differs. Treat as divergence.
- **ZIP missing / GitHub present**: GitHub-only evidence.
- **ZIP present / GitHub missing**: ZIP-only evidence, possibly local branch, unmerged work, generated artefact, or stale path.

### 14.3 If SHA comparison is unavailable

Use size and content snippets as weaker comparison.

```bash
wc -c README.md scripts/create-lean-zip.README.md package.json
sed -n '1,80p' README.md
```

Be honest: size/snippet comparison is weaker than a blob SHA match.

### 14.4 Generate a full local path manifest if useful

```bash
cd /mnt/data/ks2-mastery-lean-work
python - <<'PY' > /tmp/ks2-local-manifest.tsv
from pathlib import Path
import hashlib

for p in sorted(Path('.').rglob('*')):
    if not p.is_file():
        continue
    rel = p.as_posix()[2:] if p.as_posix().startswith('./') else p.as_posix()
    data = p.read_bytes()
    sha = hashlib.sha256(data).hexdigest()
    print(f'{sha}\t{len(data)}\t{rel}')
PY
sed -n '1,80p' /tmp/ks2-local-manifest.tsv
```

## 15. Missing-path workflow

When the user gives a path and it is missing from the ZIP:

1. Confirm it is really missing with `test -f` and `rg --files`.
2. Search nearby directories in the ZIP.
3. Fetch the exact path from GitHub `main` or the requested ref if GitHub access is available.
4. Report the source boundary clearly.

Example:

```bash
cd /mnt/data/ks2-mastery-lean-work
PATH_TO_CHECK='docs/plans/james/hero-mode/A/hero-pA1-ring2-evidence.md'

test -f "$PATH_TO_CHECK" && echo PRESENT || echo MISSING
rg --files | rg 'hero-pA1|hero-mode/A|ring2|ring3|ring4' || true
```

Good final wording:

> Those pA1 evidence files were not in the uploaded ZIP, so I could not treat them as ZIP evidence. I fetched the exact paths from GitHub `main` and labelled them as GitHub-supplement evidence.

## 16. Divergence workflow

If ZIP and GitHub disagree, do not try to smooth it over. Classify the divergence.

Common cases:

- **ZIP behind GitHub main**: reports or code exist on GitHub but not in ZIP.
- **ZIP ahead of GitHub main**: local review bundle includes files not yet on main.
- **Different branch/ref**: user supplied a branch bundle, while API fetch used `main`.
- **Generated artefact drift**: report or manifest generated locally but not committed.
- **Lean omission**: expected if missing/different content is intentionally excluded by manifest.

Decision ladder:

1. Is the GitHub ref known: `main`, branch, SHA, PR head, or PR merge?
2. Does the ZIP include a manifest, commit marker, report SHA, or generated-at timestamp?
3. Did the user ask to validate the ZIP snapshot, latest GitHub `main`, or a merged PR?
4. Is the mismatch in source code, generated report, asset placeholder, or live evidence?
5. Does the report claim the two sources should be the same?

Useful wording:

> I found a source split: the ZIP has X, while GitHub `main` has Y. For this review I treated the ZIP as the supplied snapshot and used GitHub only to flag the divergence, not to override the ZIP.

Use “false claim risk” when evidence is inconsistent but intent is unclear. Use “false claim” only when a report plainly asserts something contradicted by the same source layer.

## 17. Mismatch table pattern

Use a small table in notes or final answer.

| Path | ZIP status | GitHub status | Interpretation |
|---|---:|---:|---|
| `README.md` | present, blob SHA X | `main` SHA X | exact match |
| `package.json` | present, Node 22 expected | `main` SHA Y | differs; use ZIP for local run limits |
| `assets/**` | placeholders | real files may exist | lean omission, not product failure |
| P7 report | present | present | compare exact claims |

This prevents accidental overclaiming.

## 18. Report and claim validation discipline

A completion report is a claim. Treat scripts, tests, generated reports, source files, review registers, and production evidence as validation.

Use this phrase often:

> Implementation delivered does not equal rollout evidence accepted.

Split claims into buckets.

### 18.1 Source-existence claims

Examples:

- “Script X exists.”
- “Test file Y was added.”
- “Reviewer pack supports `--candidate-depth 6`.”

Validation method:

- read the source file from the ZIP;
- optionally fetch the same path from GitHub;
- compare exact behaviour in code, not report prose.

### 18.2 Local-behaviour claims

Examples:

- “Verifier passes.”
- “Reviewer pack emits 242 items.”
- “Generated items have non-generic explanations.”

Validation method:

- check Node version and dependencies;
- run the narrow script if safe;
- otherwise inspect the script and run targeted code paths;
- record environmental limitations.

### 18.3 Rollout and production claims

Examples:

- “Production smoke passed.”
- “Depth 6 is safe to activate.”
- “Live site serves release id X.”

Validation method:

- require live smoke artefacts or actual deployed checks;
- require origin, timestamp, release ID, and pass/fail result;
- downgrade to “implemented locally” or “prepared for production” if live evidence is absent.

### 18.4 Operational readiness claims

Examples:

- “Rollback is proven.”
- “Dashboard is ready.”
- “Alerts cover the risk.”
- “Capacity is certified.”

Validation method:

- inspect runbooks, dashboards, alert definitions, verification scripts, and evidence files;
- check whether evidence is simulated/local/staging/production;
- do not infer readiness from implementation alone.

### 18.5 Human-quality claims

Examples:

- “All questions are approved.”
- “No edge cases remain.”
- “Review complete.”

Validation method:

- inspect reviewer decision fixtures/registers;
- check whether decisions are populated or empty;
- check whether reviewer packs show enough data to review each item;
- run adversarial probes against marking;
- do not accept an implementation report alone.

## 19. Prefer generated checks over prose

Generated checks and actual script outputs are stronger than completion-report prose.

Example Grammar QG command set:

```bash
cd /mnt/data/ks2-mastery-lean-work
node scripts/audit-grammar-question-generator.mjs --json > /tmp/grammar-qg-audit.json
node scripts/audit-grammar-question-generator.mjs --deep --json > /tmp/grammar-qg-deep-audit.json
node scripts/audit-grammar-content-quality.mjs --seeds=1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30 --json > /tmp/grammar-qg-quality.json
python -m json.tool /tmp/grammar-qg-audit.json | sed -n '1,160p'
python -m json.tool /tmp/grammar-qg-quality.json | sed -n '1,160p'
```

If a script prints human text before JSON despite `--json`, record that as a validator/tooling gap. Do not claim `--json` is machine-clean if the command emits banners or other non-JSON output.

## 20. Release evidence and production evidence

Local checks can validate scripts and reports. They do not certify live production unless the evidence file actually contains live measurements from the right environment.

For production evidence, require:

```text
origin/environment
release ID or version
timestamp
command/check performed
result
failure details if any
link or artefact path
```

Never claim production readiness from:

- a local script pass alone;
- a completion report alone;
- a GitHub PR merge alone;
- a screenshot without environment identity;
- a production smoke file with missing release ID/timestamp/origin.

Useful wording:

> Local verification passed for the uploaded ZIP snapshot. I did not certify production because no live production smoke with origin, timestamp, release ID, and pass result was present.

## 21. KS2 common orientation paths

Start here for most KS2 ZIP reviews:

```text
README.md
LEAN_ZIP_MANIFEST.txt
scripts/create-lean-zip.README.md
package.json
.nvmrc
wrangler.jsonc
src/platform/core/subject-registry.js
worker/src/subjects/runtime.js
docs/subject-expansion.md
```

Use exact path reads before broad searching.

## 22. KS2 system hardening and capacity checklist

For system hardening and Cloudflare optimisation work, inspect:

```text
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

Search terms that often matter:

```bash
rg -n "bootstrap|workerLogJoin|capacity.request|rowsRead|rowsWritten|phaseTimings|budget|tail latency|D1" \
  docs scripts worker tests reports \
  --glob '!assets/**'
```

Important distinction:

```text
implementation delivered != capacity certified
```

A verifier pass can prove evidence shape and local consistency. It does not prove Cloudflare production CPU, D1 queueing, or live learner capacity unless the inspected evidence contains those live measurements.

## 23. KS2 subject/product route checklist

For subject/product route work, inspect:

```text
src/platform/core/subject-registry.js
worker/src/subjects/runtime.js
src/subjects/
worker/src/subjects/
tests/helpers/subject-expansion-harness.js
docs/subject-expansion.md
```

Rules to preserve:

- Public subject engines should not secretly ship production logic in the browser if the architecture requires Worker-owned subject commands.
- Session creation, marking, scheduling, progress mutation, and reward projection should be Worker-owned where the subject contract requires it.
- Game/reward layers should react to domain events, not UI clicks or game-layer state.

## 24. KS2 punctuation question-generator checklist

Orientation:

```bash
sed -n '1,220p' README.md
sed -n '1,220p' LEAN_ZIP_MANIFEST.txt
cat .nvmrc 2>/dev/null || true
cat package.json | jq '.scripts | with_entries(select(.key|test("punctuation|qg|review")))'
```

Report and plan paths:

```bash
sed -n '1,260p' docs/plans/james/punctuation/questions-generator/punctuation-qg-p7-completion-report.md
sed -n '1,260p' docs/plans/james/punctuation/questions-generator/punctuation-qg-p7-implementation-plan.md
rg --files docs/plans/james/punctuation/questions-generator | sort
```

Source paths:

```bash
rg --files src worker scripts tests docs \
  | rg 'punctuation|review-punctuation|verify-punctuation|questions-generator|golden-marking'
```

Reviewer pack commands:

```bash
node scripts/review-punctuation-questions.mjs --json --out /tmp/punctuation-production-review.json
node scripts/review-punctuation-questions.mjs --include-depth-6 --json --out /tmp/punctuation-depth6-review.json
node scripts/review-punctuation-questions.mjs --candidate-depth 6 --json --out /tmp/punctuation-depth6-candidates.json

jq '.summary' /tmp/punctuation-production-review.json
jq '.summary' /tmp/punctuation-depth6-review.json
jq '.summary' /tmp/punctuation-depth6-candidates.json
```

If Node version prevents execution, inspect the script and report the limitation rather than pretending the run happened.

Marking and oracle issues to probe:

- closed repair/insert items accepting extra words;
- speech items accepting changed reporter/speaker when the stem already supplies one;
- open transfer items accepting token-only fragments;
- apostrophe normalisation eating spaces after plural possessive apostrophes;
- direct speech accepting missing reporting commas;
- choice items missing options/correct-index in reviewer packs;
- reviewer decision schema not aligned with reviewer pack display;
- generated explanations being non-generic but semantically weak;
- fixed-bank items lacking negative vectors.

## 25. KS2 grammar question-generator checklist

For Grammar QG work, validate claims across these files before trusting a completion report:

```text
worker/src/subjects/grammar/content.js
package.json
scripts/audit-grammar-question-generator.mjs
scripts/audit-grammar-content-quality.mjs
scripts/validate-grammar-qg-completion-report.mjs
scripts/validate-grammar-qg-certification-evidence.mjs
tests/grammar-qg-*.test.js
reports/grammar/grammar-qg-*.json
reports/grammar/grammar-production-smoke-*.json
docs/plans/james/grammar/questions-generator/*.md
```

Minimum consistency matrix:

| Claim | Must be checked against |
|---|---|
| final release ID | `GRAMMAR_CONTENT_RELEASE_ID`, report frontmatter/body, manifest, inventory summary, inventory items, smoke evidence |
| denominator | live audit output, report denominator table, inventory template list |
| seed window | report wording, inventory summary, oracle summary, actual test loops |
| adult review | review register provenance, not only generated status map |
| prompt cue support | content serialisation, read model, React render path, read-aloud path |
| table-choice support | content inputSpec, normalisation, marker, React renderer, review surface |
| post-deploy certified | production smoke evidence file with origin, release ID, timestamp, and pass result |
| no reward/mastery change | diff/search against reward, Stars, mastery, Hero, monster, and event projection files |

Example command set:

```bash
cd /mnt/data/ks2-mastery-lean-work
node scripts/audit-grammar-question-generator.mjs --json > /tmp/grammar-qg-audit.json
node scripts/audit-grammar-question-generator.mjs --deep --json > /tmp/grammar-qg-deep-audit.json
node scripts/audit-grammar-content-quality.mjs --seeds=1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30 --json > /tmp/grammar-qg-quality.json
python -m json.tool /tmp/grammar-qg-audit.json | sed -n '1,160p'
python -m json.tool /tmp/grammar-qg-quality.json | sed -n '1,160p'
```

## 26. Recommended final answer structure

For serious reviews, answer in this order:

1. **Source boundary**: ZIP primary, GitHub supplement, named ref used.
2. **ZIP contents**: relevant files present/missing, manifest interpretation, rootless/archive shape.
3. **Local verification**: scripts/tests/audits run from the ZIP and their results.
4. **GitHub supplement**: exact paths/ref fetched, whether same/different/missing in ZIP.
5. **Validation verdict**: credible claims, false claims, false-claim risks, gaps, overclaims.
6. **Unverified limits**: live production, omitted assets, missing `.git`, external services, missing reports, human review.
7. **Next implications**: what engineering/QA/product should accept, reject, or require before rollout expands.

Reusable opening sentence:

> I used the uploaded lean ZIP as the primary snapshot, read its README/manifest/package scripts first, then used GitHub API only for exact-file or PR/ref supplementation. I am separating ZIP evidence, local-run evidence, GitHub evidence, and production evidence because those prove different things.

## 27. Strong conclusion labels

Every conclusion should be traceable to one of these labels:

```text
ZIP-proven
ZIP-local-test-proven
GitHub-main-proven
GitHub-ref-proven
Cross-validated ZIP = GitHub
Divergent ZIP/GitHub
Production-proven
Not proven from supplied artefacts
```

This prevents the two big failure modes:

1. under-using the ZIP because a browser/file-search tool cannot read it;
2. over-claiming GitHub/latest-main evidence as if it came from the uploaded bundle.

## 28. Useful wording bank

Source boundary:

> I used the uploaded ZIP as primary evidence for the supplied snapshot. GitHub was used only as an exact-file supplement.

Lean assets:

> The lean ZIP preserves asset paths as 0-byte placeholders, so code-level asset path review is possible, but visual asset completeness is not certified from this bundle.

Divergence:

> The uploaded ZIP and GitHub `main` differ for this path. I am treating this as snapshot drift, not a false claim, unless the report explicitly claims the ZIP is the merged main state.

Missing path:

> This path is missing from the uploaded ZIP. I found it only in GitHub `main`, so it is GitHub-supplement evidence, not ZIP evidence.

Runtime mismatch:

> I could not faithfully run this verifier in the ZIP environment because the local runtime differs from `.nvmrc`. I inspected the script and ran only the checks that are valid in this environment.

Production limit:

> Local checks passed for this snapshot, but production readiness remains unverified because no live smoke evidence with origin, release ID, timestamp, and pass result was present.

Implementation vs rollout:

> Implementation delivered does not equal rollout evidence accepted.

## 29. Common traps and corrections

### Trap 1: Saying the ZIP is inaccessible

If file-search tools cannot read the ZIP, that does not mean the ZIP is inaccessible. Check `/mnt/data` and use shell tools.

### Trap 2: Using file-search output as proof of ZIP content

File-search may surface uploaded Markdown but not ZIP contents. ZIP proof comes from direct filesystem/ZIP inspection.

### Trap 3: Extracting into an active or old work folder

Use a clean work folder per ZIP/task:

```text
/mnt/data/ks2-lean-work
/mnt/data/ks2-main-work
/mnt/data/zip-targeted-report-work
```

### Trap 4: Treating 0-byte assets as product failures

Lean ZIP placeholders are often intentional. Read `LEAN_ZIP_MANIFEST.txt` and the lean-ZIP README before judging assets.

### Trap 5: Using `git` commands inside a ZIP extraction

Most uploaded ZIPs lack `.git`. Use `rg`, `find`, direct reads, and computed hashes. Use GitHub API for repository metadata.

```bash
test -d .git && git status --short || echo 'No .git metadata in this ZIP'
```

### Trap 6: Running broad tests before reading `.nvmrc`

A Node version mismatch can create false failures. Check `.nvmrc` before running scripts.

### Trap 7: Trusting completion reports as proof

Completion reports are targets for validation, not validation itself. Read source, tests, scripts, generated artefacts, and decision fixtures.

### Trap 8: Confusing “gate exists” with “gate is satisfied”

A CI gate can be correctly implemented while currently failing because reviewer decisions are empty. That may be an acceptance state, not a code bug.

### Trap 9: Comparing GitHub SHA with SHA256

GitHub content API file SHA is normally a Git blob SHA. Use the Git blob calculation for exact content identity.

### Trap 10: Allowing GitHub to hide a stale ZIP

If GitHub has a later fix, say so, but do not claim the uploaded ZIP contains it.

### Trap 11: Claiming production readiness from local scripts

A local verifier pass proves local behaviour for the ZIP snapshot. It does not prove live Cloudflare/D1/production behaviour.

### Trap 12: Letting tests pass with zero generated cases

If a test/audit passes because it generated or inspected zero cases, call that out as a tooling gap.

### Trap 13: Claiming `--json` works when output is not clean JSON

If the command emits non-JSON banners before or after JSON, record it as a machine-readability gap.

## 30. Minimal command crib sheet

```bash
# Locate uploads.
ls -lah /mnt/data
find /mnt/data -maxdepth 1 -type f \( -name '*.zip' -o -name '*.md' \) -printf '%f\t%s bytes\n' | sort
sha256sum /mnt/data/*.zip 2>/dev/null || true

# Inspect ZIP without extraction.
ZIP=/mnt/data/name.zip
unzip -t "$ZIP" | tail -20
unzip -l "$ZIP" | sed -n '1,120p'

# Extract orientation files.
ORIENT=/mnt/data/zip-orientation
rm -rf "$ORIENT" && mkdir -p "$ORIENT"
unzip -q "$ZIP" README.md package.json .nvmrc LEAN_ZIP_MANIFEST.txt scripts/create-lean-zip.README.md -d "$ORIENT" 2>/tmp/unzip-orientation.err || true
sed -n '1,220p' "$ORIENT/README.md" 2>/dev/null || true
sed -n '1,220p' "$ORIENT/LEAN_ZIP_MANIFEST.txt" 2>/dev/null || true
sed -n '1,220p' "$ORIENT/scripts/create-lean-zip.README.md" 2>/dev/null || true
sed -n '1,260p' "$ORIENT/package.json" 2>/dev/null || true
cat "$ORIENT/.nvmrc" 2>/dev/null || true

# Full extract.
WORK=/mnt/data/zip-work
rm -rf "$WORK" && mkdir -p "$WORK"
unzip -q "$ZIP" -d "$WORK"
cd "$WORK"

# Inspect root and index.
find . -maxdepth 2 -type d | sort | sed -n '1,120p'
rg --files > /tmp/ks2-files.txt
sed -n '1,120p' /tmp/ks2-files.txt

# Check placeholders and suspicious zero files.
find . -type f -size 0 | sed -n '1,160p'
find . -type f -size 0 ! -path './assets/*' ! -path './public/assets/*' | sed -n '1,160p'

# Search code/docs.
rg -n "search term" docs scripts worker src tests reports --glob '!assets/**'

# Read specific files.
sed -n '1,260p' path/to/file.md

# JSON report inspection.
jq '.' path/to/report.json | sed -n '1,200p'

# Node environment check.
node --version
npm --version
cat .nvmrc 2>/dev/null || true
jq '.scripts' package.json 2>/dev/null || sed -n '/"scripts"/,/}/p' package.json

# Git-safe check.
test -d .git && git status --short || echo 'No .git metadata in this ZIP'

# Local Git blob SHA for GitHub content API comparison.
python - <<'PY'
from pathlib import Path
import hashlib
p = Path('README.md')
data = p.read_bytes()
print(hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest())
PY
```

## 31. Final principle

Lean ZIP review is mostly about disciplined source boundaries.

The ZIP gives a compact review snapshot. The manifest tells you what is intentionally missing. Local shell tools give fast inspection and targeted execution. GitHub/API gives exact-file and metadata supplementation. Live production evidence is still a separate layer.

The strongest reviews say exactly what was proved, where it was proved, and what remains outside the evidence boundary.
