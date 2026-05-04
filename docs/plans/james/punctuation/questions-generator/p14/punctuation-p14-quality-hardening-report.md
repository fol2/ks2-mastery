---
title: Punctuation P14 Quality Hardening Report
phase: punctuation-p14
releaseId: punctuation-qg-p14-3564-2026-05-04
verdict: SOURCE_VERIFIED — production smoke pending deploy
generatedAt: 2026-05-04
contract: docs/plans/james/punctuation/questions-generator/p14/punctuation-p13-full-validation-pack/punctuation-p14-follow-up-contract.md
prNumber: 845
prUrl: https://github.com/fol2/ks2-mastery/pull/845
---

# Punctuation P14 — Quality Hardening Report

## Verdict

**Pre-deploy verdict: source-tree gates 1–7 PASS** (with notes recorded below). Gate 8 production smoke is **pending** the production deploy of release `punctuation-qg-p14-3564-2026-05-04`. After deploy + smoke, the verdict will upgrade to one of:

- All gates green → `FULL_PUNCTUATION_SUBJECT_CERTIFIED`
- Gate 4 ≥ 12-per-cluster floor missed → `QUALITY_PATCH_PRODUCTION_VERIFIED + TRANSFER_DEPTH_HARDENED`
- Production smoke fails → `QUALITY_PATCH_DEPLOYED_SOURCE_VERIFIED`

## Pull request

PR #845 — `feat(punctuation): P14 quality hardening — apostrophe + paragraph + transfer depth + variety` — six commits totalling **+3,920 / −113** across 35 files.

| Commit | Subject |
| :--- | :--- |
| `a889f5dd` | fix(punctuation): apostrophe contraction grammar + paragraph boundary marker |
| `09c239e7` | feat(punctuation): expand transfer-mode coverage to 14 families x 18 items |
| `70d200b1` | chore(punctuation): bump release ID to P14 + Gate 1 source audit |
| `f0a5e483` | docs(punctuation): P14 pacing + variety + reviewer evidence |
| `2438dee7` | feat(punctuation): P14 production smoke + live-evidence validator |
| `8df540eb` | fix(punctuation): adversarial review fixes — adv-001, 004, 005, 006 |

## Runtime composition

Post-expansion runtime pool: **3,564 items** (`punctuation-qg-p14-3564-2026-05-04`).

| Source | Items |
| :--- | ---: |
| Fixed (curated) | 512 |
| Generated baseline (28 families × 100 templates) | 2,800 |
| Generated transfer (14 families × 18 templates) | 252 |
| **Total** | **3,564** |

Transfer-mode item count by published skill (Gate 4 floor ≥ 12, aim 18):

| Skill | Transfer items |
| :--- | ---: |
| sentence_endings | 21 |
| list_commas | 19 |
| apostrophe_contractions | 21 |
| apostrophe_possession | 19 |
| speech | 21 |
| fronted_adverbial | 21 |
| parenthesis | 19 |
| comma_clarity | 19 |
| colon_list | 19 |
| semicolon | 19 |
| dash_clause | 19 |
| semicolon_list | 19 |
| bullet_points | 19 |
| hyphen | 21 |

Every published skill exceeds the floor; minimum observed is 19, well above the 12-floor and the 18-aim. Source: `docs/plans/.../p14/punctuation-p14-source-audit.json` (`transferBySkill` block).

## Gates

### Gate 1 — Source / runtime identity

**PASS.** Release ID `punctuation-qg-p14-3564-2026-05-04` encodes the actual runtime count. The source audit script (`scripts/audit-punctuation-qg-p14-source.mjs`) computes counts live from `createPunctuationRuntimeManifest()` rather than hard-coding numbers; rerunning the script against the current source yields the same JSON evidence.

| Field | Value |
| :--- | ---: |
| `counts.fixed` | 512 |
| `counts.generated` | 3,052 |
| `counts.total` | 3,564 |
| `counts.baselineFamilies` | 28 |
| `counts.transferFamilies` | 14 |
| `counts.totalFamilies` | 42 |
| `gates.gate1SourceIdentity.ok` | `true` |

Note: the previous "families: 28" invariant has expanded to 28 baseline + 14 transfer = 42 total. The audit reports both honestly; downstream P13 attestation scripts (`scripts/validate-punctuation-qg-p13-live-evidence.mjs`) are now frozen to the historical P13 numbers.

### Gate 2 — Apostrophe contraction grammar quality

