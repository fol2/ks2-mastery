# Reading Stretch Challenge + Interface Hardening Contract

## Evidence boundary

Primary local implementation source for this package is a reconstructed post-hardened Reading v5 snapshot, because the user-named `ks2-mastery-lean-05121226.zip` was not present under `/mnt/data` in this environment.

Reconstruction source layers:

1. `/mnt/data/ks2-mastery-lean-05111651.zip`
2. `/mnt/data/reading-post-implementation-review-hardening-package.zip`
3. GitHub Reading commits used as supplementary evidence for the completed post-hardening rollout.

This package proves local patch behaviour on that reconstructed snapshot. It does not prove production until the patch is merged/deployed and a fresh Reading smoke is run.

## Scope

Reading subject only.

In scope:

- Reading metadata and mode registry.
- Reading setup interface copy/controls.
- Reading Worker session selection for the new mode.
- Reading runtime tests and static interface contract tests.

Out of scope:

- Other subjects.
- Hero economy, coins, camp, or cross-subject scheduling.
- Reading content count expansion.
- Monster reward thresholds.
- Production deployment.

## Contract

### C1: Stretch Challenge mode exists consistently

Reading must expose a new `stretch` mode through both server/Worker content metadata and browser-safe metadata. Browser metadata must remain answer-safe and must not import `shared/reading/content.js`.

### C2: Stretch Challenge is extra-credit style practice, not a paper

Stretch sessions must:

- be non-strict Reading practice sessions;
- use delayed feedback;
- select six questions;
- choose a long or high-difficulty passage;
- avoid punctuation-only questions;
- prefer high-depth Reading tasks such as open, evidence, match, order, comparison, structure and inference work;
- preserve normal stale-guard, save-response, mark-section and answer-redaction behaviour.

### C3: Stretch Challenge should not become monotonous

Stretch selection must bias toward challenging question types, but must not simply choose one repeated question type where alternatives exist. The first selected set should preserve skill and type variety before filling the remaining slots.

### C4: Setup interface remains simple and bounded

Stretch Challenge appears in the existing More Reading practice surface, not as an additional competing primary CTA. The learner still has one primary start action.

The setup source must also guard against duplicate `data-text-tone={textTone}` hero-card attributes.

### C5: Reading content counts do not change

The patch must not change Reading v5 content totals:

- 210 passages
- 2072 questions
- 75 papers
- 71 fiction passages
- 71 non-fiction passages
- 68 poetry passages
- 166 long passages

## Acceptance checks

Required local checks:

```bash
node --check shared/reading/content.js
node --check shared/reading/metadata.js
node --check src/subjects/reading/metadata.js
node --check worker/src/subjects/reading/engine.js
node --check tests/reading-content-contract.test.js
node --check tests/worker-reading-runtime.test.js
npm run audit:reading-content
node --test tests/reading-content-contract.test.js tests/worker-reading-runtime.test.js tests/reading-phase5-next1000-contract.test.js tests/reading-subject-registry.test.js
```

In a dependency-complete repo/CI, also run:

```bash
node --test tests/reading-session-interface.test.js
npm test
npm run check
npm run smoke:production:reading -- --expected-content-version 5 --commit-sha <post-patch-commit>
npm run smoke:production:reading-landing -- --origin https://ks2.eugnel.uk
```

## Rollback

Revert the patch. This removes the `stretch` mode, restores previous mode metadata, and restores the previous Reading question selection rules. No database migration is involved.
