# Hero Mode Final Completion Report - 2026-05-10

**Status:** complete for the current production contract boundary, pending final independent re-review  
**Contract folder:** `docs/plans/james/hero-mode/A/`  
**Primary contract:** `docs/plans/james/hero-mode/A/hero-mode-pA8.md`  
**Production origin:** `https://ks2.eugnel.uk`  
**Deployed Worker version:** `6b0ece44-9f85-44c7-aa12-3e6a96d8d2e0`  
**Deployed code baseline:** `6dd02cdb73c60df5154b8018789c9cd33acb9ad5`

---

## Outcome

Hero Mode is fully functioning within the pA8 production boundary: James-only named internal rollout, no global default-on, rollout percentage 0, and global checked-in Hero flags false.

This report does not claim global normalisation. pA8 explicitly blocks normalisation until Stage 2/Stage 3 evidence exists.

The 2026-05-10 closure reasserted the production boundary secrets through `scripts/wrangler-oauth.mjs`: `HERO_INTERNAL_ACCOUNTS` from the single real D1 Hero boundary account, `HERO_EXTERNAL_ACCOUNTS=[]`, `HERO_EXCLUDED_ACCOUNTS=[]`, `HERO_EMERGENCY_DISABLED=false`, and `HERO_ROLLOUT_PERCENT=0`. The evidence records only PII-safe account proofs.

---

## Prompt-to-Artifact Checklist

| Requirement | Evidence |
|-------------|----------|
| Complete the involved Hero Mode contract | pA8 remains the active release-boundary contract: `hero-mode-pA8.md`; final pA8 decision remains `HOLD WITH KNOWN BOUNDARY - JAMES-ONLY NAMED INTERNAL ROLLOUT`. |
| Expand only for contract-related fixing | The shipped code path gates client Hero read-model loads behind `session.heroMode.shadowEnabled`, preventing disabled/non-cohort production sessions from issuing failing Hero read-model requests. |
| Keep Hero fully functional for enabled scope | `hero-mode-current-deploy-enabled-smoke-2026-05-10.json` passed on the deployed worker: enabled read model, start-task, six-question Worker-owned punctuation session, claim +100 coins, duplicate claim +0 coins, and Camp blocked by insufficient coins. |
| Do not widen global exposure | `npm run check` and deploy output show all checked-in global Hero flags remain `false`; boundary secrets were reasserted to one internal account, empty external/excluded lists, emergency off `false`, and rollout percent 0. |
| Pre-deploy verification | `npm test`: 109191 total, 109179 pass, 0 fail, 12 skipped. Targeted Hero/auth tests: 111 pass, 0 fail. |
| Build/deploy gate | `npm run check`: Wrangler dry-run build, public asset assertion, and client bundle audit passed. |
| Production deployment | `npm run deploy`: deployed Worker version `6b0ece44-9f85-44c7-aa12-3e6a96d8d2e0`; production bundle audit passed. |
| Deployed production UI evidence | `hero-mode-production-ui-gating-smoke-2026-05-10.json`: desktop and mobile demo UI flows passed with no console errors, request failures, or HTTP failures. |
| Deployed production state evidence | `hero-mode-production-counts-2026-05-10.json`: remote D1 returned one real account boundary, 3 learner state rows, 2 event learners, and no demo/external Hero rows after the enabled-path smoke cleanup. |
| Current deployed enabled-path smoke | `hero-mode-current-deploy-enabled-smoke-2026-05-10.json`: temporary demo external allowlist passed, external list was restored empty, the demo account returned `hero_shadow_disabled`, and scoped demo runtime rows were cleaned. |
| Independent review remediation | Code-review and contract-audit findings were addressed by wrapper-safe D1 evidence, PII-safe boundary cardinality, current deployed enabled-path smoke, secret reassertion evidence, stale-doc supersession notes, and this updated report. |
| Evidence placed beside task source | New evidence and report files are in `docs/plans/james/hero-mode/A/`. |

---

## Evidence Files

- `docs/plans/james/hero-mode/A/hero-mode-deploy-evidence-2026-05-10.json`
- `docs/plans/james/hero-mode/A/hero-mode-production-ui-gating-smoke-2026-05-10.json`
- `docs/plans/james/hero-mode/A/hero-mode-production-ui-gating-screenshots-2026-05-10/desktop-1024-selected-8.png`
- `docs/plans/james/hero-mode/A/hero-mode-production-ui-gating-screenshots-2026-05-10/mobile-390-selected-12.png`
- `docs/plans/james/hero-mode/A/hero-mode-production-counts-2026-05-10.json`
- `docs/plans/james/hero-mode/A/hero-mode-production-counts-2026-05-10.mjs`
- `docs/plans/james/hero-mode/A/hero-mode-production-counts-2026-05-10.sql`
- `docs/plans/james/hero-mode/A/hero-mode-current-deploy-enabled-smoke-2026-05-10.json`
- `docs/plans/james/hero-mode/A/hero-mode-current-deploy-enabled-smoke-2026-05-10.mjs`

---

## Verification Notes

The 2026-05-10 production UI smoke intentionally uses a non-cohort demo path. That makes it safe to rerun and directly verifies the latest fix: disabled Hero sessions no longer produce user-visible console or HTTP failures from client-side Hero read-model loading.

The current-deploy enabled Hero path was replayed on 2026-05-10 without mutating James's real learner state. The smoke used a temporary demo account in `HERO_EXTERNAL_ACCOUNTS`, waited for Cloudflare secret propagation, completed the enabled Hero path, restored `HERO_EXTERNAL_ACCOUNTS=[]`, verified the demo account was hidden again, and then cleaned the scoped demo runtime rows from remote D1.

The current D1 row counts are not three exposed accounts. They are one real account with three learner Hero state rows and two learners with Hero events. The post-smoke counts remain at one state account and one event actor account after demo cleanup.

`scripts/wrangler-oauth.mjs` now prefers the local Wrangler JS entrypoint when available. This keeps the OAuth-safe wrapper path while preserving Windows argv boundaries for `--command "SELECT ..."` D1 evidence queries.
