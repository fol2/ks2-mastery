---
phase: grammar-qg-p12
title: Grammar QG P12 — Production Evidence Lock and Live Certification Contract
status: proposed
owner: Product + Engineering
language: UK English
baseline_phase: grammar-qg-p11
baseline_content_release_id: grammar-qg-p11-2026-04-30
planned_content_release_id: grammar-qg-p11-2026-04-30
content_release_id_change_expected: false
scoring_or_mastery_change_allowed: false
reward_or_star_change_allowed: false
hero_mode_change_allowed: false
primary_goal: certify the existing Grammar QG pool for production, not expand it
---

# Grammar QG P12 — Production Evidence Lock and Live Certification Contract

## 1. Executive summary

P11 fixed the important learner-facing prompt-cue and read-aloud bugs found during the P10 review. The question generator is now a strong pre-deploy candidate. P12 must not become another feature phase. It is a production certification phase whose job is to make the release evidence truthful, reproducible and deployable.

The current content release is `grammar-qg-p11-2026-04-30`. P12 should not bump the content release ID unless a learner-visible code or content change is introduced. If P12 only regenerates evidence, fixes release validators, updates package scripts, and runs production smoke, the content release remains P11 and the certification artefacts carry a P12 certification phase label.

The target outcome is:

`Grammar QG P11 content release — CERTIFIED_POST_DEPLOY`

That outcome is only valid after the live production smoke evidence exists and the evidence validator proves that report, manifest, code, inventory, quality register, semantic audit, scheduler status map and production smoke all agree.

## 2. Product principle

P12 exists because implementation delivered is not the same as rollout evidence accepted. The platform is for children, so the final bar is not whether the code has a promising report. The final bar is whether the deployed system serves the exact certified release, the questions are answerable and fair, and the evidence package can be re-run without relying on prose claims.

No new templates should be added in P12. No Stars, Mega, Hero Mode, Hero Coins, Monster, Concordium, scoring, mastery or reward semantics should be changed. Any attempt to expand the question pool before the release evidence is locked must be blocked.

## 3. Current validation state from P11 review

P11 credible evidence:

- The live code exports `GRAMMAR_CONTENT_RELEASE_ID = grammar-qg-p11-2026-04-30`.
- The denominator audit still reports 18 concepts, 78 templates, 58 selected-response templates, 20 constructed-response templates, 52 generated templates, 26 fixed templates, 47 answer-spec templates, 4 manual-review-only templates, 17 explanation templates and 8 mixed-transfer templates.
- The 30-seed content-quality audit checked 2,340 items and returned 0 hard failures and 0 advisories.
- The semantic prompt-cue audit checked 2,340 items and returned 0 findings.
- Direct probes now show the P10 bugs fixed: `identify_words_in_sentence` and `subject_object_choice` read the actual sentence, and `qg_p4_voice_roles_transfer` announces an underlined noun phrase rather than an underlined word.
- P11 targeted tests for target extraction, accessibility copy, distractor/matrix truth, evidence truth, scheduler blocklist, production smoke contract and verify-chain shape pass when the required reports are extracted.

Remaining production blockers:

- The P11 completion report still has `final_report_commit: pending-this-commit`.
- The production release script still validates `reports/grammar/grammar-qg-p10-certification-manifest.json` with `--expected-release=grammar-qg-p10-2026-04-29`, even though the current code release is P11.
- P11 evidence artefacts are incomplete: the ZIP has P10 render inventory, P10 quality register, P10 distractor audit, P10 marking matrix and P10 certification status map, but no committed `grammar-qg-p11-render-inventory.json`, `grammar-qg-p11-quality-register.json`, `grammar-qg-p11-distractor-audit.json`, `grammar-qg-p11-marking-matrix.json` or `grammar-qg-p11-certification-status-map.json`.
- `validate-grammar-qg-certification-evidence.mjs` still hardcodes P10 artefact paths in several checks, especially the render-inventory release check.
- Validating a generated P11 manifest against the existing P10 render inventory produces release-ID mismatches for metadata plus every inventory item.
- No live production smoke evidence exists for `grammar-qg-p11-2026-04-30`.

