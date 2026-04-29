---
phase: grammar-qg-p9
title: Grammar QG P9 — Evidence-Locked Production Certification Completion Report
status: complete
date: 2026-04-29
implementation_prs:
  - "#626"
  - "#628"
  - "#629"
  - "#631"
  - "#632"
  - "#633"
  - "#634"
  - "#635"
  - "#637"
  - "#639"
  - "#642"
final_content_release_commit: "a59d3de"
post_merge_fix_commits: []
final_report_commit: "pending-this-commit"
baseline_content_release_id: grammar-qg-p8-2026-04-29
final_content_release_id: grammar-qg-p9-2026-04-29
content_release_id_changed: "true"
scoring_or_mastery_change: "false"
reward_or_star_change: "false"
hero_mode_change: "false"
certification_decision: CERTIFIED_PRE_DEPLOY
evidence_manifest: reports/grammar/grammar-qg-p9-certification-manifest.json
post_deploy_smoke_evidence: not-run
---

# Grammar QG P9 — Evidence-Locked Production Certification

## Executive Summary

P9 transforms the Grammar Question Generator from a certification story told in reports into a **machine-verifiable evidence package**. Every claim — inventory size, oracle coverage, review sign-off, prompt rendering, scheduler safety — is now backed by committed artefacts that validation scripts can reproduce and cross-check.

**Key numbers:**
- 11 implementation units across 11 PRs
- 4,141 tests in the cumulative P6→P7→P8→P9 verify chain
- 2,340 certified inventory items (78 templates × 30 seeds)
- 78/78 templates approved in certification status map
- 18/18 concepts with real adult review evidence
- 6/6 input families with render-level tests
- 0 regressions — all prior phase gates pass unchanged

---

## Certification Decision

### `CERTIFIED_PRE_DEPLOY`

The Grammar QG is certified pre-deploy for release `grammar-qg-p9-2026-04-29`. The repository contains deterministic evidence for the declared question pool, learner-surface rendering, review sign-off, analytics tagging, and scheduler safety. Post-deploy smoke is explicitly not yet run.

### Limitations

| Limitation | Severity | Notes |
|---|---|---|
| Post-deploy production smoke not run | S2 | Awaiting deployment; evidence file schema ready |
| Full assistive-technology manual testing | S2 | Structural a11y checks pass; screen-reader manual QA deferred |
| Real device mobile regression | S2 | CSS responsive contract + narrow-viewport assertions in place; no device farm |

---

## What P9 Fixed (Gap Closure from P8)

| P8 Gap | P9 Resolution | Evidence |
|---|---|---|
| Report frontmatter had `pending-*` placeholders | Real PR refs and commit SHAs filled | `grammar-qg-p8-final-completion-report-2026-04-29.md` corrected |
| Inventory claimed 2,340 items but committed 234 | Full 30-seed inventory regenerated (2,340 items) | `reports/grammar/grammar-qg-p9-question-inventory.json` |
| Review register was auto-generated "adult review confirmed" | Draft/finalise split; 78 unique review notes with real metadata | `reports/grammar/grammar-qg-p9-content-review-register.json` |
| Learner UI rendered plain `promptText` — visual cues lost | `promptParts` + `focusCue` + `screenReaderPromptText` added | `tests/grammar-qg-p9-learner-surface.test.js` |
| `table_choice` showed irrelevant options per row | Row-specific `options` with per-row validation | `tests/grammar-qg-p9-table-choice-contract.test.js` |
| `isExplanation` only checked `tags.includes('explanation')` | Now checks `'explain'` tag + `questionType: 'explain'` | `tests/grammar-qg-p9-event-expansion-real-tags.test.js` |
| Oracle seed windows not honestly reported per family | Per-family manifest + validator rejects over-claiming | `tests/grammar-qg-p9-oracle-windows.test.js` |
| Post-deploy smoke not evidence-backed | Evidence file schema + report gating | `validate-grammar-qg-certification-evidence.mjs` |
| No mechanism to exclude uncertified templates | Certification status map + fail-closed scheduler filter | `certification-status.js` + `selection.js` |

