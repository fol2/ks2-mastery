---
title: "Grammar QG P12 — Production Evidence Lock and Live Certification"
type: feat
status: active
date: 2026-04-30
origin: docs/plans/james/grammar/questions-generator/grammar-qg-p12.md
---

# Grammar QG P12 — Production Evidence Lock and Live Certification

## Overview

Lock the Grammar QG P11 content release (`grammar-qg-p11-2026-04-30`) to production-certified status by regenerating all evidence artefacts under P11 identity, refactoring the validator to read artefact paths from the manifest instead of hardcoded P10 filenames, updating package release gates, and producing the final certification report. Production smoke evidence requires live deployment and is deferred.

---

## Problem Frame

P11 fixed learner-facing prompt-cue and read-aloud bugs but was never production-certified because its evidence artefacts still carry P10 identity, the validator hardcodes P10 paths, and no production smoke evidence exists. The platform serves children — evidence must be truthful, reproducible, and deployable rather than merely "promising".

---

## Requirements Trace

- R1. One command validates the release currently in code (P11), not P10
- R2. The command fails if any artefact says P10 while code says P11 (unless explicitly historical)
- R3. Final report has no placeholder frontmatter
- R4. Evidence manifest names every artefact used by the release gate
- R5. Validator reads artefact paths from manifest, not hardcoded P10 filenames
- R6. Semantic prompt-cue audit passes 2,340 items against P11 code
- R7. Scheduler status map covers all 78 templates
- R8. Production smoke proves deployed Worker serves P11 release (DEFERRED: requires deployment)
- R9. Report status remains CERTIFIED_PRE_DEPLOY until production smoke exists
- R10. No reward, scoring, mastery or Hero Mode files change

---

## Scope Boundaries

- No new Grammar templates
- No scoring, mastery, Stars, Mega, Hero Mode, Hero Coins, Concordium or monster changes
- No cosmetic UI work
- P10 artefacts remain in repo as historical; they are not deleted

### Deferred to Follow-Up Work

- **Production smoke evidence (U5)**: DEFERRED: requires human — live deployment to `https://ks2.eugnel.uk` needed before smoke can run. The script infrastructure (`grammar-production-smoke.mjs`) is ready; only execution against a deployed Worker is missing.

---

## Context & Research

### Relevant Code and Patterns

- `scripts/validate-grammar-qg-certification-evidence.mjs` (927 lines) — the validator with hardcoded P10 paths at lines 600, 634, 710, 741-742, 833
- `scripts/generate-grammar-qg-certification-manifest.mjs` — derives phase from release ID, outputs to `grammar-qg-${phase}-certification-manifest.json`
- `scripts/generate-grammar-qg-render-inventory.mjs` — hardcodes `grammar-qg-p10-` output filenames at line 206
- `scripts/generate-grammar-qg-quality-register.mjs` — quality register with 14-field entries per template
- `scripts/audit-grammar-distractor-quality.mjs` — distractor quality audit with S0/S1 severity
- `scripts/generate-grammar-marking-matrix.mjs` — 9 variant categories per constructed-response template
- `scripts/grammar-production-smoke.mjs` (623 lines) — supports `--json` and `--evidence-origin` flags; derives release ID from `GRAMMAR_CONTENT_RELEASE_ID` and hardcodes output path (needs `--release-id` and `--out` additions in U5)
- `reports/grammar/grammar-qg-p10-certification-manifest.json` — current P10 manifest (different shape from P12 contract requirement)
- `worker/src/subjects/grammar/content.js:8281` — `GRAMMAR_CONTENT_RELEASE_ID = 'grammar-qg-p11-2026-04-30'`

### Institutional Learnings

- The P10 certification cycle established the render-inventory + quality-register + distractor-audit + marking-matrix pipeline
- The certification manifest must be the single source of truth (no hardcoded paths)
- Validators that hardcode phase-specific filenames create silent validation debt when the phase advances

---

## Key Technical Decisions

