# Hero Mode pA8 - Rollback Evidence

**Phase:** A8 release boundary closure and A-series termination
**Date:** 2026-05-02
**Status:** EMERGENCY-OFF REHEARSAL PASSED FOR DORMANT BOUNDARY

---

## 2026-05-10 Supersession Note

This file remains valid as historical emergency-off rehearsal evidence for the earlier dormant boundary. Its zero-row statements are superseded for the current production boundary by `hero-pA8-final-decision.md`, `hero-pA8-known-account-smoke-evidence.md`, `hero-mode-current-deploy-enabled-smoke-2026-05-10.json`, and `hero-mode-final-completion-report-2026-05-10.md`.

The current boundary is a James-only named internal rollout, not a dormant zero-row state. On 2026-05-10 the closure reasserted empty external and excluded account lists, emergency-off `false`, rollout percent 0, and one real internal boundary account. A temporary demo external allowlist was used only for current deployed enabled-path smoke, then restored empty; the demo account was verified hidden and its scoped runtime rows were cleaned.

---

## Evidence Collected

| Check | Evidence | Result |
|-------|----------|--------|
| Emergency-off control exists | `HERO_EMERGENCY_DISABLED` secret name present after A8 | PASS |
| Emergency-off can be enabled | Secret temporarily set to `true` during rehearsal | PASS |
| Read model hides Hero under emergency-off | Production demo session received status 200 with `hero.heroEnabled=false` and `hero.ui.enabled=false` | PASS |
| Hero command rejected under emergency-off | Production demo `/api/hero/command` returned controlled 403 `hero-unavailable` | PASS |
| Emergency-off can be restored | Secret restored to `false` after rehearsal | PASS |
| Dormant boundary restored | Post-rehearsal read model returned 404 `hero_shadow_disabled`; command returned 404 `hero_launch_disabled` | PASS |
| State preserved | Hero state rows stayed 0; Hero event rows stayed 0 | PASS |

---

## Boundary

This rehearsal proves the emergency brake exists and hides/rejects Hero while the release is dormant. It does not prove re-enablement of an existing exposed cohort with balances or Hero Pool state, because A8 deliberately ended with zero exposed accounts and zero Hero rows.

That limitation blocks widening and normalisation, but it does not block the final dormant decision.
