# KS2 Mastery 05060131 validation audit

Primary artefact: `/mnt/data/ks2-mastery-lean-05060131.zip`
ZIP SHA256: `b62eec2f9a9c2b4ce41b0cff16200f940a3699af00ad281be83cc00837c05fc6`
Local extraction: `/mnt/data/ks2-05060131-work`
Patched validation extraction: `/mnt/data/ks2-05060131-clean-apply`

## Source boundary

I used the uploaded ZIP as the primary snapshot. GitHub was only used as a supplement for exact-file comparison. Local commands prove behaviour in this container for the extracted ZIP snapshot. Production is only accepted where the repository contains a production smoke artefact with origin, release ID, timestamp, and pass/fail result.

The ZIP is a lean bundle. `LEAN_ZIP_MANIFEST.txt` says `mode=placeholder`, `exclude_globs=assets/**,worktrees/**,.worktrees/**`, `tracked_total=3078`, `copied=2295`, `omitted=783`, `placeholders=783`, and `missing=0`. Zero-size files outside asset placeholders were only `.gitkeep` files under reports.

## Environment

```text
Node: v18.20.4
npm: 9.2.0
.nvmrc: 22
```

The lean ZIP has no `node_modules`, so full `npm test` could not be run here. `node scripts/preflight-test.mjs` stops on missing packages such as `react` and `esbuild`. Several Hero tests also depend on Node 22 features such as `node:sqlite` and `import.meta.dirname`; those failures are environment/runtime mismatch, not automatically product bugs.

## ZIP and implementation validation

### Punctuation QG P20

Command run from the original ZIP extraction:

```bash
npm run verify:punctuation-qg:p20
```

Result: PASS.

Observed output:

```text
Punctuation QG P20 expansion audit: PASS
release: punctuation-qg-p20-15072-2026-05-04
runtime/generated/fixed: 15072/14560/512
unique surfaces/signatures: 15066/15072
generated families: 126
failing gates: none
Punctuation QG P20 live evidence validation: PASS
production evidence tests: 2 pass / 0 fail
```

The committed smoke evidence contains:

```text
ok: true
origin: https://ks2.eugnel.uk
environment: production
releaseId: punctuation-qg-p20-15072-2026-05-04
runtimeItemCount: 15072
authenticatedCoverage: true
adminHubCoverage: true
timestamp: 2026-05-05T20:00:44.460Z
workerCommitSha: 092566ce765e73b7d3434dc14238650dcef899ed
workerVersionId: null
deploymentId: null
```

Caveat: I validated the committed production smoke evidence and the local verifier. I did not independently log in to the live production site.

### Reading / Hero / Grammar / Punctuation targeted tests

Command run from original ZIP extraction:

```bash
node --test tests/reading-content-contract.test.js tests/reading-subject-registry.test.js tests/worker-reading-runtime.test.js tests/hero-providers.test.js tests/punctuation-qg-p20-production-evidence.test.js tests/grammar-qg-p20-answer-acceptance.test.js tests/grammar-qg-p20-quality-hardening.test.js tests/grammar-answer-spec.test.js tests/grammar-answer-spec-audit.test.js
```

Result: PASS.

```text
# tests 89
# pass 89
# fail 0
```

### Grammar QG P20

Combined command attempted:

```bash
npm run verify:grammar-qg-p20
```

Result in this container: timed out before a final summary. This does not prove a product failure; the combined gate is long-running in this lean environment.

The component checks I ran individually passed:

```text
audit-grammar-question-generator: PASS
audit-grammar-question-generator --deep: PASS
audit-grammar-open-response-fairness: PASS
audit-grammar-qg-p20-quality-hardening: PASS
tests/grammar-answer-spec.test.js: 18 pass / 0 fail
tests/grammar-answer-spec-audit.test.js: 12 pass / 0 fail
tests/grammar-question-generator-audit.test.js: 5 pass / 0 fail
tests/grammar-qg-p20-answer-acceptance.test.js: 10 pass / 0 fail
tests/grammar-qg-p20-quality-hardening.test.js: 3 pass / 0 fail
```

