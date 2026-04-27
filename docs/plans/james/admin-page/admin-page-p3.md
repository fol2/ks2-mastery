# Admin Console P3 — Product + Engineering Contract

Status: advisory contract for the next implementation-planning agent  
Date: 2026-04-27  
Scope owner: KS2 Mastery business/operator admin surface  
Preceded by: `docs/plans/james/admin-page/admin-page-p2-completion-report.md`

This document is intentionally **not** a root-level implementation ticket plan. It does not prescribe implementation units, exact files, test filenames, or sequencing. The next agent must digest this contract, re-scan current `main`, inspect open/merged PR state, and then write its own implementation plan with concrete units, files, tests, review dispatches, and merge order.

The role of this file is to define what P3 must achieve, what it must not break, and what product/engineering guarantees a finished P3 must satisfy.

---

## 0. Source context reviewed

This contract was written after reviewing the following current-source artefacts. The next implementation-planning agent must re-check them because the repo is moving quickly.

Primary Admin reports and PR state:

```text
docs/plans/james/admin-page/admin-page-p2-completion-report.md
docs/plans/james/admin-page/admin-page-p2.md
docs/plans/james/admin-page/admin-page-p1-5-completion-report.md
docs/plans/james/admin-page/pr100n119-mixture.md
PR #363 — Admin Console P2 merged feature PR
PR #344 / #346 / #355 / #356 — per-unit P2 PRs that may still appear open even though their commits were merged through #363
```

Current Admin/client/Worker shape checked at contract time:

```text
src/surfaces/hubs/AdminHubSurface.jsx
src/surfaces/hubs/AdminOverviewSection.jsx
src/surfaces/hubs/AdminAccountsSection.jsx
src/surfaces/hubs/AdminDebuggingSection.jsx
src/surfaces/hubs/AdminContentSection.jsx
src/surfaces/hubs/AdminMarketingSection.jsx
src/surfaces/hubs/AdminSectionTabs.jsx
src/platform/core/admin-hash.js
src/platform/core/store.js
src/main.js
src/platform/hubs/api.js
src/platform/hubs/admin-panel-patches.js
src/platform/hubs/admin-read-model.js
worker/src/app.js
worker/src/repository.js
worker/README.md
wrangler.jsonc
package.json
docs/operating-surfaces.md
docs/subject-expansion.md
docs/monster-visual-config.md
```

Important review caveat: the source scan used GitHub rendered/raw files because the local execution environment could not resolve `github.com` for `git clone`. This contract therefore does not claim a local `npm test` or `npm run check` run. The next agent must run the project’s normal verification gates before making merge claims.

---

## 1. Current state after P2

P2 was successful as a console-structure pass.

The admin page is no longer a flat monolithic operator surface. It now has direct `/admin` entry, TopNav access for admin/ops users, hash-based section deep-linking, tabbed information architecture, and a thin `AdminHubSurface` shell that renders five sections: Overview, Accounts, Debugging & Logs, Content, and Marketing placeholder.

P2 deliberately did **not** add new backend routes, database tables, or admin data contracts. That was the right call for P2 because it reduced structural risk while solving the immediate usability problem: “how do I get into Admin and find the right part?”

The current rough shape is:

```text
Admin Console
  Overview
    dashboard KPIs
    recent ops activity
    demo health

  Accounts
    account roles
    account ops metadata
    mutation receipt/audit lookup

  Debugging & Logs
    error log centre
    error detail drawer
    learner support/diagnostics

  Content
    spelling content release/import status
    post-Mega spelling debug
    post-Mastery seed harness
    grammar/punctuation diagnostics panels
    monster visual/effect config

  Marketing
    placeholder only
```

This means P3 should **not** spend its energy redoing basic navigation. P3 should turn the console from a well-organised page into a genuinely useful operating cockpit.

---

## 2. P3 mission

P3 must make Admin answer real operator questions quickly and safely:

