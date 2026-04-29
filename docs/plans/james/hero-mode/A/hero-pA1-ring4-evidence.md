# Hero Mode pA1 — Ring 4 Evidence (Internal Production)

**Date range:** [start] to [end]
**Status:** PENDING

## Configuration

- Team accounts: [list account IDs]
- Override mechanism: HERO_INTERNAL_ACCOUNTS secret
- Rollback rehearsed before enablement: [Yes/No]

## Team Usage Observations

| Day | Account | Actions | Issues |
|-----|---------|---------|--------|
| 1 | — | — | — |
| 2 | — | — | — |
| 3 | — | — | — |

## Performance Metrics

| Metric | Target | Observed |
|--------|--------|----------|
| D1 read p95 latency | < 200ms | — |
| D1 write p95 latency | < 200ms | — |
| KV quota usage | < 50% | — |
| Worker CPU time p95 | < 50ms | — |

## Telemetry End-to-End

- Production telemetry probe: [events received / not received]
- Privacy validator: [pass / fail]
- Metric families observed: [list]

## Multi-Device/Multi-Tab

- [ ] Second device sees updated state after first completes
- [ ] Stale request from old tab gets 409 (not 500)
- [ ] Multi-tab conflict resolution works

## Non-Team Account Verification

- [ ] Non-team accounts see no Hero surfaces
- [ ] Non-team accounts get normal read-model (no Hero block)

## Ring 4 Verdict

- P0 defects found: [count]
- P1 defects found: [count]
- D1 latency within budget: [Yes/No]
- Telemetry end-to-end: [Yes/No]

**Verdict:** [PASS / FAIL / HOLD]
**Assessed by:** [name]
