# Grammar Monster Status/Codex Sidebar Alignment Completion Report

Date: 2026-05-08

## Summary

The Grammar landing sidebar and Monster Codex now resolve Grammar monster visual state through the same asset-stage and asset-branch contract.

Two production defects were fixed:

- Grammar display stages are child-facing stages `0-5`, while monster image assets are `0-4`. The sidebar now uses the Codex-aligned `assetStage` instead of passing display stage directly to the renderer.
- The sidebar companion panel no longer hard-codes Grammar monster branch `b1`; it carries the branch from `progressForGrammarMonster`, matching Codex for the same learner state.

## Landed Commits

- `d9919115 Fix Grammar monster asset stage parity`
- `e40cc29e Align Grammar sidebar monster branches`

## Files Changed

- `src/platform/game/mastery/grammar.js`
- `src/subjects/grammar/components/grammar-view-model.js`
- `src/subjects/grammar/components/GrammarSetupScene.jsx`
- `tests/grammar-star-e2e.test.js`
- `tests/grammar-ui-model.test.js`

## Verification

- `node --test tests\grammar-ui-model.test.js tests\grammar-star-e2e.test.js tests\render.test.js tests\codex-view-model.test.js tests\ui-companion-panel-data-contract.test.js`: passed, 186/186.
- `npm test`: passed, 109170 pass, 0 fail, 12 skipped.
- `npm run check`: passed, including Wrangler OAuth dry-run build and client bundle audit.
- `git push origin main`: passed with pre-push `npm test`, 109170 pass, 0 fail, 12 skipped.

## Production Deployment

- Command: `npm run deploy`
- Origin: `https://ks2.eugnel.uk`
- Worker version: `4026c822-157a-427c-90f3-0362d393adea`
- Deployed commit: `e40cc29ef65a02646c39487bb29744e689193f9f`
- Production bundle audit: passed for `https://ks2.eugnel.uk/`.

## Production Evidence

- Bootstrap smoke: `reports/hotfixes/grammar-monster-status-codex-sidebar-alignment/bootstrap-production-smoke-2026-05-08.json`
- Grammar smoke: `reports/hotfixes/grammar-monster-status-codex-sidebar-alignment/grammar-production-smoke-2026-05-08.json`
- Browser Codex/sidebar parity probe: `reports/hotfixes/grammar-monster-status-codex-sidebar-alignment/browser-codex-sidebar-parity-2026-05-08.json`
- Browser parity probe script: `reports/hotfixes/grammar-monster-status-codex-sidebar-alignment/browser-parity-probe.mjs`
- Grammar sidebar screenshot: `reports/hotfixes/grammar-monster-status-codex-sidebar-alignment/grammar-sidebar-production-2026-05-08.png`
- Codex screenshot: `reports/hotfixes/grammar-monster-status-codex-sidebar-alignment/codex-production-2026-05-08.png`

The browser parity probe used a production demo browser session, seeded one correct Grammar answer for Chronalyx, then verified:

- sidebar Chronalyx asset stage is `0`;
- Codex Chronalyx asset stage is `0`;
- sidebar and Codex branches match;
- sidebar and Codex stages match;
- Codex card class includes `stage-0`;
- Codex image alt text is `Chronalyx Egg`.

The recorded result was `ok: true`, with both sidebar and Codex resolving Chronalyx to branch `b2`, stage `0`.

## Independent Review

- Code review: GREEN after the final branch-parity fix.
- Contract audit: GREEN after production deployment and live browser evidence.

No reviewer or auditor blockers remain.