1. “A parent says the app broke. What exactly happened for that account, learner, route, session, and release?”
2. “Is this account healthy, blocked, suspended, payment-held, demo, stale, or misconfigured?”
3. “Is a reported bug a client error, Worker error, subject-command failure, capacity/degradation problem, content release problem, asset/effect config problem, or user-access problem?”
4. “Which subject/content/asset areas are ready, stale, failing validation, or generating abnormal support load?”
5. “Can we safely operate a basic marketing/live-ops message without mixing it into content publishing or child learning rewards?”

The short product sentence:

**P3 turns Admin from a sectioned dashboard into a support/debug/content-operations command centre, while preserving the small admin/ops role model and Worker-authoritative safety boundaries.**

---

## 3. Non-negotiable boundaries

These are hard boundaries. A P3 implementation plan must explicitly preserve them.

### 3.1 Admin is not a subject engine

Admin may read subject diagnostics, content release state, misconception summaries, coverage summaries, and subject-command failure evidence. Admin must not become the place where subject pedagogy, scoring, scheduling, or mastery mutation lives.

Subject runtime boundaries remain separate. Spelling, Grammar, and Punctuation production practice must continue to go through Worker-owned subject commands. Future Arithmetic, Reasoning, and Reading must follow the same pattern when they become real subjects.

### 3.2 Content Management merges the view, not the engines

P3 may create a unified Content Management surface. It must not merge Spelling, Grammar, Punctuation, Arithmetic, Reasoning, and Reading into one shared runtime engine.

The correct product model is:

```text
one Admin content-ops surface
many subject-owned engines/read models
shared cross-subject summary contracts
```

### 3.3 Worker remains the authority for admin mutations

Any durable admin mutation must be Worker-authoritative, same-origin protected, role-gated, idempotent where appropriate, audited, and safe under retries or two browser tabs.

Client-only state may be used for drafts, filters, temporary UI controls, or optimistic rendering. It must not be the source of truth for account status, debug evidence, content publish state, asset publish state, or live-ops delivery state.

### 3.4 The permission model stays small in P3

Do not build a complex role/authority layer yet.

P3 should continue with:

```text
platform_role = parent | admin | ops
```

P3 may add UI placeholders or future-facing contract notes for later roles such as `support`, `content_admin`, `marketing_admin`, or `viewer`, but those roles must not be partially implemented or accidentally enforced in inconsistent places.

Expected P3 behaviour:

```text
admin: can view and mutate admin-owned surfaces
ops: can view operating surfaces, with sensitive fields redacted where already established
parent/demo/signed-out: no Admin access
```

### 3.5 No raw CSS, JS, DOM, or arbitrary HTML authoring

Asset/effect/content/marketing tools must use schemas, closed templates, allowlists, tokens, and reviewed/publishable drafts. Admin must not be able to paste arbitrary JavaScript, raw CSS, unsanitised HTML, or dynamic DOM snippets.

This is especially important for Asset & Effect Registry and Marketing / Live Ops.

### 3.6 Debugging must be evidence-first and redacted

P3 should make debugging faster, but not by leaking secrets or personal data.

Debug bundles, occurrence timelines, request-denial logs, and account support views must follow a redaction contract. They may include masked identifiers, release/build hashes, route names, event kinds, status codes, timestamps, and bounded snippets. They must not include passwords, auth tokens, raw cookies, raw request bodies, provider secrets, unredacted child free text, or unrestricted internal notes for ops-role readers.

### 3.7 Marketing/live ops must not mutate learning mastery

Marketing / Live Ops P3 should not introduce XP boosts, reward multipliers, content unlock rewards, hero coins, streak manipulation, or child-facing game-economy changes unless a separate learning/reward contract exists.

P3 live ops should start with safe operator messages such as announcements and maintenance banners. Anything that changes learning flow, rewards, subject content, or child motivation must be a later phase.

---

## 4. Required P3 product outcomes

P3 is complete only if the console supports these product outcomes.

### Outcome A — Admin entry survives real sign-in flows

P2 added direct `/admin` entry and hash sections, but login redirect preservation was deferred. P3 must close that gap.

Required behaviour:

```text
/admin
/admin#section=debug
/admin#section=accounts
/admin#section=content
/admin#section=marketing
```