- **Manifest-driven path resolution**: The validator will resolve all artefact paths from `manifest.artefacts[key]` using a `requireArtefact()` helper. This eliminates the P10→P11→P12 path-update treadmill.
- **Generator parameterisation**: Each generator gets a `--release` and `--out` (or `--out-prefix`) CLI argument. The existing code already derives phase from `GRAMMAR_CONTENT_RELEASE_ID`; the CLI argument overrides the output filename.
- **Manifest shape evolution**: The P11 manifest will use the `artefacts` map shape specified in the P12 contract, which differs from the P10 manifest's `expectedOutputPaths` array shape. The validator must accept both shapes for backwards compatibility but require the `artefacts` map for P11+.
- **CERTIFIED_PRE_DEPLOY as terminal state for this delivery**: Since production smoke requires live deployment, the report will be CERTIFIED_PRE_DEPLOY. The validator already accepts this status without requiring smoke evidence.
- **Status map generation**: The certification status map will be derived from the quality register, one entry per template, covering all 78 templates.

---

## Open Questions

### Resolved During Planning

- **Q: Does the manifest generator need a full rewrite?** No — the existing generator already derives phase and outputs correctly. It needs the `artefacts` map and `certificationPhase` field added to its output shape.
- **Q: Can we reuse P10 artefacts for P11?** No — the contract is explicit: every artefact metadata block must say `grammar-qg-p11-2026-04-30`. Regeneration is required.
- **Q: Do we need a LEAN_ZIP_MANIFEST.txt?** Yes if the lean ZIP includes these artefacts. Since no LEAN_ZIP_MANIFEST.txt exists yet in the repo, we create it.

### Deferred to Implementation

- **Q: Exact formatting of the certification status map entries** — will be determined by the quality register's output shape.
- **Q: Whether the smoke script needs any P11-specific template additions** — the existing script already tests multiple answer families and template types.

---

## Implementation Units

- U1. **Enhance manifest generator for P12 contract shape**

**Goal:** Update the manifest generator to output the `artefacts` map, `certificationPhase`, and `seedWindowPerEvidenceType` (including `semantic-prompt-cue-audit`) as required by the P12 contract.

**Requirements:** R4

**Dependencies:** None

**Files:**
- Modify: `scripts/generate-grammar-qg-certification-manifest.mjs`
- Create: `reports/grammar/grammar-qg-p11-certification-manifest.json`
- Test: `tests/grammar-qg-p12-manifest-shape.test.js`

**Approach:**
- Add `certificationPhase` field (derived from `--phase` CLI arg, defaulting to same as content phase)
- Add `artefacts` map with all required paths (render inventory, redacted, quality register, distractor audit, marking matrix, certification status map, semantic audit script, production smoke)
- Add `semantic-prompt-cue-audit: '1..30'` to `seedWindowPerEvidenceType`
- Add `postDeployRequiredForPostDeployCertification: true`
- Accept `--phase=grammar-qg-p12` and `--release=grammar-qg-p11-2026-04-30` CLI args
- Run the generator to produce the committed P11 manifest

**Patterns to follow:**
- Existing manifest generator at `scripts/generate-grammar-qg-certification-manifest.mjs`
- P10 manifest shape as baseline, evolving to contract-specified shape

**Test scenarios:**
- Happy path: generated manifest has all required fields (`contentReleaseId`, `certificationPhase`, `templateDenominator`, `seedWindow`, `seedWindowPerEvidenceType`, `artefacts`, `expectedItemCount`, `postDeployRequiredForPostDeployCertification`)
- Happy path: `artefacts` map contains all 8 required keys with correct P11 file paths
- Happy path: `seedWindowPerEvidenceType` contains `semantic-prompt-cue-audit: '1..30'`
- Edge case: `--phase` and `--release` CLI args override defaults correctly
- Error path: manifest validation rejects missing `artefacts` key for P11+ manifests

**Verification:**
- `reports/grammar/grammar-qg-p11-certification-manifest.json` exists and matches the contract-specified shape
- Manifest `contentReleaseId` equals `grammar-qg-p11-2026-04-30`

---

- U2. **Parameterise generators and regenerate P11 evidence artefacts**

**Goal:** Add `--release`/`--out`/`--out-prefix` CLI arguments to all evidence generators and regenerate all artefacts with P11 identity.

**Requirements:** R1, R2, R6, R7

**Dependencies:** U1

