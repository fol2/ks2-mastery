---
phase: grammar-qg-p12
title: Grammar QG P12 — Final Production Certification Report
certification_decision: CERTIFIED_PRE_DEPLOY
certification_phase: grammar-qg-p12
final_content_release_id: grammar-qg-p11-2026-04-30
content_release_unchanged: true
scoring_change: none
mastery_change: none
reward_change: none
hero_mode_change: none
post_deploy_smoke_evidence: pending-deployment
template_count: 78
concept_count: 18
inventory_item_count: 2340
---

# Grammar QG P12 — Final Production Certification Report

## 1. Source Boundary

| Field | Value |
|-------|-------|
| Code commit | `6f89df58338737458676b530868e77f352192c75` |
| Content release | `grammar-qg-p11-2026-04-30` |
| Evidence manifest | `reports/grammar/grammar-qg-p11-certification-manifest.json` |
| Smoke evidence | pending deployment |

---

## 2. Denominator

- 18 grammar concepts
- 78 templates (58 selected-response, 20 constructed-response, 52 generated, 26 fixed)
- 2,340 inventory items (78 templates x 30 seeds)

---

## 3. P11 Learner-Surface Fix Confirmation

| Template | Fix | Status |
|----------|-----|--------|
| `identify_words_in_sentence` | reads actual sentence (P10 bug fixed) | Confirmed |
| `subject_object_choice` | reads actual sentence (P10 bug fixed) | Confirmed |
| `qg_p4_voice_roles_transfer` | announces underlined noun phrase not word (P10 bug fixed) | Confirmed |

---

## 4. Evidence Artefact Table

| Artefact | Path | Release ID |
|----------|------|------------|
| Certification manifest | reports/grammar/grammar-qg-p11-certification-manifest.json | grammar-qg-p11-2026-04-30 |
| Render inventory | reports/grammar/grammar-qg-p11-render-inventory.json | grammar-qg-p11-2026-04-30 |
| Render inventory (redacted) | reports/grammar/grammar-qg-p11-render-inventory-redacted.md | grammar-qg-p11-2026-04-30 |
| Quality register | reports/grammar/grammar-qg-p11-quality-register.json | grammar-qg-p11-2026-04-30 |
| Distractor audit | reports/grammar/grammar-qg-p11-distractor-audit.json | grammar-qg-p11-2026-04-30 |
| Marking matrix | reports/grammar/grammar-qg-p11-marking-matrix.json | grammar-qg-p11-2026-04-30 |
| Certification status map | reports/grammar/grammar-qg-p11-certification-status-map.json | grammar-qg-p11-2026-04-30 |
| Semantic audit script | scripts/audit-grammar-prompt-cues-semantic.mjs | — |
| Production smoke | reports/grammar/grammar-production-smoke-grammar-qg-p11-2026-04-30.json | pending |

---

## 5. Production Smoke Result

- **Status:** pending deployment
- The smoke script is ready and validated
- Runbook at: `docs/plans/james/grammar/questions-generator/grammar-qg-p12-smoke-runbook.md`

---

## 6. Known Limitations

- Production smoke evidence not yet produced (requires live deployment)
- Report will be updated to CERTIFIED_POST_DEPLOY after smoke passes

---

## 7. No-Change Statement

| System | Status |
|--------|--------|
| Scoring | unchanged |
| Mastery | unchanged |
| Rewards | unchanged |
| Stars | unchanged |
| Mega | unchanged |
| Hero Mode | unchanged |
| Hero Coins | unchanged |
| Concordium | unchanged |
| Monster progression | unchanged |
