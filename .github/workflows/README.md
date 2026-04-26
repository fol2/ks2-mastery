# GitHub Actions workflows — policy

This directory hosts repo-scoped CI workflows. All workflows follow the
policy below. Added by SH2-U11 (plan: `docs/plans/2026-04-26-001-feat-sys-hardening-p2-plan.md`,
lines 747-799, R11). Deepens S-02 and S-03 from the SH2 plan.

## Minimum-permissions policy (S-02)

Every workflow MUST declare:

```yaml
permissions:
  contents: read
```

at the top-level. The only exception in this repo is `mega-invariant-nightly.yml`,
which additionally needs `issues: write` so the nightly probe can open or
comment on a de-duplicated issue on failure. No other workflow may broaden
beyond `contents: read`.

Concretely this means no workflow may declare any of:

- `contents: write`
- `pull-requests: write`
- `packages: write`
- `id-token: write`
- `deployments: write`

Widening permissions on a workflow requires a plan entry and a reviewer
acknowledgement in the PR body. Silent widening is the pattern this policy
exists to prevent.

## No Cloudflare secrets in the Actions secrets scope (S-02)

Deploy-capable credentials MUST NOT be configured in the repository's
Actions secrets scope:

- `CLOUDFLARE_API_TOKEN` — never set.
- `CF_*` (any variant) — never set.

This is a defence-in-depth safeguard. The deploy path uses OAuth via
`scripts/wrangler-oauth.mjs` locally. `npm run check` intentionally fails
in CI without OAuth, which is the signal that deploy-capable credentials
simply are not available in the CI environment. A malicious PR therefore
cannot exfiltrate a deploy token because there is no deploy token to
exfiltrate.

If a future workflow genuinely needs deploy-time auth (for example a
release workflow), the policy is to run it on a separate protected
environment with environment-scoped secrets, not repo-scoped secrets,
and to gate that workflow on a `workflow_dispatch` manual trigger —
never on a `pull_request` event.

## Baselines are never auto-committed (S-03)

The nightly Playwright matrix (`playwright-nightly.yml`) uploads updated
screenshot candidates as artefacts only. It MUST NOT commit baselines
back to the repository. Baseline regeneration after an intentional visual
change is always a human-reviewed PR, one viewport per PR so the diff is
reviewable per-surface.

Concretely this means no nightly or scheduled workflow may run any of:

- `git commit`
- `git push`
- `git add` followed by a write-back
- `actions/github-script` with `contents: write` to update blobs
- `peter-evans/create-pull-request` to draft a baseline-regen PR from CI

Reviewers should grep every nightly or schedule-trigger workflow for the
patterns above before approving a change in this directory.

## Current workflows

| File | Trigger | Purpose |
| --- | --- | --- |
| `playwright.yml` | `pull_request` | Chromium + `mobile-390` golden paths on every PR. |
| `playwright-nightly.yml` | `schedule` (03:07 UTC) | Full 5-viewport Playwright matrix. |
| `node-test.yml` | `pull_request` | `npm test` + `npm run check` (schema-drift canary). |
| `audit.yml` | `pull_request` | `npm run audit:client`. |
| `mega-invariant-nightly.yml` | `schedule` (02:37 UTC) | Variable-seed Mega invariant probe. |

## Contact

Maintainer-owned. Any change in this directory goes through the normal
PR review gate; the policy above is enforced by reviewer attention, not
by an automated gate (the automated gate would itself need a widened
permissions grant to land).