**Files:**
- Modify: `scripts/generate-grammar-qg-render-inventory.mjs`
- Modify: `scripts/generate-grammar-qg-quality-register.mjs`
- Modify: `scripts/audit-grammar-distractor-quality.mjs`
- Modify: `scripts/generate-grammar-marking-matrix.mjs`
- Create: `reports/grammar/grammar-qg-p11-render-inventory.json`
- Create: `reports/grammar/grammar-qg-p11-render-inventory-redacted.md`
- Create: `reports/grammar/grammar-qg-p11-quality-register.json`
- Create: `reports/grammar/grammar-qg-p11-distractor-audit.json`
- Create: `reports/grammar/grammar-qg-p11-marking-matrix.json`
- Create: `reports/grammar/grammar-qg-p11-certification-status-map.json`
- Test: `tests/grammar-qg-p12-artefact-identity.test.js`

**Approach:**
- Each generator already reads `GRAMMAR_CONTENT_RELEASE_ID` and stamps items. The output filename is the only hardcoded P10 reference.
- Add `--out-prefix` to the render inventory generator (controls the `grammar-qg-p11` vs `grammar-qg-p10` prefix in output filenames)
- Add `--out` to quality register, distractor audit, and marking matrix generators
- The certification status map is a new derived artefact: iterate the quality register entries, emit one status entry per template with evidence references
- Run all generators after modification to produce committed P11 artefacts
- Verify: all metadata blocks say `grammar-qg-p11-2026-04-30`, render inventory has exactly 2,340 items across 78 templates

**Patterns to follow:**
- Existing generator CLI patterns (minimal — currently no CLI args)
- `buildRenderInventory()` already stamps `GRAMMAR_CONTENT_RELEASE_ID` per item

**Test scenarios:**
- Happy path: render inventory metadata.contentReleaseId equals `grammar-qg-p11-2026-04-30`
- Happy path: every inventory item (2,340) has contentReleaseId `grammar-qg-p11-2026-04-30`
- Happy path: render inventory has exactly 2,340 items and 78 unique templateIds
- Happy path: quality register metadata matches certification status map totals
- Happy path: certification status map covers all 78 templates
- Happy path: distractor audit metadata.contentReleaseId equals `grammar-qg-p11-2026-04-30`
- Happy path: marking matrix metadata.contentReleaseId equals `grammar-qg-p11-2026-04-30`
- Edge case: `--out-prefix` produces correctly named files without affecting content
- Error path: status map rejects unknown template IDs (fail-closed)

**Verification:**
- All 6 P11 artefact files exist in `reports/grammar/`
- All metadata blocks use `grammar-qg-p11-2026-04-30`
- Render inventory: 2,340 items, 78 templates
- Status map: 78 templates, no gaps

---

- U3. **Refactor validator to manifest-driven path resolution**

**Goal:** Replace all hardcoded P10 artefact paths in the validator with a `requireArtefact(manifest, key)` resolver that reads paths from `manifest.artefacts`.

**Requirements:** R1, R2, R5

**Dependencies:** U1, U2

**Files:**
- Modify: `scripts/validate-grammar-qg-certification-evidence.mjs`
- Test: `tests/grammar-qg-p12-validator-paths.test.js`

**Approach:**
- Add `requireArtefact(manifest, key, rootDir)` and `readJsonArtefact(manifest, key, rootDir)` helper functions as specified in contract section 6
- Replace hardcoded path constructions at lines 600, 634, 710, 741-742, 833 with manifest-resolved paths
- For manifests without `artefacts` (P10 backward compat), fall back to the legacy hardcoded paths with a warning
- Add validation that fails if: artefact path missing from manifest, artefact file missing, artefact metadata release differs from manifest, any inventory item release differs, report frontmatter release differs, code constant differs unless `--expected-release` matches, report claims CERTIFIED_POST_DEPLOY without smoke evidence file
- The validator already handles smoke evidence validation correctly (lines 351-451); no changes needed there

**Patterns to follow:**
- Contract section 6 (`requireArtefact` / `readJsonArtefact` pattern)
- Existing `validateInventoryReleaseIds()` for release-ID cross-checking

**Test scenarios:**
- Happy path: validator passes with P11 manifest pointing to P11 artefacts
- Happy path: validator passes with CERTIFIED_PRE_DEPLOY report (no smoke required)
- Error path: validator fails if manifest has no `artefacts` key (P11+ must have it)
- Error path: validator fails if an artefact path is missing from manifest
- Error path: validator fails if artefact file does not exist on disk
- Error path: validator fails if artefact metadata release differs from manifest contentReleaseId
- Error path: validator fails if inventory item release ID mismatches
- Error path: validator fails if report says CERTIFIED_POST_DEPLOY but smoke file is absent
- Integration: running against P10 manifest still works (backward compatibility)