Therefore P11 is not yet production-certified. It is a strong pre-deploy release candidate that needs a P12 evidence lock and deployment proof.

## 4. Non-negotiable acceptance standard

P12 passes only when all of the following are true:

1. One command validates the release currently in code, not a previous phase.
2. The command fails if any artefact still says P10 while the code says P11, unless that artefact is explicitly labelled historical and excluded from the certification manifest.
3. The final report has no placeholder frontmatter.
4. The evidence manifest names every artefact used by the release gate.
5. The validator reads artefact paths from the manifest, not from hardcoded P10 filenames.
6. The semantic prompt-cue audit runs against the P11 code and passes 2,340 items.
7. The scheduler status map is generated from the quality register and covers all 78 templates.
8. The production smoke file proves the deployed Worker serves `grammar-qg-p11-2026-04-30` and can create, answer and read back Grammar QG items with no answer leaks.
9. The report status remains `CERTIFIED_PRE_DEPLOY` until the production smoke evidence exists.
10. No reward, scoring, mastery or Hero Mode files change except for incidental import ordering if unavoidable.

## 5. Implementation units

### U0 — Release truth reset

Fix the P11 completion report and release metadata.

Required changes:

- Replace `final_report_commit: pending-this-commit` with the real commit SHA after merge.
- Add a short addendum explaining that P11 fixed learner-facing code but P12 locked production evidence.
- If no P12 content change is made, keep `final_content_release_id: grammar-qg-p11-2026-04-30`.
- Add `certification_phase: grammar-qg-p12` to the final P12 report, but do not imply a P12 content release unless content changed.

Acceptance:

- Report frontmatter validator rejects `pending-*`, `todo-*`, `tbd-*`, `unknown-*`, empty strings and inline placeholders.
- The final P12 report has no placeholder values.

### U1 — Canonical P11 evidence manifest

Create a P11 certification manifest that is the single source of truth for release evidence.

Required file:

`reports/grammar/grammar-qg-p11-certification-manifest.json`

Required shape:

```json
{
  "contentReleaseId": "grammar-qg-p11-2026-04-30",
  "certificationPhase": "grammar-qg-p12",
  "templateDenominator": 78,
  "seedWindow": { "certification": "1..30" },
  "seedWindowPerEvidenceType": {
    "selected-response-oracle": "1..15",
    "constructed-response-oracle": "1..10",
    "manual-review-oracle": "1..5",
    "redaction-oracle": "1..30",
    "content-quality-audit": "1..30",
    "semantic-prompt-cue-audit": "1..30"
  },
  "artefacts": {
    "renderInventory": "reports/grammar/grammar-qg-p11-render-inventory.json",
    "renderInventoryRedacted": "reports/grammar/grammar-qg-p11-render-inventory-redacted.md",
    "qualityRegister": "reports/grammar/grammar-qg-p11-quality-register.json",
    "distractorAudit": "reports/grammar/grammar-qg-p11-distractor-audit.json",
    "markingMatrix": "reports/grammar/grammar-qg-p11-marking-matrix.json",
    "certificationStatusMap": "reports/grammar/grammar-qg-p11-certification-status-map.json",
    "semanticAuditScript": "scripts/audit-grammar-prompt-cues-semantic.mjs",
    "productionSmoke": "reports/grammar/grammar-production-smoke-grammar-qg-p11-2026-04-30.json"
  },
  "expectedItemCount": 2340,
  "postDeployRequiredForPostDeployCertification": true
}
```

Acceptance:

- A generated P11 manifest exists and is committed.
- GitHub `main`, the lean ZIP and the local generated manifest agree on release ID.
- The manifest does not point to P10 artefacts except in a clearly marked `historicalBaselines` section.