If a signed-out admin opens one of those URLs, completes sign-in, and has the correct platform role, they should land back on the intended Admin section. They should not be dumped onto `/` with no obvious route back.

If the user does not have Admin access, they should see a clear access-denied state without leaking admin data.

The implementation may use `sessionStorage`, a safe return-to parameter, or another bounded mechanism. The contract is not the exact mechanism; the contract is the user outcome and security boundary.

Acceptance-level guarantees:

- Signed-in `admin` can open `/admin` directly.
- Signed-in `ops` can open `/admin` directly and view permitted surfaces.
- Signed-out admin who opens `/admin#section=debug` returns to Debugging & Logs after sign-in.
- Parent/demo/suspended/payment-held users do not receive admin payload data.
- Invalid hash sections fall back safely to Overview.
- Navigating away from Admin clears stale admin hash state as P2 intended.

### Outcome B — Debug Bundle exists as the first-class support artefact

The single most important P3 feature is a support/debug evidence packet.

When a parent reports “it broke”, the operator should be able to generate a bounded debug bundle by entering one or more of:

```text
account email / account id
learner id
session id
route name or route contains
error fingerprint / event id
approximate time window
release/build hash
```

The output should be copyable as JSON and as a human-readable support summary.

The bundle should aggregate, where available:

```text
generatedAt
correlation/request identifiers
current release/build hash
account summary, with role/status/plan/tags and masked identifiers
ops_status and status reason/history if available
linked learners summary
selected learner summary
recent practice sessions
recent subject-command failures
recent client error fingerprints
recent server/admin errors
error occurrence timeline
recent request denials / auth blocks
capacity/degradation state around the time window
recent mutation receipts
recent account ops changes
content release versions relevant to the learner/subject
monster visual/effect config published version/hash
browser/user-agent family when available
route names and timestamps
```

The Debug Bundle must not be a browser-only scrape of visible UI. It needs a Worker-authoritative aggregation path because support/debugging is exactly where partial client state misleads operators.

P3 does not need perfect search infrastructure. It does need a bounded, reliable way to answer “show me what happened around this report.”

Acceptance-level guarantees:

- Admin can generate a bundle for a known account/learner/time window.
- Ops can generate a redacted version if allowed by the existing ops-read model.
- Bundle generation has clear empty states when no evidence exists.
- Bundle output is copyable and stable enough to paste into a bug report.
- Bundle output includes a generated timestamp and release/build context.
- Bundle cannot expose auth tokens, secrets, raw cookies, or unsafe free text.
- Bundle generation is rate-limited or bounded enough not to become a hot path under repeated use.

### Outcome C — Error Centre gains occurrence timeline and actionability

P1.5 gave the error centre filtering and an error drawer. P2 moved it to the Debugging & Logs section. P3 must make it genuinely actionable.

The current drawer already shows important group-level fields such as error kind, message first line, first frame, route, user agent, occurrence count, first/last seen, release fields, status, and linked account marker. P3 should add occurrence-level evidence.

The occurrence timeline should answer:

```text
When did this fingerprint happen?
Which release/build did it happen on?
Which route did it happen on?
Was it anonymous/demo/signed-in/admin?
Did it happen after being marked resolved?
Is it tied to one learner/account or widespread?
What nearby subject command / mutation / denial evidence exists?
```

The implementation may store occurrence rows, bounded occurrence samples, or another safe representation. The contract is that operators can see enough history to debug without guessing.

Acceptance-level guarantees:

- Error group rows still dedupe by the established fingerprint tuple.
- Occurrence history is bounded; repeated spam cannot create unbounded writes.
- Resolved errors reopening after a new occurrence remains correct and counter-safe.
- The drawer links naturally into Debug Bundle generation.
- Filters by route/kind/date/release/reopened remain backend-effective, not just UI-local.
- There is an obvious copy action for fingerprint and debug context.

### Outcome D — Request denials and access blocks become visible

Many real production complaints are not JavaScript crashes. They are access-boundary events:

