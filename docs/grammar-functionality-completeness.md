# Grammar Functionality Completeness

This document tracks Grammar-only functionality completeness against the reviewed legacy HTML donor. It does not expand Punctuation scope, and it does not change the production authority boundary: scored Grammar practice remains Worker-owned.

## Current Foundation

- Grammar is a real production subject behind the Worker subject command boundary.
- The content release is `grammar-legacy-reviewed-2026-04-24`.
- The reviewed denominator is present: 18 concepts, 51 templates, 31 selected-response templates, and 20 constructed-response templates.
- All eight legacy mode ids are enabled: `learn`, `smart`, `trouble`, `surgery`, `builder`, `worked`, `faded`, and `satsset`.
- Analytics, misconception evidence, question-type evidence, recent activity, Grammar rewards, Bellstorm bridge copy, non-scored AI enrichment validation/triggers, adult Grammar evidence surfaces, production smoke, and browser/bundle guardrails already exist.

## Remaining Completeness Work

| Area | Status | Owner unit |
|---|---|---|
| Strict mini-test with fixed set, timer, navigation, delayed feedback, finish action, and end review | Completed | U2 |
| Session goals: ten minutes, fifteen questions, and clear due items | Completed | U3 |
| Practice settings: Smart Review teaching items and show-domain-before-answer | Completed | U3 |
| In-session repair: retry, worked solution, faded support, and built-in similar problem | Completed | U4 |
| Visible AI triggers: explanation, revision cards, safe drill suggestions, and parent summary drafts | Completed | U5 |
| Read aloud and speech-rate preference | Completed | U6 |
| Adult/data replacement parity for legacy Profiles/Data/Settings | Completed | U7 |
| Functionality completeness tests and production smoke coverage | Completed | U8 |

## Replaced Legacy Behaviours

- Learner create, rename, delete, import, export, reset, and remote sync are platform responsibilities, not Grammar-scene responsibilities.
- Parent Hub and Admin Hub expose Grammar concept status, due/weak concepts, question-type weakness, misconception patterns, recent activity, and parent summary drafts from platform state.
- Platform import/export/restore preserves Grammar state, preferences, recent evidence, and parent summary drafts. Grammar does not rebuild legacy localStorage data controls.

## Rejected Legacy Behaviours

- Browser-local scoring is not a production parity target.
- Browser-held AI keys are not a production parity target.
- Browser localStorage as the authoritative Grammar data store is not a production parity target.
- Serving the single-file legacy HTML as the product route is not a production parity target.

## Source of Truth

- Plan: `docs/plans/2026-04-25-001-feat-grammar-functionality-completeness-plan.md`
- Baseline fixture: `tests/fixtures/grammar-functionality-completeness/legacy-baseline.json`
- Guardrail test: `tests/grammar-functionality-completeness.test.js`

## Release Gate Note

- `npm run smoke:production:grammar` remains a manual post-deploy release gate because it depends on the live production origin and demo-session/auth behaviour.
- `npm run check` and local dry-run scripts must stay network/auth independent; production smoke evidence belongs in the PR/deploy notes for Grammar-facing changes.
- External PR checks, including Cloudflare Workers Builds, are part of the PR fix loop. A failing external check must be investigated, fixed in the branch when branch-caused, or documented with deterministic local evidence before merge when it is external infrastructure drift.
