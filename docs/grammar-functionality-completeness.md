# Grammar Functionality Completeness

This document tracks Grammar-only functionality completeness against the reviewed legacy HTML donor. It does not expand Punctuation scope, and it does not change the production authority boundary: scored Grammar practice remains Worker-owned.

## Current Foundation

- Grammar is a real production subject behind the Worker subject command boundary.
- The content release is `grammar-legacy-reviewed-2026-04-24`.
- The reviewed denominator is present: 18 concepts, 51 templates, 31 selected-response templates, and 20 constructed-response templates.
- All eight legacy mode ids are enabled: `learn`, `smart`, `trouble`, `surgery`, `builder`, `worked`, `faded`, and `satsset`.
- Analytics, misconception evidence, question-type evidence, recent activity, Grammar rewards, Bellstorm bridge copy, non-scored AI enrichment validation/triggers, adult Grammar evidence surfaces, production smoke, and browser/bundle guardrails already exist.
- Grammar AI enrichment keeps deterministic fallback as the production contract until a separate reviewed server-side provider plan lands.

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

## Perfection Pass

Legacy functionality is complete, but a subsequent review (`docs/plans/james/grammar/grammar-phase2.md`) identified fairness, depth, and behavioural-proof gaps that are not covered by the legacy-HTML completeness audit above. These are tracked in a separate baseline so legacy parity does not silently absorb fairness regressions.

| Review issue | Status | Owner unit | Notes |
|---|---|---|---|
| I1. Docs overclaim completeness vs behaviour tests | Planned | U1 | Perfection-pass baseline fixture and test enforce resolution status per issue. |
| I2. Adaptive selection lacks recent-repeat penalty and question-type weakness weighting | Planned | U2 | Extract `buildGrammarPracticeQueue` as a seeded pure function; add `buildGrammarMiniPack` for quota-aware mini-test balancing. |
| I3. Support scoring may be session-level | Planned | U3 | Rename to item-level fields (`firstAttemptIndependent`, `supportUsed`, `supportLevelAtScoring`); three-layer migration; remove Smart + teaching-items session promotion. |
| I4. Legacy content gaps (thin explain/vocabulary/formality pools) | Deferred | - | Deferred to a separate reviewed content-release plan. This plan pins the current per-question-type and per-concept floors so erosion is detectable. |
| I5. Transfer writing placeholder-only | Planned | U7 | Non-scored transfer writing lane with paragraph prompts, grammar-target checklist, per-promptId evidence storage. |
| I6. Strict mini-test needs behaviour-level QA | Planned | U4 | Extend SSR harness in `tests/react-grammar-surface.test.js`. Playwright intentionally not added. |
| I7. Mode focus behaviour unclear | Already fixed | - | `NO_STORED_FOCUS_MODES` / `NO_SESSION_FOCUS_MODES` already encode the intended mode/focus table; covered by `tests/grammar-engine.test.js`. No reimplementation. |
| I8. Analytics show strength without confidence context | Planned | U6 | Five-label taxonomy: `emerging`, `building`, `consolidating`, `secure`, `needs-repair`. |
| I9. Accepted-answer registry | Planned | U5 | Declarative per-template `answerSpec`; `markByAnswerSpec` replaces `markStringAnswer` call sites; `contentReleaseId` bump policy codified. |

Perfection-pass release gate is U8.

## Source of Truth

- Plan: `docs/plans/2026-04-25-001-feat-grammar-functionality-completeness-plan.md`
- Perfection-pass plan: `docs/plans/2026-04-25-002-feat-grammar-perfection-pass-plan.md`
- AI provider decision: `docs/grammar-ai-provider-decision.md`
- Transfer decision: `docs/grammar-transfer-decision.md`
- Baseline fixtures: `tests/fixtures/grammar-functionality-completeness/legacy-baseline.json`, `tests/fixtures/grammar-functionality-completeness/perfection-pass-baseline.json`
- Guardrail test: `tests/grammar-functionality-completeness.test.js`

## Release Gate Note

- `npm run smoke:production:grammar` remains a manual post-deploy release gate because it depends on the live production origin and demo-session/auth behaviour.
- `npm run check` and local dry-run scripts must stay network/auth independent; production smoke evidence belongs in the PR/deploy notes for Grammar-facing changes.
- External PR checks, including Cloudflare Workers Builds, are part of the PR fix loop. A failing external check must be investigated, fixed in the branch when branch-caused, or documented with deterministic local evidence before merge when it is external infrastructure drift.
