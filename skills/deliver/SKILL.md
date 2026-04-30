---
name: deliver
description: "Autonomous end-to-end contract delivery pipeline. Use when the user provides a contract document (plan, spec, or requirements file) and wants full autonomous execution: planning, plan review, implementation via SDLC cycle with independent reviewers, 10-reviewer delivery validation, completion reporting, housekeeping, and knowledge compounding. Trigger when user says 'deliver this contract', 'deliver', '/deliver', 'execute this plan end-to-end', 'run the full delivery cycle', or provides a contract path expecting autonomous implementation. Requires a contract document path as input — rejects if none provided."
---

# Autonomous Contract Delivery

Execute a full autonomous delivery pipeline for the contract at $ARGUMENTS.

**Hard gate: if $ARGUMENTS is empty or does not point to a readable contract document, STOP immediately.** Say: "No contract provided. Usage: `/deliver path/to/contract.md`" and do nothing else.

---

## Pipeline

```
Phase 0: Contract (provided) ─── REJECT if missing
    │
    ▼
Phase 1: /ce-plan ─── translate contract → implementation plan (no questions)
    │
    ▼
Phase 1.5: Plan Review ─── 3 reviewers validate plan vs contract (all must PASS)
    │
    ▼
Phase 1.5: Commit & merge plan PR (doc-only, CI auto-pass)
    │
    ▼
Phase 2: /ce-worktree ─── create isolated worktree (no questions)
    │
    ▼
Phase 3: /ce-work (BUILD) ─── implement plan units (worker → MANDATORY reviewers → merge)
    │
    ▼
Phase 4: Delivery ─── 10 contract reviewers validate entire contract (MANDATORY, DO NOT SKIP)
    │                  if blockers: /ce-work (FIX) → MANDATORY reviewers → merge → re-review ALL 10
    ▼
Phase 5: Report ─── completion report .md, PR merged to main
    │
    ▼
Phase 6: Housekeeping ─── remove worktree, delete branches, prune refs
    │
    ▼
Phase 7: /compound-engineering:ce-compound ─── document solved problem
    │
    ▼
Phase 8: /dream ─── consolidate session learnings (if available)
    │
    ▼
DONE
```

---

## Phase 0: Contract Validation

1. Read $ARGUMENTS as a file path. If the file does not exist, STOP.
2. Read the contract in full.
3. Confirm it contains: scope, goals/requirements, acceptance criteria or gates.
4. If the contract is malformed or empty, STOP with: "Contract at <path> is unreadable or has no requirements."
5. Rename the session to the contract filename (without extension): `/rename <contract-filename>`
   - e.g., for `grammar-qg-p11.md` → `/rename grammar-qg-p11`

---

## Phase 1: Plan (`/ce-plan`)

Invoke `/ce-plan` with these overrides to its default behaviour:

### Input to `/ce-plan`

Pass the full contract content as the planning input. Add this preamble:

```
You are planning the autonomous delivery of this contract. Rules:

1. The plan MUST deliver 100% of the contract. No fallbacks, no "stretch goals", no "nice to have". Every stated requirement becomes a planned unit of work.

2. Do NOT ask questions. The contract is complete and organised. If a requirement is ambiguous, interpret it in the way that delivers the most value while remaining safe.

3. Convert any non-agent workflow to autonomous equivalents:
   - "Run a cohort of real accounts for 5 days" → create test fixtures/mocks that simulate multi-day cohort data, generate synthetic evidence, write validation tests that prove the system would behave correctly under real cohort conditions
   - "Manual QA by a team member" → automated test suites + browser testing + validation scripts
   - "Get sign-off from stakeholder" → delivery cycle reviewers validate against contract gates
   - "Observe production for N days" → time-simulation tests, state-machine coverage, date-key rollover tests

4. The ONLY items that remain non-autonomous are those requiring:
   - Physical hardware the agent cannot access
   - Third-party credentials not available in the environment
   - Legal/compliance sign-off that requires a named human
   Flag these as "DEFERRED: requires human" with clear explanation.

5. Structure the plan as ordered units of work, each independently PR-able.

6. Each unit must specify: files to create/modify, tests to write, acceptance criteria derived from the contract.
```