```text
session expired
account suspended
payment hold blocked a write
demo expired
viewer/read-only learner attempted a write
missing learner membership
admin/ops permission denied
same-origin/CSRF rejection
rate-limit rejection
```

P3 should add a small request-denial/support-log surface. The aim is not to log every request. The aim is to preserve enough evidence to explain why a legitimate-looking user could not proceed.

Acceptance-level guarantees:

- Admin can see recent denial events by reason, route, account/learner mask, and timestamp.
- Denial logs are redacted and bounded.
- Denial evidence can appear in a Debug Bundle.
- Normal users do not see internal denial metadata.
- Sensitive security-denial details are not overexposed in the browser.

### Outcome E — Account Management becomes searchable and support-oriented

P2 put account roles and ops metadata into the Accounts section. P3 should turn this into a real account-support cockpit.

Required product shape:

```text
Accounts
  search / filter
  account list
  account detail drawer/page
  linked learners
  account status and reason
  plan/tags/internal notes
  recent sessions
  recent errors
  recent request denials
  recent mutations/audit
  copy debug bundle
```

Account search should support practical operator queries:

```text
email contains
account id
masked account id suffix
display name
ops_status
platform_role
plan label
tag
real/demo if available
```

Account detail should not become a CRM or billing system. It should be a support/debug view.

Account mutations must continue to preserve:

- admin-only mutation authority
- row-version/CAS conflict handling
- dirty-row protection
- last-admin and self-lockout protections
- mutation receipts
- refresh cascade and visible refresh errors
- `ops` redaction of internal notes if that remains the established rule

Acceptance-level guarantees:

- Operator can find a known account without scrolling a long list.
- Operator can open a support view for that account.
- Operator can see why the account is blocked or healthy.
- Operator can jump from account detail to relevant Debug Bundle.
- Status transitions require reason/confirmation when high impact.
- Account notes/tags preserve existing CAS conflict behaviour.

### Outcome F — Content Management becomes a subject-operations overview

P2 grouped existing content and subject panels into the Content section. P3 should define the cross-subject operating contract.

Content Management should answer:

```text
Which subjects are live, gated, placeholder, or broken?
Which subject has draft/published content?
Which subject has validation errors?
Which content release is the learner using?
Which skills/templates/items are weak or under-covered?
Which misconception patterns are common?
Which subject has abnormal error/support load?
Which subject is safe to publish or needs attention?
```

Required conceptual sections:

```text
Content Management
  Subject Overview
  Release Readiness
  Content Library / Word Library entry points
  Skill / Template / Item Coverage
  Misconception Taxonomy / Signals
  Subject-specific diagnostics
  Asset & Effect Registry
```

The first version does not need a complete CMS for every subject. It must, however, establish a consistent subject-operations view that can grow across Spelling, Grammar, Punctuation, and future Arithmetic/Reasoning/Reading.

Acceptance-level guarantees:

- Content section distinguishes real production subjects from placeholders.
- Subject overview shows release/rollout state per subject.
- Spelling content release/import status remains supported.
- Grammar and Punctuation diagnostics remain available and are grouped meaningfully.
- Future subjects can appear as placeholders without pretending they have engines/content.
- No subject runtime logic is moved into Admin.
- No subject mastery is mutated from Content Management except through existing safe content/admin routes.

### Outcome G — Asset & Effect Registry is specified and begins replacing one-off Monster Visual Config

Monster Visual Config and Monster Effect Config are already a strong prototype: draft/publish/restore, reviewed state, fallback behaviour, allowlisted effect templates, no raw DOM/CSS/JS. P3 should generalise the product concept without throwing away that proven safety.

Required registry concept:

```text
Asset & Effect Registry
  asset id / monster id / branch / stage
  display name
  category/context
  manifest hash / published config hash
  visual config
  effect config
  animation tokens
  CSS-token-style variants, not raw CSS
  review status
  validation state
  draft version
  published version
  rollback/restore state
  runtime fallback status
```

P3 may implement a first registry slice or write the migration path from current Monster Visual Config into a registry-shaped model. The exact implementation scope is for the next plan. The contract is that Asset & Effect Registry becomes the long-term home of asset metadata, animation controls, and safe visual/effect tuning.