**Verification:**
- `node scripts/validate-grammar-qg-certification-evidence.mjs reports/grammar/grammar-qg-p11-certification-manifest.json <report-path> --expected-release=grammar-qg-p11-2026-04-30` passes
- Same command fails if manifest points to P10 artefact as active release artefact

---

- U4. **Update package release gates**

**Goal:** Update `verify:grammar-qg-production-release` in package.json to validate P11 artefacts via the P11 manifest, referencing the P12 final report.

**Requirements:** R1

**Dependencies:** U3

**Files:**
- Modify: `package.json`
- Test: `tests/grammar-qg-p12-release-gate.test.js`

**Approach:**
- Replace the `verify:grammar-qg-production-release` script to use `grammar-qg-p11-certification-manifest.json` and `--expected-release=grammar-qg-p11-2026-04-30`
- Point the report path to `docs/plans/james/grammar/questions-generator/grammar-qg-p12-final-production-certification-report-2026-04-30.md`
- Keep P10 verification scripts as `verify:grammar-qg-p10-historical` (renamed from production role)

**Patterns to follow:**
- Existing `verify:grammar-qg-p11` script chain pattern

**Test scenarios:**
- Happy path: `npm run verify:grammar-qg-production-release` invokes P11 manifest validation
- Error path: script fails if P11 manifest does not exist
- Edge case: P10 historical script still runnable independently

**Verification:**
- `package.json` `verify:grammar-qg-production-release` references P11 manifest, not P10
- No production-release script references P10 manifest as active release proof

---

- U5. **Production smoke evidence infrastructure**

**Goal:** Ensure the smoke script is ready for P11 execution and document the deferred manual step.

**Requirements:** R8, R9

**Dependencies:** U1

**Files:**
- Modify: `scripts/grammar-production-smoke.mjs` (add `--release-id` and `--out` CLI args; currently derives from constant and hardcodes path)
- Create: `docs/plans/james/grammar/questions-generator/grammar-qg-p12-smoke-runbook.md`
- Test: `tests/grammar-qg-p12-smoke-contract.test.js`

**Approach:**
- Verify the smoke script accepts `--release-id=grammar-qg-p11-2026-04-30` and `--out=reports/grammar/grammar-production-smoke-grammar-qg-p11-2026-04-30.json` and `--evidence-origin=post-deploy`
- Add contract test that validates the smoke evidence JSON shape includes all required fields from the P12 contract (`releaseId`, `evidenceOrigin`, `environment`, `deployedUrl`, `timestamp`, `command`, `learnerFixtureType`, `itemCreationResult`, `answerSubmissionResult`, `readModelUpdateResult`, `noAnswerLeakAssertion`, `semanticCueAssertion`, `releaseIdAssertion`, `failureDetails`)
- Create a runbook documenting the exact command to run post-deployment
- The report will use CERTIFIED_PRE_DEPLOY until smoke runs

**DEFERRED: requires human** — Actual execution of `npm run smoke:production:grammar -- --json --evidence-origin post-deploy --release-id grammar-qg-p11-2026-04-30 --out reports/grammar/grammar-production-smoke-grammar-qg-p11-2026-04-30.json` against the live deployed Worker at `https://ks2.eugnel.uk` requires the app to be deployed. The script infrastructure is ready.

**Patterns to follow:**
- Existing `tests/grammar-qg-p11-production-smoke-contract.test.js`

**Test scenarios:**
- Happy path: smoke script accepts all required CLI flags without error (dry-run or mock)
- Happy path: smoke evidence JSON shape includes all P12-contract-required fields
- Edge case: `semanticCueAssertion` and `releaseIdAssertion` fields present (new in P12 vs existing smoke required fields)
- Error path: smoke evidence with missing required field fails validator

**Verification:**
- Smoke contract test passes
- Runbook documents exact post-deploy command
- Report correctly states CERTIFIED_PRE_DEPLOY

---

- U6. **Release package reproducibility (LEAN_ZIP_MANIFEST)**

**Goal:** Create `LEAN_ZIP_MANIFEST.txt` listing all evidence artefacts for reproducible extraction.

**Requirements:** R4

**Dependencies:** U2

**Files:**
- Create: `LEAN_ZIP_MANIFEST.txt`
- Test: `tests/grammar-qg-p12-lean-zip-manifest.test.js`

