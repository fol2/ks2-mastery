# Reading validation hotfix completion report

Date: 2026-05-07

## Status

Complete and production deployed.

Repository commit: `28de730c66c98c46dc9816907ad638b07213c44e`

Production origin: `https://ks2.eugnel.uk`

Cloudflare Worker version: `b52805a5-fad1-4231-96d8-9af7c4b51499`

## Scope Delivered

- Applied the Reading validation hotfix to the live repository.
- Fixed immediate Reading passage repeats after a start/end/no-answer flow.
- Routed Guided Reading through the weakness/diversity scheduler instead of a static first-four question slice.
- Removed duplicated normalised Reading question stems while preserving ids, answers, marks, rubrics, options, model answers, papers, and release id.
- Reduced delayed-feedback one-question Reading UI to one `Save and next` path while preserving non-delayed draft navigation.
- Added Reading 100-star high-water reward parity, release-scoped mastery filtering, grand `lorequill` star fields, and deep secure evidence.
- Added the global button-label governance allowlist entry for the deliberate Reading list-mode label `Save this section`; this is test-only scope required to keep the full repository gate reproducible.

## Evidence

| Gate | Result | Evidence |
| --- | --- | --- |
| Patch reverse-check against current repo diff | Pass | `git apply --reverse --check --ignore-whitespace docs/plans/james/hotfixes/1. reading-validation-audit-and-hotfix-package/patches/001-reading-validation-hotfix-repo-root.patch` |
| Targeted Reading/UI tests | 35/35 pass | `validation/logs/repo-reading-targeted-tests-2026-05-07.log` |
| Full repository tests | 109154/109154 pass, 12 skipped | `validation/logs/repo-npm-test-pass-2026-05-07.log`; pre-push rerun also passed before pushing `28de730c66c98c46dc9816907ad638b07213c44e` |
| Dry-run deployment check | Pass | `validation/logs/repo-npm-check-2026-05-07.log` |
| Production deploy | Pass | `validation/logs/repo-deploy-2026-05-07.log` |
| Production bundle audit | Pass | `validation/logs/repo-deploy-2026-05-07.log` |
| Reading production smoke | Pass | `validation/production/reading-production-smoke-2026-05-07.json`; `validation/logs/reading-production-smoke-json-2026-05-07.log` |

## Production Smoke Result

The post-deploy Reading smoke used a production demo session and hit `https://ks2.eugnel.uk`.

- `ok`: `true`
- `environment`: `production`
- `origin`: `https://ks2.eugnel.uk`
- `contentReleaseId`: `reading-poc-promoted-2026-05-05`
- `contentVersion`: `2`
- `commitSha`: `28de730c66c98c46dc9816907ad638b07213c44e`
- Immediate guided Reading command path: passed with a correct marked response.
- Strict delayed-paper Reading path: passed with hidden feedback before final marking and summary max score `50`.

The smoke script records the local Git `HEAD` at the time the smoke is run. This artefact was generated immediately after deploying implementation commit `28de730c66c98c46dc9816907ad638b07213c44e`. Later evidence-only commits are descendants of that implementation commit and do not change the deployed Reading runtime.

## Reviewer Closure

Initial independent code review and contract audit returned RED for evidence/package completeness, not for Reading runtime correctness. The blockers were closed by:

- regenerating the repo-root patch to include the current implementation/test diff;
- documenting the button-label governance test-only scope;
- adding `reading-session-interface.test.js`, full `npm test`, and `npm run check` to acceptance evidence;
- committing and pushing the hotfix to `origin/main`;
- deploying the pushed commit;
- generating fresh production Reading smoke evidence from `https://ks2.eugnel.uk`;
- adding this completion report and refreshed checksums in the same package folder.

## Final Sync

The final evidence commit is pushed to `origin/main`; local `main` and `origin/main` are synchronised in the working tree used for this report.

Residual risk: none identified.
