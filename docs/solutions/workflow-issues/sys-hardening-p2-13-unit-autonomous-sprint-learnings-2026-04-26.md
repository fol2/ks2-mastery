---
title: "Running 13-unit autonomous sprints with adversarial review under high concurrency"
date: "2026-04-26"
category: workflow-issues
module: sys-hardening
problem_type: workflow_issue
component: development_workflow
severity: high
applies_when:
  - "Autonomous scrum-master orchestration with 10+ units in a single sprint"
  - "Parallel worktree-isolated workers feeding concurrent commits to main"
  - "Adversarial reviewer dispatch on state-machine or security-surface units"
  - "Code-splitting or build-config changes that require same-PR atomicity"
  - "Test harness exercises controller directly while production routes through a shadow handler"
tags:
  - scrum-master-orchestration
  - adversarial-reviewer
  - worktree-isolation
  - esbuild-code-splitting
  - test-harness-production-divergence
  - sys-hardening
  - autonomous-sdlc
  - same-pr-atomicity
related_components:
  - tooling
  - testing_framework
---

# Running 13-unit autonomous sprints with adversarial review under high concurrency

## Context

When a sprint exceeds ~5 implementation units that must ship within a single day, a single-agent sequential workflow becomes the bottleneck. Sys-Hardening Phase 2 required 13 units (SH2-U0 through SH2-U12) to land in ~12 hours: double-submit guards, rehydrate sanitisers, demo-expiry UX, TTS hardening, empty-state primitives, 85 visual baselines, a11y golden scenes, CSP inventory + inline-style migration, HSTS preload audit, code-splitting with byte-budget gate, GitHub Actions CI, and an error-copy oracle.

The repo received 81 total commits to main on sprint day — 13 from sys-hardening plus ~68 from other concurrent streams (spelling P2, grammar Phase 4, punctuation Phase 4, capacity, admin P1.5, bootstrap hotfixes). The prior Phase 1 sprint (13 units, 14 PRs, 19 reviewer-found blockers) established the base pattern; Phase 2 scaled it under significantly higher concurrency pressure.

The question: how do you orchestrate dozens of parallel agent workers and reviewers on a shared codebase without merge-clobber, stale-branch, or silent-green regressions?

(auto memory [claude]: base pattern established in `feedback_autonomous_sdlc_cycle.md` across 8+ sprints from 2026-04-25)

## Guidance

### 1. Scrum-master-only main agent

The main agent MUST NOT write code. It acts exclusively as dispatcher, collector, and merge-decision-maker.

Per-unit SDLC cycle:
1. **Worker subagent** (`isolation: "worktree"`) — implement, test, push, open PR → STOP and report.
2. **2–4 parallel ce-\* reviewers** — dispatch by concern: correctness (always), testing (always), adversarial (for state-machine-adjacent / security-surface / build-pipeline units), security (for auth/CSP paths), design-lens (for UI units).
3. **Review-follower subagent** — address all blockers in a single commit, push → STOP and report.
4. **Final re-reviewer** — narrow scope: verify ONLY the blockers from the prior round are resolved. Verdict: MERGE-READY or BLOCK-REMAINS. No partial approvals.
5. **Main agent merges** via `gh pr merge --squash --delete-branch`.

