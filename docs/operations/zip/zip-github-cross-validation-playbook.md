# ZIP + GitHub Cross-Validation Playbook

Status: ready for future KS2 Mastery review sessions  
Purpose: improve handling of uploaded lean ZIP bundles and avoid false claims when cross-checking against GitHub  
Default stance: uploaded ZIP is the primary evidence for the user-supplied snapshot; GitHub is a supplement unless the user explicitly asks for latest `main` or PR state.

## 1. Evidence boundary

Always label evidence by source:

| Label | Meaning | Strength | Limitation |
|---|---|---|---|
| `[ZIP]` | File content extracted from the uploaded bundle under `/mnt/data` | Best evidence for the user-supplied snapshot | May be stale, lean, missing assets, and without `.git` history |
| `[ZIP local-run]` | Script/test/audit run from extracted ZIP | Proves behaviour in this environment for the ZIP snapshot | May lack assets, env vars, node modules, Cloudflare/D1/live services |
| `[GitHub main]` | Exact file fetched from repository `main` | Best evidence for current repository main, if fetched successfully | May differ from uploaded ZIP |
| `[GitHub PR]` | PR metadata, merge commit, changed files, checks | Best evidence for merge/review state | Does not prove uploaded ZIP contains the same commit |
| `[Production]` | Deployed smoke, live audit, Cloudflare/D1 evidence | Best evidence for live readiness | Only valid if evidence file includes origin, timestamp, release ID and result |

Never merge these into one vague “repo says”. Say which layer proves the claim.

## 2. Mandatory fast start

Run this before deep analysis:

```bash
ls -lah /mnt/data
sha256sum /mnt/data/*.zip 2>/dev/null || true
unzip -t /mnt/data/ks2-mastery-lean.zip | tail -20
unzip -l /mnt/data/ks2-mastery-lean.zip | sed -n '1,80p'
```

Then extract only orientation files:

```bash
ZIP=/mnt/data/ks2-mastery-lean.zip
WORK=/mnt/data/ks2-zip-orientation
rm -rf "$WORK"
mkdir -p "$WORK"
unzip -q "$ZIP" \
  README.md \
  LEAN_ZIP_MANIFEST.txt \
  scripts/create-lean-zip.README.md \
  package.json \
  -d "$WORK" 2>/tmp/unzip-orientation.err || true

sed -n '1,180p' "$WORK/README.md" 2>/dev/null || true
sed -n '1,220p' "$WORK/LEAN_ZIP_MANIFEST.txt" 2>/dev/null || true
sed -n '1,220p' "$WORK/scripts/create-lean-zip.README.md" 2>/dev/null || true
node -e "const p=require('$WORK/package.json'); console.log(JSON.stringify(p.scripts,null,2))" 2>/dev/null || sed -n '1,220p' "$WORK/package.json"
```

Read these before running broad searches. The README gives architecture and operating assumptions. The lean-ZIP README explains intentional exclusions and placeholder files. The package scripts tell you which checks are canonical.

## 3. Full extraction only into a clean work folder

Never extract into the current working folder or into a previous task folder.

```bash
ZIP=/mnt/data/ks2-mastery-lean.zip
WORK=/mnt/data/ks2-mastery-lean-work
rm -rf "$WORK"
mkdir -p "$WORK"
unzip -q "$ZIP" -d "$WORK"
cd "$WORK"
```

Confirm whether the ZIP is rootless:

```bash
find . -maxdepth 2 -type f | sort | sed -n '1,80p'
find . -maxdepth 2 -type d | sort | sed -n '1,80p'
test -d .git && git status --short || echo "No .git metadata in this ZIP extraction"
```

For KS2 lean ZIPs, expect a rootless archive with `README.md`, `worker/`, `src/`, `scripts/`, `tests/`, `reports/` and `docs/` directly under the extraction directory.

## 4. Build a local file index

```bash
cd /mnt/data/ks2-mastery-lean-work
rg --files > /tmp/ks2-lean-files.txt
sed -n '1,120p' /tmp/ks2-lean-files.txt

python - <<'PY'
from pathlib import Path
from collections import Counter
counts = Counter()
for p in Path('.').rglob('*'):
    if p.is_file():
        counts[p.parts[0] if len(p.parts) > 1 else '.'] += 1
for name, count in sorted(counts.items()):
    print(f'{name:24} {count}')
PY
```

Prefer `rg --files`, `find`, `sed`, `jq`, `node`, and Python. Do not depend on `git ls-files` unless `.git` is present.

## 5. Interpret lean ZIP placeholders correctly

Lean ZIPs are not complete asset packages. In this project, the lean ZIP generator keeps repository paths visible, excludes heavy asset payloads, and replaces excluded files with 0-byte placeholders by default.

Check placeholders:

```bash
find . -type f -size 0 | sed -n '1,160p'
```

Decision rule:

- 0-byte under `assets/**` plus manifest `mode=placeholder` = intentional omission, not product corruption.
- 0-byte source under `src/`, `worker/`, `scripts/`, `tests/`, `docs/` = inspect and flag unless manifest says otherwise.

Never certify visual asset completeness from a lean ZIP unless the real asset payloads are included.

## 6. GitHub supplement workflow

Use GitHub API for exact files and metadata, not random browsing.