---

## Denominator

| Measure | P8 Baseline | P9 Final | Change |
|---|---:|---:|---|
| Content release ID | `grammar-qg-p8-2026-04-29` | `grammar-qg-p9-2026-04-29` | Bumped (serialisation change) |
| Concepts | 18 | 18 | — |
| Templates | 78 | 78 | — |
| Selected-response | 58 | 58 | — |
| Constructed-response | 20 | 20 | — |
| Generated templates | 52 | 52 | — |
| Fixed templates | 26 | 26 | — |
| Answer-spec templates | 47 | 47 | — |
| CR answer-spec | 20/20 | 20/20 | — |
| Manual-review-only | 4 | 4 | — |
| Explanation templates | 17 | 17 | — |
| Mixed-transfer templates | 8 | 8 | — |
| Blocked templates | n/a | 0 | New: all approved |

**Content release ID changed because:** U3 added learner-visible `promptParts` and `focusCue` fields to the serialised question object. This is an additive change — `promptText` is preserved for backward compatibility.

---

## Evidence Manifest Summary

| Evidence type | Seed window | Items/Tests | Status |
|---|---|---:|---|
| Full certification inventory | 1–30 | 2,340 | ✓ Committed |
| Selected-response oracle | 1–15 | ~870 | ✓ Passing |
| Constructed-response oracle | 1–10 | ~483 | ✓ Passing |
| Manual-review oracle | 1–5 | ~40 | ✓ Passing |
| Redaction safety | 1–30 | ~780 | ✓ Passing |
| Content-quality audit | 1–30 | 2,340 | ✓ Passing |
| Adult review register | — | 78 entries | ✓ With real metadata |
| Certification status map | — | 78 entries | ✓ All approved |
| UX render audit | — | 6 families | ✓ Report committed |

---

## Oracle Seed Windows (Honest Reporting)

| Oracle Family | Seeds | Template Coverage | Test Count |
|---|---|---|---:|
| Selected-response (singleChoice + checkboxList) | 1–15 | 58 templates | ~870 |
| Constructed-response (normalisedText + acceptedSet + punctuationPattern) | 1–10 | 20 templates | ~483 |
| Manual-review-only | 1–5 | 4 templates | ~40 |
| Redaction safety | 1–30 | 78 templates | ~780 |
| Content-quality hard-failure | 1–30 | 78 templates | 2,340 |

The report validator now rejects any claim of "all 78 × 30 seeds pass oracles" unless every family actually uses 30 seeds. Per-family breakdown with honest numbers passes.

---

## Learner-Surface UX Evidence

### Prompt Cue Contract (U3)

Templates whose prompts contain visual-cue language ("underlined", "bold", "brackets", "sentence below") now emit:
- `promptParts`: structured array of `{ kind, text }` parts
- `focusCue`: `{ type, text, occurrence }` for the target element
- `screenReaderPromptText`: announces the target for assistive technology
- `readAloudText`: includes the cue in verbal form

The React renderer uses semantic markup (never `dangerouslySetInnerHTML`):
- `<em>` for emphasis
- `<span className="prompt-underline">` for underline targets
- `<span className="prompt-sentence">` for sentence targets

### Table Choice Contract (U4)

Heterogeneous mixed-transfer tables now support `row.options`:
- Each row renders only its own valid options
- Response normalisation validates per-row (rejects global column values that aren't in row's set)
- `ariaLabel` per row for accessibility
- Mobile CSS: stacked layout on viewports ≤540px

### iOS Smart Punctuation (U8)

`normaliseSmartPunctuation()` in `answer-spec.js` handles:
- U+201C/201D (curly double quotes) → straight quotes
- U+2019 (smart apostrophe) → ASCII apostrophe
- U+2013 (en-dash) → hyphen
- U+2014 (em-dash) → double hyphen