## Bugs / glitches found

### 1. Hero date key returns locale-shaped strings in this runtime

Severity: high for Hero Mode scheduling correctness.

Observed failure in the Hero test sweep:

```text
deriveDateKey returns YYYY-MM-DD for Europe/London
expected: 2026-04-27
actual:   04/27/2026
```

Root cause: `Intl.DateTimeFormat('en-CA').format(...)` was used as if it always returns `YYYY-MM-DD`. That is not safe across Node/ICU builds.

Fix: use `formatToParts()` and assemble `YYYY-MM-DD` explicitly.

Final repository application also pins the invalid-timezone fallback path with
`tests/hero-contracts.test.js` so the safe fallback requirement cannot regress silently.

### 2. Reading exact-answer checks accept learner substrings

Severity: medium now, high future-risk.

Current content does not appear to use `exactAny` heavily, but the exported matcher contract is unsafe. A learner fragment can pass when it is merely contained in the model answer.

Fix: require equality or whole phrase containment from learner answer to model phrase, never reverse substring containment.

Final repository application also pins `containsAny` phrase-boundary containment so the matcher cannot fall back to arbitrary character substrings.

### 3. Reading stale save / duplicate submit can mutate response state after marking

Severity: medium-high.

A stale browser tab can submit/save against the currently displayed question without `save-response` checking expected session/question IDs. A duplicate `submit-answer` can overwrite stored `responses[qid]` before the runtime realises the question was already marked. That can leave response and result out of sync.

Fix: reject stale expected session/question IDs for saves, reject saves after marking, and reject duplicate submits before mutation.

## Hotfix validation

Patch applied cleanly to a fresh extraction of the uploaded ZIP:

```bash
git apply --check patches/001-hero-datekey-reading-integrity-hotfix.patch
git apply patches/001-hero-datekey-reading-integrity-hotfix.patch
```

Static checks after patch:

```text
node --check shared/hero/seed.js: PASS
node --check worker/src/subjects/reading/engine.js: PASS
node --check tests/hero-contracts.test.js: PASS
node --check tests/worker-reading-runtime.test.js: PASS
```

Targeted tests after patch:

```bash
node --test tests/hero-contracts.test.js tests/hero-p6-datetime.test.js tests/worker-reading-runtime.test.js tests/reading-content-contract.test.js tests/reading-subject-registry.test.js
```

Result:

```text
# tests 79
# suites 6
# pass 79
# fail 0
```

Punctuation regression after patch:

```bash
npm run verify:punctuation-qg:p20
```

Result: PASS.

Additional final repository gates after applying the expanded hotfix:

```text
npm test: PASS, 109128 pass / 0 fail / 12 skipped
npm run check: PASS
npm run verify:grammar-qg-p20: PASS, 48 pass / 0 fail
```

Final evidence logs in this package:

```text
validation/hotfix-targeted-tests.log
validation/npm-test-after-hotfix.log
validation/punctuation-qg-p20-verify-after-hotfix.log
validation/repo-check-after-hotfix.log
validation/grammar-qg-p20-verify-after-hotfix.log
```

## Verdict

The uploaded snapshot is broadly strong: Punctuation QG P20 validates, the Reading runtime/content focused tests pass, Hero provider tests pass in the targeted set, and Grammar P20 component gates pass individually.

However, I would not deploy or continue building on this snapshot without applying the hotfix. The Hero date-key issue is a real daily-scheduler bug, and the Reading stale-response/substring issues are real integrity bugs even if not all of them are currently visible in learner-facing content.

## Recommended acceptance gates after applying the patch

```bash
node --test tests/hero-contracts.test.js tests/hero-p6-datetime.test.js tests/worker-reading-runtime.test.js tests/reading-content-contract.test.js tests/reading-subject-registry.test.js
npm run verify:punctuation-qg:p20
npm run check
```

Then run under the intended Node 22 environment with installed dependencies:

```bash
npm test
npm run check
npm run verify:grammar-qg-p20
```
