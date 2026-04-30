---
phase: punctuation-qg-p10
title: Punctuation QG P10 — Final Production Certification Gate
status: proposed
owner: KS2 Mastery / Punctuation
language: en-GB
created: 2026-04-30
source_review_bundle: ks2-mastery-lean-04301832.zip
zip_sha256: 47bf712c7c65a5e3e56ad68be30e88344ffb17252d3c6eb7d34d556e77b99745
production_depth_target: 4
capacity_depth_seen: 8
primary_goal: close the remaining generated-item lexical-preservation leak and turn P9 evidence into a defensible production release gate
---

# Punctuation QG P10 — Final Production Certification Gate

## Executive decision

P9 is a real improvement over P8, but it is not yet enough to call Punctuation QG fully production-certified.

The supplied lean ZIP shows that P9 fixed the major P8 gaps around short extra-tail answers, speech reporting-clause protection, transfer fragments, reviewer-pack structure, reviewer decision alignment, and the AI-versus-human review split. The depth-4 production pool is still 192 items: 92 fixed items and 100 generated production items. Production depth remains 4, which is correct.

The remaining problem is narrower but serious: generated closed `insert` and `fix` items can still accept same-count lexical substitutions. P9 blocks extra words such as `today` and `in class`, but some generated items still accept answers where a learner changes an original content word while keeping the punctuation shape. That breaks the contract of a closed punctuation task: the learner is meant to punctuate the supplied sentence, not rewrite it.

P10 should therefore be the final production certification phase, not another broad feature phase. It has one essential code fix, one non-vacuous adversarial oracle, and one release-evidence hardening track. If those pass, depth 4 can be certified. Depth 6 should remain blocked unless its candidate-only pool and review-required clusters are separately accepted.

## Evidence boundary

Primary evidence is the uploaded lean ZIP `ks2-mastery-lean-04301832.zip`.

GitHub API was used only as exact-file supplementary evidence for `main`. The P9 report and P9 verifier in the ZIP match the GitHub `main` blob SHAs for those exact paths:

```text
docs/plans/james/punctuation/questions-generator/punctuation-qg-p9-completion-report.md
ZIP/GitHub blob SHA: 0cf8d9105d098c97f2a32f6c7cb98eddfff0c2d9

scripts/verify-punctuation-qg-p9.mjs
ZIP/GitHub blob SHA: afe91335feb81b4dfcac36df9efee9b211acddac
```

The ZIP is a lean review bundle. Its manifest says `mode=placeholder`, `exclude_globs=assets/**`, `tracked_total=2563`, `copied=1780`, `omitted=783`, and `placeholders=783`. That means visual asset payload completeness is not certified from this bundle. Code, tests, reports, and reviewer fixtures can still be reviewed.

Local runtime is not faithful to the canonical verifier: the ZIP `.nvmrc` requires Node 22, while this environment has Node 18.19.0. `npm run verify:punctuation-qg:p9` correctly refuses to run under Node 18. I therefore do not claim that I locally reproduced the full P9 verifier pass. I did run targeted Node tests and custom audits that are valid under this environment.

No live deployed production smoke was inspected. Local source checks do not prove the live Cloudflare Worker state.

## P9 validation summary

### P9 claims that are credible

P9’s main implementation direction is credible.

The P9 report claims P9 closes seven production-blocking gaps from P8, replaces the old `+2` word tolerance with exact enforcement for single-line closed stems, locks speech items against extra-word leaks, aligns reviewer cluster decisions, separates AI review from human acceptance, hardens the verifier for Node 22, and keeps live production smoke unclaimed. The verifier source also explicitly composes P8’s 37 logical gates plus 10 P9-specific gates into 47 logical gates across 11 top-level gates, and it refuses Node below 22.

Targeted local tests from the ZIP support the core P9 improvements:

```text
punctuation-closed-preservation-productionisation.test.js: 17 tests, 17 pass
punctuation-negative-vectors.test.js: 14 tests, 14 pass
punctuation-reviewer-cluster-alignment.test.js: 7 tests, 7 pass
punctuation-review-authority.test.js: 10 tests, 10 pass
punctuation-production-evidence.test.js: 7 tests, 7 pass
punctuation-production-qa-gate.test.js: 11 tests, 11 pass
```

The previous P8 tail leaks now reject. For example, these are no longer accepted in P9:

