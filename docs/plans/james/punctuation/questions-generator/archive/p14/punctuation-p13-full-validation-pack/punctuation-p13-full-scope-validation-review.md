# Punctuation Subject P13 — Full-scope validation review

## Evidence boundary

Primary source snapshot: uploaded lean ZIP `ks2-mastery-lean-05030002.zip`.

ZIP SHA256:

```text
a7952f94b2d8ce68f50c454545f9773ea3e8d317db00af0290b6149ac5483462
```

GitHub evidence was used only to cross-check production smoke evidence. The ZIP and GitHub `main` production-smoke file are byte-identical for `reports/punctuation/punctuation-qg-p13-production-smoke.json` by Git blob SHA `f0786caf0ea76eefb0f027fae43e362a0d352891`.

Important runtime limit: this review environment has Node `v18.20.4`, while the ZIP `.nvmrc` says `22`. I therefore did not claim a faithful full `npm run check` or full P13 verifier rerun. I ran focused Node tests and custom audits that execute successfully in this ZIP environment. Some UI SSR tests failed only because the lean ZIP/runtime environment lacks `esbuild` and Node 22 `node:sqlite`, not because those tests exposed product failures.

Lean ZIP caveat: assets under `assets/**` are intentionally placeholder-mode omissions, so this review does not certify visual asset payload completeness.

## Live status

Verdict: P13 is live-serving from production evidence.

The inspected production evidence shows:

```text
origin: https://ks2.eugnel.uk
environment: production
releasePhase: punctuation-qg-p13-live-serving
releaseId: punctuation-qg-p12-3000-2026-05-02
runtimeItemCount: 3312
generatedDepth: 100
workerCommitSha: 1c8ac551d3991008deba455a3a9a74c1d6c9c2f2
workerVersionId: fdba25ce-4865-4648-b162-3c75d84b9de3
authenticatedCoverage: true
adminHubCoverage: true
smartSix.summaryTotal: 6
smartSix.uniqueItems: 6
smartSix.immediateRepeats: 0
smartSix.generatedSeen: 3
smartSix.fixedSeen: 3
```

So the old P11 caveat about missing Worker identity is now closed for P13.

## Local verification run from ZIP

### P13 live evidence validation

Command:

```bash
node scripts/validate-punctuation-qg-p13-live-evidence.mjs reports/punctuation/punctuation-qg-p13-production-smoke.json
```

Result: pass.

Output saved in:

```text
p13-full-review-live-evidence-validation.json
```

### P12/P13 core release tests

Command:

```bash
node --test tests/punctuation-qg-p13-live-release.test.js tests/punctuation-qg-p12-expansion.test.js tests/punctuation-qg-p12-surface-pack.test.js
```

Result:

```text
18 tests
18 pass
0 fail
```

Output saved in:

```text
p13-full-review-core-tests.txt
```

### UI/workflow selected tests

Command:

```bash
node --test tests/punctuation-session-ui.test.js tests/punctuation-view-model.test.js tests/react-punctuation-scene.test.js tests/punctuation-map-phase.test.js tests/punctuation-map-hero-backdrop.test.js tests/punctuation-setup-hero-backdrop.test.js tests/ui-primary-action-contract.test.js tests/punctuation-release-smoke.test.js tests/punctuation-smoke-attestation.test.js
```

Environment result:

```text
138 pass
5 fail due environment/tooling only
```

The failures were missing `esbuild` and Node 22-only `node:sqlite`. The pure session UI/view-model/primary-action tests passed.

Output saved in:

```text
p13-full-review-ui-workflow-tests.txt
```

### Custom full-subject audit before patch

Command:

```bash
node punctuation-p13-subject-full-audit.mjs --out punctuation-p13-subject-full-audit.json
```

Result:

```text
fixed: 512
generated: 2800
total: 3312
generatedFamilies: 28
model failures: 0
answer-surface failures: 0
feedback failures: 0
closed lexical-replacement false accepts: 0
closed extra-tail false accepts: 0
punctuation-removal false accepts: 99
```

Session simulation:

```text
80 sessions
690 surfaced items
209 unique surfaced items
0 immediate repeats
min unique modes per sampled session: 3
max unique modes per sampled session: 6
```

The audit found one high residual product risk:

```text
Only 24 transfer/open-production items in a 3312-item pool.
```

## Bugs / quality defects found

### 1. Generated apostrophe questions included ungrammatical English

