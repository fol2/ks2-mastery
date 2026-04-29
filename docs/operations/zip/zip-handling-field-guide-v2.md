---
title: "ZIP + GitHub Cross-Validation Field Guide for ChatGPT Sessions"
type: session-handoff-guide
status: ready-to-share
version: 2
created: 2026-04-29
updated: 2026-04-29
context: "KS2 Mastery lean/main ZIP review workflow with GitHub API supplementation"
supersedes: "zip-handling-field-guide.md"
---

# ZIP + GitHub Cross-Validation Field Guide for ChatGPT Sessions

This guide is for reviewing KS2 Mastery ZIP bundles in a ChatGPT execution environment while also using GitHub/API access responsibly. The aim is to move fast without making false claims.

The central rule is simple: **the ZIP proves what is inside the uploaded bundle; GitHub proves what is in a fetched repository ref; neither automatically proves live production.** Treat them as different evidence sources and say which one you used.

## 1. Evidence hierarchy

Use this hierarchy unless the user explicitly says otherwise.

1. **Uploaded ZIP**: primary source for the exact bundle the user provided.
2. **ZIP manifest / README**: explains what the ZIP intentionally omits or replaces.
3. **Local checks from the ZIP**: prove what can run in this environment from that snapshot.
4. **GitHub API exact-file fetches**: supplement missing files, confirm latest `main`, or compare against a specific ref.
5. **GitHub PR / issue metadata**: useful for merge intent and history, but not a substitute for source inspection.
6. **Live production checks**: required before claiming deployed production behaviour.

Do not collapse these layers. A local script pass from a lean ZIP is not a live production smoke. A GitHub `main` fetch is not proof that the uploaded ZIP contains the same file. A completion report is not proof that every claim is true.

Good wording:

> I used the uploaded lean ZIP as the primary code source. I used GitHub API only to cross-check exact files on `main`. The ZIP has no `.git` metadata and uses asset placeholders, so I did not treat omitted assets or missing Git ancestry as product failures.

Bad wording:

> The ZIP proves this is merged on main.

The ZIP and GitHub can agree, but you need to check.

## 2. Fast start checklist

Run this before doing any deep analysis.

```bash
# 1. Locate uploaded files.
ls -lah /mnt/data

# 2. Identify likely ZIPs.
find /mnt/data -maxdepth 1 -type f \( -name '*.zip' -o -name '*.md' \) -printf '%f\t%s bytes\n' | sort

# 3. Check ZIP integrity without extracting everything.
unzip -t /mnt/data/ks2-mastery-lean.zip | tail -20

# 4. List the archive root and first entries.
unzip -l /mnt/data/ks2-mastery-lean.zip | sed -n '1,100p'

# 5. Extract orientation files only.
ZIP=/mnt/data/ks2-mastery-lean.zip
WORK=/mnt/data/ks2-zip-orientation
rm -rf "$WORK"
mkdir -p "$WORK"
unzip -q "$ZIP" \
  README.md \
  LEAN_ZIP_MANIFEST.txt \
  scripts/create-lean-zip.README.md \
  package.json \
  .nvmrc \
  -d "$WORK" 2>/tmp/unzip-orientation.err || true

# 6. Read orientation files before broad searching.
sed -n '1,220p' "$WORK/README.md" 2>/dev/null || true
sed -n '1,220p' "$WORK/LEAN_ZIP_MANIFEST.txt" 2>/dev/null || true
sed -n '1,220p' "$WORK/scripts/create-lean-zip.README.md" 2>/dev/null || true
sed -n '1,260p' "$WORK/package.json" 2>/dev/null || true
cat "$WORK/.nvmrc" 2>/dev/null || true
```

Why this order matters:

- `README.md` tells you the architecture and operating assumptions.
- `LEAN_ZIP_MANIFEST.txt` tells you whether assets are intentionally omitted or replaced.
- `scripts/create-lean-zip.README.md` tells you how to interpret the lean archive.
- `package.json` tells you the intended scripts.
- `.nvmrc` tells you whether local Node can run the tests faithfully.

## 3. Understand lean ZIP semantics

A lean ZIP is usually a review/development package, not a production-complete asset bundle.

In KS2 Mastery lean ZIPs, heavy asset files may be replaced with 0-byte placeholders while paths remain visible. A 0-byte file under `assets/**` is therefore not automatically a broken asset. First read `LEAN_ZIP_MANIFEST.txt` and the lean ZIP README.

