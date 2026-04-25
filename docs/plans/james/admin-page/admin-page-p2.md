I re-scanned the phase-1 completion report, current `main`, Worker routing/repository code, the admin React surface, client hub API, client error-capture code, the new migration, package scripts, and the open PR list. My view: **P1 is a solid foundation, but it is not yet the “comprehensive SaaS admin system.”** It is the right base layer. The next step should be a **P1.5 hardening/debugging sprint**, not a big feature expansion yet.

The report says P1 landed dashboard KPIs, recent ops activity, account ops metadata, an error log centre, and unauthenticated client-error ingest, while preserving existing admin/ops surfaces. It also clearly marks some important things as intentionally deferred, especially account-status enforcement, IPv6 rate-limit hardening, account-metadata CAS, admin-hub query dedupe, and UI/UX polish. ([GitHub][1]) The repo itself has moved beyond a local prototype: production is Worker-backed, auth/session-aware, with live Parent/Admin hub payloads, role/member separation, and Worker routes for subject commands and admin operations. ([GitHub][2]) I also saw no open PRs at scan time, so this looks like current `main`, not an unmerged branch. ([GitHub][3])

One caveat: I could not clone and run the suite locally from this execution environment because GitHub DNS failed in the container, so this is a source-level review against current GitHub, not an executed test run. The report’s own test posture says 1575 of 1577 passed, with one skip and one pre-existing grammar smoke failure. ([GitHub][1])

## My blunt recommendation

Do **not** build the full event-delivery/live-ops system next.

Do this order instead:

1. **Make the admin console truthful and safe.**
2. **Make account status actually enforceable.**
3. **Make the error centre useful for real debugging.**
4. **Then build event delivery.**

A live-ops/event system is powerful, but it can also create production incidents if the admin foundation is not hardened first. Right now, P1 gives you visibility. P1.5 should make that visibility reliable.

## Biggest risks I found

The first risk is **admin KPIs can mislead you unless definitions are tightened**. `readDashboardKpis` currently counts learners, sessions, event logs, demos, account updates, and errors, but some of those queries appear to count all records, not clearly separated into “real paid/account users” versus demo/test usage. For a SaaS admin page, that matters. A dashboard number that mixes demos with real customer usage is useful for load monitoring, but misleading for business analytics. ([GitHub][4])

The second risk is **dashboard error counters and error-centre totals can disagree**. The dashboard reads error status counts from `admin_kpi_metrics`, while the error log centre computes status totals directly from `ops_error_events`. That is not automatically wrong, but the repository comments also accept rare counter drift in the public error ingest path. So either add a reconciliation job/tool, or make one source authoritative for user-facing admin counts. ([GitHub][4])

The third risk is **account status is currently only a label**. The UI correctly warns that `active`, `suspended`, and `payment_hold` are informational only and are not enforced by sign-in yet. That is fine for P1, but it is dangerous if business owners start trusting it as a GM tool. This should be one of the next backend changes. ([GitHub][5])

The fourth risk is **public error ingest abuse**, especially IPv6 rotation. The Worker has a public `/api/ops/error-event` route placed before normal session auth, with rate limiting, body cap, redaction, and attribution gating. That is good. But the app code itself notes the deferred IPv6 `/64` rotation weakness. Fix this before any more public-ingest style endpoints are added. ([GitHub][6])

The fifth risk is **admin refresh failures are too quiet**. Several narrow admin refresh actions catch errors and log them to the console, but the panel itself can remain stale without clearly telling the admin. For an ops console, silent stale data is worse than a loud error. The UI needs “last refreshed”, “refresh failed”, and per-panel error states. ([GitHub][7])

The sixth risk is **account metadata updates need concurrency protection**. Error status transitions already use expected previous status / CAS-style protection. Account ops metadata updates do not have the same symmetry yet. Today it is “only you”, but even one browser tab plus another browser tab can overwrite notes/tags in surprising ways. ([GitHub][4])

The seventh risk is **the error centre is not yet a real debugging cockpit**. It lists recent error events and allows status changes, but it needs better details: first frame, route, browser/user-agent, build hash, occurrence timeline, affected account/session where allowed, copyable fingerprint, and search/filter. The client capture layer is nicely bounded and defensive, with redaction, queueing, backoff, timeout, and global `error` / `unhandledrejection` listeners, but the admin UI needs to expose more of that data in a way that helps you actually fix bugs. ([GitHub][8])

## P1.5 sprint: what I would do next

### 1. Fix admin truthfulness first

Add a `generatedAt` timestamp to every admin panel payload and show it in the UI. Every panel should say when it was last refreshed. If a refresh fails, show a visible warning in that panel, not just `console.error`.

After these mutations, immediately refresh or patch related panels:

After account metadata save: refresh account metadata, KPI account-update count, and recent activity.

After error status transition: refresh error list, error totals, KPI error counts, and recent activity.

