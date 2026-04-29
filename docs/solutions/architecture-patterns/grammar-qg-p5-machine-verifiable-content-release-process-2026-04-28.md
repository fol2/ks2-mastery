---
title: "Grammar QG P5 — Machine-Verifiable Content Release: Deep-Seed Expansion, Content Linting, and Evidence-Traced Completion Reports"
date: 2026-04-28
category: architecture-patterns
module: grammar-qg
problem_type: architecture_pattern
component: tooling
severity: high
applies_when:
  - "Shipping content-heavy modules where the denominator matters (grammar, punctuation, spelling question generators)"
  - "Release reports risk overclaiming against code state"
  - "Deterministic generators need deep-seed testing to prove variety"
  - "Completion reports should be machine-checkable, not human-interpreted"
  - "Production smoke should produce traceable evidence artefacts"
tags:
  - grammar-qg
  - machine-verifiable-release
  - deep-seed-expansion
  - content-quality-linting
  - completion-report-validation
  - production-smoke-evidence
  - frozen-fixture
  - release-gate
---

# Grammar QG P5 — Machine-Verifiable Content Release: Deep-Seed Expansion, Content Linting, and Evidence-Traced Completion Reports

## Context

Grammar QG P1-P4 shipped quality improvements (78 templates, 18 concepts, mixed-transfer, explanation coverage), but the release process depended on human interpretation:

- Deep-seed analysis showed 12 generated families with < 8 unique prompts across 30 seeds (learners see repeats)
- Completion reports could claim values no script verified
- No content-quality linting existed (a non-registered misconception `possession_hyphen_transfer_confusion` went undetected through P4)
- Production smoke results were not captured as machine-readable evidence

P5 converted this manually interpreted content release into a machine-verifiable release process. The structural guarantee: overclaiming is impossible because the report validator runs live audits against the code — if the code does not match the claim, validation fails.

## Guidance

### 1. One-command release gate pattern

Compose multiple audit scripts into a single verification command that proves denominator, depth, collisions, answer-spec completeness, selection reachability, and engine behaviour in one invocation.

```json
{
  "audit:grammar-qg": "node scripts/audit-grammar-question-generator.mjs --json",
  "audit:grammar-qg:deep": "node scripts/audit-grammar-question-generator.mjs --deep --json",
  "verify:grammar-qg": "npm run audit:grammar-qg && npm run audit:grammar-qg:deep && [content-quality audit] && [test suite]"
}
```

A single `npm run verify:grammar-qg` proves the full release gate. No manual step can be skipped or interpreted differently by different reviewers.

### 2. Deep-seed expansion pattern

When deep-seed analysis reveals families with insufficient variety (< 8 unique prompts across 30 seeds), expand case banks rather than creating new template IDs.

- 12 families expanded from 3-7 unique variants to 9-12 unique variants over seeds 1..30
- Use `pickBySeed(seed, cases)` with double-modulo: `((seed - 1) % N + N) % N`
- Never mulberry32 first-call for banks < 20 items (nearby seeds cluster)
- Add `qg-p5` tag to expanded templates for strict enforcement tier
- No new template IDs — case-bank expansion only

```javascript
// WRONG: mulberry32 clusters for nearby seeds on small banks
const idx = Math.floor(mulberry32(seed)() * cases.length);

// CORRECT: deterministic modulo guarantees distinct for consecutive seeds
const idx = ((seed - 1) % cases.length + cases.length) % cases.length;
const item = cases[idx];
```

The double-modulo form handles all edge cases including seed=0 (JavaScript negative remainder produces `arr[-1] = undefined` with naive `seed % N`).

### 3. Content-quality linting as hard gate

Create a dedicated content-quality audit script that catches authoring-time errors before they reach production.

Script: `scripts/audit-grammar-content-quality.mjs`

