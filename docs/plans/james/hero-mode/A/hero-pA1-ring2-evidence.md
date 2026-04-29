# Hero Mode pA1 — Ring 2 Evidence

**Status:** SUPERSEDED BY A2
**Date:** 2026-04-30

## Summary

Ring 2 (staging seeded validation) is superseded by A2's expanded operational evidence.

**Original scope:** Deploy to staging, run `scripts/hero-pA1-staging-smoke.mjs`, verify telemetry probe returns events.

**Why superseded:** A2 PR #662 expanded the telemetry probe with readiness checks, health indicators, reconciliation gap detection, and override status. This provides richer operational evidence than the original Ring 2 smoke script alone. A2's internal cohort (Ring A2-2 + A2-3) exercises the same infrastructure under real production conditions.

**A2 equivalents:**
- Ops probe expansion: PR #662
- Recursive privacy: PR #660
- Cohort smoke script: PR #674
