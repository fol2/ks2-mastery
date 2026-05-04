---
title: "Punctuation P14 multi-gate contract validation with 9-agent audit panel"
date: 2026-05-04
category: workflow-issues
module: punctuation-qg
problem_type: workflow_issue
component: development_workflow
severity: medium
applies_when:
  - "Multi-gate quality contracts require structured certification beyond tests-pass"
  - "Post-expansion quality hardening where content growth must not regress existing behaviour"
  - "Pre-production certification needs evidence-based consensus from multiple perspectives"
tags:
  - punctuation
  - contract-validation
  - quality-hardening
  - multi-gate
  - adversarial-review
  - parallel-agents
  - audit-panel
  - PR-per-finding
related_components:
  - testing_framework
  - tooling
---

# Punctuation P14 multi-gate contract validation with 9-agent audit panel

## Context

A Punctuation P14 post-live quality-hardening contract defined 8 explicit gates (source identity, apostrophe regression, paragraph boundary marking, transfer depth, session variety, UX review, star pacing, production smoke). The implementation (PRs #845 + #847) expanded the runtime pool from 3,312 to 3,564 items with 252 new transfer-mode items across 14 skill families, while fixing apostrophe grammar defects and adding paragraph sentence-boundary enforcement.

The work was already merged to main. A structured validation was needed to certify that every gate's acceptance criteria was satisfied before production deployment — going beyond "tests pass" to contract-level evidence certification with independent consensus.

Prior art: Punctuation QG P9 (47 gates, CERTIFIED_PRE_DEPLOY) established gated contract validation. This session refined the execution topology into an 8-step pipeline with a novel 3×3×3 audit panel composition. (auto memory [claude])

## Guidance

The pipeline executes in strict sequence:

### Step 1 — Orchestrator validates against contract

The orchestrator reads the full contract, identifies every gate's acceptance criteria, runs the test suite and audit scripts, cross-references all JSON artefacts against report claims, and compiles a findings list with gate references.

Key: the orchestrator does NOT fix anything — it only observes and records.

### Step 2 — Parallel fix dispatch (worktree isolation)

Each finding is dispatched to an independent fix worker. Each worker:
- Operates in an isolated git worktree (not the main checkout)
- Creates exactly one PR for its finding
- Never shares state with other workers

### Step 3 — Code review gate per PR

Each PR is reviewed by a dedicated code-review agent. Merge only on explicit pass. This creates an atomic, reviewable, revertable unit per finding.

### Step 4 — 9-agent audit panel (3×3×3 composition)

After all fix PRs are merged, dispatch a final audit panel:
- **3 contract auditors** — verify each gate's acceptance criteria against evidence
- **3 code reviewers** — verify implementation correctness, edge cases, regex safety
- **3 QA agents** — verify test coverage, runtime behaviour, adversarial marking

Each agent works independently with identical instructions. Consensus (majority agreement) determines pass/fail.

### Step 5 — Non-blocking findings dispatch

Panel findings that don't block certification are dispatched to another round of parallel fix workers, same worktree-isolation pattern.

### Step 6 — Second code review round

Same pattern as Step 3 for the non-blocking fix PRs.

### Step 7 — Re-run 9-agent panel

Confirms all-clear on the post-fix state. If new blocking findings emerge, loop back to Step 5.

### Step 8 — Housekeeping (first-class step)

Remove all worktrees, delete local and remote branches. Not an afterthought — worktree/branch accumulation degrades developer experience.

```bash
git worktree unlock <path> && git worktree remove <path> --force
git branch -D <local-branch>
git push origin --delete <remote-branch>
git fetch --prune origin
git worktree prune
```

## Why This Matters

- **Multi-perspective coverage catches what single-pass misses.** The 3×3×3 panel in this session found: a Windows entrypoint bug (`import.meta.url` guard), a seed collision in the star-pacing simulator, tautological profiles producing identical traces, a missing facet label, and a hardcoded constant — none caught by any single-pass review.
- **Parallel execution compresses wall-clock time.** 8 independent fix PRs completed in the time of ~1 sequential fix.
- **PR-per-finding creates atomic units.** Each change addresses exactly one problem, making review trivial and revert safe.
- **3×3×3 provides statistical confidence.** Nine agents with three distinct role perspectives reduce the probability that a defect passes all reviewers.
- **Housekeeping prevents drift.** This session accumulated 9 worktrees and 8 remote branches that would pollute future work if not cleaned.

## When to Apply

- Any multi-gate contract with explicit acceptance criteria (scales from 3 gates to 47+)
- Quality-hardening phases where content expansion must not regress existing behaviour
- Pre-production certification requiring evidence beyond "tests pass"
- Post-merge validation when work is on main but not yet deployed
- Any situation where a single reviewer's confidence is insufficient for the risk profile

## Examples

### Session output: 8 PRs merged

| PR | Finding | Category |
|:---|:---|:---|
| #849 | Source audit multi-skill counting note | Documentation |
| #850 | Gate 5 multi-seed floor alignment | Contract clarification |
| #851 | Stale doc static check references | Test fix |
| #859 | Verdict label → `QUALITY_PATCH_READY` | Contract compliance |
| #860 | `token_variety` facet label + derive `TOTAL_REWARD_UNITS` | Code quality |
| #862 | 4 missing test cases | Test coverage |
| #863 | Star-pacing simulator (exit-code + seed + profile fix) | Script correctness |
| #870 | Windows entrypoint guard | Cross-platform fix |

### Agent compositions

- **Fix workers:** 1 per finding, isolated worktree, single-PR output, `mode: dontAsk`
- **Code reviewers:** 1 per PR, subagent_type `pr-review-toolkit:code-reviewer`, pass/fail verdict
- **Audit panel:** 3× `ce-adversarial-document-reviewer` + 3× `ce-correctness-reviewer` + 3× general-purpose QA

### Novel patterns introduced

1. **Normalised inflation rule (Gate 6 v3):** Stars-per-correct ratio normalised against the natural 6/4 = 1.5× round-length ratio. Only the canonical `always-correct` profile is decision-bearing; others are diagnostic.
2. **Attestation source legend:** Smoke output distinguishes `worker-attested` fields (meaningful cross-checks) from `client-asserted` fields (shape consistency only).
3. **Multi-seed variety gating:** 5 seeds × 20 sessions, gate on worst-seed (p95 with n=5) rather than a single lucky seed.

### Contract verdict labels (from P14 contract)

```
QUALITY_PATCH_READY                          ← current standing
QUALITY_PATCH_DEPLOYED_SOURCE_VERIFIED
QUALITY_PATCH_PRODUCTION_VERIFIED
TRANSFER_DEPTH_HARDENED
FULL_PUNCTUATION_SUBJECT_CERTIFIED           ← target after deploy + smoke
```

## Evolution of the pattern (session history)

The 3×3×3 audit panel is the third generation of the multi-agent validation pattern in this codebase:

1. **P8 (2026-04-29):** First 10-auditor panel. Three rounds needed — first found real gaps, second produced a false alarm (auditor hand-reconstructed IDs diverged from production path), third confirmed all-clear. Lesson: trust the verify command output over auditor hand-reconstruction.
2. **P9 (2026-04-30):** Formalised into `/deliver` Phase 4. 10 reviewers across distinct concerns (Functional, Test Coverage, Code Quality, Architecture, Security, Performance, UX + 3 others). First time independence enforcement was self-corrected mid-run.
3. **P14 (2026-05-04):** Evolved to 3×3×3 composition (auditors + code reviewers + QA). Smaller count but with role-group consensus — statistical confidence through independent agreement within each role, not just across roles.

Key lesson from P8 that applies here: auditor agents that reconstruct expected values from scratch can diverge from the actual production path. The authoritative check is always the production verify command itself (in P14: `scripts/audit-punctuation-qg-p14-source.mjs`, `scripts/simulate-punctuation-qg-p14-star-pacing.mjs`). (session history)

## Related

- [Autonomous certification phase-wave execution](../workflow-issues/autonomous-certification-phase-wave-execution-2026-04-27.md) — parallel subagent workers, wave execution pattern
- [Multi-agent contract audit orchestration](../workflow-issues/multi-agent-contract-audit-orchestration-2026-05-04.md) — grammar P18 variant of the same pattern
- [Provenance-gated certification and adversarial SDLC](../architecture-patterns/provenance-gated-certification-and-adversarial-sdlc-2026-04-30.md) — the adversarial review cycle pattern
- [Evidence-locked production certification](../architecture-patterns/evidence-locked-production-certification-2026-04-29.md) — manifest-driven gate validation
- [Punctuation QG P8 production quality certification](../architecture-patterns/punctuation-qg-p8-production-quality-certification-2026-04-30.md) — prior punctuation certification (last entry in solutions)
- PR #845: [feat(punctuation): P14 quality hardening](https://github.com/fol2/ks2-mastery/pull/845)
- PR #847: [fix(punctuation): round-2 adversarial review — 17 findings](https://github.com/fol2/ks2-mastery/pull/847)