Expected manifest pattern:

```text
mode=placeholder
exclude_globs=assets/**
tracked_total=...
copied=...
omitted=...
placeholders=...
```

Correct conclusion:

> The lean ZIP intentionally replaced omitted assets with 0-byte placeholders. Source and many Node checks can still be reviewed, but visual asset completeness cannot be certified from this bundle.

Wrong conclusion:

> The app has broken WebP/PNG assets because many files are 0 bytes.

## 4. Safe extraction pattern

Never extract a large ZIP into an active working directory. Use a clean folder under `/mnt/data` and name it per task.

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
find "$WORK" -maxdepth 2 -type f | sed -n '1,80p'
find "$WORK" -maxdepth 2 -type d | sort | sed -n '1,120p'
```

Current KS2 lean ZIPs are usually rootless: `README.md`, `worker/`, `src/`, `docs/`, `tests/`, and `scripts/` appear directly inside the extraction directory. Do not assume there is a `ks2-mastery/` parent folder.

## 5. Create a local ZIP identity record

Before analysis, create a small identity record. This makes later claims much cleaner.

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

When reporting back, include at least the ZIP path, whether integrity passed, whether the archive is rootless, and whether placeholders are intentional.

## 6. Build a quick file index after extraction

Use `rg --files`, not `git ls-files`, unless `.git` is present.

```bash
cd /mnt/data/ks2-mastery-lean-work

# Top-level directories.
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
    print(f'{name:28} {count}')
PY

# Searchable file index.
rg --files > /tmp/ks2-files.txt
sed -n '1,160p' /tmp/ks2-files.txt

# Git metadata check.
test -d .git && git status --short || echo 'No .git metadata in this ZIP extraction'
```

## 7. Search strategy inside the ZIP

Start with exact paths from the user. Use broad search only after exact reads.

```bash
# Exact report paths supplied by the user.
sed -n '1,260p' docs/plans/james/punctuation/questions-generator/punctuation-qg-p7-completion-report.md
sed -n '1,260p' docs/plans/james/punctuation/questions-generator/punctuation-qg-p7-implementation-plan.md

# Find related files by name.
rg --files | rg 'punctuation-qg|punctuation.*question|review-punctuation|verify-punctuation|golden-marking'

# Search likely implementation/test areas. Exclude assets.
rg -n "PRODUCTION_DEPTH|canonicalPunctuationText|reportingClause|reviewerDecisions|candidate-depth|include-depth-6" \
  docs scripts src worker tests \
  --glob '!assets/**'
```

For JSON and reviewer-pack outputs, prefer `jq` or Python over manual scrolling.

```bash
jq '.summary, .items[0]' /tmp/punctuation-reviewer-pack.json 2>/dev/null || true
```

## 8. Testing from a lean ZIP

A lean ZIP may be enough for static analysis and focused Node tests, but not necessarily full product verification.

Check the runtime first.

```bash
node --version
npm --version
cat .nvmrc 2>/dev/null || true
cat package.json | jq '.scripts' 2>/dev/null || sed -n '/"scripts"/,/}/p' package.json
```

Be direct about mismatches. If `.nvmrc` says Node 22 and the environment has Node 18, a test using Node 22-only features can fail locally without proving the product code is wrong.

Good wording:

> I could not faithfully run the full verifier in this ZIP environment because the bundle expects Node 22 and this container has Node 18. I still inspected the verifier source and ran targeted static/local checks that do not depend on Node 22 features.

Avoid:

> The verifier failed, so the implementation is false.

That is only justified after checking whether the failure is environmental or product-related.

## 9. GitHub API usage principles

Use GitHub/API access as a supplement, not a replacement, unless the user asks for latest `main` specifically.

Use GitHub API when:

- the user asks to compare the ZIP against `main`;
- a path is missing from the lean ZIP;
- you need PR/merge metadata not inside the ZIP;
- you need the latest report on `main`;
- you want to confirm whether a file from the ZIP exactly matches a repository ref;
- asset payloads or Git history are omitted from the lean bundle.

Do not use GitHub API to paper over ZIP evidence. If GitHub has a fix but the uploaded ZIP does not, report that difference.

## 10. Cross-validation workflow: ZIP vs GitHub

Use this when the user gives a lean ZIP and also expects GitHub awareness.

### Step A — decide the authority

Write this down before analysis:

```text
Primary authority: uploaded ZIP / latest GitHub main / specific PR / specific commit
Supplementary authority: GitHub API exact-file fetches / PR metadata / local ZIP checks
Production authority: live deployed smoke only, if available
```

For most user-uploaded bundle reviews, primary authority should be the uploaded ZIP.

### Step B — identify the ZIP snapshot

Check whether the ZIP embeds a commit, branch, timestamp, or manifest fields.

```bash
cd /mnt/data/ks2-mastery-lean-work
rg -n "commit|sha|branch|created|generated|mode=|exclude_globs|tracked_total" \
  README.md LEAN_ZIP_MANIFEST.txt scripts/create-lean-zip.README.md package.json 2>/dev/null || true
