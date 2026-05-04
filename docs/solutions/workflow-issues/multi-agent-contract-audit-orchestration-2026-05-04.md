---
title: Multi-agent contract audit orchestration — shared blind spots and fix isolation
date: "2026-05-04"
category: workflow-issues
module: grammar-qg
problem_type: workflow_issue
component: development_workflow
severity: medium
applies_when:
  - Running multi-contract quality audits across a large template bank (100+)
  - Orchestrating parallel subagent auditors with shared code dependencies
  - Audit and generator share validation logic (regex, property paths)
  - Fix workers must produce isolated PRs reviewed before merge
tags:
  - multi-agent
  - contract-audit
  - worktree-isolation
  - subagent-orchestration
  - parallel-review
  - blind-spot-detection
related_components:
  - testing_framework
  - tooling
---

# Multi-agent contract audit orchestration — shared blind spots and fix isolation

## Context

A P18 full-scope quality review of 510 grammar question templates identified 4 issues requiring follow-up contracts. The contracts specified acceptance criteria for: open-response marking fairness (A), article-agreement normalisation (B), pronoun-cohesion correction (C), and smart-practice diversity (D).

Three rounds of parallel auditing were conducted using 9 subagents per round (3 contract auditors, 3 code reviewers, 3 QA agents), producing 10 fix PRs (#853–#868) — each created by an isolated worktree worker and code-reviewed before merge. The process exposed structural failure modes specific to multi-agent audit workflows.

## Guidance

### 1. Shared blind spot pattern

When an audit tool and the code under audit share the same validation logic, gaps in that logic create false assurance — the audit structurally cannot detect what the generator missed.

```javascript
// BAD: Audit reuses the generator's regex
// audit-grammar-open-response-fairness.mjs
function isOpenPrompt(prompt) {
  return /join\s+the/.test(prompt);  // same pattern as generator
}
// "Join these ideas using..." NEVER caught by either

// GOOD: Audit uses an independently-derived broader pattern
function isOpenPrompt(prompt) {
  return /\bjoin\b/i.test(prompt);  // catches join + any following word
}
```

**Mitigation**: Audit regex should be at least as broad as (or broader than) the generator's. Better: cross-reference the risk sample list directly rather than relying solely on regex matching.

### 2. Property path verification with optional chaining

JavaScript's `?.` silently returns `undefined` on wrong paths. Code review must verify that the property actually exists at the accessed location.

```javascript
// BUG: question.answerSpec?.nonScored !== true
// nonScored is at question.nonScored (top-level), not inside answerSpec
// Optional chaining hides the error — always evaluates to true (no-op)

// FIX: Trace property to its source definition
const isExempt = question.nonScored !== true;  // correct path
```

**Rule**: Any `?.` chain in new code requires the reviewer to trace the property to its creation site.

### 3. String() on objects for key generation

`String({...})` always produces `"[object Object]"` — never use it for structural comparison or hashing.

```javascript
// BUG: surfaceKeyFor collapsed all focusCue objects to same key
const focusCue = String(serialised?.focusCue || '');  // "[object Object]"

// FIX: JSON.stringify preserves discriminating structure
const focusCue = JSON.stringify(serialised?.focusCue ?? '');
```

### 4. Multi-round adversarial audit orchestration

Three rounds × 9 agents catches issues that single-pass review misses. Each round's fixes are verified by the next round.

```
Round 1: 9 auditors → findings (genuine bugs: regex, property paths, duplicates)
    ↓
Fix workers (worktree-isolated, 1 PR each, code-reviewed)
    ↓
Round 2: 9 auditors verify fixes + find residual issues
    ↓
Fix workers (advisory/non-blocker improvements)
    ↓
Round 3: 9 auditors → final certification (0 blocking findings = CERTIFIED)
```

### 5. Worktree-isolated fix workers

Each fix gets its own Git worktree and branch. Workers operate in parallel without conflicts. Each creates its own PR for independent code review.

```
Orchestrator dispatches N workers in parallel:
  Worker 1 → .claude/worktrees/agent-xxx → branch fix/regex-blind-spot → PR #864
  Worker 2 → .claude/worktrees/agent-yyy → branch fix/property-path → PR #865
  Worker 3 → .claude/worktrees/agent-zzz → branch fix/string-object → PR #867

After all workers complete:
  Code reviewer per PR (parallel) → PASS/FAIL
  FAIL → send fix instruction back to worker → re-review
  PASS → merge sequentially
```

## Why This Matters

- **Shared blind spots** create the illusion of coverage while guaranteeing specific bug classes survive indefinitely. The audit literally cannot fail for cases the generator also misses.
- **Silent undefined** from wrong `?.` paths produces data corruption that tests don't catch — `undefined !== true` is always `true`, making the guard a permanent no-op.
- **`String()` on objects** only manifests at scale — with 1 template it "works", with 510 templates every surface key collides, destroying deduplication.
- **Multi-round auditing** catches second-order problems: Round 2 sees the codebase after Round 1 fixes, revealing issues the original findings masked (e.g., merge conflicts exposing regeneration dependencies).
- **Worktree isolation** prevents the "merge conflict cascade" and gives each fix a clean, reviewable diff.

## When to Apply

- **Shared blind spot check**: Any time a validation/audit tool is written to verify a generator — ask "does this validator share logic with the thing it validates?"
- **Property path verification**: All code reviews involving optional chaining on data objects, especially when schema is defined elsewhere.
- **String() guard**: Any use of `String()` for key generation or comparison where input could be an object.
- **Multi-round adversarial audit**: High-stakes content systems with large template banks (100+), or any fix cycle where completeness confidence matters more than speed.
- **Worktree isolation**: 3+ parallel fix branches on the same repo, especially when orchestrated by automation.

## Examples

### The full audit found these issues across 3 rounds

| Round | Finding | Root Cause | Fix PR |
|-------|---------|-----------|--------|
| 1 | 1 template unconverted (91 risk list) | `join\s+the` regex missed "Join these..." | Already fixed (prior hotfix) |
| 1 | surfaceKeyFor false collisions | `String(obj)` → "[object Object]" | #857 |
| 1 | Article normalisation lost capitalisation | Replace always produced lowercase "an" | #855 |
| 1 | Case 08/11 wording pedagogically wrong | Morphology framing in cohesion family | #854 |
| 1 | nonScored check wrong path | `question.answerSpec?.nonScored` (always undefined) | #853 |
| 1 | Stale comment (8 → 11 profiles) | Not updated after D.4 profiles added | #856 |
| 2 | HARD FAIL 8 duplicate of rule 6 | Near-miss iteration instead of raw-prompt test | #864 |
| 2 | manualReviewOnly wrong path | Same pattern as nonScored — answerSpec vs top-level | #865 |
| 2 | compactCase strips boolean guards | Dead code — fields never preserved through compaction | #866 |
| 2 | eligibleTemplateIds over-counts focus pool | Includes skillId-less templates when focus active | #867 |
| 2 | Markdown pipe chars break table | JSON.stringify in failure detail not escaped | #868 |

### Audit result progression

- Round 1: 6 findings (1 HIGH, 5 MEDIUM)
- Round 2: 5 findings (2 MEDIUM, 3 LOW)
- Round 3: 0 blocking findings → **CERTIFIED**

## Related

- `docs/solutions/workflow-issues/sys-hardening-p2-13-unit-autonomous-sprint-learnings-2026-04-26.md` — autonomous sprint learnings (earlier variant)
- `docs/solutions/workflow-issues/autonomous-certification-phase-wave-execution-2026-04-27.md` — certification wave execution pattern
- Grammar P19 contract: `docs/plans/james/grammar/questions-generator/p18/grammar-p18-fullscope-review-pack/grammar-p19-follow-up-contracts.md`
- (auto memory [claude]) Worker PR mandate and subagent tool availability constraints informed the worktree isolation pattern