Hard constraints:

- no raw CSS authoring
- no raw JavaScript authoring
- no arbitrary HTML injection
- no unreviewed publish
- broken config must fall back to bundled defaults, not blank rendering
- visual and effect publish atomicity must be pinned by a Worker-level test or equivalent durable-path proof
- production smoke should exist for published runtime shape

Acceptance-level guarantees:

- Current Monster Visual/Effect Config capabilities are not regressed.
- The registry model can describe both visual and effect data.
- Operators can preview before publish.
- Operators can restore a previous retained version.
- First-publish bundled-default behaviour remains safe.
- A future asset category can be added without inventing a new admin panel from scratch.

### Outcome H — Marketing / Live Ops becomes safe V0, not a full game event system

The Marketing tab is currently a placeholder. P3 should make it useful, but not dangerous.

Recommended P3 V0 product scope:

```text
Marketing / Live Ops
  announcement banner
  maintenance banner
  internal/demo audience preview
  draft -> preview -> schedule/publish -> pause -> archive lifecycle
  audit trail
```

Do not implement reward multipliers, XP boosts, content unlocks, seasonal challenge rewards, Hero Coins, streak pressure, or per-child behaviour manipulation in P3 unless a separate learning/reward contract exists.

Marketing messages must be schema-bound:

```text
type: announcement | maintenance
status: draft | scheduled | published | paused | archived
title
body text or restricted-safe markdown
severity/tone token
audience descriptor
startsAt
endsAt
createdBy
updatedBy
publishedBy
createdAt
updatedAt
publishedAt
```

Audience targeting should be conservative:

```text
internal/admin preview
demo users
all signed-in users
possibly parent-only later
```

Avoid sensitive targeting and child-personalisation in V0.

Acceptance-level guarantees:

- Admin can create and preview a simple announcement or maintenance banner.
- Publishing requires explicit confirmation for broad audiences.
- Published messages are read from Worker-authoritative state.
- Client runtime receives only active, relevant, safe fields.
- All mutations are audited and idempotent where appropriate.
- Ops can view live/scheduled messages if permitted, but not mutate unless product explicitly allows it later.
- Marketing does not alter subject content, asset config, rewards, or learning progress.

### Outcome I — Admin read performance and actor resolution are cleaned up

P2 deferred two known performance/shape debts:

```text
readAdminHub sequential -> Promise.all where safe
assertAdminHubActor dedup / single actor resolution per hub load
```

P3 should address these if it adds heavier debug/account/content reads. It is irresponsible to add Debug Bundles, account detail, and occurrence timelines on top of repeated actor resolution and unnecessary sequential hub reads.

The exact performance budget should be set by the implementation plan after measuring current baselines. The product contract is:

- Admin should not feel slower because P3 adds richer panels.
- New expensive panels should lazy-load or narrow-refresh instead of bloating the first Admin Hub bundle.
- Worker capacity telemetry should make slow admin/debug requests visible.
- The initial `/admin` load should remain bounded.
- Large evidence views should use search/detail fetches, not load every row into the base hub payload.

Acceptance-level guarantees:

- Admin initial load remains healthy under current test/capacity gates.
- Heavy debug/account detail data is fetched on demand.
- Actor/session/account resolution is not repeated unnecessarily within one request.
- Existing circuit-breaker/degradation UX remains intact.

### Outcome J — Documentation and PR hygiene are repaired

P3 must include documentation cleanup as a deliverable, not a leftover.

Known documentation drift to fix:

- `docs/operating-surfaces.md` still describes the Admin ops P1 state and says account ops status was not wired into sign-in enforcement. P1.5 changed that, so this doc is misleading.
- Worker route docs should reflect expanded error-event filters if they are now active, not only status/limit.
- Admin docs should describe the current five-section Admin Console after P2.
- Monster Visual/Effect docs should call out the Asset & Effect Registry direction once P3 lands.
- Marketing/Live Ops V0 should have an operator runbook if any publishable message system ships.