### Behaviour

- `/ce-plan` runs to completion without asking questions
- The plan is saved to the contract's directory as `<contract-name>-plan.md`
- If `/ce-plan` attempts to ask a question, override: "Decide autonomously based on the contract. Do not ask."

---

## Phase 1.5: Plan Review (3 independent reviewers)

After `/ce-plan` completes, validate the plan against the contract before any implementation begins.

### Reviewer Panel (3 independent subagents)

Spawn 3 independent subagent reviewers in parallel. Each validates whether the plan faithfully delivers the contract:

1. **Contract Completeness Reviewer** — every contract requirement maps to at least one plan unit; nothing is dropped, softened, or deferred without "DEFERRED: requires human" justification
2. **Feasibility & Ordering Reviewer** — units are correctly ordered (dependencies respected), each unit is independently PR-able, file paths and acceptance criteria are specific and actionable
3. **Autonomous Conversion Reviewer** — non-agent workflows are converted to autonomous equivalents that genuinely validate the same concerns (not just skipped or trivialised)

### Protocol

Each reviewer:
- Reads the **original contract** in full
- Reads the **generated plan** in full
- Returns: PASS or BLOCK (with specific findings and suggested fixes)

### Gate

ALL 3 reviewers must PASS. If any blocks:
1. Collect all blocking findings
2. Revise the plan directly (fix the plan document, not the code)
3. Re-invite ALL 3 reviewers on the revised plan
4. Repeat until all 3 simultaneously PASS

### Commit the agreed plan

Once all 3 reviewers pass:
1. Commit the plan file: `git add <plan-file> && git commit -m "docs(<contract-slug>): agreed implementation plan"`
2. Push and create a doc-only PR (CI will auto-pass for docs)
3. Merge the plan PR immediately (doc-only, CI green by default)
4. `git fetch origin` to sync

---

## Phase 2: Worktree (`/ce-worktree`)

Invoke `/ce-worktree` after the plan PR is merged.

### Behaviour

- No questions asked — create the worktree with a branch name derived from the contract (e.g., `feat/hero-pA2-delivery` or `feat/<contract-slug>`)
- The worktree is where ALL implementation happens
- The main repo checkout remains untouched on its current branch

---

## Phase 3: SDLC Implementation (`/ce-work` — build mode)

**Purpose:** Implement all planned units of work. This is the BUILD phase.

Invoke `/ce-work` inside the worktree with the generated plan. The scope of this invocation is strictly: implement the plan units, get each through per-unit code review, and merge. It does NOT validate the contract as a whole — that is Phase 4's job.

### Per-unit pipeline

For each unit in the plan, execute:

```
Worker (subagent in worktree)
  → implement + tests + commit + push + open PR
  → Worker rules:
    - "Your output MUST include a valid PR URL."
    - "Do not use git stash."
    - "Include 'Plan Deviations' in PR body if you deviate."
    - For UI/UX units: invoke /ce-frontend-design
```

### MANDATORY: Per-unit code review (DO NOT SKIP)

Every PR MUST go through independent code review before merge. This step is NOT optional. Do not merge without reviewer approval.

```
Reviewers (parallel independent subagents)
  → Always-on: ce-correctness-reviewer, ce-maintainability-reviewer,
    ce-testing-reviewer, ce-project-standards-reviewer
  → Conditional: ce-security-reviewer, ce-performance-reviewer,
    ce-reliability-reviewer, ce-data-migrations-reviewer
  → Each returns: APPROVE or BLOCKING (with findings)

Review Follower (if any BLOCKING)
  → git pull origin <branch> first
  → Address all blocking findings
  → Push fixes
  → Re-dispatch ALL reviewers (not just blockers)
  → Repeat until zero blockers
```

### ⛔ Anti-circumvention: Phase 3 review rules

These are HARD rules. Violating any of them is a protocol failure:

