# Validation summary

## Uploaded ZIP identity

`ks2-mastery-lean-05102302.zip`

SHA-256:

`58b5ad91e1aac120f83c49fd0c198d763ffedfdb1b3bc72cfc1fa928c78783c6`

The ZIP integrity check passed. It is a rootless lean ZIP with no `.git` metadata. Node runtime matched `.nvmrc` (`v22.16.0` locally, `.nvmrc` = `22`).

## Findings

### 1. Fixed: post-span negation marking bug

The prior Reading hotfix correctly rejected prefix negation such as `not speech marks`, but the uploaded ZIP still accepted a correct phrase followed by a local contradiction. Examples from the baseline probe:

- `speech marks are not needed` was accepted.
- `the house around her seemed to change did not happen` was accepted.
- `folded slips of paper were not inside` was accepted.
- Evidence text `the house around her seemed to change did not happen` could still earn the evidence mark.

The patch extends local contradiction detection to scan inside and just after the matched span while preserving valid contrast cases such as `folded slips of paper, but not coins`.

### 2. Fixed: final delayed-feedback button label

The one-question Reading surface could still display `Save and next` even on the final delayed-feedback question. The patch introduces `primarySubmitLabel(session, result)` so the final delayed-feedback question says `Save answer` instead.

### 3. Expanded: Reading content pool and systematic quality gate

The patch expands Reading from:

- 21 passages to 24 passages
- 182 questions to 212 questions
- 12 papers to 13 papers
- 8 fiction / 8 non-fiction / 5 poetry to 9 / 9 / 6
- 7 long passages to 8

New passages:

- `lantern_map` — fiction
- `seed_vault_guardians` — non-fiction, long passage
- `rooftop_rain` — poetry

New complete paper:

- `paper_m` — 60 minutes, 50 marks

A new audit script, `scripts/audit-reading-content-quality.mjs`, checks duplicate stems, duplicate model answers, repeated stem shapes, evidence snippets, skill coverage, question ID validity, and paper mark totals.

## Validation results after patch

Patch application on a fresh ZIP extraction:

- `git apply --check`: pass
- `git apply`: pass

Reading content audit:

- passages: 24
- questions: 212
- papers: 13
- failures: 0
- advisories: 0
- duplicate normalised stem groups: 0
- duplicate model answer groups: 0
- repeated stem-shape advisories: 0

Focused non-React Reading/registry/Hero/reward/button tests:

- 98 tests passed
- 0 failed

React render-level Reading session-interface test:

- Not runnable in this lean ZIP because `esbuild` is missing.
- This package updates the static contract in that test, but a dependency-complete repo/CI run is still required before calling the React render surface fully certified.

## Production limit

This package does not certify live production. It provides a patch, contract, local ZIP validation, and fresh-apply validation.