Right now the optimistic UI updates the row, but related totals/activity can lag until manual refresh. That is a logic-flow flaw, not just polish. ([GitHub][7])

Also split KPIs into clearer categories:

“Real accounts”
“Demo sessions”
“Real learner profiles”
“Demo learner profiles”
“Practice sessions, real”
“Practice sessions, demo”
“Errors, client”
“Errors, server/admin”

Do not let one “learners” number pretend to be a business metric unless it excludes demos and test data.

### 2. Harden public endpoint rate limiting

Create one canonical helper, something like:

```js
normaliseRateLimitSubject(request)
```

It should handle:

IPv4 as-is.
IPv6 grouped by `/64`.
Unknown IPs with a conservative fallback bucket.
Optional global bucket for the public error-ingest endpoint.

Use it across public endpoints, not just the new client-error route. The existing route already rate-limits before body read, which is good, but the report and code both identify IPv6 rotation as unfinished. ([GitHub][6])

I would also add a production-shaped test that sends many IPv6 addresses from the same `/64` and proves they hit the same bucket.

### 3. Verify same-origin behaviour in the deployed browser

Admin ops GET routes currently call `requireSameOrigin`. That may be fine, but same-origin browser GET requests can behave differently around the `Origin` header depending on fetch mode and environment. Your `requireSameOrigin` helper blocks missing `Origin` in production unless configured otherwise. ([GitHub][6])

So add a real production smoke test for:

Admin dashboard load.
KPI refresh.
Error log refresh.
Account metadata refresh.
Account metadata save.
Error status transition.

This is the kind of issue that can pass mocked tests and fail only in the deployed browser.

### 4. Make `ops_status` real

Define exact behaviour now, before more admin features depend on it.

My suggested semantics:

`active`: full access.

`payment_hold`: allow login and parent/admin account access, but block new learner practice writes, reward changes, subject command writes, and premium content. Show a clear payment-hold message. Keep export/download/account-management available.

`suspended`: block app access after login/session resolution, block all learner writes, block subject commands, block Parent Hub, and show a minimal suspended-account page. Admins must still be able to view/manage the account.

Also add lockout protections:

The last admin cannot suspend/demote themselves.
The owner account cannot be accidentally locked without a special explicit confirmation.
Suspended accounts should invalidate active sessions or be checked on every privileged request.
Every blocked request should produce a predictable error code, not a generic 500/403.

The P1 report explicitly says ops status is not wired into sign-in enforcement yet, so this is not a bug in P1. It is simply the next necessary step before you call it GM account management. ([GitHub][1])

### 5. Add CAS/versioning to account ops metadata

Add either `row_version INTEGER` or require `expectedUpdatedAt` on save. The API should reject stale updates with `409 Conflict`.

For the UI, that means:

When the row is stale, show “This account was updated elsewhere.”
Offer “Reload” and “Overwrite anyway” only for admins.
Never silently overwrite internal notes.

This is especially important because internal notes and tags are exactly the kind of field you will edit while investigating support/debug issues.

### 6. Add counter reconciliation

Because `admin_kpi_metrics` is a derived counter table, add a reconciliation path. It can be a script first, not a UI button.

Something like:

```bash
npm run admin:reconcile-kpis
```

It should recompute:

error status counters from `ops_error_events`
account metadata update count from mutation receipts or metadata rows
delivery-event counters later
maybe demo/session/activity counters if you decide to cache them

Then add one admin-only route later:

```text
POST /api/admin/ops/reconcile-kpis
```

Only after it is safe, audited, and idempotent.

This matters because the current repository intentionally accepts narrow non-atomic windows in some places, which is reasonable for P1 but needs a repair mechanism for production confidence. ([GitHub][4])

### 7. Improve the error centre into a bug-fixing tool

For each error group, add a details drawer:

fingerprint
kind
message first line
first frame
route name
release/build hash
first seen
last seen
occurrence count
status
linked account/session where allowed
user agent/browser family
last 5 occurrences
copy button for fingerprint
copy button for debug bundle

Then add filters:

status
route
kind
date range
account/session
“new since last deploy”
“reopened after resolved”

Also add status flow:

`open` → `investigating` → `resolved`
`ignored` for noisy/non-actionable
automatic reopen if the same fingerprint appears after a new release or after being resolved

Right now, last-50 is fine for P1, but real production debugging needs search, grouping, and release context.

### 8. Clean up admin UI flow

The current account metadata row syncs local state from props. That is common, but it can create annoying edit-wipe behaviour when a refresh lands while someone is typing. Track dirty fields and avoid replacing local form state unless the row is not dirty or the save succeeded. ([GitHub][5])

Add these small UX fixes:

inline validation for plan label, tags, and notes
character counters
disable Save unless dirty
clear “saving…” state per row
show server validation errors inline, not only `alert`
confirm destructive/high-impact transitions
make “status is not enforced yet” impossible to miss until enforcement ships