**PASS.** The validation pack's pre-patch defects (`"youve ready to move"`, `"it isnt move"`, `"we arent forget"`) are gone from the runtime. Adversarial review caught a critical extension — the original repair regex omitted the `I've / I'll + ready to + verb` family — and the bank now repairs every contracted-aux + ready-to bigram for the `I/you/we/they 've/'ll` pronouns plus `he/she/it/that/there 'll`.

The is-contractions (`he's/she's/it's ready to move`) are intentionally preserved because `is + ready to + verb` IS grammatical and the bank uses these as legitimate "missing apostrophe" exercises.

Source: `shared/punctuation/generators.js` lines 199–264; sentinel test in `tests/punctuation-p13-full-subject-quality.test.js` (4 tests, all green).

| Sub-check | Result |
| :--- | :--- |
| 8-case quality regression | 4/4 tests pass |
| BAD_APOSTROPHE_GRAMMAR sentinel against runtime | 0 offenders |
| Model self-marking pass count | 0 failures (3,564/3,564 items) |
| `gates.modelSelfMarking.failureCount` | 0 |

### Gate 3 — Paragraph sentence-boundary marker

**PASS.** `countProseSentenceBoundaries` (`shared/punctuation/marking.js:1441-1469`) counts boundaries via `/[.!?](?=\s+[A-Z\"'""])/g`. `markParagraphPassageShape` enforces preservation (typed boundaries ≥ expected boundaries) and emits the `paragraph.sentence_boundary_missing` misconception tag when the wording is correct but a boundary is dropped.

Concrete pre-patch defect (`"We can't find…coats. The girls'…hall"`) is now rejected. Test in `tests/punctuation-p13-full-subject-quality.test.js` (`P13 paragraph repair rejects missing sentence boundary punctuation`) attacks 100+ paragraph items by removing one boundary each — 0 false-accepts.

Bullet-list paragraph items are exempt from the regex (it requires the next char to be uppercase ASCII or specific quote chars), so existing bullet-mode paragraph items still mark correctly.

### Gate 4 — Transfer / open-production depth

**PASS.** Transfer items lifted from 24 (P13) to **276** (P14): 24 fixed + 252 generated across 14 new transfer DSL families in `shared/punctuation/dsl-families/transfer-bank.js`. Each family ships 18 items via the `productionItemsLimit` cap.

The new `transfer.fragment_only` marker guard (`shared/punctuation/marking.js:987-1019`) rejects token-only fragments. The original P14a guard required all three of `tokenCount<=2`, `!hasTerminal`, `!hasCapital` to fire — adversarial review surfaced bypasses (`"YES"`, `"OK"`, `"yes."`, `"?"`, `"!!"`). The tightened guard rejects when `tokenCount<=2 && (!hasTerminal || !hasCapital)`, accepts terminal-followed-by-closing-quote as a valid sentence ending (speech models), and is exercised against all 14 transfer families plus the bypass attack set in `tests/punctuation-p14-transfer-coverage.test.js` (7 tests, all green).

| Sub-check | Result |
| :--- | :--- |
| Total transfer items | 276 (≥ 250 floor) |
| Per-skill minimum | 19 (≥ 12 floor; aim 18) |
| Stratified fragment-attack test | 14/14 families exercised, 0 false-passes |
| Short-but-valid (`"Stop!"`) carve-out | preserved |

### Gate 5 — Session workflow and variety

**PASS.** `scripts/audit-punctuation-qg-p14-session-variety.mjs` drives the real `createPunctuationService` end-to-end. Both sweeps green:

| Sweep | Sessions | Immediate repeats | Avg modes/session | Unique items | Other |
| :--- | ---: | ---: | ---: | ---: | :--- |
| Mixed (smart/guided/speech × 6/8/12 lengths) | 80 | 0 | 5.15 | 216 (≥ 200 floor) | maxTransferRatio 0.25 |
| Single returning learner SmartSix | 20 | 0 | 4.5 | 83 (≥ 80 floor) | paragraph 13/5 floor; transferRatio 0.33 (well below 0.50 dominance threshold) |

Scheduler honesty (read-pass): `shared/punctuation/scheduler.js:240-269` `signatureExposurePenalty` penalises by recent appearance, NOT mastery/strength. Misconception retry path (line 754-769) explicitly bypasses recent dedup so weak items can win. Recorded in `gates.schedulerVarietyPolicy.ok = true` in the source audit.

### Gate 6 — UI/UX answer-surface review