**Hard-fail (block release):**
- Unknown misconception IDs (non-registered misconceptions pass silently without linting)
- Duplicate options within a single question
- Multiple correct answers when exactly one is expected
- Missing correct answer from option set
- Raw answer equals accepted answer (redundant normalisation)

**Advisory (warn but do not block):**
- Reversed quotes in distractors
- `-ly` hyphenation inconsistencies
- Transfer feedback completeness gaps

The hard-fail tier catches the class of bug exemplified by `possession_hyphen_transfer_confusion` — a misconception ID that was never registered but was referenced in template feedback, meaning learners would never receive the intended explanatory feedback.

### 4. Machine-verifiable completion reports

Script: `scripts/validate-grammar-qg-completion-report.mjs`

Key design decisions:

- Runs live audits programmatically (not against saved JSON — prevents stale-data masking)
- Compares 16+ claimed fields against actual output
- Validates smoke evidence file existence
- Distinguishes repository vs post-deploy smoke claims
- CRLF-safe regex for Windows environments

```javascript
// Claims "post-deploy smoke passed" -> evidence file must exist
if (claims.postDeploySmoke === 'passed') {
  const evidencePath = `reports/grammar/grammar-production-smoke-${releaseId}.json`;
  if (!existsSync(evidencePath)) {
    failures.push({ field: 'postDeploySmoke', expected: 'evidence file exists', actual: 'file missing' });
  }
}
```

The validator does not compare against saved audit output — it runs the audit live. This means a report written against stale code will fail when the code changes, preventing a class of regression where reports are "accurate at time of writing" but misleading at merge time.

### 5. Production-smoke evidence capture

Structure production smoke as machine-readable artefacts with clear provenance:

- `--json` flag writes structured artefact to `reports/grammar/grammar-production-smoke-<releaseId>.json`
- `--evidence-origin` flag (not `--origin` — avoids collision with HTTP target URL)
- Artefact includes: ok, origin, contentReleaseId, tested templates, per-phase results, timestamp, commitSha

The `--evidence-origin` naming is deliberate: `--origin` collides with the HTTP target URL parameter that tells the smoke script which deployment to hit. The evidence-origin field records where the evidence was produced (local, CI, production).

### 6. Frozen fixture strategy

Each release gets its own baseline fixture pair (oracle + functionality-completeness). Generated from executable audit output, never hand-written.

```javascript
// P5 baseline: generated from audit, includes deep fields
const audit = buildGrammarQuestionGeneratorAudit({ seeds: [1,2,3], deepSeeds: range(1,30) });
writeFixture('grammar-qg-p5-baseline.json', audit);

// Test: P4 baseline remains frozen (historical proof)
const p4 = readGrammarQuestionGeneratorP4Baseline();
assert.strictEqual(p4.templateCount, 78); // pinned, never changes
```

Rules:
- P1-P4 baselines remain frozen — never edited
- P5 fixture includes deep-audit fields (deepSampledSeeds, generatedCaseDepthByFamily)
- Generated from executable audit output, never hand-written
- Historical baselines prove no regression across releases

## Why This Matters

- **Overclaiming is structurally impossible:** The report validator runs live audits — if the code does not match the claim, validation fails. There is no path where a stale or inflated claim passes.
- **Depth problems become visible:** 30-seed deep audit catches repeat patterns invisible in the default 3-seed window. A family with 6 case variants looks fine at seeds 1-3 but produces visible learner repeats at scale.
- **Content bugs are caught at authoring time:** Unknown misconception IDs fail immediately during the content-quality lint, not after deployment when learners see missing feedback.
- **Evidence culture is enforced:** Post-deploy smoke is either evidenced (JSON artefact exists with provenance) or explicitly marked as not run — no ambiguity. There is no third state where someone claims it passed without a trace.
- **Release gates are composable:** Each audit script runs independently with `--json` output. The verify command composes them. CI can run any subset. New checks slot in without modifying existing scripts.

## When to Apply

