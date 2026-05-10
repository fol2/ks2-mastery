# Punctuation Landing UI Alignment Completion Report

Date: 2026-05-10

## Contract

Align the Punctuation landing interface with the established Grammar and Spelling setup layout while preserving the Bellstorm Coast background. This was a fixing contract, not a redesign contract: the work stayed inside the Punctuation setup surface and directly related setup journeys.

## Runtime Changes

- Replaced the old Punctuation setup button stack with the shared setup rhythm used by Grammar and Spelling:
  - `mode-row punctuation-mode-row`
  - `setup-control-stack punctuation-control-stack`
  - `setup-begin-row punctuation-start-row`
- Kept the Bellstorm Coast setup backdrop and adapted the contrast profile so the shared controls remain legible on the existing background.
- Changed mode cards to select the practice mode only. The single bottom CTA now starts or continues the selected mode.
- Removed the old secondary drawer layout from the setup surface.
- Updated related Punctuation journey selectors so Wobbly Spots, GPS Check, Smart Review, and reward-parity flows wait for the selected card state and then use the shared CTA.
- Fixed a related production contract bug found during live smoke: a fresh learner selecting GPS Check now gets `Start GPS Check`, not the fresh Smart Review egg CTA.
- Stabilised the Hero completion flow test clock after the full pre-push suite exposed a midnight boundary race unrelated to the UI but blocking the required production publish gate.

## Verification

Local targeted gates:

- `node --test tests/react-punctuation-scene.test.js tests/punctuation-setup-hero-backdrop.test.js tests/ui-token-contract.test.js`: pass, 198 tests, 0 failures.
- `node --test tests/react-punctuation-scene.test.js tests/punctuation-setup-hero-backdrop.test.js tests/ui-token-contract.test.js tests/hero-completion-flow-e2e.test.js`: pass, 208 tests, 0 failures.
- `node --check` for the changed smoke and journey modules: pass.
- `npm run check`: pass. Client bundle audit passed with main bundle `197461 / 232000` bytes gzip.

Full publish gate:

- `npm test`: pass during pre-push, 109216 tests, 109204 passed, 0 failed, 12 skipped.

Production deployment:

- Commit deployed: `410d630986e5f38d544c900df05e3f828895df15`.
- Worker version: `9760a762-99af-42b2-a00b-7afdce81e9ac`.
- `npm run deploy`: pass.
- Production bundle audit for `https://ks2.eugnel.uk/`: pass, including matrix demo check, security-header checks, and cache-split checks.

Production browser smoke:

- Evidence: `docs/plans/james/punctuation/punctuation-landing-ui-alignment-production-smoke-2026-05-10.json`.
- Result: `ok: true`.
- Origin: `https://ks2.eugnel.uk`.
- Checks proved:
  - Punctuation setup heading renders.
  - Bellstorm Coast background remains visible.
  - Three shared mode cards render: Smart Review, Wobbly Spots, GPS Check.
  - Shared setup classes are present.
  - Old secondary drawer is absent.
  - Layout order is mode cards, progress row, controls, single CTA.
  - GPS Check selects cleanly and the CTA reads `Start GPS Check`.
  - GPS session starts from the deployed site.
  - Console errors: 0.
  - Request failures: 0.
  - HTTP failures: 0.

Screenshots:

- Setup: `docs/plans/james/punctuation/punctuation-landing-ui-alignment-production-setup-2026-05-10.png`.
- GPS session: `docs/plans/james/punctuation/punctuation-landing-ui-alignment-production-gps-session-2026-05-10.png`.

## Independent Review Gates

- Code Reviewer: GREEN after the journey selector race fixes.
- Contract Auditor: GREEN after the final evidence audit. The auditor confirmed no blockers or advisory-blockers and approved marking this report as complete.

## Git And Sync

- Runtime commits:
  - `56476e6b` - Align punctuation landing controls.
  - `5580ab09` - Fix punctuation GPS setup CTA label.
  - `410d6309` - Stabilise Hero completion flow clock.
- Evidence/report commit: this report and the production evidence artefacts are committed separately from the runtime source commits.
- Local main sync: performed as part of the final handover after the evidence/report push.