### U2 — Regenerate P11 evidence artefacts

Regenerate evidence using the P11 code release.

Required files:

- `reports/grammar/grammar-qg-p11-render-inventory.json`
- `reports/grammar/grammar-qg-p11-render-inventory-redacted.md`
- `reports/grammar/grammar-qg-p11-quality-register.json`
- `reports/grammar/grammar-qg-p11-distractor-audit.json`
- `reports/grammar/grammar-qg-p11-marking-matrix.json`
- `reports/grammar/grammar-qg-p11-certification-status-map.json`

Implementation detail:

Existing P10 generators may still emit P10 filenames. Add a phase/release argument rather than copying files by hand.

Example CLI contract:

```bash
node scripts/generate-grammar-qg-certification-manifest.mjs \
  --release=grammar-qg-p11-2026-04-30 \
  --phase=grammar-qg-p12

node scripts/generate-grammar-qg-render-inventory.mjs \
  --release=grammar-qg-p11-2026-04-30 \
  --out-prefix=grammar-qg-p11

node scripts/generate-grammar-qg-quality-register.mjs \
  --release=grammar-qg-p11-2026-04-30 \
  --out=reports/grammar/grammar-qg-p11-quality-register.json

node scripts/audit-grammar-distractor-quality.mjs \
  --release=grammar-qg-p11-2026-04-30 \
  --out=reports/grammar/grammar-qg-p11-distractor-audit.json

node scripts/generate-grammar-marking-matrix.mjs \
  --release=grammar-qg-p11-2026-04-30 \
  --out=reports/grammar/grammar-qg-p11-marking-matrix.json
```

Acceptance:

- Every P11 artefact metadata block says `grammar-qg-p11-2026-04-30`.
- Every item in render inventory says `grammar-qg-p11-2026-04-30`.
- Render inventory has exactly 2,340 items and 78 unique templates.
- Quality register totals are internally consistent and match the certification status map.
- Historical P10 artefacts may remain in the repo, but they must not be used as the active P11 release proof.

### U3 — Fix the certification validator path model

Refactor `scripts/validate-grammar-qg-certification-evidence.mjs` so it reads all artefact paths from the manifest.

Current gap:

The validator still hardcodes P10 paths such as `grammar-qg-p10-render-inventory.json`, `grammar-qg-p10-quality-register.json`, `grammar-qg-p10-distractor-audit.json` and `grammar-qg-p10-marking-matrix.json`. That lets a P11 release be indirectly certified through P10 artefacts.

Required resolver:

```js
function artefactPath(manifest, key, rootDir) {
  const rel = manifest?.artefacts?.[key];
  if (!rel || typeof rel !== 'string') {
    throw new Error(`Certification manifest missing artefacts.${key}`);
  }
  return path.resolve(rootDir, rel);
}
```

Then replace hardcoded paths with:

```js
const inventoryPath = artefactPath(manifest, 'renderInventory', rootDir);
const qualityRegisterPath = artefactPath(manifest, 'qualityRegister', rootDir);
const distractorAuditPath = artefactPath(manifest, 'distractorAudit', rootDir);
const markingMatrixPath = artefactPath(manifest, 'markingMatrix', rootDir);
const statusMapPath = artefactPath(manifest, 'certificationStatusMap', rootDir);
```

The validator must fail if:

- an artefact path is missing from the manifest;
- the artefact file is missing;
- the artefact metadata release differs from `manifest.contentReleaseId`;
- any inventory item release differs from `manifest.contentReleaseId`;
- the report frontmatter release differs from the manifest;
- the code constant differs from the manifest, unless an explicit `--expected-release` matching the manifest is supplied;
- a report claims post-deploy certification without a valid production smoke file.

Acceptance:

- `node scripts/validate-grammar-qg-certification-evidence.mjs reports/grammar/grammar-qg-p11-certification-manifest.json <final-report>` passes.
- The same command fails if the manifest points to any P10 artefact as the active release artefact.
- The same command fails if the report says `CERTIFIED_POST_DEPLOY` without smoke evidence.

