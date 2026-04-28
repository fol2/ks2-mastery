# Punctuation Question Generator P2 Completion Report

Date: 28 April 2026

Status: U7 open for review in PR #514; U1-U6 completed and merged to remote `main`

Source plan: `docs/plans/james/punctuation/questions-generator/punctuation-qg-p2.md`

Implementation plan: `docs/plans/2026-04-28-002-feat-punctuation-qg-p2-depth-release-gate-plan.md`

Shipped PRs:

| Unit | PR | Merge commit | Merged at | Purpose |
| --- | --- | --- | --- | --- |
| U1 | [#492](https://github.com/fol2/ks2-mastery/pull/492) | `ac7bf726badc83d60ac52c92a45212a66de6bb55` | 2026-04-28 18:05:57 UTC | Add the dedicated Punctuation content-audit CI gate. |
| U2 | [#495](https://github.com/fol2/ks2-mastery/pull/495) | `74a605183b99ab2aa880673a0494612f35ba0072` | 2026-04-28 18:33:21 UTC | Scope Punctuation Stars to current release evidence. |
| U3 | [#498](https://github.com/fol2/ks2-mastery/pull/498) | `670855d260ab0a967390fcc1ca883752356831ed` | 2026-04-28 19:17:10 UTC | Add P2 fixed anchor depth for priority skills. |
| U4 | [#502](https://github.com/fol2/ks2-mastery/pull/502) | `fe70dc9b63175d9c921dbafc7603b5c289ad7922` | 2026-04-28 19:49:44 UTC | Codify generated metadata transport and redaction policy. |
| U5 | [#506](https://github.com/fol2/ks2-mastery/pull/506) | `4ab2525a6fd87d7a0cd68098bfec713e5cb21409` | 2026-04-28 20:22:31 UTC | Clarify dash display and list-comma marking policy. |
| U6 | [#508](https://github.com/fol2/ks2-mastery/pull/508) | `d6cc3887b69f751b3c8fab1dc8926fcbd82de2d3` | 2026-04-28 20:58:13 UTC | Expand deterministic generator and context-pack capacity. |
| U7 | [#514](https://github.com/fol2/ks2-mastery/pull/514) | Pending merge | Open for review | Extend production smoke and record P2 completion evidence. |

## Executive Summary

The P2 Punctuation question-generator release is ready for review with a production-smoke gate that now exercises the deployed Worker-backed subject boundary instead of relying only on source-level tests.

The release still does **not** use runtime AI to create learner questions or marking decisions. P2 deepens the deterministic portfolio and release controls around the existing Worker-owned Punctuation subject:

```text
Fixed evidence items:        92
Published generator families: 25
Generated variants per family: 4
Generated runtime items:    100
Total runtime items:        192
Published reward units:      14
```

The important P2 outcome is that the larger runtime is now release-gated by audit checks, release-scoped Star projection, generated metadata redaction, canonical dash display with permissive dash marking, explicit Oxford-comma policy, expanded deterministic template capacity, and live production smoke evidence.

## Final Outcome

### What shipped in U1-U6

P2 shipped the following production-sensitive safeguards before U7:

- A dedicated Punctuation content-audit workflow and stricter audit checks for generated family coverage, duplicate signatures, generated model-answer marking, fixed-anchor depth, and validator coverage.
- Release-scoped Star projection so old-release reward-unit evidence cannot inflate current Secure, Mastery, or Grand Star totals.
- Fixed-anchor depth for the priority thin skills: sentence endings, apostrophe contractions, comma clarity, semi-colon lists, hyphens, and dash clauses.
- An explicit generated metadata transport contract: active generated `session.currentItem` may carry an opaque `variantSignature`; GPS review rows, Parent Hub, Admin evidence, and adult evidence must not.
- Dash policy cleanup: model answers teach a spaced en dash, while marking accepts spaced hyphen, en dash, and em dash variants where the item is testing a dash.
- List-comma policy cleanup: default free-text list-comma content accepts an otherwise-correct Oxford comma unless the item explicitly forbids it and says so.
- Spare deterministic generator capacity beyond the production `generatedPerFamily: 4` runtime setting, without raising the learner-facing generated volume.

### What U7 adds

U7 extends `scripts/punctuation-production-smoke.mjs` rather than introducing another browser or HTTP framework. The smoke now verifies:

- current release id: `punctuation-r4-full-14-skill-structure`
- P2 runtime stats through command responses: total 192, published reward units 14
- local release-manifest/audit expectation: `generatedPerFamily: 4`, 100 generated items, 192 runtime items, and 14 published reward units; the live smoke does not observe a production generated-item total
- generated active-item metadata policy, including opaque `variantSignature`
- an incorrect generated answer producing misconception evidence
- GPS delayed-review redaction
- Parent Hub/adult evidence redaction
- local release-smoke coverage for Admin Hub evidence redaction
- dash acceptance for spaced hyphen, en dash, and em dash variants
- Oxford-comma acceptance for a default list-comma item
- English Spelling startup parity through the same Worker command boundary

## Production Smoke Evidence

Command:

```bash
npm run smoke:production:punctuation
```

Result: passed against `https://ks2.eugnel.uk` on 28 April 2026.

Key output:

```text
productionObserved:
  releaseId: punctuation-r4-full-14-skill-structure
  runtimeItems: 192
  publishedRewardUnits: 14
  generatedItemCommandPathProbe:
    itemId: gen_speech_insert_1shvsd2_4
    mode: insert
    misconceptionTags: speech.quote_missing
localReleaseManifestExpectation:
  fixedItems: 92
  generatedItems: 100
  generatedPerFamily: 4
  runtimeItems: 192
  publishedRewardUnits: 14
generatedIncorrectItemId: gen_speech_insert_1shvsd2_4
generatedIncorrectMisconceptionTags: speech.quote_missing
dashAcceptance:
  spaced-hyphen -> dc_insert_alarm_rang
  en-dash -> gen_dash_clause_fix_13mhhcw_4
  em-dash -> dc_transfer_flooded_route
oxfordCommaItemId: lc_transfer_trip
advancedMode: gps
advancedReviewItems: 1
parentHubAttempts: 19
spelling.progressTotal: 1
spelling.hasPromptToken: true
```

No live-production smoke check was skipped. The smoke used an isolated demo session and did not require an admin session. The generated count shown above is the local release-manifest/audit expectation, not a production-observed generated-item count.

## Audit Evidence

Command:

```bash
npm run audit:punctuation-content -- --strict --generated-per-family 4
```

Result: passed.

Key output:

```text
fixed items: 92
generator families: 25
generated items: 100
runtime items: 192
published reward units: 14
generated duplicate signatures: 0
```

The audit continues to report duplicate generated stems/models for content review only. Duplicate signatures remain the hard release-gate failure.

## Local Verification

Completed:

```bash
node --test tests/punctuation-release-smoke.test.js   # 6 passed
npm run audit:punctuation-content -- --strict --generated-per-family 4   # passed
npm run smoke:production:punctuation   # passed against https://ks2.eugnel.uk
npm test   # 5885 passed, 0 failed, 6 skipped
npm run check   # passed Wrangler dry-run build/audit/deploy
git diff --check   # passed
```

The first `npm test` attempt stopped at the worktree preflight because this fresh git worktree had no `node_modules`. Running `node scripts/worktree-setup.mjs` symlinked the matching primary-checkout dependencies, then the full suite passed.

## Residual Risks

- The production smoke uses bounded command-boundary searches for policy-specific generated/dash/list-comma items. It fails with the seen item ids if routing drifts, but it does not force a private item id through a special test-only command.
- Live production smoke does not exercise Admin Hub evidence because the production command is designed to run from a demo session without admin credentials. Local release-smoke tests still cover Admin Hub Punctuation evidence redaction.
- Live production smoke verifies release id and runtime behaviour rather than the deployed commit or build hash. The demo-accessible production APIs used here do not expose `BUILD_HASH`, so commit-level deployment identity remains a separate Cloudflare/GitHub deployment evidence risk.
- U7 documents the P2 release and opens the review PR; it does not merge or deploy this final report branch.

## Post-Deploy Monitoring And Validation

After U7 is merged and the Worker deploy completes, run:

```bash
npm run smoke:production:punctuation
```

Expected post-deploy status:

- `punctuationProduction` exposure gate remains enabled.
- Punctuation command responses still report release `punctuation-r4-full-14-skill-structure`, total 192, and 14 published reward units.
- Generated incorrect-answer smoke still emits at least one misconception tag and no generated internals.
- GPS delayed-review, Parent Hub evidence, and progress snapshots remain free of forbidden generated metadata.
- Dash and Oxford-comma probes remain accepted through the Worker command boundary.
- English Spelling still starts with a redacted cloze prompt and prompt token.
