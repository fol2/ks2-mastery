---
title: "P5 60-Learner Diagnostic — Operator Checklist"
type: operator-checklist
date: 2026-04-30
status: ready
prerequisite: "30-learner-beta-certified promoted (PR #756)"
---

# P5 60-Learner Diagnostic — Operator Checklist

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
  --delay-ms 610000 \
  --output /tmp/ks2-p5-60-manifest.json
```

## Execution: Tail Capture

Start bounded raw JSON tail capture BEFORE the diagnostic run:

```sh
P5_RUN=2026-04-30-p5-60-diagnostic
RAW_LOG=/tmp/ks2-${P5_RUN}-worker-tail.jsonl
npm run ops:tail:json > "$RAW_LOG"
```

## Execution: Load Run

```sh
npm run capacity:classroom -- \
  --production \
  --origin https://ks2.eugnel.uk \
  --session-manifest /tmp/ks2-p5-60-manifest.json \
  --learners 60 \
  --bootstrap-burst 20 \
  --rounds 1 \
  --config reports/capacity/configs/60-learner-stretch.json \
  --confirm-production-load \
  --confirm-high-production-load \
  --output reports/capacity/evidence/2026-04-30-p5-60-diagnostic.json
```

## Post-Run: Correlation and Classification

1. Produce tail correlation:
```sh
node scripts/join-capacity-worker-logs.mjs \
  --evidence reports/capacity/evidence/2026-04-30-p5-60-diagnostic.json \
  --logs "$RAW_LOG" \
  --output reports/capacity/evidence/2026-04-30-p5-60-tail-correlation.json
```

2. Produce statement map:
```sh
node scripts/build-capacity-statement-map.mjs \
  --input "$RAW_LOG" \
  --output reports/capacity/evidence/2026-04-30-p5-60-statement-map.json
```

3. Classify using P5 vocabulary and write `reports/capacity/evidence/2026-04-30-p5-60-tail-classification.md`:
   - `60-diagnostic-positive`
   - `60-diagnostic-d1-dominated`
   - `60-diagnostic-worker-cpu-dominated`
   - `60-diagnostic-platform-overhead`
   - `60-diagnostic-payload-bound`
   - `60-diagnostic-query-fanout`
   - `60-diagnostic-write-amplification-bound`
   - `60-diagnostic-setup-blocked`
   - `60-diagnostic-insufficient-logs`

## Raw Log Handling

- RAW LOGS STAY LOCAL: Never commit raw `*.jsonl` Worker tail captures to git
- Committed artefacts: only `*-tail-correlation.json` (redacted), `*-statement-map.json`, classification markdown
- Verify: `git status` must not show any `.jsonl` files staged
- If raw logs must stay local and cannot be committed, build the statement map from the redacted correlation artefact only when it contains the required structured records. Otherwise keep the statement map local and commit only the redacted derived artefact.

## Outcome Classification

After the run, the operator writes `docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p5-60-diagnostic-decision.md` selecting ONE next path. A positive diagnostic is not 60-learner certification; certification still requires repeated evidence and reviewed governance.

## Failure Modes

| Failure | Classification | Next Action |
|---------|---------------|-------------|
| Session manifest rate-limited | `setup-blocked` | Extend bucket-reset delay or use multi-IP |
| Bootstrap P95 > 750ms | classified 60 diagnostic failure | Classify top-tail samples, recommend P6 path |
| Missing CPU/wall coverage | `60-diagnostic-insufficient-logs` | Fix tail capture, re-run |
| All thresholds pass | `60-diagnostic-positive` | Consider repeat certification policy; do not certify from one run |