PR hygiene:

- The merged P2 feature PR may coexist with stale per-unit PRs that still appear open. Those should be closed or clearly labelled as merged-via-feature-branch to avoid future agents reviewing stale branches by mistake.
- Future P3 plans should keep the “plan + PR + squash SHA cross-reference” convention because it makes repo archaeology much easier.

Acceptance-level guarantees:

- Docs no longer contradict shipped enforcement behaviour.
- A future agent can understand Admin current state from docs without reverse-engineering reports.
- Open stale PRs from earlier implementation-unit branches are either closed or explicitly marked.

---

## 5. Contract-level data and privacy rules

P3 will likely add or expose more operational data. These rules apply to every P3 feature.

### 5.1 Evidence retention must be bounded

Debug evidence is useful, but it can grow forever if not bounded. Any new occurrence, denial, bundle, or live-ops event table must define retention or compaction behaviour.

Examples of acceptable patterns:

```text
keep latest N occurrences per fingerprint
keep denials for N days
aggregate older rows into counts
sample repeated identical occurrences after a threshold
manual export for support before retention expiry
```

The implementation plan should choose the exact mechanism.

### 5.2 Identifiers must be intentionally masked

Admin may need full identifiers in some admin-only contexts. Ops and copied support bundles should use masked identifiers unless there is a specific admin-only reason not to.

At minimum, debug bundle output should clearly mark what is full, masked, absent, or redacted.

### 5.3 Internal notes are not generic debug output

Account internal notes are useful, but they may contain business-sensitive context. They should not automatically appear in every copyable debug bundle unless the user role and export mode are explicitly admin-only and the UI labels the inclusion.

### 5.4 Child-facing text must be treated carefully

If future debug logs include child-submitted writing, typed answers, or open text, P3 must redact or summarise by default. The first P3 version should avoid raw free-text inclusion unless a narrow existing subject contract already permits it.

---

## 6. P3 validation contract

The implementation plan must translate this into exact test files and scripts. This section defines the categories that must be covered.

### 6.1 Access and auth flow validation

Must prove:

- direct `/admin` entry works for signed-in admin/ops
- signed-out admin return-to flow preserves section after sign-in
- parent/demo/signed-out cannot receive admin data
- suspended/payment-held behaviour matches the established auth/mutation contract
- invalid admin sections sanitise to Overview
- stale hash is cleared when leaving Admin

### 6.2 Debug evidence validation

Must prove:

- Debug Bundle aggregates from multiple sources without throwing on missing data
- redaction differs correctly between admin and ops where required
- empty/no-match state is clear and non-error
- copyable bundle output is stable and bounded
- error occurrence timeline is bounded and linked to error fingerprints
- request denials appear in the right support context

### 6.3 Account Management validation

Must prove:

- account search/filter works on intended fields
- account detail does not expose forbidden fields to ops
- account status mutations still require admin
- status reason/audit is preserved
- CAS conflicts still work
- dirty-row guard still prevents accidental edit loss
- last-admin/self-lockout protections remain intact

### 6.4 Content Management validation

Must prove:

- subject overview does not crash on placeholder subjects
- real subjects and placeholders are visually distinct
- subject release/validation status is accurate for available subjects
- Admin does not import subject engines into the production client bundle
- Content Management does not mutate mastery/progress through unsafe paths

### 6.5 Asset & Effect validation

Must prove:

- current Monster Visual/Effect functionality is not regressed
- visual/effect publish stays atomic or otherwise has a durable invariant test
- broken/missing published config falls back safely
- raw CSS/JS/HTML is not accepted
- smoke validation covers published runtime shape

### 6.6 Marketing / Live Ops validation

Must prove:

- only admin can mutate messages/events
- ops can view according to product decision
- broad-audience publish requires confirmation
- inactive/scheduled/archived messages are not delivered as active
- active message delivery is schema-bound and safe
- marketing messages do not alter content/reward/progress state

### 6.7 Performance and degradation validation

Must prove:

