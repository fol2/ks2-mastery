# Hero Mode pA6 - Rollback Rehearsal Evidence

**Phase:** A6 (Production close-out, normalisation, or stop)
**Date:** 2026-05-01
**Status:** LOCAL REHEARSAL PASSED - production rehearsal still required before widening
**Contract:** `docs/plans/james/hero-mode/A/hero-mode-pA6.md`

---

## Local Evidence

| Check | Evidence | Result |
|-------|----------|--------|
| Emergency-off wins over all other classifications | `node scripts/hero-pA5-rollout-resolver-evidence.mjs` scenario S5 | PASS |
| Excluded wins over internal allowlist | `node scripts/hero-pA5-rollout-resolver-evidence.mjs` scenario S4 | PASS |
| 0 percent rollout admits no account by bucket | `node scripts/hero-pA5-rollout-resolver-evidence.mjs` scenario S8 | PASS |
| Resolver precedence and bucket stability | `node --test tests/hero-pA5-rollout-resolver.test.js tests/hero-pA5-safety-regression.test.js` | PASS, 44/44 |
| Emergency-off preserves dormant Hero state | `tests/hero-pA5-safety-regression.test.js` rollback-preserves-state group | PASS |

---

## Production Evidence Boundary

This is not a production rollback rehearsal. No Cloudflare secret was changed and no live smoke account was exercised by this branch.

The production rollback rehearsal still needs to prove:

- Hero surfaces are hidden after rollback.
- Hero command routes return controlled non-500 errors.
- Hero state remains preserved in `child_game_state`.
- Excluded accounts remain excluded.
- Rollback does not require SQL repair or state deletion.

---

## A6 Gate Impact

Local rollback evidence is sufficient to keep the code path eligible for a future controlled rollout. It is not sufficient to normalise Hero Mode.

The selected A6 outcome remains:

```txt
HOLD AT CURRENT ROLLOUT PERCENTAGE
```