1. **BLOCK means BLOCK.** You cannot reclassify a BLOCK as "advisory", "minor", "acceptable", "edge case only", or "not applicable". If a reviewer returns BLOCK, the fix cycle MUST run.
2. **You cannot merge with open blockers.** No PR merges until ALL dispatched reviewers return APPROVE. There is no "merge now, fix later" path.
3. **You cannot reduce the reviewer set.** All 4 always-on reviewers must be dispatched for every PR. You cannot skip one because "this PR is small" or "only touches tests".
4. **Re-review means ALL reviewers.** After fixes, re-dispatch ALL reviewers that were originally dispatched — not just the one that blocked. Fixes can introduce new issues.
5. **You cannot self-approve.** The orchestrator cannot decide a finding is invalid. Only a re-dispatched reviewer can clear its own block.

### Merge Gate

- ALL reviewers must APPROVE (zero blockers)
- `gh pr checks` must all pass (CI green)
- Only then: `gh pr merge --squash --delete-branch`
- `git fetch origin`
- Next unit

### Exit criteria

Phase 3 is complete when ALL plan units have merged PRs with green CI AND reviewer approval. Report: "Phase 3 complete: N/N units merged. Starting Phase 4."

---

## Phase 4: Delivery Validation (10 contract reviewers → `/ce-work` fix mode)

**Purpose:** Validate the ENTIRE contract has been delivered correctly. This is the VALIDATE phase.

This is a fundamentally different workflow from Phase 3. Phase 3 reviews individual PRs for code quality. Phase 4 reviews the entire delivered codebase against the original contract at the highest standard. These are independent concerns — passing Phase 3 does NOT mean Phase 4 will pass.

### MANDATORY: 10-reviewer contract validation (DO NOT SKIP)

This step is the core quality gate of the delivery. It MUST run. The contract is NOT delivered until all 10 reviewers pass. Do not proceed to Phase 5 without completing this phase.

### Reviewer Panel (10 independent subagents)

ALL 10 reviewers MUST be dispatched as **10 separate subagent calls**. You cannot reduce this number.

**Each reviewer = 1 independent subagent.** You MUST spawn 10 separate Agent tool calls — one per dimension. You cannot combine multiple dimensions into a single agent call. A single agent "reviewing all 10 dimensions" is NOT 10 independent reviewers — it is 1 reviewer pretending to be 10. Independence means each reviewer has its own context, its own judgement, and returns its own verdict without seeing the others.

Spawn 10 independent subagent reviewers in parallel (10 separate Agent calls):

1. **Functional Completeness** — every contract requirement is implemented and working
2. **Test Coverage** — all acceptance criteria have corresponding tests
3. **Code Quality** — maintainability, naming, structure
4. **Architecture Alignment** — matches established codebase conventions
5. **Security & Safety** — no vulnerabilities, proper validation, safe defaults
6. **Performance** — no regressions, efficient implementations
7. **UX/UI Fidelity** — (if applicable) matches design intent, accessible
8. **Documentation** — self-documenting, complex logic explained
9. **Edge Cases & Error Handling** — graceful failures, boundary conditions covered
10. **Integration & Regression** — no side effects on existing functionality

### Protocol

Each reviewer:
- Reads the **original contract** in full (not just the plan — the contract itself)
- Reads the **current codebase state** (post all Phase 3 merges)
- Returns: PASS or BLOCK (with specific, actionable findings referencing contract requirements)

### ⛔ Anti-circumvention: Phase 4 delivery review rules

These are the HARDEST rules in the entire pipeline. This is where delivery quality is enforced. Every observed failure of this pipeline has been the orchestrator rationalising its way past a BLOCK here.

1. **BLOCK means FIX CYCLE. No exceptions.** If a reviewer returns BLOCK, you MUST invoke `/ce-work` (fix mode) to address the findings. You cannot:
   - Reclassify the BLOCK as "advisory" or "informational"
   - Decide the finding is "minor" or "low priority"
   - Argue the reviewer is wrong without dispatching a fix
   - Claim the dimension is "N/A" to skip it (if truly N/A, the reviewer itself will return PASS — you do not make this judgement)
   - Proceed to Phase 5 while any BLOCK exists