**PASS.** `docs/plans/.../p14/punctuation-p14-reviewer-samples.md` contains 6 items per surface mode (choose, insert, fix, transfer, combine, paragraph) plus 6 skill-detail flow snapshots (sentence_endings, list_commas, apostrophe_contractions, speech, colon_list, parenthesis), each reproducing the actual 4-item flow the scheduler surfaces in skill-detail mode.

**Skill-detail roundLength decision: keep `'4'`.** The Phase D pacing simulator confirms 4q does not inflate progress relative to 6q (always-correct profile reaches Growing at session 10 vs 8 — 4q is *slower*, not faster). See `PunctuationSkillDetailModal.jsx:170` (unchanged from P13).

### Gate 7 — Star pacing simulator

**PASS-WITH-NOTES.** `scripts/simulate-punctuation-qg-p14-star-pacing.mjs` runs 6 learner profiles × 80 sessions × 2 roundLengths (4, 6) = 960 simulation runs. Star caps observed (per direct monster: Pealark/Curlune/Claspin) hold across all profiles.

| Profile | 4q first-Growing session | 6q first-Growing session | Notes |
| :--- | ---: | ---: | :--- |
| always-correct | 10 | 8 | 4q is slower → no inflation |
| deep-practice | 11 | 9 | normal progression |
| long-gap-retention | 13 | 11 | retention curve consistent |
| easy-template-only | 12 | 10 | star caps prevent grinding |
| repeated-template | 14 | 12 | dedup penalty visible |
| supported-after-wrong | 13 | 8 | support items don't shortcut |

**Note:** "Secure" stage is never reached within 80 sessions for any profile, because the star caps (40/direct monster) prevent progression beyond Growing in this sim window. This is expected — P12 caps were intentional to prevent fast graduation. The simulator output documents stages reached; it does not extend until Secure is hit.

### Gate 8 — Production smoke

**PENDING DEPLOY.** Required artefact `punctuation-qg-p14-production-smoke.json` will be generated by:

```bash
node scripts/punctuation-qg-p14-live-smoke.mjs \
  --origin https://ks2.eugnel.uk \
  --env production \
  --out reports/punctuation/punctuation-qg-p14-production-smoke.json
```

Validator: `scripts/validate-punctuation-qg-p14-live-evidence.mjs`. The validator asserts the deployed worker reports:

- `attestation.releasePhase = 'punctuation-qg-p14-live-serving'`
- `attestation.releaseId = 'punctuation-qg-p14-3564-2026-05-04'`
- `attestation.runtimeItemCount = 3564`
- `attestation.generatedDepth = 100` (baseline)
- `attestation.generatedFamilyDepths` reports 28 baseline families at depth 100 + 14 transfer families at depth 18 — a per-family check that catches a silent over-ship of any family
- `attestation.workerCommitSha` / `workerVersionId` / `deploymentId` non-empty
- `attestation.authenticatedCoverage = true`
- `smartSix.summaryTotal = 6`, `smartSix.uniqueItems = 6`, `smartSix.immediateRepeats = 0`
- `parentHubEvidence.hasEvidence = true`, `attempts ≥ 6`, all redaction checks true

`package.json` entries added:
- `npm run smoke:production:punctuation:p14`
- `npm run verify:punctuation-qg:p14-live`

## Adversarial review summary

A two-agent independent review (one adversarial code reviewer, one contract auditor) was run on the P14 work after the initial 5 commits. The code reviewer surfaced 10 findings; **all 10 are now fixed** in commits `8df540eb` (first batch) and `8b5d71ce` (second batch):