```

If no commit is embedded, do not infer one. Say:

> The lean ZIP does not include `.git` metadata or an embedded commit id, so I compared selected critical files against GitHub `main` rather than claiming the whole ZIP is exactly `main`.

### Step C — fetch exact GitHub files

Prefer exact paths. Examples for the GitHub API tool:

```text
repository_full_name: fol2/ks2-mastery
ref: main
path: README.md
path: package.json
path: scripts/create-lean-zip.README.md
path: docs/plans/james/punctuation/questions-generator/punctuation-qg-p7-completion-report.md
path: scripts/review-punctuation-questions.mjs
path: tests/punctuation-*.test.js
```

When the API response includes a file SHA, preserve it in your notes. That SHA is normally the Git blob SHA for the file content, not a ZIP SHA256.

### Step D — compare exact file identity

To compare a local extracted file with GitHub content API `sha`, compute the local Git blob SHA.

```bash
# Compute Git blob SHA for a local file. This should match GitHub content API "sha"
# when the file content is identical.
python - <<'PY'
from pathlib import Path
import hashlib
for name in ['README.md', 'package.json']:
    p = Path(name)
    if not p.exists():
        continue
    data = p.read_bytes()
    digest = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
    print(f'{name}\t{digest}\t{len(data)} bytes')
PY
```

If the SHA differs, do not assume a bug. It may mean:

- the ZIP is older than `main`;
- GitHub `main` moved after the ZIP was created;
- the ZIP came from another branch or PR;
- line endings changed;
- the file was generated or post-processed.

Report it as a source mismatch and validate against the chosen authority.

### Step E — compare critical paths, not every file

Full repository diff is often wasteful. Compare files that anchor the claim.

For a punctuation question-generator review, useful paths include:

```text
README.md
package.json
.nvmrc
LEAN_ZIP_MANIFEST.txt
scripts/create-lean-zip.README.md

