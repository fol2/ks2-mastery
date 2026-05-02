# Hero Mode pA8 - Metrics Summary

**Phase:** A8 release boundary closure and A-series termination
**Date:** 2026-05-02
**Status:** LIVE PRODUCTION ZERO-USAGE STATEMENT

---

## Source Truth

| Source | A8 role | Result |
|--------|---------|--------|
| `child_game_state` where `system_id='hero-mode'` | Authoritative Hero state, economy, ledger, Camp | 0 rows |
| `event_log` where `system_id='hero-mode'` | Observational Hero telemetry mirror | 0 rows |
| Cloudflare Worker secret-name list | Exposure-control presence only | Internal, external, excluded, emergency-off, and rollout-percent controls present |
| Secret rotations | Exposure count truth | Internal/external/excluded lists rotated or created as empty arrays; rollout percent set to 0 |
| Production demo checks | Boundary behaviour | Emergency-off hides read model and rejects command; dormant state returns flag-disabled responses; prepared demo/test account still has no Hero-eligible subjects |

---

## Population Context

| Metric | Live value | Evidence note |
|--------|------------|---------------|
| Adult accounts | 176 | D1 read-only count after A8 demo checks |
| Real accounts | 5 | D1 read-only count |
| Demo accounts | 171 | D1 read-only count |
| Known Hero-exposed accounts | 0 | Secret rotation to empty internal/external allowlists and rollout percent 0 |
| Hero state rows | 0 | D1 read-only count |
| Hero event rows | 0 | D1 read-only count |

---

## Metrics Decision

There are no live Hero usage rows to summarise. That is now an honest zero-usage statement under a known zero-exposure boundary, not an unknown hold.

The metrics support the final decision:

```txt
KEEP DORMANT UNTIL OWNED
```
