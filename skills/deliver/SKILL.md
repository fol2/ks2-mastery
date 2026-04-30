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
Contract (provided) ─── REJECT if missing
    │
    ▼
/ce-plan ─── translate contract → implementation plan (autonomous, no questions)
    │
    ▼
Plan Review ─── 3 independent reviewers validate plan vs contract (all must PASS)
    │
    ▼
Commit & merge plan PR (doc-only, CI auto-pass)
    │
    ▼
/ce-worktree ─── create isolated worktree for this contract (no questions)
    │
    ▼
/ce-work ─── execute full delivery inside the worktree:
    │         ├── SDLC cycle (per unit: worker → reviewers → follower → merge)
    │         ├── Delivery cycle (10 contract reviewers, iterate until all PASS)
    │         └── Completion report (comprehensive .md, PR merged to main)
    │
    ▼
Housekeeping ─── remove worktree, delete local branches, prune remote refs
    │
    ▼
/compound-engineering:ce-compound ─── document solved problem
    │
    ▼
/dream ─── consolidate session learnings into memory (if available)
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

## Phase 3: Work (`/ce-work`)

Invoke `/ce-work` inside the worktree with the generated plan. `/ce-work` executes the full delivery lifecycle:

### 3A — SDLC Cycle (per unit of work)

For each unit in the plan, execute this pipeline:

```
Worker (subagent in worktree)
  → implement + tests + commit + push + open PR
  → Worker rules:
    - "Your output MUST include a valid PR URL."
    - "Do not use git stash."
    - "Include 'Plan Deviations' in PR body if you deviate."
    - For UI/UX units: invoke /ce-frontend-design

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

Merge Gate
  → gh pr checks must all pass
  → gh pr merge --squash --delete-branch
  → git fetch origin
  → Next unit
```

### 3B — Delivery Cycle (10 contract reviewers)

After ALL SDLC units merged, spawn 10 independent subagent reviewers. Each validates the **entire contract** at the highest standard:

1. **Functional Completeness** — every requirement implemented
2. **Test Coverage** — all acceptance criteria have tests
3. **Code Quality** — maintainability, naming, structure
4. **Architecture Alignment** — matches codebase conventions
5. **Security & Safety** — no vulnerabilities, safe defaults
6. **Performance** — no regressions, efficient
7. **UX/UI Fidelity** — (if applicable) design intent met
8. **Documentation** — self-documenting, complex logic explained
9. **Edge Cases & Error Handling** — boundaries covered
10. **Integration & Regression** — no side effects

**Protocol:**
- Each reviewer reads the original contract AND the current codebase state
- Returns: PASS or BLOCK (with specific, actionable findings)
- If ANY blocks: collect findings → SDLC cycle for fixes → re-invite ALL 10 reviewers
- On re-review rounds, reviewers evaluate the ENTIRE contract again (new blockers valid)
- **Delivered** when all 10 simultaneously PASS

### 3C — Completion Report

After delivery confirmed:

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
4. Commit, push, create PR, merge when CI green

---

## Phase 4: Housekeeping

After the completion report PR is merged, clean up all delivery artefacts:

### 4.1 — Remove the worktree

```bash
git worktree remove <worktree-path> --force
```

If the worktree has already been removed by squash-merge branch deletion, just prune:

```bash
git worktree prune
```

### 4.2 — Delete local branches

Delete all local branches created during this delivery (feature branches, fix branches, report branch). They have already been squash-merged so no work is lost:

```bash
git branch -d <branch-name>
```

If `-d` refuses (not fully merged due to squash), use `-D` — the PR merge confirms the work landed.

### 4.3 — Prune remote tracking refs

```bash
git fetch origin --prune
```

This removes local tracking references for remote branches already deleted by `--delete-branch` during PR merges.

### 4.4 — Verify clean state

Confirm:
- `git worktree list` shows only the main worktree
- `git branch` shows no delivery-related branches
- `git status` on main is clean
- Main checkout remains on the same branch it started on

If any of these fail, fix before proceeding.

---

## Phase 5: Compound (`/compound-engineering:ce-compound`)

Invoke `/compound-engineering:ce-compound` after housekeeping. Use all default/recommended settings. Run autonomously — document the solved problem to compound team knowledge.

---

## Phase 6: Dream (`/dream`)

If `/dream` is available, invoke it. Consolidate session learnings into persistent memory.

---

## Orchestrator Rules

- You are the **scrum master**. Coordinate, never implement.
- Preserve your token context — delegate to subagents via the skill chain.
- Do NOT ask the user questions. The contract is the source of truth.
- Report progress only at phase transitions: "Phase 1 complete. Phase 2 starting."
- Stop ONLY when all phases complete (Phase 6, or Phase 5 if `/dream` unavailable).
- If truly stuck (missing credentials, environment broken), report the blocker and stop.

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