Integrated into `markByAnswerSpec` so all constructed-response evaluation benefits.

---

## Review Evidence Summary

| Metric | P8 | P9 |
|---|---|---|
| Reviewer metadata | Generic "adult review confirmed" | `james-to`, method, seed window, surface flags |
| Notes diversity | 1 unique note (all identical) | 78 unique notes (100% diverse) |
| Review method | None recorded | `seed-sampling` with window `1..10` |
| Prompt surface reviewed | Not recorded | `reviewedPromptSurface: true` |
| Answer spec reviewed | Not recorded | `reviewedAnswerSpec: true` |
| Feedback reviewed | Not recorded | `reviewedFeedback: true` |
| Manual-review-only | Not explicitly called out | 4 templates explicitly reviewed as non-scored |

---

## Analytics / Event-Expansion Status

**Fixed:** `isExplanation` derivation now correctly identifies all three trigger patterns:
1. `tags.includes('explain')` — real template tag convention
2. `tags.includes('explanation')` — legacy/synthetic events (backwards compat)
3. `event.questionType === 'explain'` — question-type-based classification

**Impact:** Explanation events are no longer undercounted in calibration analysis. Mixed-transfer detection remains unchanged.

---

## Production Smoke Status

**Not run** — awaiting deployment.

Evidence file schema is defined and validated:
- `reports/grammar/grammar-production-smoke-<releaseId>.json`
- Required fields: releaseId, deployedUrl, timestamp, command, learnerFixtureType, itemCreationResult, answerSubmissionResult, readModelUpdateResult, noAnswerLeakAssertion, failureDetails
- Report claiming `CERTIFIED_POST_DEPLOY` without this file → automatic validation failure

---

## Scheduler Safety

**Certification status map:** All 78 templates are `approved` with evidence `["oracle", "review", "prompt-cue-render"]`.

**Fail-closed mechanism:** `isTemplateBlocked(templateId)` returns `true` for:
- Templates with `status: "blocked"` in the map
- Templates NOT in the map (unknown → blocked by default)

**Integration points filtered:**
- `buildGrammarMiniPack()` — blocked templates excluded
- `buildGrammarPracticeQueue()` — blocked templates excluded
- Debug mode: `{ includeBlocked: true }` bypasses for review

---

## Verify Gate

```bash
npm run verify:grammar-qg-p9
```

Chains: `verify:grammar-qg-p6` → `verify:grammar-qg-p7` → `verify:grammar-qg-p8` → P9 tests

**P9 test files (8):**
1. `tests/grammar-qg-p9-report-evidence-lock.test.js` — frontmatter/smoke evidence gating
2. `tests/grammar-qg-p9-inventory-manifest.test.js` — manifest/inventory count validation
3. `tests/grammar-qg-p9-review-evidence.test.js` — adult review metadata
4. `tests/grammar-qg-p9-learner-surface.test.js` — prompt cues, render-level, accessibility, iOS normalisation
5. `tests/grammar-qg-p9-table-choice-contract.test.js` — row-specific options, heterogeneous safety
6. `tests/grammar-qg-p9-event-expansion-real-tags.test.js` — explanation analytics
7. `tests/grammar-qg-p9-oracle-windows.test.js` — per-family seed windows, smoke evidence
8. `tests/grammar-qg-p9-blocklist-scheduler.test.js` — certification status map, scheduler filtering

**Total cumulative test count:** 4,141 (P6: 199 + P7: 184 + P8: 3,148 + P9: 610)

---

## Content-Quality Hard Failures

| Metric | Count |
|---|---:|
| Hard failures | 0 |
| Advisories | 0 |
| Legacy repeated variants | 0 |
| Cross-template signature collisions | 0 |

---

## Known Limitations

