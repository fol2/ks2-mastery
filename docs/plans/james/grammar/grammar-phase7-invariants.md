---
title: "Grammar Phase 7 — Invariants (addendum)"
type: invariants
status: locked
date: 2026-04-27
plan: docs/plans/2026-04-27-003-feat-grammar-phase7-qol-debug-hardening-plan.md
unit: U4
---

# Grammar Phase 7 — Invariants (addendum)

This document extends the Phase 6 invariants (`docs/plans/james/grammar/grammar-phase6-invariants.md`, 6 invariants locked) with six new invariants that cover the QoL, debug-hardening, and child-copy fixes shipped in Phase 7. The six fixes address child-facing summary shape, Writing Try independence, bank filter labelling, debug-surface isolation, shared module dependency direction, and legacy-stage elimination.

**Phase 4 invariants 1--12 remain enforced.** Phase 5 invariants 1--15 remain enforced. Phase 6 invariants 1--6 remain enforced. Phase 7 extends but never weakens any earlier set. Where a Phase 7 invariant overlaps with a prior-phase invariant, the Phase 7 invariant is the stricter or more specific statement.

---

### P7-1. Child summary monster progress is Star-based

Child-facing round summary renders Stars (`X / 100 Stars`) for each active Grammar monster, not raw `mastered/total` concept counts. `grammarSummaryCards` returns monster-progress entries with `{ monsterId, stars, starMax, stageName }` shape.

**Why:** Children understand "42 / 100 Stars" across every monster without needing to know concept counts. Exposing raw concept counts on the summary screen would contradict the Phase 5 universal 100-Star scale and confuse learners who see Stars everywhere else.

**Enforced by:** `tests/grammar-ui-model.test.js` (P7-U2 monster-progress shape assertions).

---

### P7-2. Writing Try availability does not depend on AI capability

`buildGrammarDashboardModel` returns `writingTryAvailable: true` regardless of `aiEnrichment.enabled`. Writing Try is a non-scored transfer-writing lane, not an AI feature.

**Why:** Writing Try is a pedagogical surface that lets learners practise applying grammar concepts in their own writing. It does not require AI enrichment — the value comes from the act of writing, not from AI feedback. Gating it behind an AI toggle would silently remove a learning lane for learners whose accounts have AI disabled.

**Enforced by:** `tests/grammar-ui-model.test.js` (P7-U3 Writing Try tests), `tests/grammar-phase5-invariants.test.js` (P7-U4 dashboard model pin).

---

### P7-3. Grammar Bank "Due" filter is renamed to child-safe label

`GRAMMAR_BANK_STATUS_CHIPS` entry for `id: 'due'` uses label `'Practise next'`, not `'Due'`. The underlying filter logic (`grammarBankFilterMatchesStatus`) is unchanged — it matches `needs-repair || building`.

**Why:** "Due" is an internal scheduling term that carries no meaning for a child. "Practise next" communicates the same intent in child-safe language. The filter logic is unchanged so that existing telemetry and Worker routing continue to function identically.

**Enforced by:** `tests/grammar-ui-model.test.js` (P7-U3 status chip label pin), `tests/grammar-phase5-invariants.test.js` (P7-U4 chip label pin).

---

### P7-4. Debug surfaces are adult/admin/test-only

No debug, Worker, projection, denominator, or read-model terminology appears on child-facing surfaces. `GRAMMAR_CHILD_FORBIDDEN_TERMS` sweep enforces this.

**Why:** Debug terminology leaking into child surfaces undermines trust. A child who sees "projection", "denominator", or "Worker" on their grammar dashboard has been exposed to an implementation detail that confuses rather than helps. The forbidden-term sweep is a zero-tolerance gate that catches terminology leaks before they reach production.

**Enforced by:** `tests/grammar-phase3-child-copy.test.js`, `tests/grammar-phase5-invariants.test.js` (forbidden-term pin).

---

### P7-5. Shared Grammar Star module dependency direction is acyclic

`shared/grammar/grammar-stars.js` has zero imports from `src/`. Concept-to-monster data lives in `shared/grammar/grammar-concept-roster.js`, imported by both the shared Star module and the platform mastery layer.

**Why:** The shared Star module is consumed by both the client and the Worker. If it imported from `src/`, the Worker build would pull in platform-specific code (React, DOM, router), breaking the shared contract. The acyclic dependency direction — `shared/` never imports `src/` — is a structural invariant that keeps the module boundary clean.

**Enforced by:** `tests/grammar-phase5-invariants.test.js` (P7 import-path pin).

---