Severity: high content-quality bug.

Affected generated families:

```text
gen_apostrophe_contractions_fix
gen_apostrophe_mix_paragraph
```

Examples found in runtime source before patch:

```text
youve ready to move the lantern to the mountain lodge.
weve ready to move the camera to the bus stop.
theyll ready to move the costume to the adventure yard.
well ready to move the sketchbook to the school gate.
it isnt move the audio recorder to the assembly hall.
we arent move the team flag to the market stall.
it isnt forget the wildlife helpers whistles.
we arent forget the story leaders lunch trays.
```

These are not just style issues. They undermine learner trust because a punctuation practice item should not ask a child to repair punctuation in a sentence whose grammar is broken by the system.

Patch provided:

```text
punctuation-p13-quality-fix.patch
```

The patch normalises the affected generated templates at runtime before item construction, preserving contraction targets while repairing grammar and capitalising model sentence starts.

### 2. Paragraph marking accepted missing sentence-boundary punctuation

Severity: high marking-quality bug.

Before patch, some paragraph repair answers were accepted even when the answer removed the sentence break between two prose sentences. Example:

```text
Model:
We can't find the children's coats. The girls' bags are in the hall.

Accepted before patch:
We can't find the children's coats The girls' bags are in the hall
```

This was caused by paragraph passage preservation using stripped words only, which erased sentence-boundary punctuation during the shape check.

Patch provided:

```text
punctuation-p13-quality-fix.patch
```

The patch adds prose sentence-boundary counting to `markParagraphPassageShape()`. It deliberately excludes bullet-list line punctuation so existing bullet-point accepted variants remain valid.

### 3. Transfer / open-production depth is underrepresented

Severity: high product-depth risk, not an immediate release blocker after the quality patch.

Mode distribution in the 3,312-item pool:

```text
choose: 740
insert: 720
fix: 717
combine: 606
paragraph: 505
transfer: 24
```

The session scheduler can surface transfer items, but the actual pool only contains 24 transfer/open-production items. This means the subject is now much broader, but not yet as deep in independent open production as it should be.

This should be handled in the follow-up contract as content-quality expansion only, not as a new UI feature.

### 4. Skill-detail focused practice still launches four-question guided rounds

Severity: medium UX/pacing risk.

Default Smart Practice is six questions, but the skill-detail modal still dispatches:

```js
{ mode: 'guided', guidedSkillId, roundLength: '4' }
```

This may be acceptable for a quick rescue round, but it conflicts with the larger product concern that children can feel they are “done” too quickly. The follow-up contract should decide whether focused guided rounds remain four or move to six, and should verify the Star pacing impact. I did not patch this in this pack because it changes learner pacing policy and has many existing tests around `roundLength: '4'`.

## Patch verification

After applying the quality patch inside the ZIP worktree, I reran:

```bash
node --test tests/punctuation-qg-p12-expansion.test.js tests/punctuation-qg-p13-live-release.test.js tests/punctuation-golden-marking.test.js tests/punctuation-p13-full-subject-quality.test.js
```

Result:

```text
25 tests
25 pass
0 fail
```

Custom audit after patch:

```text
fixed: 512
generated: 2800
total: 3312
model failures: 0
answer-surface failures: 0
feedback failures: 0
closed lexical-replacement false accepts: 0
closed extra-tail false accepts: 0
punctuation-removal false accepts: 0
explanation-too-short failures: 0
```

Remaining risk after patch:

```text
transfer_underrepresented: Only 24 transfer/open-production items in a 3312-item pool.
```

## Production recommendation

P13 live-serving status is credible.

However, I recommend applying the quality patch before calling the whole Punctuation subject “highest-standard certified”. P13 is serving the right size pool, and the workflow/smoke evidence is much stronger than earlier phases, but the ungrammatical generated apostrophe items are real learner-facing quality defects.

Recommended status labels:

```text
Before patch: LIVE_SERVING_WITH_CONTENT_QUALITY_DEFECTS
After patch + deploy + smoke: LIVE_SERVING_CONTENT_QUALITY_HARDENED
```

Do not add new features in the follow-up. The next work should be quality-only:

1. apply the quality patch;
2. redeploy and regenerate P13 smoke with the same 3,312 count;
3. run a full Node 22 verification chain;
4. expand transfer/open-production content depth;
5. audit Star pacing with the larger pool;
6. review whether skill-detail guided rounds should remain four questions.