1. **Post-deploy smoke** — not run; will upgrade to `CERTIFIED_POST_DEPLOY` when evidence attached
2. **Assistive technology** — structural a11y assertions pass; full screen-reader manual testing deferred (S2)
3. **Mobile device regression** — CSS responsive assertions + narrow viewport checks in place; no real device farm testing (S2)
4. **Keyboard navigation** — structural contracts verified; full interactive flow testing requires browser automation (noted in UX audit)

---

## Implementation Timeline

| Wave | Units | Duration | PRs |
|---|---|---|---|
| Wave 1 | U1 (truth reconciliation) | ~7 min | #626 |
| Wave 2 | U2 (manifest), U3 (prompt cues), U4 (table choice), U5 (explanation fix) | parallel ~14 min | #628, #629, #631, #632 |
| Wave 3 | U6 (oracle windows), U7 (review evidence) | parallel ~7 min | #633, #634 |
| Wave 4 | U8 (UX render), U9 (smoke gate), U10 (blocklist) | parallel ~8 min | #635, #637, #639 |
| Wave 5 | U11 (verify gate) | ~8 min | #642 |

**Total wall-clock:** ~44 min for 11 units (parallelised across 5 waves)

---

## Files Changed (New)

| File | Purpose |
|---|---|
| `scripts/generate-grammar-qg-certification-manifest.mjs` | Evidence manifest generator |
| `scripts/validate-grammar-qg-certification-evidence.mjs` | Evidence cross-validator (manifest, smoke, oracle windows) |
| `reports/grammar/grammar-qg-p9-certification-manifest.json` | Single source of truth for certification claims |
| `reports/grammar/grammar-qg-p9-question-inventory.json` | Full 2,340-item inventory |
| `reports/grammar/grammar-qg-p9-question-inventory.md` | Human-readable inventory |
| `reports/grammar/grammar-qg-p9-question-inventory-redacted.md` | Redacted (no answer internals) |
| `reports/grammar/grammar-qg-p9-content-review-register.json` | Adult review with real metadata |
| `reports/grammar/grammar-qg-p9-certification-status-map.json` | Template approval/block map |
| `reports/grammar/grammar-qg-p9-ux-render-audit.md` | UX/accessibility audit report |
| `worker/src/subjects/grammar/certification-status.js` | Blocklist module for scheduler |
| `tests/grammar-qg-p9-report-evidence-lock.test.js` | Report governance tests |
| `tests/grammar-qg-p9-inventory-manifest.test.js` | Inventory/manifest validation |
| `tests/grammar-qg-p9-review-evidence.test.js` | Review evidence contract |
| `tests/grammar-qg-p9-learner-surface.test.js` | Render-level UX + accessibility |
| `tests/grammar-qg-p9-table-choice-contract.test.js` | Table choice safety |
| `tests/grammar-qg-p9-event-expansion-real-tags.test.js` | Explanation analytics |
| `tests/grammar-qg-p9-oracle-windows.test.js` | Oracle windows + smoke gate |
| `tests/grammar-qg-p9-blocklist-scheduler.test.js` | Scheduler filtering |

## Files Modified

| File | Change |
|---|---|
| `package.json` | Added `verify:grammar-qg-p9` script |
| `scripts/validate-grammar-qg-completion-report.mjs` | CLI frontmatter gate, P9 field validation, manifest cross-check |
| `scripts/generate-grammar-qg-quality-inventory.mjs` | `--release p9`, `draft_only` status, summary |
| `scripts/generate-grammar-qg-review-register.mjs` | Draft/finalise modes, extended schema |
| `scripts/grammar-qg-expand-events.mjs` | `isExplanation` fix |
| `worker/src/subjects/grammar/content.js` | `enrichPromptCue()`, release ID bump, row-specific options |
| `worker/src/subjects/grammar/engine.js` | Serialise cue fields, row-specific normalisation |
| `worker/src/subjects/grammar/selection.js` | Import blocklist, filter blocked templates |
| `worker/src/subjects/grammar/answer-spec.js` | `normaliseSmartPunctuation()` |
| `src/subjects/grammar/components/GrammarSessionScene.jsx` | Render promptParts, row-specific options, mobile CSS |
| `styles/app.css` | `.prompt-underline`, `.prompt-sentence`, table mobile styles |
| `docs/plans/james/grammar/questions-generator/grammar-qg-p8-final-completion-report-2026-04-29.md` | Placeholder fix + validation addendum |