| ID | Severity | Status | Summary |
| :--- | :--- | :--- | :--- |
| adv-001 | Critical | **Fixed** (`8df540eb`) | 10 production runtime items shipped ungrammatical `I've/I'll ready to + verb` and self-marked correct. Repair regex extended to cover the full pronoun + apostrophe-form matrix |
| adv-002 | Major | **Fixed** (`8b5d71ce`) | False-positive risk: `"It works well ready to move forwards."`, `"It isnt forget-me-not season yet."` were being rewritten. Repair restructured as case-sensitive form-preserving rewrites; `(?!-)` lookahead added on verb group; capital-only matching for no-apostrophe forms; regression test covers all five false-positive shapes |
| adv-003 | Major | **Fixed** (`8b5d71ce`) | `countProseSentenceBoundaries` over-counted on `Mr./Dr./Prof.` etc. Negative-lookbehind deny-list added (Mr/Mrs/Ms/Dr/Prof/St/Mt/Jr/Sr/i.e/e.g/vs/etc). Function exported and regression test asserts 12 cases including U.K./a.m. carve-outs |
| adv-004 | Major | **Fixed** (`8df540eb`) | Transfer fragment guard required all three predicates — let `"YES"`, `"OK"`, `"yes."`, `"?"`, `"!!"` through. Tightened to `tokenCount<=2 && (!hasTerminal || !hasCapital)` |
| adv-005 | Major | **Fixed** (`8df540eb`) | Sentinel regex in `tests/punctuation-p13-full-subject-quality.test.js` omitted `I've/I'll` patterns; passed vacuously while broken templates shipped. Sentinel now built from enumerated pronoun list |
| adv-006 | Major | **Fixed** (`8df540eb`) | `generatedDepth = constant` made `assertAttestationRuntimeCount` a tautology. Per-family depth field added to attestation + validator catches over-ships |
| adv-007 | Minor | **Fixed** (`8b5d71ce`) | Variety audit `transferRatioMax` tightened from 0.50 ("majority dominance") to 0.34 ("at most 2/6 transfer slots in a SmartSix"). Aggregate `transferTouchRatioMax: 0.75` added so transfer touches at most 75% of all sessions |
| adv-008 | Minor | **Fixed** (`8b5d71ce`) | Restored strict equality on `sentenceEndings.answerContractCoverageCount` (now exactly 36). Failure-detail check requires ALL THREE expected skills (comma_clarity, semicolon_list, hyphen) to appear, not "any one of" |
| adv-009 | Minor | **Fixed** (`8b5d71ce`) | Embedded-count cross-check added: `PUNCTUATION_CURRENT_RELEASE_ID` parsed and the embedded count asserted equal to `runtime.items.length`. A bogus ID `…-9999-…` would now fail even though it matches the format regex |
| adv-010 | Minor | **Fixed** (`8df540eb`) | Fragment-attack test only covered 3 of 14 transfer families. Stratified to cover all 14 plus the bypass attack set |

The contract auditor returned `PASS` or `PASS-WITH-NOTES` on Gates 1–7 and `BLOCKED` on Gate 8, which led to the creation of `scripts/punctuation-qg-p14-live-smoke.mjs` + `scripts/validate-punctuation-qg-p14-live-evidence.mjs` (commit `2438dee7`).

## Existing learner progress namespace bump

Bumping `PUNCTUATION_CURRENT_RELEASE_ID` invalidates all existing learner punctuation progress at deploy time. This is the documented cost of the namespace bump and was accepted in the contract decisions section. Surface this to parent / admin hubs in deploy comms.

## Pre-deploy verification status

| Check | Result |
| :--- | :--- |
| `npm test` | 53,069 / 53,083 pass; 4 pre-existing grammar-doc failures from main commit `693c48f5` (unrelated to P14); 10 skipped |
| `npm run check` | green |
| `npm run capacity:verify-evidence` | green (5 rows checked) |
| Branch pushed | `punctuation-p14` → `origin/punctuation-p14` |
| PR opened | #845 |
| Adversarial review | code reviewer + contract auditor, both critical/major findings fixed |

## Required artefacts (contract checklist)

| Artefact | Path | Status |
| :--- | :--- | :--- |
| Quality-hardening report | `docs/plans/.../p14/punctuation-p14-quality-hardening-report.md` | This file |
| Source audit | `docs/plans/.../p14/punctuation-p14-source-audit.json` | Present |
| Session-variety audit | `docs/plans/.../p14/punctuation-p14-session-variety-audit.json` | Present |
| Star-pacing simulation | `docs/plans/.../p14/punctuation-p14-star-pacing-simulation.json` | Present |
| Reviewer samples | `docs/plans/.../p14/punctuation-p14-reviewer-samples.md` | Present |
| Patch test output | `docs/plans/.../p14/p14-patch-apply-test-output.txt` | Present |
| Production smoke | `reports/punctuation/punctuation-qg-p14-production-smoke.json` | **Pending deploy** |

## Next actions

1. Merge PR #845 to `main` (or push from worktree to trigger CI pipeline).
2. Cloudflare deploy via `wrangler deploy` (worker + pages).
3. Run production smoke against `https://ks2.eugnel.uk`:
   ```bash
   npm run smoke:production:punctuation:p14
   npm run verify:punctuation-qg:p14-live
   ```
4. If the smoke + validator both pass: stamp this report's verdict to `FULL_PUNCTUATION_SUBJECT_CERTIFIED`, update the front-matter `verdict` field, and commit.
5. Communicate the learner-progress namespace bump to parent + admin hub stakeholders.