### P7-6. No child surface uses legacy `stage` for Grammar monster display

Child-facing Grammar UI components consume Star fields (`stars`, `starMax`, `stageName`, `displayStage`) from `progressForGrammarMonster` or `buildGrammarMonsterStripModel`, not the legacy `stage` (0-4) field.

**Why:** The legacy `stage` field (0 = New, 1 = Egg, 2 = Hatch, 3 = Evolve, 4 = Mega) was the Phase 4 display mechanism. Phase 5 replaced it with Star-based thresholds that derive the stage name from the Star count. Child surfaces that read the legacy `stage` field would bypass the Star derivation and display stale or inconsistent stage names, breaking the 100-Star visual contract.

**Enforced by:** `tests/grammar-phase5-invariants.test.js` (P7 Star-field pin).

---

## Phase 4 + Phase 5 + Phase 6 invariant preservation

All twelve Phase 4 invariants, all fifteen Phase 5 invariants, and all six Phase 6 invariants remain enforced without weakening. Phase 7 specifically preserves:

- **P4 invariant 7** (denominator freeze: `GRAMMAR_AGGREGATE_CONCEPTS.length === 18`)
- **P4 invariant 11** (Concordium is never revoked post-secure) -- unchanged
- **P5 invariant 6** (Stars are monotonically non-decreasing) -- unchanged
- **P5 invariant 14** (no contentReleaseId bump) -- Phase 7 ships zero release-id bumps
- **P6-1** (production attempt shape is primary contract) -- unchanged
- **P6-4** (sub-secure Stars persist via starHighWater at evidence time) -- unchanged

---

## How reviewers cite this document

A Phase 7 review comment that flags a breach should cite the invariant number (e.g., "breach of P7-3 -- Grammar Bank 'Due' filter is renamed to child-safe label") so that the discussion thread maps back to the same contract the worker read when writing the unit.

If a future requirements change necessitates relaxing an invariant, the relaxation must ship in a dedicated PR that (a) updates this document, (b) updates the enforcing test, and (c) ships the compensating migration -- never as a silent side effect of an implementation unit.

---

## Question-Generator P1 addendum

This addendum records the additional contracts introduced by `docs/plans/james/grammar/questions-generator/grammar-qg-p1.md`. It does not weaken any Phase 4, Phase 5, Phase 6, or Phase 7 invariant. The important change is that QG P1 intentionally bumps the Grammar content release to `grammar-qg-p1-2026-04-28`, so the Phase 7 "no contentReleaseId bump" note remains true for Phase 7 itself but no longer describes the current Grammar content release.

### QG-P1-1. Generated score-bearing content stays deterministic and teacher-authored

QG P1 templates are deterministic `createGrammarQuestion({ templateId, seed })` families. Runtime AI remains enrichment-only and must not author or mark score-bearing Grammar questions.

**Enforced by:** `tests/grammar-question-generator-audit.test.js`, `tests/grammar-engine.test.js`, `tests/grammar-answer-spec-audit.test.js`.

### QG-P1-2. New generated templates require typed answer contracts

Every QG P1 score-bearing template declares a validated `answerSpec`; legacy inline markers remain supported only for pre-existing content. Learner read models must not expose the answer spec, golden answers, or near-miss bank.

**Enforced by:** `tests/grammar-answer-spec.test.js`, `tests/grammar-answer-spec-audit.test.js`, `tests/grammar-production-smoke.test.js`.

### QG-P1-3. Selector variety uses safe generated variant metadata

Generated attempts may store `generatorFamilyId` and `variantSignature` internally so the selector can penalise repeated generated surfaces. These fields are server-only and must not appear in child, parent, admin, feedback, or summary read models.

**Enforced by:** `tests/grammar-selection.test.js`, `tests/grammar-engine.test.js`, `tests/grammar-production-smoke.test.js`, `tests/redaction-access-matrix.test.js`.

### QG-P1-4. Content release and reward release calculations are release-aware

Grammar concept-secured events carry the current content release in their mastery keys. Reward-state transition calculations must use that same release id when determining whether direct and aggregate monster events should emit.

**Enforced by:** `tests/worker-grammar-subject-runtime.test.js`.

### QG-P1-5. Adult/operator diagnostics stay safe

Adult and admin evidence may expose safe generator coverage counts, thin-pool warnings, answer-spec template counts, and question-type coverage. They must not expose raw validators, answer specs, accepted answers, typed learner responses, or hidden generator internals.

**Enforced by:** `tests/hub-read-models.test.js`, `tests/grammar-stats-rename.test.js`, `tests/grammar-production-smoke.test.js`.