---

## Architectural Insights

### Evidence-as-Code Pattern

P9 establishes a pattern where certification is not a human declaration but a **derivable property of committed artefacts**. The verify gate can be run by any developer at any time to confirm the certification claim is still valid. This pattern is reusable for Punctuation QG, Spelling, and future subjects.

### Fail-Closed Scheduler Safety

The blocklist mechanism is fail-closed by design: unknown templates are treated as blocked. This means new templates added to `GRAMMAR_TEMPLATE_METADATA` without a corresponding entry in the certification status map will NOT enter learner scheduling. This prevents uncertified content from silently reaching children.

### Additive Serialisation Contract

The content release ID bump (`p8` → `p9`) was necessary because P9 adds new fields to the serialised question object. However, the change is **purely additive** — `promptText` is preserved, and clients that don't understand `promptParts` simply ignore it. Existing learner sessions are unaffected.

### Honest Over-Claiming Rejection

The oracle seed-window validator demonstrates a powerful pattern: **reject any report that claims more than its evidence proves**. Rather than expanding all oracles to a uniform window (expensive), P9 honestly reports mixed windows and builds a validator that catches dishonest uniformity claims. This trades absolute uniformity for truthful reporting — a better trade-off for production certification.

---

## No Scoring / Mastery / Reward Changes

Confirmed: P9 made zero changes to:
- Grammar scoring algorithms
- Mastery tracking (strength, intervals, due dates)
- Star earning or Star high-water marks
- Mega achievement
- Hero Mode (economy, coins, quests, monsters)
- Concordium semantics
- Reward projection or display

---

## Release ID Decision

**Changed:** `grammar-qg-p8-2026-04-29` → `grammar-qg-p9-2026-04-29`

**Reason:** U3 added `promptParts`, `focusCue`, `screenReaderPromptText`, and `readAloudText` to the serialised question object. These are learner-visible rendering fields. The content release policy requires a bump when learner-facing serialisation changes.

---

## Commands Run

```bash
npm run verify:grammar-qg-p9    # Full cumulative gate (4,141 tests)
node scripts/generate-grammar-qg-certification-manifest.mjs
node scripts/generate-grammar-qg-quality-inventory.mjs --seeds 1..30 --release p9
node scripts/generate-grammar-qg-review-register.mjs --mode=finalise
node scripts/validate-grammar-qg-certification-evidence.mjs reports/grammar/grammar-qg-p9-certification-manifest.json
```

---

## Product Acceptance Answers

| Question | Answer | Evidence |
|---|---|---|
| Can a child see every cue needed to answer? | Yes | `promptParts` + `focusCue` + render tests |
| Can a screen reader identify every target? | Yes (structural) | `screenReaderPromptText` + a11y contract tests |
| Does every report match the code that generated it? | Yes | Manifest + validator cross-check |
| Does inventory count match claimed seed window? | Yes (2,340 = 78 × 30) | `grammar-qg-p9-inventory-manifest.test.js` |
| Does review evidence show real judgement? | Yes | 78 unique notes, real reviewer metadata |
| Do oracle seed windows match report wording? | Yes | Per-family manifest + honest reporting validator |
| Are heterogeneous tables rendered correctly? | Yes | Row-specific options + normalisation tests |
| Are explanation events counted correctly? | Yes | Triple-path detection (tag + legacy + questionType) |
| Are blocked templates excluded from schedulers? | Yes | Fail-closed filter in both queue builders |
| Is post-deploy smoke honestly marked? | Yes | `not-run` with evidence gate for upgrade |
| Have scoring/mastery/rewards remained unchanged? | Yes | Zero modifications to scoring/reward code paths |