Good GitHub supplement targets:

```text
README.md
scripts/create-lean-zip.README.md
package.json
specific report path supplied by user
specific script/test paths involved in a claim
PR metadata and merge commit when the report claims a PR/merge
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

Do not say “the ZIP proves this is on main”. The ZIP proves the uploaded snapshot. GitHub proves the fetched ref.

## 7. File-level cross-validation

When the same path exists in ZIP and GitHub, compare content, not just filenames.

Local ZIP fingerprints:

```bash
cd /mnt/data/ks2-mastery-lean-work
python - <<'PY'
from pathlib import Path
import hashlib, json
paths = [
    'README.md',
    'package.json',
    'worker/src/subjects/grammar/content.js',
    'docs/plans/james/grammar/questions-generator/grammar-qg-p9-final-completion-report-2026-04-29.md',
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

If you have GitHub API content in a local temp file, compare:

```bash
sha256sum path/from/zip /tmp/github-fetched-file
cmp -s path/from/zip /tmp/github-fetched-file && echo SAME || echo DIFFERENT
```

If comparing to GitHub blob SHA, remember Git blob SHA is not plain file SHA-1. Compute it like this:

```bash
python - <<'PY'
from pathlib import Path
import hashlib
path = 'README.md'
data = Path(path).read_bytes()
blob = b'blob ' + str(len(data)).encode() + b'\0' + data
print(hashlib.sha1(blob).hexdigest())
PY
```

## 8. Report/release evidence cross-validation

For Grammar QG work, validate across all these files before believing a completion report:

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
| post-deploy certified | production smoke evidence file with origin, release ID, timestamp and pass result |
| no reward/mastery change | diff/search against reward, Stars, mastery, Hero, monster and event projection files |

## 9. Prefer generated checks over prose

A completion report is a claim. Treat scripts/reports/tests as evidence.

Example command set for Grammar QG:

```bash
cd /mnt/data/ks2-mastery-lean-work
node scripts/audit-grammar-question-generator.mjs --json > /tmp/grammar-qg-audit.json
node scripts/audit-grammar-question-generator.mjs --deep --json > /tmp/grammar-qg-deep-audit.json
node scripts/audit-grammar-content-quality.mjs --seeds=1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30 --json > /tmp/grammar-qg-quality.json
python -m json.tool /tmp/grammar-qg-audit.json | sed -n '1,160p'
python -m json.tool /tmp/grammar-qg-quality.json | sed -n '1,160p'
```

If a script prints human text before JSON despite `--json`, record that as a validator/tooling gap.

## 10. Cross-source mismatch handling

When ZIP and GitHub disagree, do not immediately call either false.

Use this decision ladder:

1. Is the GitHub ref known? `main`, branch, SHA, PR head, or PR merge?
2. Does the ZIP include a manifest, commit marker, report SHA, or generated-at timestamp?
3. Does the user ask to validate the ZIP snapshot, latest GitHub `main`, or a merged PR?
4. Is the mismatch in source code, generated report, asset placeholder, or live evidence?
5. Does the report claim the two should be the same?

Useful wording:

> The uploaded lean ZIP and GitHub `main` differ for this path. I am treating this as snapshot drift, not a false claim, unless the report explicitly claims the ZIP is the merged main state.

Use “false claim risk” when the evidence is inconsistent but intent is unclear. Use “false claim” only when the report plainly asserts something contradicted by the same source layer.

## 11. Source labelling in final answers

Use this four-layer report structure:

1. ZIP contents: what files and reports exist in the uploaded snapshot.
2. Local verification: scripts/tests/audits run from the ZIP and their results.
3. GitHub supplement: exact files/PR metadata fetched from GitHub and whether they match or differ.
4. Still unverified: live production, omitted assets, missing `.git`, environment-only tests, or anything not present in either source.

Example:

> I used the uploaded lean ZIP as primary evidence. I used GitHub API only to fetch `README.md` and the lean-ZIP README from `main`, because those describe the intended archive semantics. The ZIP proves the P9 snapshot I analysed; GitHub proves the current `main` copy of those files. I did not treat 0-byte assets as broken because the lean-ZIP README says excluded assets are represented as placeholders.

## 12. Anti-patterns to avoid

Do not:

- apologise that the ZIP is inaccessible before checking `/mnt/data`;
- use file-search output as proof that ZIP content is searchable;
- extract one ZIP into another task’s work folder;
- treat 0-byte assets in lean ZIP as broken product state;
- use GitHub `main` to silently overwrite uploaded ZIP findings;
- claim a report is true because the report says so;
- claim production readiness from local scripts;
- ignore missing `.git` when running Git-history validators;
- let tests pass with zero generated cases;
- claim `--json` works if the command emits non-JSON banners.

## 13. Recommended answer sentence

Use this at the start of future validation reports:

> I used the uploaded lean ZIP as the primary snapshot, read its README/manifest/package scripts first, then used GitHub API only for exact-file or PR/ref supplementation. I am separating ZIP evidence, local-run evidence, GitHub evidence and production evidence because those prove different things.

## 14. Final principle

The lean ZIP is the user’s review snapshot. GitHub is the repository/ref supplement. Local scripts prove local behaviour. Production evidence proves production. Strong validation comes from keeping those layers separate and then checking whether the claims line up across them.
