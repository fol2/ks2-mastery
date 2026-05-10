# Hero Mode Final Completion Report - 2026-05-10

**Status:** complete for the current production contract boundary; independent code review and contract audit GREEN
**Contract folder:** `docs/plans/james/hero-mode/A/`
**Primary contract:** `docs/plans/james/hero-mode/A/hero-mode-pA8.md`
**Production origin:** `https://ks2.eugnel.uk`
**Deployed Worker version:** `e06ec59e-0ea9-4ee9-bd38-28466d10fd99`
**Deployed code baseline:** `8214e9b12b1478f6f845c7c83455ffabd3af2620`

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
| Keep Hero fully functional for enabled scope | `hero-mode-current-deploy-enabled-smoke-2026-05-10.json` passed on the deployed worker: enabled read model, browser Hero Quest card, browser Hero Camp panel, home-subject-Codex-home navigation, start-task, six-question Worker-owned punctuation session, claim +100 coins, duplicate claim +0 coins, and Camp blocked by insufficient coins. |
| Do not widen global exposure | `npm run check` and deploy output show all checked-in global Hero flags remain `false`; boundary secrets were reasserted to one internal account, empty external/excluded lists, emergency off `false`, and rollout percent 0. |
| Pre-deploy verification | `npm test`: 109193 total, 109181 pass, 0 fail, 12 skipped. Targeted Hero/runtime tests: 172 pass, 0 fail. |
| Build/deploy gate | `npm run check`: Wrangler dry-run build, public asset assertion, and client bundle audit passed. |
| Production deployment | `npm run deploy`: deployed Worker version `e06ec59e-0ea9-4ee9-bd38-28466d10fd99`; production bundle audit passed. |
| Deployed production UI evidence | `hero-mode-production-ui-gating-smoke-2026-05-10.json`: desktop and mobile non-cohort demo UI flows passed with no console errors, request failures, or HTTP failures; mobile setup clipping regression is covered by the refreshed `mobile-390-selected-12.png` screenshot. |
| Deployed production state evidence | `hero-mode-production-counts-2026-05-10.json`: remote D1 returned one real account boundary, 3 learner state rows, 2 event learners, and no demo/external Hero rows after the enabled-path smoke cleanup. |
| Current deployed enabled-path smoke | `hero-mode-current-deploy-enabled-smoke-2026-05-10.json`: temporary demo external allowlist passed, enabled browser UI passed at 390px, Hero commands did not mutate subject data or the monster Codex hash, external list was restored empty, the demo account returned `hero_shadow_disabled`, and scoped demo runtime rows were cleaned. |
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
- `docs/plans/james/hero-mode/A/hero-mode-current-deploy-enabled-ui-screenshots-2026-05-10/mobile-home-hero-camp.png`
- `docs/plans/james/hero-mode/A/hero-mode-current-deploy-enabled-ui-screenshots-2026-05-10/mobile-subject-punctuation.png`
- `docs/plans/james/hero-mode/A/hero-mode-current-deploy-enabled-ui-screenshots-2026-05-10/mobile-codex.png`

---

## Verification Notes

The 2026-05-10 production UI smoke intentionally uses a non-cohort demo path. That makes it safe to rerun and directly verifies the latest fix: disabled Hero sessions no longer produce user-visible console or HTTP failures from client-side Hero read-model loading.

The current-deploy enabled Hero path was replayed on 2026-05-10 without mutating James's real learner state. The smoke used a temporary demo account in `HERO_EXTERNAL_ACCOUNTS`, waited for Cloudflare secret propagation, completed the enabled Hero path, restored `HERO_EXTERNAL_ACCOUNTS=[]`, verified the demo account was hidden again, and then cleaned the scoped demo runtime rows from remote D1.

The enabled browser smoke now proves the Hero Mode interface contract directly on the live deployed UI: Hero Quest card visible, Hero Camp panel visible, navigation from home to the Punctuation subject, subject to Codex, and Codex back to home. The 390px viewport reported `scrollWidth=390` on home, subject, and Codex, with no console errors, request failures, or HTTP failures.

The enabled command smoke also snapshots subject data and the monster Codex before and after `claim-task`, duplicate `claim-task`, and blocked `unlock-monster`. The proof row `hero-commands-did-not-mutate-subject-stars-mastery-or-monsters` confirms Hero commands did not mutate subject Stars, mastery, subject data, or subject-owned monsters.

The current D1 row counts are not three exposed accounts. They are one real account with three learner Hero state rows and two learners with Hero events. The post-smoke counts remain at one state account and one event actor account after demo cleanup.

`scripts/wrangler-oauth.mjs` now prefers the local Wrangler JS entrypoint when available. This keeps the OAuth-safe wrapper path while preserving Windows argv boundaries for `--command "SELECT ..."` D1 evidence queries.
