# Capacity Evidence

This directory holds release-gating evidence produced by `npm run capacity:classroom` and related smoke scripts. Phase 2 treats capacity as measured evidence, not estimate.

## Retention policy

- `latest-<env>.json` — the most recent run per environment (local, preview, production). Tracked in git; overwritten by every new run.
- `snapshots/<year>-Q<n>/` — quarterly archives kept for trend analysis. Tracked in git.
- `configs/<tier>.json` — pinned threshold configurations for certification-tier runs. Tracked in git, PR-reviewed, never relaxed ad-hoc.
- Intermediate runs (auto-named `<timestamp>-<sha>-<env>.json`) stay local; `.gitignore` excludes them.

## Evidence schema

Evidence files follow `evidenceSchemaVersion: 1` (U1, this PR). `evidenceSchemaVersion: 2` lands with U3 telemetry (D1 row counts, query counts, per-endpoint capacity metrics) and is required for certification tiers above `small-pilot-provisional`.

## Tier eligibility

| Tier | `evidenceSchemaVersion` required |
|------|----------------------------------|
| `smoke-pass` | v1 or later |
| `small-pilot-provisional` | v1 or later |
| `30-learner-beta-certified` | v2 or later (after U3) |
| `60-learner-stretch-certified` | v2 or later (after U3) |
| `100-plus-certified` | v2 or later (after U3) |

## Usage

See `docs/operations/capacity.md` for operator runbooks and the Capacity Evidence table.