2. **All 10 reviewers must be dispatched as 10 SEPARATE subagent calls. Every time.** You cannot:
   - Skip reviewers because "this contract doesn't have UI" (the reviewer decides that, not you)
   - Reduce to 6 or 8 reviewers to save tokens
   - Merge dimensions (e.g., "security and performance are both fine" — they are separate reviewers)
   - Combine multiple dimensions into one agent call (that is 1 reviewer, not 10)
   - Substitute your own assessment for a reviewer's verdict
   - Dispatch a single agent "covering all dimensions" — each dimension = 1 independent agent call

3. **Re-review means ALL 10. Every time. From scratch.** After fixes:
   - Dispatch all 10 again — not just the ones that blocked
   - Previously-passing reviewers can issue NEW blocks on the re-review
   - This is by design: fixes can break previously-passing areas
   - You cannot "run the remaining N" — if you dispatched fewer than 10 initially, that was a protocol violation. The fix is to re-run ALL 10 from scratch, not to "top up" with the missing ones
   - Partial runs are invalid. Only a complete set of 10 simultaneous PASS verdicts from the same round counts

4. **The fix cycle has its own mandatory code review.** The `/ce-work` (fix mode) follows the full Phase 3 per-unit pipeline including MANDATORY code reviewers. You cannot:
   - Push fixes directly without a PR
   - Merge fix PRs without code reviewer approval
   - Skip the review follower cycle if a code reviewer blocks

5. **Only reviewer verdicts count.** The orchestrator cannot:
   - Override a BLOCK ("I checked and it's fine")
   - Declare delivery complete while any BLOCK stands
   - Decide findings are "already addressed" without a re-review confirming PASS

6. **"N/A" is the reviewer's call, not yours.** If a dimension does not apply to this contract (e.g., no UI work), the reviewer for that dimension will return PASS with a note explaining why. You do not pre-empt this by not dispatching the reviewer.

### Fixing blockers (`/ce-work` — fix mode)

If ANY reviewer blocks:
1. Collect ALL blocking findings from ALL reviewers (not just one)
2. Invoke `/ce-work` to implement the fixes — this is a DIFFERENT `/ce-work` invocation from Phase 3:
   - **Phase 3 `/ce-work`**: implements plan units (building new features)
   - **Phase 4 `/ce-work`**: fixes delivery gaps found by contract reviewers (patching to meet the contract)
3. The fix `/ce-work` follows the FULL per-unit pipeline: worker → PR → MANDATORY code reviewers → follower → merge. No shortcuts.
4. After ALL fix PRs merged, re-invite ALL 10 delivery reviewers (not just the ones that blocked)
5. On re-review rounds, reviewers re-evaluate the ENTIRE contract at the highest standard — new blockers from previously-passing areas are valid and expected
6. Repeat until all 10 simultaneously PASS

### Exit criteria

The contract is **delivered** ONLY when all 10 reviewers simultaneously return PASS on the same codebase state. Report: "Phase 4 complete: contract delivered (round N, all 10 PASS). Starting Phase 5."

---

## Phase 5: Completion Report

This is a separate documentation phase. It runs AFTER the delivery cycle confirms all 10 reviewers passed.

### Report creation

1. Write comprehensive report as `<contract-name>-completion-report.md`
2. Place in the same folder as the original contract
3. Content:
   - Executive summary
   - Contract requirements vs delivery mapping (full checklist)
   - All PRs with URLs and descriptions
   - Architecture decisions
   - Test coverage summary
   - Reviewer rounds (iterations, what was caught, what was fixed)
   - Metrics: PRs, commits, review iterations
   - Insights and learnings
   - Deferred items (human-required only)

### Merge the report

1. Commit the report file
2. Push and create PR
3. Merge when CI green (doc-only, auto-pass)
4. `git fetch origin` to sync

### Exit criteria

Report PR is merged to main. Report: "Phase 5 complete: report merged. Starting Phase 6."

---