```text
lc_insert_supplies: We needed pencils, rulers and glue today.
lc_insert_supplies: We needed pencils, rulers and glue in class.
pa_insert_museum: The museum, a former station, was busy today.
pa_fix_author: The author, who won the prize, smiled in class.
sp_insert_question: Ella asked, "Can we start now?" today.
sp_insert_question: Ella asked, "Can we start now?" in the cupboard.
sp_fix_question: "Where are we meeting?" asked Zara in class.
ac_transfer_contractions: Can't we're.
ap_transfer_possession: The children's teachers'.
```

The reviewer evidence is stronger than P8:

```text
reviewer schema version: 3
itemDecisions: 192
clusterDecisions: 47
AI pre-review: complete
human acceptance: not_started
production certification: blocked_pending_human_acceptance_and_p9_gates
```

The negative-vector fixture is also stronger:

```text
negative vectors: 208
choice validation entries: 20
```

The reviewer summary CLI reports:

```text
mode: production
productionDepth: 4
totalItems: 192
productionCount: 192
candidateCount: 0
itemStates.approved: 192
totalClusters: 115
clusterStates.approved: 47
clusterStates.unreviewed: 68
```

This is much better than the P8 state where cluster decisions did not align with actual reviewer-pack clusters.

### P9 claims that are still too strong

The P9 report’s proposed post-P9 claim is too strong:

> Punctuation QG is production-quality certified for the depth-4 item pool from source and local verification evidence. Live production remains separately proven only by a live smoke artefact.

I would not use that wording yet.

The correct status is:

> P9 is source-hardened and much closer to production, but it is not fully production-certified until P10 closes generated lexical-replacement leaks, records exact release provenance, obtains human acceptance, and, for post-deploy certification, passes live production smoke.

## Production blocker found after P9

### Blocker: generated closed items still accept same-count lexical substitutions

I ran a custom audit over the depth-4 production pool. The audit replaces each word in each closed `insert`, `fix`, and `combine` model answer with a same-count word and asks the marker whether the answer is correct. This is intentionally adversarial but production-relevant: a closed repair item should not allow content changes just because the punctuation pattern is present.

Result against the unpatched P9 ZIP:

```text
runtime pool: 192
fixed items: 92
generated production items: 100
closed insert/fix/combine items audited: 123
same-count lexical replacement attempts: 916
false accepts: 88
leaking items: 24
false accepts by source: generated only
```

The false accepts are concentrated in generated `insert` and `fix` families:

```text
gen_apostrophe_possession_insert: 23 false accepts
gen_fronted_adverbial_fix: 16 false accepts
gen_comma_clarity_insert: 15 false accepts
gen_hyphen_insert: 12 false accepts
gen_semicolon_list_fix: 12 false accepts
gen_list_commas_insert: 10 false accepts
```

Examples that P9 currently accepts but should reject:

```text
gen_list_commas_insert:
We banana ropes, maps and snacks.

 gen_fronted_adverbial_fix:
After the storm, the banana was muddy.

 gen_apostrophe_possession_insert:
The children's banana covered the teacher's desk.

 gen_comma_clarity_insert:
When the banana lifted, the tower appeared.
```

This does not mean P9 failed everywhere. Fixed items are much safer now, and the P8 short-tail leak is closed. The issue is specifically that some generated validators check the required punctuation phrase, list, apostrophe token, or phrase boundary, but do not enforce every original content word.

### Root cause

In `shared/punctuation/marking.js`, `markTransfer()` currently has this gate:

```js
if ((item.mode === 'insert' || item.mode === 'fix') && validator.type) {
  const preservation = evaluatePreservation(text, item);
  if (!preservation.preserved && preservation.extraWords.length > 0) {
    return {
      correct: false,
      expected: item.model || '',
      note: 'You changed the sentence — only add or fix the punctuation.',
      misconceptionTags: ['content.words_added_or_changed'],
      facets: [facet('content_preservation', false)],
    };
  }
}
```

That catches added words. It does not catch same-count replacements, because `evaluatePreservation()` returns `preserved: false` with `extraWords: []` and `missingWords: [...]`. The answer then falls through to validator-specific checks, and broad validators can mark it correct.

P10 should change this to reject any failed preservation for closed `insert` and `fix` transfer items:

```js
if ((item.mode === 'insert' || item.mode === 'fix') && validator.type) {
  const preservation = evaluatePreservation(text, item);
  if (!preservation.preserved) {
    return {
      correct: false,
      expected: item.model || '',
      note: 'You changed the sentence — only add or fix the punctuation.',
      misconceptionTags: ['content.words_added_or_changed'],
      facets: [facet('content_preservation', false)],
    };
  }
}
```

