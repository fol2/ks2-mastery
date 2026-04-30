---
module: capacity-and-multi-learner
date: "2026-04-30"
problem_type: architecture_pattern
component: tooling
severity: high
tags:
  - "capacity-evidence"
  - "governance"
  - "verifier"
  - "commit-provenance"
  - "fail-closed"
  - "status-promotion"
applies_when: "Promoting a capacity tier (adding a certified row to the verified evidence table) or debugging verifier failures during promotion"
---

# Capacity Status Governance Promotion Pipeline

## Context

The capacity certification system uses a multi-stage fail-closed pipeline to promote tier status. P4 was the first time this governance step was completed end-to-end (promoting from `small-pilot-provisional` to `30-learner-beta-certified`). The process surfaced a critical distinction between commit *existence* and commit *ancestry* in the verifier.

## Guidance

### Promotion Pipeline

Status promotion requires ALL of these steps in order:

1. Add a reviewed row to `docs/operations/capacity.md` `## Capacity Evidence` table with `decision: <tier>-certified`
2. Run `node scripts/generate-evidence-summary.mjs` to regenerate `reports/capacity/latest-evidence-summary.json`
3. Run `npm run capacity:verify-evidence` — must pass without `CAPACITY_VERIFY_SKIP_ANCESTRY`
4. Verify Admin model (`src/platform/hubs/admin-production-evidence.js`) returns the expected state

No single artefact can unilaterally promote status. Diagnostics (`*-tail-correlation.json`), preflights, smoke runs, and the budget ledger are all architecturally excluded from the certification path.

### Commit Existence vs Ancestry (Critical Distinction)

The verifier has TWO commit checks that are often confused:

| Check | What it does | Env var bypass | Failure mode |
|-------|-------------|----------------|--------------|
| **Existence probe** (`probeEvidenceCommitPresence`) | `git cat-file -e <sha>^{commit}` — does the commit exist in the object store? | **NONE** — hard-fails unconditionally on full clones (Round 8 P1 hardening) | `evidence commit does not exist in repo history; possible fabrication` |
| **Ancestry check** (`probeCommitReachableFromHead`) | `git merge-base --is-ancestor <sha> HEAD` — is it an ancestor of HEAD? | `CAPACITY_VERIFY_SKIP_ANCESTRY=1` | Warning on shallow clones, failure on full clones (unless env var set) |

**Common mistake:** Assuming `CAPACITY_VERIFY_SKIP_ANCESTRY=1` will fix a missing commit. It does NOT. The existence probe fires BEFORE the ancestry check and is immune to all env vars.

### Pre-Squash Production Deploy Commits

When a production load test runs against a Cloudflare Workers deploy from a feature branch that is later squash-merged, `reportMeta.commit` in the evidence JSON contains a SHA that no longer exists in the repo. This is not fabrication — it's a Git workflow artefact.

**Resolution:** Identify the squash-merge commit that landed the equivalent code (use `git log --all --oneline --diff-filter=A -- <evidence-file-path>`). Update `reportMeta.commit` to the squash-merge SHA. Document the provenance change in the status report.

### Verifier Behaviour by Decision Type

| Decision | Full verification? | Commit probe? |
|----------|-------------------|---------------|
| `fail` | **NO** — returns `ok: true` immediately (line 927) | No |
| `smoke-pass` | Yes | Yes |
| `30-learner-beta-certified` | Yes | Yes |
| `60-learner-stretch-certified` | Yes | Yes |
| `100-plus-certified` | Yes | Yes |

This means pre-existing evidence with unreachable commits in `fail` rows will NOT trigger failures — only promotion (non-fail decision) triggers the full verification pipeline.

## Why This Matters

Without understanding this distinction, a developer attempting status promotion will:
1. Add the reviewed row
2. Run the verifier
3. Get a hard failure on commit existence
4. Try `CAPACITY_VERIFY_SKIP_ANCESTRY=1` (which does nothing for this error)
5. Waste time debugging what appears to be a verifier bug

The fail-closed design is intentional: it prevents accidental certification from fabricated or unreachable evidence. The resolution path (update to squash-merge SHA) preserves provenance integrity while accommodating the squash-merge workflow.

## When to Apply

- When promoting any capacity tier (adding a non-`fail` row to the evidence table)
- When debugging `evidence commit does not exist in repo history` errors from the verifier
- When the evidence JSON contains a commit from a branch that was later squash-merged
- When planning a production load test — consider which commit SHA will end up in the evidence

## Examples

### Before: Evidence with unreachable commit

```json
{
  "reportMeta": {
    "commit": "b469e585c193b6197fdf1b98ac649de782d03027"
  }
}
```

Verifier output: `FAIL — evidence commit b469e585c1 does not exist in repo history`

### After: Evidence with squash-merge commit

```bash
# Find the squash-merge that added the evidence file
git log --all --oneline --diff-filter=A -- reports/capacity/evidence/2026-04-30-p3-t5-strict-r2.json
# Output: 3af2b44b feat(capacity): complete P3 strict telemetry gate

# Verify it's an ancestor
git merge-base --is-ancestor 3af2b44beaf3b89e476b1eb837569e30dc1717fb HEAD && echo "OK"
```

Update `reportMeta.commit` to `3af2b44beaf3b89e476b1eb837569e30dc1717fb`. Verifier passes.
