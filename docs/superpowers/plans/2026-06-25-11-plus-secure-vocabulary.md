# 11 Plus Secure Vocabulary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add James's 300 supplied 11+ vocabulary words and meanings to KS2 Mastery's spelling content without duplicating existing statutory, secure-extension, or extra words.

**Architecture:** Store the supplied list as a deterministic source artefact, apply it through a focused content import script, then publish a new spelling content release via the existing content model. Existing words keep their current tier but receive the supplied learner-facing meaning; missing words are added as secure-extension core entries with provenance, UK spelling, sentence, and review metadata.

**Tech Stack:** Node.js ESM scripts, `node:test`, existing spelling content model/generator, Cloudflare deployment package scripts.

---

### Task 1: Source Contract Test

**Files:**
- Create: `content/spelling-11-plus-secure-vocabulary-2026-06-25.json`
- Modify: `tests/spelling-content.test.js`

- [ ] **Step 1: Add a failing test**

Add assertions that:
- the source artefact contains exactly 300 unique words;
- the published spelling snapshot contains all source words;
- 224 source words are secure-extension additions;
- every source word uses the supplied meaning as its explanation.

- [ ] **Step 2: Run the targeted test to verify it fails**

Run: `node --test tests/spelling-content.test.js`

Expected: failure because the source artefact and imported release are not present yet.

### Task 2: Deterministic Import

**Files:**
- Create: `scripts/apply-spelling-11-plus-secure-vocabulary.mjs`
- Modify: `content/spelling.seed.json`
- Create: `docs/plans/james/hotfixes/23. 11-plus-secure-vocabulary/validation/11-plus-secure-vocabulary-import-manifest.json`

- [ ] **Step 1: Implement the importer**

The script must parse the source artefact, validate unique lowercase slugs, update existing word explanations, create missing secure-extension word-list entries, create one sentence per new word, validate the bundle, publish a new release, and write a manifest.

- [ ] **Step 2: Apply the importer**

Run: `node scripts/apply-spelling-11-plus-secure-vocabulary.mjs --apply`

Expected: `content/spelling.seed.json` contains release `spelling-r9`, secure-extension count increases from 1215 to 1439, statutory-core remains 213, and enrichment-extra remains 52.

### Task 3: Generated Runtime Data

**Files:**
- Modify: `src/subjects/spelling/data/content-data.js`
- Modify: `src/subjects/spelling/data/word-data.js`
- Modify: `worker/src/generated-spelling-content-seed.js`

- [ ] **Step 1: Regenerate data**

Run: `node scripts/generate-spelling-content.mjs`

Expected: generated files pin the runtime snapshot to release `spelling-r9`.

- [ ] **Step 2: Run content validation**

Run: `node scripts/validate-spelling-content.mjs`

Expected: `ok: true`, zero errors, secure-extension count 1439.

### Task 4: Verification, Reviews, Deployment, Report

**Files:**
- Create: `docs/plans/james/hotfixes/23. 11-plus-secure-vocabulary/completion-report-2026-06-25.md`

- [ ] **Step 1: Run targeted spelling tests**

Run: `node --test tests/spelling-content.test.js tests/spelling-progression.test.js tests/spelling-secure-vocabulary-source.test.js tests/secure-vocabulary-release-gates.test.js tests/secure-vocabulary-release-gap-summary.test.js`

Expected: all tests pass.

- [ ] **Step 2: Run project checks**

Run package scripts for `test` and `check`, using the available package runner in this environment.

Expected: both pass before deployment.

- [ ] **Step 3: Run independent reviewers**

Dispatch Code Reviewer and Contract Auditor subagents over the final diff. Treat any advisory as blocked and fix until both return no blockers and no advisories.

- [ ] **Step 4: Commit, push, deploy, and verify production**

Create a `codex/11-plus-secure-vocabulary` branch, commit, push, deploy through the package deploy script, and verify `https://ks2.eugnel.uk` after hard refresh for spelling setup/word-bank evidence and no 503 subject command failure.

- [ ] **Step 5: Write completion report**

Record source ledger, diff summary, command evidence, reviewer outputs, deployment result, and production evidence in the completion report folder.