Do not blindly apply the same blanket rule to all `combine` items yet. Some combine stems can legitimately change structure, join notes, or omit scaffolding text. P10 should add a combine-specific policy only if the audit finds combine false accepts. In this audit, the actual false accepts were generated `insert` and `fix` items.

## Patch validation already performed

I applied the focused `markTransfer()` patch in a copied worktree and ran the same audit again.

Patched result:

```text
runtime pool: 192
fixed items: 92
generated production items: 100
closed insert/fix/combine items audited: 123
same-count lexical replacement attempts: 916
false accepts: 0
leaking items: 0
```

I also checked model answers after the patch:

```text
production pool: 192
non-choice accepted/model answers checked: 198
answer failures: 0
```

And I ran the new P10 oracle test in the patched worktree:

```text
punctuation-closed-lexical-preservation-p10.test.js: 3 tests, 3 pass
```

The existing P9 preservation and negative-vector tests still pass after the patch:

```text
punctuation-closed-preservation-productionisation.test.js: 17 tests, 17 pass
punctuation-negative-vectors.test.js: 14 tests, 14 pass
```

This is a small patch with a large trust impact. It should be prioritised before any release claim.

## P10 objective

P10 must turn the Punctuation QG from “strong source-hardened candidate” into one of these explicit statuses:

```text
BLOCKED
CERTIFIED_PRE_DEPLOY
CERTIFIED_POST_DEPLOY
DEPTH6_BLOCKED_BUT_DEPTH4_CERTIFIED
```

`BLOCKED` means one or more marking, reviewer, provenance, verification, human acceptance, or live-smoke gates fail.

`CERTIFIED_PRE_DEPLOY` means source behaviour, Node 22 verification, reviewer evidence, human acceptance, and certification manifest pass, but live production smoke has not run.

`CERTIFIED_POST_DEPLOY` means all pre-deploy requirements pass and live production smoke passes against the declared release identity.

`DEPTH6_BLOCKED_BUT_DEPTH4_CERTIFIED` means the depth-4 pool is certified, while depth 6 remains unavailable because candidate item review, candidate clusters, or live evidence are incomplete.

## P10 acceptance criteria

P10 is complete only when all of these are true.

1. Closed generated and fixed `insert` and `fix` items reject extra words, removed words, and same-count lexical substitutions.
2. The depth-4 generated pool has zero accepted lexical-replacement probes.
3. The P10 preservation oracle is non-vacuous and reports the number of items and adversarial answers inspected.
4. All fixed and generated model/accepted answers still mark correct.
5. Existing speech-reporting clause behaviour remains intact: wrong reporter is rejected, extra outer text is rejected, and valid model answers pass.
6. Existing meaningful transfer gates remain intact: token-only fragments are rejected.
7. Negative vectors remain populated and passing.
8. Reviewer item decisions remain at 192 for the depth-4 production pool.
9. Review-required cluster decisions remain aligned with the reviewer-pack cluster IDs.
10. Human acceptance is completed by a named human reviewer or product owner before any public “production-certified” claim.
11. AI pre-review remains labelled as AI pre-review and is never renamed to human approval.
12. The canonical verifier is `npm run verify:punctuation-qg:p10` and requires Node 22.
13. The verifier output is archived with a SHA-256 digest and exact Node/npm versions, not a placeholder such as `22.x`.
14. The certification manifest records the exact ZIP SHA-256, Git ref, commit SHA, verified path hashes, verifier log hash, reviewer fixture hash, and release ID.
15. The named Git commit must actually contain every verified Punctuation QG path. A commit that cannot serve `scripts/verify-punctuation-qg-p9.mjs` or the P10 verifier is not valid release provenance.
16. Live production smoke remains `not_run` unless it genuinely ran against a deployed origin.
17. `CERTIFIED_POST_DEPLOY` is impossible unless live smoke passes and includes origin, environment, release ID, deployed commit or Worker version, timestamp, and result.
18. `PRODUCTION_DEPTH` remains 4 unless depth-6 candidate review is separately completed and accepted.
19. The final P10 completion report states exactly what is source-proven, local-run-proven, human-accepted, and live-production-proven.

## P10 implementation units

### U1 — Lexical preservation lock for closed transfer items

Patch `shared/punctuation/marking.js` so closed `insert` and `fix` transfer items reject any failed preservation, not only failed preservation with `extraWords.length > 0`.

