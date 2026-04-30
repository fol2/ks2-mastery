---
title: "P4 60-Learner Diagnostic — Operator Checklist"
type: operator-checklist
date: 2026-04-30
status: ready
prerequisite: "30-learner-beta-certified promoted (PR #756)"
---

# P4 60-Learner Diagnostic — Operator Checklist

## Prerequisites

- [ ] 30-learner beta promoted and verified (U2 complete)
- [ ] Cloudflare account credentials available
- [ ] Access to `wrangler tail` for Worker log capture
- [ ] Session-manifest preparation window (requires 30+ minutes for rate-limit bucket resets)

## Setup: Session Manifest

The rate limit `DEMO_LIMITS.createIp = 30` per 10-minute window prevents a single host from creating 60 demo sessions in one burst. Use session-manifest mode with bucket-reset delays.

### Strategy: 28/28/4 batches

1. Prepare batch 1: 28 sessions (within single-IP bucket)
2. Wait 10 minutes for bucket reset
3. Prepare batch 2: 28 sessions
4. Wait 10 minutes for bucket reset
5. Prepare batch 3: 4 sessions (remaining)

### Command

```sh
# Step 1: Prepare session manifest
node scripts/prepare-session-manifest.mjs \
  --origin https://ks2.eugnel.uk \
  --learners 60 \
  --batch-size 28 \
  --bucket-reset-minutes 10 \
  --output /tmp/ks2-p4-60-manifest.json
```

## Execution: Tail Capture

Start bounded raw JSON tail capture BEFORE the diagnostic run:

```sh
P4_RUN=2026-04-30-p4-60-diagnostic
RAW_LOG=/tmp/ks2-${P4_RUN}-worker-tail.jsonl
npm run ops:tail:json > "$RAW_LOG"
```

## Execution: Load Run

```sh
npm run capacity:classroom -- \
  --origin https://ks2.eugnel.uk \
  --session-manifest /tmp/ks2-p4-60-manifest.json \
  --learners 60 \
  --bootstrap-burst 20 \
  --rounds 1 \
  --config reports/capacity/configs/60-learner-stretch.json \
  --output reports/capacity/evidence/2026-04-30-p4-60-diagnostic.json
```

## Post-Run: Correlation and Classification

1. Produce tail correlation:
```sh
node scripts/correlate-worker-tail.mjs \
  --evidence reports/capacity/evidence/2026-04-30-p4-60-diagnostic.json \
  --tail "$RAW_LOG" \
  --output reports/capacity/evidence/2026-04-30-p4-60-tail-correlation.json
```

2. Produce statement map:
```sh
node scripts/build-statement-map.mjs \
  --evidence reports/capacity/evidence/2026-04-30-p4-60-diagnostic.json \
  --output reports/capacity/evidence/2026-04-30-p4-60-statement-map.json
```

3. Classify using P4 vocabulary:
   - `d1-dominated`
   - `worker-cpu-dominated`
   - `client-network-or-platform-overhead`
   - `query-fanout`
   - `payload-bound`
   - `write-amplification-bound`
   - `unclassified-insufficient-logs`
   - `setup-blocked`

## Raw Log Handling

- RAW LOGS STAY LOCAL: Never commit `*.jsonl` tail captures to git
- Committed artefacts: only `*-tail-correlation.json` (redacted), `*-statement-map.json`, classification markdown
- Verify: `git status` must not show any `.jsonl` files staged

## Outcome Classification

After the run, the operator writes `docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p4-decision-record.md` selecting ONE Phase 5 path.

## Failure Modes

| Failure | Classification | Next Action |
|---------|---------------|-------------|
| Session manifest rate-limited | `setup-blocked` | Extend bucket-reset delay or use multi-IP |
| Bootstrap P95 > 750ms | `60-learner-classified-failure` | Classify top-tail samples, recommend P5 path |
| Missing CPU/wall coverage | `unclassified-insufficient-logs` | Fix tail capture, re-run |
| All thresholds pass | `60-learner-positive-diagnostic` | Consider repeat certification policy |