## Phase 6: Housekeeping

After the completion report PR is merged, clean up all delivery artefacts:

### 6.1 — Remove the worktree

```bash
git worktree remove <worktree-path> --force
```

If the worktree has already been removed by squash-merge branch deletion, just prune:

```bash
git worktree prune
```

### 6.2 — Delete local branches

Delete all local branches created during this delivery (feature branches, fix branches, report branch). They have already been squash-merged so no work is lost:

```bash
git branch -d <branch-name>
```

If `-d` refuses (not fully merged due to squash), use `-D` — the PR merge confirms the work landed.

### 6.3 — Prune remote tracking refs

```bash
git fetch origin --prune
```

This removes local tracking references for remote branches already deleted by `--delete-branch` during PR merges.

### 6.4 — Verify clean state

Confirm:
- `git worktree list` shows only the main worktree
- `git branch` shows no delivery-related branches
- `git status` on main is clean
- Main checkout remains on the same branch it started on

If any of these fail, fix before proceeding.

---

## Phase 7: Compound (`/compound-engineering:ce-compound`)

Invoke `/compound-engineering:ce-compound` after housekeeping. Use all default/recommended settings. Run autonomously — document the solved problem to compound team knowledge.

---

## Phase 8: Dream (`/dream`)

If `/dream` is available, invoke it. Consolidate session learnings into persistent memory.

---

## Orchestrator Rules

- You are the **scrum master**. Coordinate, never implement.
- Preserve your token context — delegate to subagents via the skill chain.
- Do NOT ask the user questions. The contract is the source of truth.
- Report progress only at phase transitions: "Phase 1 complete. Phase 2 starting."
- Stop ONLY when all phases complete (Phase 8, or Phase 7 if `/dream` unavailable).
- If truly stuck (missing credentials, environment broken), report the blocker and stop.

### ⛔ Orchestrator integrity rule

You are NOT allowed to rationalise skipping reviewers or overriding their verdicts. If you catch yourself thinking any of the following, STOP — you are about to violate protocol:

| Rationalisation thought | What you MUST do instead |
|---|---|
| "This BLOCK is minor / advisory" | Run the fix cycle. BLOCK = fix. |
| "This dimension doesn't apply" | Dispatch the reviewer anyway. Let IT decide. |
| "The reviewer is wrong" | Run the fix cycle. Only a re-review clears a BLOCK. |
| "I'll fix it in the report" | No. Fix it in code. Reports document, they don't fix. |
| "Good enough for this contract" | Not your call. 10 reviewers decide "good enough". |
| "I'll save tokens by skipping X" | Protocol is non-negotiable. Dispatch all. |
| "The contract says N/A" | Dispatch reviewer. It will PASS if truly N/A. |
| "I already checked this myself" | Self-review ≠ independent review. Dispatch. |
| "Only 1 reviewer blocked, rest passed" | 1 BLOCK = fix cycle → re-review ALL 10. |
| "The findings overlap with Phase 3 review" | Phase 4 is a different concern. Run it fully. |
| "I'll dispatch one agent for all 10 dimensions" | No. 10 dimensions = 10 separate Agent calls. 1 agent ≠ 10 reviewers. |
| "I can cover these in fewer agents" | Independence requires separate context. Each reviewer = 1 agent call. |
| "I'll run the remaining N reviewers" | No. Partial runs are invalid. Re-run ALL 10 from scratch. |
| "3 passed already, I just need the other 7" | Invalid. All 10 must come from the same round. Start over. |

## No-Regression Guarantees

- Never change branch on the main repo path
- Merge only when CI/build is green
- The worktree isolates all work from the main checkout
- If regression detected, halt and fix before continuing

## Error Recovery

- **Worker cannot push**: check permissions, branch, remote. Re-dispatch.
- **CI failing**: read logs, identify root cause, dispatch fix.
- **Reviewer loop (3+ iterations same finding)**: escalate to user.
- **Merge conflict**: rebase on latest main, resolve, re-run CI.
- **Skill unavailable**: skip gracefully, note in report.