Expected code behaviour:

```js
if ((item.mode === 'insert' || item.mode === 'fix') && validator.type) {
  const preservation = evaluatePreservation(text, item);
  if (!preservation.preserved) {
    return {
      correct: false,
      expected: item.model || '',
      note: 'You changed the sentence — only add or fix the punctuation.',
      misconceptionTags: ['content.words_added_or_changed'],
      facets: [facet('content_preservation', false)],
    };
  }
}
```

Keep the error message simple for learners. They do not need to know whether the failure was “same-count lexical substitution” or “extra-tail addition”; the actionable feedback is “only fix the punctuation”.

### U2 — Add a P10 lexical-replacement oracle test

Add a test file such as:

```text
tests/punctuation-closed-lexical-preservation-p10.test.js
```

It must:

```text
- build the full depth-4 production pool;
- assert the pool has 192 items;
- assert generated production items = 100;
- audit all closed insert/fix/combine model answers;
- perform a non-trivial number of same-count lexical substitutions;
- assert false accepts = 0;
- include explicit known generated probes;
- assert all model/accepted answers still mark correct.
```

A patch file with this test is attached separately as `punctuation-qg-p10-lexical-preservation.patch`.

### U3 — Wire P10 into the verifier

Create:

```text
scripts/verify-punctuation-qg-p10.mjs
npm script: verify:punctuation-qg:p10
```

The P10 verifier should compose P9 and add P10-specific gates:

```text
1. P9 composed gates — 47 logical
2. P10 lexical-replacement oracle
3. Model-answer preservation after P10 patch
4. Reviewer decision integrity
5. Reviewer cluster alignment
6. Human acceptance gate
7. Certification manifest validation
8. Depth-4 production-depth lock
9. Depth-6 blocked unless separately certified
10. Optional live production smoke gate, only for post-deploy status
```

If human acceptance or live smoke is intentionally not complete, the verifier should not print a misleading “production certified” summary. It should produce a bounded status such as `CERTIFIED_PRE_DEPLOY` or `BLOCKED_PENDING_HUMAN_ACCEPTANCE`.

### U4 — Certification manifest and provenance validator

Add a certification manifest such as:

```text
reports/punctuation/punctuation-qg-p10-certification-manifest.json
```

Required fields:

```json
{
  "schemaVersion": 1,
  "subject": "punctuation",
  "phase": "punctuation-qg-p10",
  "certificationStatus": "CERTIFIED_PRE_DEPLOY",
  "releaseId": "punctuation-r4-full-14-skill-structure",
  "source": {
    "zip": {
      "name": "ks2-mastery-lean-04301832.zip",
      "sha256": "47bf712c7c65a5e3e56ad68be30e88344ffb17252d3c6eb7d34d556e77b99745"
    },
    "git": {
      "repository": "fol2/ks2-mastery",
      "ref": "main",
      "commitSha": "<40-char-sha>",
      "commitContainsAllVerifiedPaths": true
    }
  },
  "runtimePool": {
    "productionDepth": 4,
    "fixedItems": 92,
    "generatedProductionItems": 100,
    "totalProductionItems": 192
  },
  "localVerification": {
    "command": "npm run verify:punctuation-qg:p10",
    "status": "pass",
    "exitCode": 0,
    "nodeVersion": "v22.x.y",
    "npmVersion": "x.y.z",
    "logicalGates": 48,
    "logPath": "reports/punctuation/punctuation-qg-p10-verify.log",
    "logSha256": "<sha256>"
  },
  "review": {
    "aiPreReview": {
      "status": "complete",
      "itemDecisions": 192,
      "reviewRequiredClusterDecisions": 47
    },
    "humanAcceptance": {
      "status": "complete",
      "reviewer": "<name>",
      "role": "product-owner",
      "acceptedItems": 192,
      "acceptedReviewRequiredClusters": 47,
      "blockers": []
    }
  },
  "liveProductionSmoke": {
    "status": "not_run"
  },
  "depth6": {
    "status": "blocked"
  }
}
```

A validator script prototype is attached separately as `punctuation-qg-p10-certification-validator.mjs`. It is intentionally strict: it fails placeholders such as `pending-verification`, requires exact Node/npm versions, checks verified path hashes, and refuses to certify Git provenance in a lean ZIP without `.git` unless explicitly run in non-certifying shape-check mode.

### U5 — Human acceptance truth gate