P2 results: 13 PRs (#255–#328), +14,068/−222 lines, 205 changed-file slots, 25 blockers found and resolved, 0 merge-clobber incidents.

### 2. Pre-create per-unit worktrees

Every worker subagent gets its own worktree created BEFORE dispatch. P1 had a U1+U9 shared-worktree corruption incident (auto memory [claude]: `feedback_subagent_tool_availability.md`). P2 pre-created all worktrees via `isolation: "worktree"` and had zero path-collision incidents across 13 units.

When rebases are needed (6 of 13 units required at least one), the isolated worktree means the rebase affects only that unit's files — no cross-contamination.

### 3. Adversarial reviewers: failure-scenarios-first

Adversarial reviewers MUST construct failure scenarios FIRST, then check whether the code handles them. Pattern-match review ("does this look right?") missed all four highest-severity blockers in P2:

| Unit | Blocker | Severity | How adversarial found it |
|------|---------|----------|--------------------------|
| U2 | Zombie `phase:'summary'` after sanitiser drops `summary` but leaves phase intact → "Start again" CTA clickable from empty shell | Permanent learner lockout | Constructed: "complete round → reload → click subject card — what renders?" |
| U2 | `pendingCommand:'start-session'` survives rehydrate → setup scene "Starting…" permanently, all controls disabled | Permanent learner lockout | Constructed: "click Begin → crash before response → rehydrate — what state?" |
| U6 | Mask-coverage measured against viewport (1440×900) not scoped target (320×480) → 100% target mask = 11.85% viewport → silent-green | P1 U5 silent-green re-introduced at desktop viewports | Constructed: "what if mask covers 100% of the captured element but < 30% of viewport?" |
| U10 | Production-audit regex `/import\s+/` misses esbuild minified `import{X}from"./chunk.js"` → 4 shared chunks (~123 KB) ship un-audited | Forbidden tokens bypass production security scan | Measured: ran regex against REAL minified output, found 0 matches vs expected 4 |
| U10 | esbuild outdir + content-hash doesn't clean → stale `AdminHubSurface-AAAA.js` ships alongside `AdminHubSurface-BBBB.js` | Un-audited stale code in production | Traced: build script → no rm → build-public copies all .js → audit reads metafile only |

12 of 25 total blockers came from adversarial reviewers — the single highest-ROI review type.

### 4. Worker stall recovery: clean restart, not resume

When SH2-U4's first worker stalled at 600 s (wrote a wrapper hook but never modified the core `tts.js` file), resuming from transcript proved fragile — the confused mental model that caused the stall carried forward.

Reliable pattern:
1. Kill the stalled worker.
2. Dispatch a **fresh** worker with explicit anti-pattern documentation: "DO NOT repeat prior worker's mistake: [specific description]. Your scope is: [enumerated files + changes]."
3. Include the full plan section verbatim so the fresh worker has complete context.

### 5. Same-PR atomicity for coupled changes

When multiple files are individually broken without each other, they MUST land in the same commit. SH2-U10's code-splitting required three fixes atomically:

- **Worker allowlist** (`worker/src/app.js`): exact-equality → prefix+extension match — otherwise split chunks 404.
- **audit-client-bundle.mjs**: walk all chunks from esbuild metafile — otherwise split chunks bypass forbidden-token audit.
- **production-bundle-audit.mjs**: regex widened for minified static imports — otherwise audit misses real chunk references.

Verification question for any coupled change: "If I revert any single file in this PR, does the build still produce correct output AND does the audit pipeline still cover all outputs?" If the answer is "no" for any file, all files must be in the same commit.

### 6. First-CI-PR ships with continue-on-error for pre-existing failures

When the first PR adding a CI workflow surfaces pre-existing failures unrelated to the PR's changes, ship with temporary `continue-on-error: true` plus an inline tracking comment for each known failure.

SH2-U11's `audit.yml` immediately went red due to `src/subjects/spelling/data/*` forbidden-imports that predated Phase 2 entirely. Correct response:

```yaml
- name: Audit client bundle
  # PRE-EXISTING: spelling/data/*.js forbidden-import violations.
  # Tracking follow-up: decouple events.js + read-model.js from data modules.
  # Remove continue-on-error once resolved.
  continue-on-error: true
  run: npm run audit:client
```

This preserves CI signal (failures are visible in logs) without blocking every PR on cross-team debt.

### 7. Inventory-first before committing thresholds

Scope estimates drifted 1.26–3.03× across all measured dimensions in P2:

| Item | Estimated | Actual | Drift ratio |
|------|-----------|--------|-------------|
| `style={}` inline sites | ~224 (charter ~93+) | 282 | 1.26× (plan) / 3.03× (charter) |
| Visual baseline PNGs | ≥ 60 | 85 | 1.42× |
| Reviewer blockers | ~19 (P1 benchmark) | 25 | 1.32× |

Run a concrete inventory pass (grep, AST count, or script) before locking unit boundaries or acceptance thresholds. The F-03 deepening that lowered the migration target from 30–50 to ≥ 20 was correct and prevented a missed-target scenario.

### 8. Design-lens reviewers catch UX defects invisible to correctness reviewers

SH2-U5's two design blockers — "WordBank says 'Play a spelling round' with no CTA button" and "Grammar EmptyState title 'Grammar is ready' breaks neutral voice baseline" — were invisible to correctness and testing reviewers. The code was technically correct; the tests passed. Both were genuine user-experience defects that shipped would have created inconsistent product surfaces.

Dispatch design-lens review for any unit that creates or modifies user-facing UI components.

## Why This Matters

A 13-unit sprint with a single-agent sequential model would take 3–5× longer and miss more defects (no adversarial review, no parallel review perspectives). The scrum-master pattern delivered:

- **Throughput**: 13 PRs in ~12 hours with ~35 parallel reviewer dispatches.
- **Defect catch rate**: 25 blockers caught pre-merge, 8 of which would have caused production-visible regressions (permanent learner lockout, silent-green visual tests, un-audited production bundles, stale files shipping, non-functional CTA buttons).
- **Zero merge-clobber**: despite 81 total commits to main on the same day from multiple streams, isolated worktrees + sequential merge prevented all conflicts.
- **Architectural discovery**: the main.js shadow-handler pattern — production dispatching through `main.js::handleGlobalAction` which returns `true` before `controller.dispatch` fires — was invisible to single-file review. Only cross-unit adversarial review uncovered that 13 `abortPending()` calls in the controller were dead code in production.
- **Knowledge compounding**: patterns documented here (adversarial failure-scenarios-first, same-PR atomicity, inventory-first thresholds) apply to every future sprint of similar scale.

## When to Apply

Apply the **full scrum-master orchestration** when ALL of the following hold:
- Unit count ≥ 5 with shared-codebase dependencies.
- Single-day or single-session delivery target — sequential would blow the time budget.
- Multiple concurrent streams may commit to main during the sprint.

Always use **adversarial reviewers** (failure-scenarios-first) when ANY unit touches:
- Rehydration / session-restore / state-machine lifecycle logic.
- Visual regression thresholds, mask coverage, or baseline comparisons.
- Build-pipeline output (bundler config, chunk splitting, output directory cleaning).
- Any code path where production routing may differ from test-harness routing.

Always use **design-lens reviewers** when ANY unit:
- Creates or modifies user-facing UI components (buttons, empty states, error cards, banners).
- Changes copy voice or introduces new user-facing text patterns across multiple surfaces.

For sprints of 1–4 units, a simpler worker + single-reviewer pattern suffices. The scrum-master overhead (dispatch messages, stop-report parsing, merge sequencing) only pays off at ≥ 5 units.

## Examples

### A. Adversarial review prompt (effective)

**Before (pattern-match):**
> Review this PR for correctness. Check that the sanitise function handles all UI state fields.

**After (failure-scenarios-first):**
> Construct these failure scenarios and verify the code prevents each:
> 1. User is on summary phase, app crashes, rehydrates — does the UI show summary CTA without summary data?
> 2. User triggers start-session, app crashes mid-command, rehydrates — is pendingCommand still set? Are controls disabled permanently?
> 3. Phase field says 'summary' but summary data was stripped — what renders?
>
> For each scenario, trace the exact code path from rehydrate entry point to final UI state.

### B. Worker stall recovery dispatch

**Before (resume attempt):**
> Continue from where the previous worker left off. The hook wrapper is written; now modify tts.js.

**After (clean restart with anti-pattern):**
> Implement SH2-U4 from scratch. DO NOT repeat prior worker's mistake: the previous worker created `src/platform/react/use-tts-status.js` wrapper hook but never modified the core `src/subjects/spelling/tts.js`. Your PRIMARY deliverable is modifying tts.js to add getStatus/subscribe/abortPending. The wrapper hook is SECONDARY.

### C. Same-PR atomicity verification

When reviewing a code-splitting or build-config PR, ask:
> If I revert any single file in this PR, does the build still produce correct output AND does the audit/test pipeline still cover all outputs?

SH2-U10 failed this check for 3 files — Worker allowlist, audit walker, and import regex — so all three shipped in the same commit as `splitting: true`.

### D. First-CI workflow with pre-existing failure

```yaml
- name: Run forbidden-import audit
  # PRE-EXISTING: src/subjects/spelling/data/*.js imported by events.js + read-model.js.
  # Remove continue-on-error once spelling team decouples data modules.
  continue-on-error: true
  run: npm run audit:client
```

## Related

- [Sys-Hardening Phase 1 completion report](../../plans/james/sys-hardening/sys-hardening-p1-completion-report.md) — P1 sprint that established the base pattern (19 blockers, 13 units, 14 PRs).
- [Sys-Hardening Phase 2 completion report](../../plans/james/sys-hardening/sys-hardening-p2-completion-report.md) — P2 sprint that scaled the pattern (25 blockers, 13 units, 81 concurrent commits).
- [Phase 2 formal plan](../../plans/2026-04-26-001-feat-sys-hardening-p2-plan.md) — Deep-tier plan with 23 key technical decisions + 26 risks.
- [P3 convergent sprint patterns](../best-practices/p3-stability-capacity-multi-learner-patterns-2026-04-27.md) — companion learning from the P3 sprint covering characterisation-first testing, measure-first budgets, client-vs-server boundary checks, vacuous-truth guards. Complements this doc's orchestration mechanics with technical discipline patterns.
- [P3 completion report](../../plans/james/sys-hardening/sys-hardening-p3-completion-report.md) — P3 sprint (7 units, 49 test scenarios, 12 reviewer findings).

## What this learning DOES NOT cover

- **Single-unit or 2–4 unit sprint orchestration** — simpler patterns suffice; the overhead of scrum-master dispatch, parallel review, and review-follower cycles only pays off at ≥ 5 units.
- **Adversarial review content** (what specific failure scenarios to construct for specific domains) — this learning covers the META-pattern ("construct failures first"); domain-specific scenarios depend on the unit's scope.
- **Code-level implementation of any SH2 unit** — see individual PR bodies and the completion report for implementation details.
- **Operator-gated follow-ups** (CSP enforcement flip, HSTS preload submission, Linux-CI baseline regeneration) — these are tracked in their respective decision records and are not workflow-pattern learnings.

---

*Empirical data: P1 (19 blockers / 13 units / 1 day) + P2 (25 blockers / 13 units / 81 concurrent commits / 1 day) + P3 (12 findings / 7 units / 1 day, 4 HIGH including 3 vacuous-truth silent-greens) = 56 reviewer-caught findings across 33 units, 0 merge-clobber incidents. P3 found that P2-era test patterns contained 3 vacuous-truth `[].every()` silent-greens — see the [P3 companion learning](../best-practices/p3-stability-capacity-multi-learner-patterns-2026-04-27.md) for the guard pattern.*

*Note: the `audit.yml` `continue-on-error` example in §6 was resolved by regression sweep PR #338 (2026-04-26), which promoted `audit:client` to a hard PR gate. The pattern (ship first-CI with temporary `continue-on-error` for pre-existing failures) remains valid as general guidance for future first-CI scenarios.*