docs/plans/james/punctuation/questions-generator/*.md
scripts/review-punctuation-questions.mjs
scripts/verify-punctuation-qg-p*.mjs
src/subjects/punctuation/**
worker/src/subjects/punctuation/**
tests/punctuation-*.test.js
tests/*punctuation*.test.js
```

For capacity/system hardening, use the capacity reports, worker scripts, and test files instead of punctuation files.

### Step F — create a mismatch table

In your notes or final answer, use a small table like this:

| Path | ZIP status | GitHub status | Interpretation |
|---|---:|---:|---|
| `README.md` | present, blob SHA X | `main` SHA X | exact match |
| `package.json` | present, Node 22 expected | `main` SHA Y | differs; use ZIP for local run limits |
| `assets/**` | placeholders | real files may exist | lean omission, not product failure |
| P7 report | present | present | compare exact claims |

This table prevents accidental overclaiming.

## 11. Practical GitHub/API + ZIP comparison scriptlets

### Generate local file hashes for important paths

```bash
cd /mnt/data/ks2-mastery-lean-work
python - <<'PY'
from pathlib import Path
import hashlib
paths = [
    'README.md',
    'package.json',
    '.nvmrc',
    'scripts/create-lean-zip.README.md',
    'docs/plans/james/punctuation/questions-generator/punctuation-qg-p7-completion-report.md',
    'docs/plans/james/punctuation/questions-generator/punctuation-qg-p7-implementation-plan.md',
    'scripts/review-punctuation-questions.mjs',
]
for name in paths:
    p = Path(name)
    if not p.exists():
        print(f'MISSING\t{name}')
        continue
    data = p.read_bytes()
    git_blob = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
    sha256 = hashlib.sha256(data).hexdigest()
    print(f'{name}\tblob={git_blob}\tsha256={sha256}\tbytes={len(data)}')
PY
```

### Generate a local path manifest, excluding placeholders if needed

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

### Find suspicious zero-byte files outside expected placeholder paths

```bash
cd /mnt/data/ks2-mastery-lean-work
find . -type f -size 0 \
  ! -path './assets/*' \
  ! -path './public/assets/*' \
  | sed -n '1,160p'
```

If this outputs non-asset source files, investigate. Zero-byte source files are not automatically expected.

## 12. Claim-validation discipline

When validating a completion report, split claims into categories.

### A. Source-existence claims

Examples:

- “Script X exists.”
- “Test file Y was added.”
- “Reviewer pack supports `--candidate-depth 6`.”

Validation method:

- read the source file from the ZIP;
- optionally fetch the same path from GitHub;
- compare exact behaviour in code, not just report prose.

### B. Local-behaviour claims

Examples:

- “Verifier passes.”
- “Reviewer pack emits 242 items.”
- “Generated items have non-generic explanations.”

Validation method:

- check Node version and dependencies;
- run the narrow script if safe;
- otherwise inspect the script and run targeted code paths;
- record environmental limitations.

### C. Production-behaviour claims

Examples:

- “Production smoke passed.”
- “Depth 6 is safe to activate.”
- “Live site serves release id X.”

Validation method:

- require live smoke artefacts or actual deployed check;
- if not available, downgrade to “implemented locally / prepared for production”.

### D. Human-quality claims

Examples:

- “All questions are approved.”
- “No edge cases remain.”
- “Review complete.”

Validation method:

- inspect reviewer decision fixtures;
- check whether decisions are populated or empty;
- check whether the reviewer pack shows enough data to review each item;
- run adversarial probes against marking;
- do not accept an implementation report alone.

## 13. Better answer pattern after ZIP + GitHub analysis

Use this structure in your final response.

```text
I used the uploaded ZIP as the primary source and GitHub API as a supplement.

ZIP facts:
- path, size, integrity status
- rootless vs parent-folder archive
- manifest/placeholder status
- runtime constraints, such as Node version mismatch

GitHub supplement:
- repository/ref used
- exact files fetched
- whether key files matched or differed

Validated:
- source claims that are true
- tests/scripts that were inspected or run
- generated artefacts that were reproduced

Gaps:
- false claims
- over-strong wording
- production claims that require live evidence
- human-quality claims that still need reviewer decisions

Next contract:
- what engineering should do next
- what QA/product should accept or reject
- what not to activate yet
```

This makes the evidence boundary visible and keeps the user’s trust.

## 14. KS2 punctuation-question-generator review checklist

For punctuation QG work, use this practical checklist.

### Orientation

```bash
sed -n '1,220p' README.md
sed -n '1,220p' LEAN_ZIP_MANIFEST.txt
cat .nvmrc 2>/dev/null || true
cat package.json | jq '.scripts | with_entries(select(.key|test("punctuation|qg|review")))'
```

### Report and plan paths

```bash
sed -n '1,260p' docs/plans/james/punctuation/questions-generator/punctuation-qg-p7-completion-report.md
sed -n '1,260p' docs/plans/james/punctuation/questions-generator/punctuation-qg-p7-implementation-plan.md
rg --files docs/plans/james/punctuation/questions-generator | sort
```

### Source paths to inspect

```bash
rg --files src worker scripts tests docs \
  | rg 'punctuation|review-punctuation|verify-punctuation|questions-generator|golden-marking'
```

### Marking and oracle probes

Look for these classes of issue:

- closed repair/insert items accepting extra words;
- speech items accepting changed reporter/speaker when the stem already supplies one;
- open transfer items accepting token-only fragments;
- apostrophe normalisation eating spaces after plural possessive apostrophes;
- direct speech accepting missing reporting commas;
- choice items missing options/correct-index in reviewer packs;
- reviewer decision schema not aligned with reviewer pack display;
- generated explanations being non-generic but semantically weak;
- fixed-bank items lacking negative vectors.

### Reviewer pack checks

Run or inspect commands such as:

```bash
node scripts/review-punctuation-questions.mjs --json --out /tmp/punctuation-production-review.json
node scripts/review-punctuation-questions.mjs --include-depth-6 --json --out /tmp/punctuation-depth6-review.json
node scripts/review-punctuation-questions.mjs --candidate-depth 6 --json --out /tmp/punctuation-depth6-candidates.json

jq '.summary' /tmp/punctuation-production-review.json
jq '.summary' /tmp/punctuation-depth6-review.json
jq '.summary' /tmp/punctuation-depth6-candidates.json
```

If Node version prevents execution, inspect the script and report the limitation rather than pretending the run happened.

## 15. GitHub mismatch handling

When ZIP and GitHub differ, do not immediately choose the nicer answer. Use this decision rule:

- User asks “validate this uploaded ZIP”: ZIP wins; GitHub is supplemental.
- User asks “what is now on main”: GitHub `main` wins; ZIP may be stale.
- User asks “did the report claim match the implementation”: validate the implementation from the same source as the report if possible.
- User asks “production quality”: neither ZIP nor GitHub is enough without live/reviewer evidence.

Report mismatches plainly:

> The uploaded ZIP contains P7 report version A. GitHub `main` contains version B. I validated the ZIP because that is the bundle you supplied, and I used GitHub only to identify that `main` has drifted.

## 16. Common traps and corrections

### Trap 1: Saying the ZIP is inaccessible

If file-search tools cannot read the ZIP, that does not mean the ZIP is inaccessible. Check `/mnt/data` and use shell tools.

### Trap 2: Running broad tests before reading `.nvmrc`

A Node version mismatch can create false failures. Check `.nvmrc` before running scripts.

### Trap 3: Treating 0-byte assets as product failures

Lean ZIP placeholders are often intentional. Read `LEAN_ZIP_MANIFEST.txt` before judging assets.

### Trap 4: Using `git` in a ZIP extraction

Most uploaded ZIPs lack `.git`. Use `rg`, `find`, direct reads, and computed hashes. Use GitHub API for repository metadata.

### Trap 5: Trusting completion reports as proof

Completion reports are targets for validation, not validation itself. Read source, tests, scripts, generated artefacts, and decision fixtures.

### Trap 6: Confusing “gate exists” with “gate is satisfied”

A CI gate can be correctly implemented while currently failing because reviewer decisions are empty. That is not necessarily a bug; it is an acceptance state.

### Trap 7: Comparing GitHub SHA with SHA256

GitHub content API file SHA is normally a Git blob SHA, not a SHA256. Use the Git blob calculation if you want exact content identity.

### Trap 8: Allowing GitHub to hide a stale ZIP

If GitHub has a later fix, say so, but do not claim the uploaded ZIP contains it.

## 17. Minimal command crib sheet

```bash
# Locate uploads.
ls -lah /mnt/data

# Inspect ZIP without extraction.
unzip -t /mnt/data/name.zip | tail -20
unzip -l /mnt/data/name.zip | sed -n '1,120p'

# Extract orientation files.
rm -rf /mnt/data/zip-orientation && mkdir -p /mnt/data/zip-orientation
unzip -q /mnt/data/name.zip README.md package.json .nvmrc LEAN_ZIP_MANIFEST.txt scripts/create-lean-zip.README.md -d /mnt/data/zip-orientation || true

# Full extract.
rm -rf /mnt/data/zip-work && mkdir -p /mnt/data/zip-work
unzip -q /mnt/data/name.zip -d /mnt/data/zip-work
cd /mnt/data/zip-work

# Inspect root.
find . -maxdepth 2 -type d | sort | sed -n '1,120p'
rg --files | sed -n '1,120p'

# Check placeholders and suspicious zero files.
find . -type f -size 0 | sed -n '1,120p'
find . -type f -size 0 ! -path './assets/*' ! -path './public/assets/*' | sed -n '1,120p'

# Search code/docs.
rg -n "search term" docs scripts worker src tests --glob '!assets/**'

# Read specific files.
sed -n '1,260p' path/to/file.md

# JSON report inspection.
jq '.' path/to/report.json | sed -n '1,200p'

# Node environment check.
node --version
npm --version
cat .nvmrc 2>/dev/null || true

# Local Git blob SHA for GitHub content API comparison.
python - <<'PY'
from pathlib import Path
import hashlib
p = Path('README.md')
data = p.read_bytes()
print(hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest())
PY
```

## 18. Final principle

Lean ZIP review is mostly about disciplined source boundaries. The ZIP gives a compact snapshot. The manifest tells you what is intentionally missing. Local shell tools give fast inspection and targeted execution. GitHub/API gives exact-file and metadata supplementation. Live production evidence is still a separate layer.

The strongest reviews say exactly what was proved, where it was proved, and what remains outside the evidence boundary.