### U4 — Fix package release gates

Replace the production-release script so it certifies the P11 release, not P10.

Target package script:

```json
{
  "verify:grammar-qg-production-release": "npm run verify:grammar-qg-p11 && npm run audit:grammar-qg:semantic && node scripts/validate-grammar-qg-certification-evidence.mjs reports/grammar/grammar-qg-p11-certification-manifest.json docs/plans/james/grammar/questions-generator/grammar-qg-p12-final-production-certification-report-2026-04-30.md --expected-release=grammar-qg-p11-2026-04-30"
}
```

If the final report path uses a different date, update the path once and keep it exact.

Acceptance:

- No package script used for production release references `grammar-qg-p10-certification-manifest.json` as the active release proof.
- P10 scripts may remain only as historical validators.

### U5 — Production smoke evidence

Run the production smoke only after deployment.

Required command:

```bash
npm run smoke:production:grammar -- \
  --json \
  --evidence-origin post-deploy \
  --release-id grammar-qg-p11-2026-04-30 \
  --out reports/grammar/grammar-production-smoke-grammar-qg-p11-2026-04-30.json
```

Required evidence fields:

```json
{
  "releaseId": "grammar-qg-p11-2026-04-30",
  "evidenceOrigin": "post-deploy",
  "environment": "production",
  "deployedUrl": "https://ks2.eugnel.uk",
  "timestamp": "ISO-8601",
  "command": "npm run smoke:production:grammar -- ...",
  "learnerFixtureType": "...",
  "itemCreationResult": { "pass": true },
  "answerSubmissionResult": { "pass": true },
  "readModelUpdateResult": { "pass": true },
  "noAnswerLeakAssertion": { "pass": true },
  "semanticCueAssertion": { "pass": true },
  "releaseIdAssertion": { "pass": true },
  "failureDetails": []
}
```

Acceptance:

- Smoke evidence is produced by a live deployed Worker, not by local generation.
- The release ID in production read model matches `grammar-qg-p11-2026-04-30`.
- The smoke includes at least one visual-cue template and one table-choice template.
- The smoke checks the learner-facing payload does not leak `golden`, `nearMiss`, `answerSpec`, `correct` or hidden answer fields.
- The smoke checks the read-aloud/screen-reader cue for a known fixed template.

### U6 — Release package reproducibility check

The lean ZIP used for final review must contain all active evidence artefacts or explicitly document why they are omitted.

Acceptance:

- `LEAN_ZIP_MANIFEST.txt` includes evidence artefacts if they are tracked.
- A reviewer can extract the final lean ZIP and run the evidence validator without regenerating missing artefacts.
- If generated artefacts are deliberately omitted, the report must label that fact and provide a reproducible generation command. For production certification, omission is not preferred.

### U7 — Final production certification report

Create:

`docs/plans/james/grammar/questions-generator/grammar-qg-p12-final-production-certification-report-2026-04-30.md`

Required status options:

- `CERTIFIED_PRE_DEPLOY` if smoke is still missing.
- `CERTIFIED_POST_DEPLOY` only if smoke exists and passes.

Required report sections:

1. Source boundary: code commit, content release, evidence manifest, smoke evidence.
2. Denominator: 18 concepts, 78 templates, 2,340 inventory items.
3. P11 learner-surface fix confirmation.
4. Evidence artefact table with file paths and release IDs.
5. Production smoke result with timestamp and origin.
6. Known limitations, if any.
7. Explicit no-change statement for scoring, mastery, reward, Stars, Mega, Hero Mode and monsters.

Acceptance:

- The report is machine-validated by `verify:grammar-qg-production-release`.
- No placeholder frontmatter remains.
- No report wording claims more than the artefacts prove.

## 6. Suggested code patch: validator artefact resolver

The key P12 engineering change is small but important. The validator must stop hardcoding phase-specific filenames.