**Approach:**
- List all P11 evidence artefacts (render inventory JSON, redacted MD, quality register, distractor audit, marking matrix, certification status map, certification manifest)
- Include generation commands for each artefact for reproducibility
- Mark production smoke as "generated post-deploy" with the runbook command

**Patterns to follow:**
- None existing (first LEAN_ZIP_MANIFEST.txt in repo)

**Test scenarios:**
- Happy path: every file listed in LEAN_ZIP_MANIFEST.txt exists in the repo
- Happy path: manifest includes generation command for each artefact
- Error path: listed file that does not exist fails validation

**Verification:**
- All paths in LEAN_ZIP_MANIFEST.txt resolve to existing files (except production smoke, which is explicitly marked as post-deploy)

---

- U7. **Fix P11 completion report and create P12 final certification report**

**Goal:** Fix the P11 report's placeholder frontmatter and create the P12 final production certification report with CERTIFIED_PRE_DEPLOY status.

**Requirements:** R3, R9, R10

**Dependencies:** U1, U2, U3, U4

**Files:**
- Modify: `docs/plans/james/grammar/questions-generator/grammar-qg-p11-final-completion-report-2026-04-30.md`
- Create: `docs/plans/james/grammar/questions-generator/grammar-qg-p12-final-production-certification-report-2026-04-30.md`
- Test: `tests/grammar-qg-p12-report-frontmatter.test.js`

**Approach:**
- P11 report fix: replace `final_report_commit: pending-this-commit` with the actual commit SHA of the P11 merge. Add addendum explaining P11 fixed learner-facing code, P12 locked production evidence.
- P12 report: create with `certification_decision: CERTIFIED_PRE_DEPLOY`, `certification_phase: grammar-qg-p12`, `final_content_release_id: grammar-qg-p11-2026-04-30`
- P12 report sections: source boundary, denominator (18 concepts, 78 templates, 2,340 items), P11 fix confirmation, evidence artefact table, production smoke result (pending), known limitations, explicit no-change statement for scoring/mastery/reward/Stars/Mega/Hero Mode/monsters
- Add frontmatter validator test that rejects `pending-*`, `todo-*`, `tbd-*`, `unknown-*`, empty strings and inline placeholders

**Patterns to follow:**
- `docs/plans/james/grammar/questions-generator/grammar-qg-p11-final-completion-report-2026-04-30.md` structure
- `scripts/validate-grammar-qg-completion-report.mjs` for frontmatter validation

**Test scenarios:**
- Happy path: P12 report passes `verify:grammar-qg-production-release` validation
- Happy path: report frontmatter has no placeholder values
- Error path: frontmatter validator rejects `pending-this-commit`
- Error path: frontmatter validator rejects empty strings
- Error path: report claiming CERTIFIED_POST_DEPLOY fails without smoke evidence
- Integration: full `verify:grammar-qg-production-release` chain passes end-to-end

**Verification:**
- `npm run verify:grammar-qg-production-release` passes
- P11 report has real commit SHA
- P12 report has CERTIFIED_PRE_DEPLOY with no placeholder frontmatter

---

## System-Wide Impact

- **Interaction graph:** Only certification scripts and package.json are affected. No runtime Worker code, no learner-facing paths, no scoring/mastery/reward systems touched.
- **Error propagation:** Validator failures exit with code 1 and structured error output. Package scripts propagate via `&&` chaining.
- **State lifecycle risks:** None — artefacts are generated statically and committed. No runtime state changes.
- **API surface parity:** No API changes.
- **Unchanged invariants:** Grammar QG runtime behaviour, scoring, mastery, Stars, Mega, Hero Mode, Hero Coins, Concordium, monster progression — all unchanged. Content release ID remains `grammar-qg-p11-2026-04-30`.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Regenerated artefacts differ from P10 due to P11 code fixes (expected) | This is correct behaviour — P11 fixed learner-facing bugs, so render inventory will differ. The release ID is the consistency anchor, not content identity. |
| Production smoke requires live deployment | Deferred with CERTIFIED_PRE_DEPLOY status. Infrastructure is ready; only execution is pending. |
| Large artefact files (render inventory ~5MB) may slow CI | Artefacts are committed once and only regenerated on release. No CI performance impact. |
| Backward compatibility with P10 validator | Legacy fallback path preserves P10 validation capability. P10 scripts renamed to `historical`. |