| Pattern | Apply when... |
|---|---|
| One-command release gate | Multiple audit dimensions must all pass before a content release ships |
| Deep-seed expansion | A deterministic generator uses seed-based selection and needs variety proof across 30+ seeds |
| Content-quality linting | Template authoring references external registries (misconception IDs, concept IDs, tag sets) |
| Machine-verifiable completion reports | A release report claims metrics that a script can verify |
| Production-smoke evidence capture | Post-deploy verification must produce a traceable artefact, not just a human's "it works" |
| Frozen fixture strategy | A content module ships iterative releases that must never regress earlier guarantees |

## Examples

**Before/after: content-quality bug detection**

```
BEFORE (P4 — non-registered misconception goes undetected):
  template: comma_splice_possessive_confusion
  feedback.misconception: "possession_hyphen_transfer_confusion"  // typo, not in registry
  Result: learner sees generic feedback instead of targeted explanation
  Detected: never (no lint, no test, no runtime error)

AFTER (P5 — hard-fail at authoring time):
  npm run audit:grammar-content-quality
  ERROR: Unknown misconception ID "possession_hyphen_transfer_confusion"
    in template comma_splice_possessive_confusion
    Registered misconceptions: [...list...]
  Exit code: 1
```

**Before/after: completion report validation**

```
BEFORE (P4 — report claims are human-interpreted):
  Completion report states: "78 templates, 18 concepts, 100% explanation coverage"
  Verification: reviewer reads report, trusts the numbers
  Risk: numbers were accurate when written but code changed since

AFTER (P5 — report claims are machine-verified):
  npm run validate:grammar-qg-completion-report
  Running live audit... templateCount=78 ✓, conceptCount=18 ✓
  Checking explanation coverage... 78/78 ✓
  Checking deep-seed depth... all families >= 8 unique ✓
  Checking smoke evidence... reports/grammar/grammar-production-smoke-qg-p5.json exists ✓
  All 16 claims validated.
```

**Before/after: deep-seed variety**

```
BEFORE (family with 6 case variants, seeds 1..30):
  Seed  1: "The dog's bone was buried." (case 2)
  Seed  2: "The dog's bone was buried." (case 2)
  Seed  3: "The cat's whiskers twitched." (case 3)
  ...
  Unique prompts across 30 seeds: 6 (repeats visible to learners)

AFTER (family expanded to 12 case variants, seeds 1..30):
  Seed  1: "The dog's bone was buried." (case 0)
  Seed  2: "The cat's whiskers twitched." (case 1)
  Seed  3: "James's bicycle had a flat tyre." (case 2)
  ...
  Unique prompts across 30 seeds: 12 (no learner-visible repeats within typical cohort)
```

## Related

- **Seeded PRNG collision pattern:** `docs/solutions/logic-errors/seeded-prng-index-collision-pickbyseed-2026-04-28.md` — detailed analysis of mulberry32 clustering for small banks and the double-modulo fix that P5 applies across all expanded families.
- **Grammar QG P4 (predecessor):** Grammar QG P4 shipped deterministic depth and mixed-transfer expansion. P5 proves P4's claims are machine-verifiable and fixes the one latent content-quality bug (non-registered misconception).
- **Grammar Phase 7 consolidation:** `docs/solutions/architecture-patterns/grammar-p7-quality-trust-consolidation-and-autonomous-sdlc-2026-04-27.md` — P7's frozen state-seeding fixtures pattern parallels P5's frozen fixture strategy for audit baselines.
- **Sys-Hardening P4 evidence culture:** `docs/solutions/architecture-patterns/sys-hardening-p5-certification-closure-d1-latency-and-evidence-culture-2026-04-28.md` — the production-evidence artefact pattern (JSON files with provenance metadata) originated in sys-hardening and is adopted by P5 for content-specific smoke.
- **Punctuation QG (sibling module):** Punctuation question generator will adopt the same release-gate, content-quality linting, and deep-seed expansion patterns established by Grammar QG P5.