Suggested implementation outline:

```js
function requireArtefact(manifest, key, rootDir = ROOT_DIR) {
  const rel = manifest?.artefacts?.[key];
  if (!rel || typeof rel !== 'string') {
    return {
      ok: false,
      path: null,
      error: `Manifest missing required artefact path: artefacts.${key}`,
    };
  }
  const abs = path.resolve(rootDir, rel);
  if (!existsSync(abs)) {
    return {
      ok: false,
      path: abs,
      error: `Artefact file not found for ${key}: ${rel}`,
    };
  }
  return { ok: true, path: abs, error: null };
}

function readJsonArtefact(manifest, key, rootDir = ROOT_DIR) {
  const resolved = requireArtefact(manifest, key, rootDir);
  if (!resolved.ok) return { ok: false, error: resolved.error, data: null };
  try {
    return {
      ok: true,
      data: JSON.parse(readFileSync(resolved.path, 'utf8')),
      path: resolved.path,
    };
  } catch (err) {
    return {
      ok: false,
      error: `Artefact ${key} is not valid JSON: ${err.message}`,
      data: null,
      path: resolved.path,
    };
  }
}
```

Use this resolver everywhere the current validator references P10 filenames.

## 7. Suggested code patch: production-release script

Replace the current P10-specific script with a P11-specific release gate. The important change is not just the filename; it is that the final report is passed into the validator.

```json
"verify:grammar-qg-production-release": "npm run verify:grammar-qg-p11 && npm run audit:grammar-qg:semantic && node scripts/validate-grammar-qg-certification-evidence.mjs reports/grammar/grammar-qg-p11-certification-manifest.json docs/plans/james/grammar/questions-generator/grammar-qg-p12-final-production-certification-report-2026-04-30.md --expected-release=grammar-qg-p11-2026-04-30"
```

If production smoke has not run, this command should still pass only for `CERTIFIED_PRE_DEPLOY`. It must fail if the report claims `CERTIFIED_POST_DEPLOY` without the smoke artefact.

## 8. Production decision rule

P12 should end with one of these two decisions.

### Decision A — CERTIFIED_PRE_DEPLOY

Use this if:

- P11 artefacts are regenerated and validated;
- semantic audit passes;
- package release gate uses P11 manifest;
- live production smoke has not yet run.

This state is suitable for deployment preparation, not for claiming production certification.

### Decision B — CERTIFIED_POST_DEPLOY

Use this only if:

- all of Decision A is true;
- the live production smoke evidence exists;
- production serves `grammar-qg-p11-2026-04-30`;
- the smoke proves create → answer → read-model update → no answer leak → semantic cue correctness.

This state is suitable for saying the Grammar QG pool is production-certified.

## 9. Out of scope

P12 must not:

- add new Grammar templates;
- change scoring or mastery;
- alter Stars, Mega, Hero Mode, Hero Coins, Concordium or monster progression;
- introduce cosmetic UI work unrelated to answerability, accessibility or production proof;
- claim post-deploy certification from local evidence.

## 10. Final acceptance checklist

Before closing P12, the team must be able to answer yes to every line below:

- Does the code release ID equal the manifest release ID?
- Does the report release ID equal the manifest release ID?
- Do all active artefacts in the manifest exist in the repo and final ZIP?
- Do all artefact metadata blocks use `grammar-qg-p11-2026-04-30`?
- Does every render inventory item use `grammar-qg-p11-2026-04-30`?
- Does the semantic audit pass 2,340 items with 0 findings?
- Does the quality register cover all 78 templates?
- Does the status map cover all 78 templates and block unknown IDs fail-closed?
- Does the production-release command validate P11 artefacts, not P10 artefacts?
- If the report says `CERTIFIED_POST_DEPLOY`, does the smoke evidence exist and pass?
- Are scoring, mastery, reward, Stars, Mega and Hero Mode unchanged?

If any answer is no, the release remains pre-deploy only.