P9 correctly separates AI pre-review from human acceptance, but it has not completed human acceptance. P10 must not blur that boundary.

A production claim requires:

```text
human_acceptance.status: complete
reviewer: named human or accountable role
reviewedAt: timestamp
acceptedItems: 192
acceptedReviewRequiredClusters: 47
blockers: []
```

Without that, the correct status is still blocked or pre-certification, even if all code tests pass.

### U6 — Live production smoke, only after deployment

Local source verification can certify the source snapshot. It cannot certify the live site.

For post-deploy certification, add or update live smoke evidence with:

```text
environment
origin
releaseId
deployed commit or Worker version
timestamp
command/check performed
result
artefact path and SHA-256
```

If no live smoke ran, the final report must say `liveProductionSmoke.status: not_run` and must not use `CERTIFIED_POST_DEPLOY`.

### U7 — Depth-6 remains out of scope unless separately accepted

P10 is allowed to certify depth 4. It should not automatically activate depth 6.

Depth 6 requires:

```text
- candidate item review populated;
- candidate negative vectors or equivalent adversarial proof;
- candidate cluster decisions aligned and accepted;
- reviewer pack summary for candidate-only items;
- depth-6 smoke or release gating;
- explicit product-owner acceptance.
```

Until then, keep `PRODUCTION_DEPTH = 4`.

## Required P10 tests and commands

Minimum command set:

```bash
npm run verify:punctuation-qg:p10
node --test tests/punctuation-closed-lexical-preservation-p10.test.js
node --test tests/punctuation-closed-preservation-productionisation.test.js
node --test tests/punctuation-negative-vectors.test.js
node --test tests/punctuation-reviewer-cluster-alignment.test.js
node --test tests/punctuation-review-authority.test.js
node --test tests/punctuation-production-evidence.test.js
node scripts/review-punctuation-questions.mjs --summary --json
node scripts/validate-punctuation-qg-certification-evidence.mjs reports/punctuation/punctuation-qg-p10-certification-manifest.json --root .
```

The final report must include the actual outputs or log hashes, not just “passes locally”.

## Release wording after P10

If U1–U5 pass but live smoke has not run, use this wording:

> Punctuation QG depth-4 is certified from source, local Node 22 verification, reviewer evidence, and human acceptance. Live production remains unproven until the declared release passes deployed smoke.

If U1–U6 pass, use this wording:

> Punctuation QG depth-4 is certified post-deploy for release `<releaseId>` on `<origin>` at `<timestamp>`. Depth 6 remains blocked pending candidate review unless separately certified.

Do not use this wording unless live smoke exists:

> Fully production certified.

Do not use this wording at all for P9:

> P9 is production-quality certified for the depth-4 item pool.

## Production decision

Do not productionise P9 as the final public release.

P9 is close. It is acceptable as a P10 starting point and probably acceptable for internal staging or reviewer acceptance workflows. It is not acceptable as final production certification because generated closed items still have lexical-replacement false accepts and the release evidence contains placeholders and weak Git provenance.

P10 can realistically deliver the product for depth 4 if the focused patch is applied and the evidence gates are completed honestly. The code fix is small; the remaining work is mostly about not over-claiming evidence.

## Deliverables checklist for P10 completion

```text
[ ] shared/punctuation/marking.js patched for closed insert/fix lexical preservation
[ ] tests/punctuation-closed-lexical-preservation-p10.test.js added
[ ] replacement audit reports 0 false accepts across the depth-4 production pool
[ ] all model/accepted answers still pass
[ ] P9 regression gates still pass under Node 22
[ ] verify:punctuation-qg:p10 added and passing under Node 22
[ ] reviewer summary still reports 192 production items and 47 approved review-required clusters
[ ] human acceptance fixture/register completed by accountable reviewer
[ ] certification manifest created with exact ZIP SHA, Git commit, path hashes, verifier log hash, and runtime versions
[ ] certification manifest validator passes in a real Git checkout
[ ] live production smoke either passes with full artefact identity or is explicitly marked not_run
[ ] final P10 completion report uses correct evidence boundaries
[ ] PRODUCTION_DEPTH remains 4 unless depth 6 has separate acceptance
```

## Bottom line

P1–P9 created a solid system, but “solid” is not the same as production-certified. P9 has one remaining marking leak and a release-evidence boundary problem. P10 should fix both, then certify depth 4 honestly. After that, it is reasonable to ship the depth-4 Punctuation QG as production-ready, while keeping depth 6 blocked until separately reviewed.
