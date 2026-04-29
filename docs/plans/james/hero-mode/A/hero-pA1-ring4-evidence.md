# Hero Mode pA1 — Ring 4 Evidence

**Status:** SUPERSEDED BY A2
**Date:** 2026-04-30

## Summary

Ring 4 (internal production enablement) is superseded by A2 Ring A2-2.

**Original scope:** Enable Hero Mode for team accounts in production, observe performance metrics, verify telemetry end-to-end, confirm non-team accounts remain unaffected.

**Why superseded:** A2 Ring A2-2 (internal production enablement) covers the same scope with additional guarantees:
- Per-account override mechanism proven and hardened (PRs #620, #627, #671)
- Ops probe monitors override status and detects non-internal exposure (PR #662)
- Certification manifest validates readiness preconditions (PR #672)
- Privacy validation is now recursive with depth limit (PR #660)
- Launchability is fixed for all subject states (PR #663)

The original Ring 4 assumed only basic enablement. A2 provides hardened operational tooling that makes the internal production phase safer and better instrumented.

**A2 equivalents:**
- Internal production enablement: Ring A2-2
- Override verification: PR #671 (16 tests)
- Ops probe monitoring: PR #662 (12 tests)
- Certification pre-deploy gate: PR #672 (16 tests)
- Privacy end-to-end: PR #660 (16 tests)
- Cohort smoke script: PR #674
