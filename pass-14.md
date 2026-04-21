# Pass 14: SaaS Adult Access Honesty

Pass 14 integrates the SaaS-first adult access work without replacing the current production branch wholesale.

## Scope

This pass makes signed-in Parent Hub and Admin / Operations consume real Worker hub payloads instead of locally synthesising adult access from writable learners.

It does not add a new subject, invite flow, billing, organisations, or viewer participation inside the writable subject shell.

## User-visible changes

- Signed-in Parent Hub loads through `GET /api/hubs/parent`.
- Signed-in Admin / Operations loads through `GET /api/hubs/admin`.
- Adult hub surfaces show platform role, learner membership role, and writable/read-only access separately.
- Viewer learners can appear and be selected in adult surfaces when returned by the Worker.
- Read-only viewer contexts disable subject entry, current-learner export, full-app export, learner edit, reset, import, and platform reset affordances.
- Signed-in accounts with no writable learners now show an honest empty writable-shell state instead of fabricating a default learner.

## Backend changes

- Parent Hub now resolves readable memberships (`owner`, `member`, `viewer`) for adult surface selection.
- `/api/bootstrap` remains writable-only for the main subject shell.
- Admin diagnostics include writable/read-only labels per learner.
- Hub read models carry selected learner id, accessible learners, membership labels, and access mode labels.

## Regression guard

The integration keeps the current production work around:

- OpenAI TTS proxy/default voice
- stale-write rebase and persistence details
- legacy spelling import/export
- spelling analytics word progress
- monster thresholds, dashboard roaming, and after-session celebration overlay
- OAuth-safe Cloudflare deploy scripts

## Tests

Pass 14 adds or updates coverage for:

- hub API client routing
- hub access context and read-only blocking
- Parent Hub/Admin read-model access labels
- Worker readable hub access while keeping bootstrap writable-only
- render behaviour for signed-in read-only adult surfaces