This is not cosmetic. Admin tools are dangerous when they look more authoritative than they are.

### 9. Keep analytics educational, not just SaaS vanity metrics

For business analytics, you need usage, retention, conversion, and errors. But for this product specifically, the admin system should also surface learning-quality data: skill strength, template weakness, common misconceptions, due review load, and where pupils repeatedly fail after support. Your earlier design brief correctly treats skill/template/item tracking and misconceptions as first-class data, not just raw scores. 

So after hardening, analytics should include:

daily/weekly active learner accounts
real vs demo usage
sessions by subject
practice completion rate
error rate by route/build
accounts with repeated client errors
weakest skills by cohort
most common misconception tags
questions/templates with abnormal wrong-rate
retry queue pressure / due workload
support usage rate: independent vs hinted vs worked

That will tell you both “is the SaaS app healthy?” and “is the learning engine working?”

## Event delivery system: build it after P1.5

Once the above is stable, then build the events/live-ops layer.

Start narrow. Do not begin with a giant online-game event engine.

First version should support:

announcement banner
maintenance banner
feature flag / rollout gate
content unlock
XP/reward multiplier
seasonal challenge

Core schema:

```text
ops_delivery_events
  id
  event_type
  lifecycle_status: draft | scheduled | published | paused | archived
  title
  payload_json
  audience_json
  starts_at
  ends_at
  created_by
  updated_by
  published_by
  created_at
  updated_at
  published_at
```

Required flow:

Draft → Preview → Schedule/Publish → Pause → Archive

Required safety:

strict payload schema per event type
preview as account/learner
canary to demo/test accounts first
audit receipt for every mutation
rollback/pause button
server-side enforcement, not client-only hiding
no event can target everyone without explicit confirmation

This should come after account-status enforcement and KPI/error hardening, because delivery events are customer-facing operations.

## Test plan I would add now

Use the existing scripts as the base; `package.json` already has `test`, `check`, `verify`, capacity, smoke, deploy, and audit scripts. ([GitHub][9])

Add focused tests for:

Admin route access:
admin can load all admin ops endpoints
ops can view but not mutate admin-only fields where intended
parent/demo cannot access admin endpoints
missing/invalid origin behaviour is tested in production-like mode

Account status:
suspended blocks app access and writes
payment_hold blocks premium/write actions but allows account access
admin cannot lock out last admin
status changes are audited

Public error ingest:
IPv6 `/64` grouping
body cap before expensive work
server-side redaction always runs
dedupe tuple works
network spam does not create unbounded D1 writes

KPI integrity:
dashboard error counts match source after reconciliation
counter drift can be detected and repaired
demo and real usage are separated

UI flow:
account metadata save updates related panels
error status transition updates totals
refresh failure shows visible panel error
dirty form fields are not wiped by refresh

Error centre:
resolved errors reopen after recurrence
search/filter works
details drawer exposes enough debug context without leaking secrets

## Priority order

I would run the next work in this order:

**P1.5-A: Admin truth and UI failure states.** Freshness timestamps, visible refresh errors, mutation-related panel refreshes, real-vs-demo KPI split.

**P1.5-B: Public endpoint hardening.** IPv6 `/64`, global public-ingest budget, production same-origin smoke tests.

**P1.5-C: Data integrity.** CAS for account metadata, KPI reconciliation, transaction/batch audit, grep old transaction helpers.

**P1.5-D: Real GM controls.** Enforce `ops_status` across auth/session/bootstrap/subject command paths.

**P1.5-E: Error centre debugging.** Details drawer, search, route/build attribution, reopen logic.

**P2: Event delivery.** Only after the admin console is trustworthy enough to operate production safely.

My overall judgement: **P1 was a good engineering step. The next mistake would be adding lots of shiny admin features before making the current console impossible to misread.** For a SaaS admin system, “boring but correct” beats “comprehensive but slightly lying.”

[1]: https://github.com/fol2/ks2-mastery/blob/main/docs/plans/james/admin-page/admin-page-p1-completion-report.md "ks2-mastery/docs/plans/james/admin-page/admin-page-p1-completion-report.md at main · fol2/ks2-mastery · GitHub"
[2]: https://github.com/fol2/ks2-mastery "GitHub - fol2/ks2-mastery: KS2 Unified — browser-side React prototype of a KS2 (UK Year 5/6) study app · GitHub"
[3]: https://github.com/fol2/ks2-mastery/pulls "Pull requests · fol2/ks2-mastery · GitHub"
[4]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/worker/src/repository.js "raw.githubusercontent.com"
[5]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/surfaces/hubs/AdminHubSurface.jsx "raw.githubusercontent.com"
[6]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/worker/src/app.js "raw.githubusercontent.com"
[7]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/main.js "raw.githubusercontent.com"
[8]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/platform/ops/error-capture.js "raw.githubusercontent.com"
[9]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/package.json "raw.githubusercontent.com"
