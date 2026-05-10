# Hero Mode pA8 - Metrics Summary

**Phase:** A8 release boundary closure and A-series termination
**Date:** 2026-05-02
**Status:** LIVE PRODUCTION KNOWN-BOUNDARY STATEMENT

---

## 2026-05-10 Supersession Note

This file originally recorded the 2026-05-02 dormant-boundary zero-usage state. That historical zero is superseded by the 2026-05-10 current-boundary evidence:

- `hero-mode-production-counts-2026-05-10.json`
- `hero-mode-current-deploy-enabled-smoke-2026-05-10.json`
- `hero-mode-final-completion-report-2026-05-10.md`

The current production boundary is a James-only named internal rollout. It has one real Hero boundary account, three learner Hero state rows, two learners with Hero events, empty external and excluded account lists, emergency-off set to `false`, and rollout percent `0`. The current evidence does not widen Hero Mode to global normalisation.

---

## Source Truth

| Source | A8 role | Result |
|--------|---------|--------|
| `child_game_state` where `system_id='hero-mode'` | Authoritative Hero state, economy, ledger, Camp | 3 rows, all attached to the one real internal boundary account |
| `event_log` where `system_id='hero-mode'` | Observational Hero telemetry mirror | 4 rows across 2 real-account learners |
| Cloudflare Worker secret-name list | Exposure-control presence only | Internal, external, excluded, emergency-off, and rollout-percent controls present |
| Secret reassertions | Exposure count truth | Internal list reasserted from the single real D1 Hero boundary account; external/excluded lists restored empty; rollout percent set to 0 |
| Production demo checks | Boundary behaviour | Temporary demo external allowlist passed the enabled Hero path, then was restored empty; the demo account was verified hidden and scoped runtime rows were cleaned |

---

## Population Context

| Metric | Live value | Evidence note |
|--------|------------|---------------|
| Adult accounts | 176 | D1 read-only count after A8 demo checks |
| Real accounts | 5 | D1 read-only count |
| Demo accounts | 171 | D1 read-only count |
| Known Hero-exposed accounts | 1 | James-only named internal rollout; external list remains empty and rollout percent is 0 |
| Hero state rows | 3 | Remote D1 read-only count; all rows classify as real internal-boundary learners |
| Hero event rows | 4 | `hero.task.completed` x2, `hero.daily.completed` x1, `hero.coins.awarded` x1 |

---

## Metrics Decision

The live Hero rows are now observable and bounded to the James-only named internal rollout. The row counts do not indicate external exposure: `hero-mode-production-counts-2026-05-10.json` classifies them as one real boundary account, three learner state rows, and two event learners, with no demo/external Hero rows after cleanup.

The metrics support the final decision:

```txt
HOLD WITH KNOWN BOUNDARY - JAMES-ONLY NAMED INTERNAL ROLLOUT
```