- initial Admin load remains bounded
- heavy detail surfaces are on-demand
- capacity/degradation warnings are preserved
- failed panel/detail fetches show visible errors, not silent stale state
- narrow refreshes do not clobber unrelated panel state

### 6.8 Documentation and archaeology validation

Must prove:

- docs are updated alongside code
- completion report records shipped scope, tests, known follow-ups, PRs, and squashes
- stale PRs are not left ambiguous

---

## 7. Suggested P3 scope slicing for the next implementation plan

This is only a suggested decomposition. The next agent must write its own plan.

A reasonable decomposition would be:

```text
P3-A: Entry/session return-to + doc/PR hygiene
P3-B: Debug Bundle + request-denial evidence contract
P3-C: Error occurrence timeline + drawer/bundle integration
P3-D: Account search/detail support cockpit
P3-E: Content Management subject overview contract
P3-F: Asset & Effect Registry first slice + atomic publish proof
P3-G: Marketing / Live Ops V0 announcement/maintenance lifecycle
P3-H: Admin read performance cleanup + completion report
```

The next agent should not blindly implement all of these in one huge PR. It should choose a safe sequence based on current `main`, migration needs, test blast radius, and whether open PRs are still present.

---

## 8. Explicit non-goals for P3

P3 should not deliver:

- billing/subscriptions
- full CRM
- complex role hierarchy
- WebSocket realtime dashboard
- full analytics warehouse
- arbitrary event-delivery engine for rewards/game economy
- raw CSS/JS/HTML authoring
- full subject CMS for every subject
- subject engine merge
- production Arithmetic/Reasoning/Reading implementation
- Hero Mode / Hero Coins / child reward economy
- push notification system
- parent-facing marketing campaign tools

These may become later phases, but P3 is already large if it covers debugging, account search, content overview, asset registry direction, and safe marketing V0.

---

## 9. Open questions the next planning agent must resolve

The next implementation-planning agent should answer these before writing units:

1. Should Debug Bundle be a single endpoint, a family of endpoints, or a search endpoint plus detail endpoint?
2. What is the retention policy for error occurrences and request denials?
3. Should account search be backed by SQL `LIKE`, a small indexed search table, or kept simple until scale demands more?
4. Should Marketing / Live Ops V0 support “all users” in P3, or only internal/demo preview until a separate release gate?
5. Does Asset & Effect Registry require a schema migration in P3, or should P3 first wrap current Monster Visual Config into a registry-shaped UI/read model?
6. What exact performance baseline should `readAdminHub` meet before and after parallelisation/dedup?
7. Which fields from account ops metadata are allowed in copied support bundles for admin vs ops?
8. Should request-denial logging capture only selected denial categories, or all auth/role/rate-limit denials with sampling?
9. Do stale per-unit PRs need to be closed before new P3 branches are created?
10. Which production smoke scripts need harmonised `--help` and structured exit codes as part of P3 versus a small separate cleanup?

---

## 10. Definition of done

P3 is done when the following are true:

- Admin direct entry and post-login return-to flow are reliable.
- Debugging & Logs can produce a copyable evidence bundle for a real support report.
- Error groups have occurrence-level history or an equivalent timeline view.
- Access denials/support blocks are visible to admins in a bounded, redacted way.
- Account Management supports practical search and an account detail/support view.
- Content Management has a cross-subject overview that distinguishes real subjects from placeholders and surfaces release/validation/support signals.
- Asset & Effect Registry direction is implemented or concretely established without regressing current Monster Visual/Effect Config safety.
- Marketing / Live Ops has a safe V0 or remains clearly deferred with an explicit reason; it must not be a vague placeholder pretending to be done.
- Admin read performance is measured and does not regress under the richer surface.
- Existing P1/P1.5/P2 invariants remain true.
- Docs reflect the shipped system rather than stale P1/P2 language.
- Completion report records shipped scope, tests, known follow-ups, and PR archaeology.

The product bar is not “more panels exist.”

The product bar is: **when something goes wrong in production, the business owner can open Admin, find the account or error, gather evidence, understand the likely source, and make a safe operational decision without guessing.**
