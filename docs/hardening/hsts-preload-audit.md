# HSTS Preload Audit — Phase 2

**Date:** 2026-04-27 (updated by U7 hardening-residuals unit)
**Status:** DRAFT — DNS audit incomplete; operator sign-off still required before preload submission
**Owning unit:** SH2-U9 (`docs/plans/2026-04-26-001-feat-sys-hardening-p2-plan.md` lines 669-697)
**Requirement:** R9 — "HSTS preload is evaluated honestly via a signed subdomain audit deliverable; submission is a gated follow-up."
**Baseline row:** `docs/hardening/p2-baseline.md` — Access / privacy faults — "HSTS `preload` directive is not set".
**Charter reference:** `docs/hardening/charter.md` — "HSTS `preload` deferral".

## Overview

Phase 1 (PR #189, SH-U6) shipped HSTS with `max-age=63072000; includeSubDomains` via `worker/src/security-headers.js` and the mirrored `_headers` file. The `preload` directive is deliberately absent. The charter's "HSTS `preload` deferral" note commits the preload flip to a separate PR that cites a signed `eugnel.uk` subdomain-tree audit.

This document is that audit skeleton. It enumerates the known subdomain surfaces, lists the `hstspreload.org` entry requirements, captures the rollback implications, records operator-gated unknowns as explicit `TBD-operator` cells, and either recommends preload submission or documents the specific reason for continued deferral.

Submission to `hstspreload.org` and the corresponding `HSTS_VALUE` change in `worker/src/security-headers.js` is a SEPARATE operator-gated PR that cites this audit. SH2-U9 produces the audit artefact only.

## Subject domain

- **Apex:** `eugnel.uk`
- **Production learner origin (confirmed in-repo):** `ks2.eugnel.uk` (see `wrangler.jsonc` `APP_HOSTNAME`, `AGENTS.md`, `docs/operations/capacity.md`).
- **Development origin (confirmed in-repo):** `dev-ks2.eugnel.uk` (see `.claude/launch.json`).
- **Other subdomains:** TBD-operator. DNS is operator knowledge and is not resolvable from the committed repo. The operator must enumerate the full DNS zone (any `A`, `AAAA`, `CNAME`, or `ALIAS` record under `eugnel.uk`) to complete this audit.

## Subdomain enumeration

Each row must be filled in by the operator from the authoritative DNS zone and from live TLS probes (e.g. `curl -sI https://<host>/` and `openssl s_client -connect <host>:443 -servername <host>`). No row below fabricates DNS, TLS, or header data; placeholder cells are marked `TBD-operator`.

| Subdomain               | Purpose                              | HTTPS-only    | TLS version   | Current HSTS header                                                                 | `includeSubDomains` reaches it? | Preload safe? |
| ----------------------- | ------------------------------------ | ------------- | ------------- | ----------------------------------------------------------------------------------- | ------------------------------- | ------------- |
| `eugnel.uk` (apex)      | TBD-operator (redirect? landing?)    | TBD-operator  | TBD-operator  | TBD-operator (must be `max-age>=31536000; includeSubDomains; preload` for preload)  | n/a (apex sets the rule)        | TBD-operator  |
| `ks2.eugnel.uk`         | Production learner app (Worker)      | yes (Worker)  | TBD-operator  | `max-age=63072000; includeSubDomains` (confirmed via `_headers` + security-headers.js) | yes                             | TBD-operator  |
| `dev-ks2.eugnel.uk`     | Development preview origin           | TBD-operator  | TBD-operator  | TBD-operator                                                                        | yes                             | TBD-operator  |
| _other staging_         | TBD-operator                         | TBD-operator  | TBD-operator  | TBD-operator                                                                        | TBD-operator                    | TBD-operator  |
| _legacy hosts_          | TBD-operator (document or decommission) | TBD-operator | TBD-operator  | TBD-operator                                                                        | TBD-operator                    | TBD-operator  |
| _mail / MX / DMARC_     | TBD-operator (non-HTTP may be safe)  | n/a (non-HTTP)| n/a           | n/a (TXT/MX records, not HTTP)                                                      | preload does not affect non-HTTP| n/a           |
| _third-party integrations on subdomains_ | TBD-operator (e.g. status page, docs, blog, analytics) | TBD-operator | TBD-operator | TBD-operator | TBD-operator | TBD-operator |

Operator action: add one row per live HTTP-serving subdomain, one row per non-HTTP record, and strike out any row that no longer resolves. The table must be exhaustive before preload submission.

## HSTS preload requirements

Per `https://hstspreload.org/#submission-requirements` (captured at audit date; operator re-verifies against the live page before submission):

1. **Serve a valid certificate.** All included hosts must present a valid, trusted certificate chain.
2. **Redirect HTTP → HTTPS on the same host.** Any `http://` request to a covered host must 301/308 to `https://` on the same host before following any cross-host redirect.
3. **Serve all subdomains over HTTPS**, including www if it resolves. In particular, the apex `eugnel.uk` itself must serve HTTPS.
4. **Serve an HSTS header on the base (apex) domain**, not only on subdomains, with:
   - `max-age` ≥ 31536000 seconds (one year minimum; two years strongly recommended). Our current value is `63072000` (two years) — **satisfies requirement**.
   - `includeSubDomains` directive present — **satisfies requirement** (confirmed in `worker/src/security-headers.js::HSTS_VALUE` and mirrored in `_headers`).
   - `preload` directive present — **NOT currently set**; the flip is the subject of a follow-up PR gated by this audit.
5. **If the base domain serves additional redirects, the redirect response must carry the HSTS header** (not just the final response).

Current `HSTS_VALUE` string (`worker/src/security-headers.js`):

```
max-age=63072000; includeSubDomains
```

After operator sign-off, the follow-up PR would change this to:

```
max-age=63072000; includeSubDomains; preload
```

and submit `eugnel.uk` at `https://hstspreload.org/`.

## `includeSubDomains` impact assessment

`includeSubDomains` already ships today. Browsers that have seen our HSTS header on `ks2.eugnel.uk` refuse plaintext HTTP to any `*.eugnel.uk` for the remainder of the `max-age` window (two years). This has been in effect since Phase 1; it is not new behaviour.

What preload changes:

- Browsers ship the rule **pre-populated** in their binary (Chromium's `transport_security_state_static.json` and equivalents in Firefox / Safari / Edge). Users who have never visited `ks2.eugnel.uk` still refuse plaintext HTTP to any `*.eugnel.uk`.
- First-visit TOFU (trust-on-first-use) is removed. A user on a hostile network can no longer be downgrade-attacked on their first request.

Operational consequence: **any future HTTP-only service on any `*.eugnel.uk` subdomain becomes unreachable from preload-list browsers until the preload entry is removed.** Operator must confirm no current or near-term planned subdomain depends on plaintext HTTP (e.g. legacy IoT endpoints, third-party redirectors, hard-coded HTTP callbacks).

## Rollback implications

Preload is a **one-way commitment** with a best-effort reverse path:

- Once `eugnel.uk` is accepted into the Chromium preload list and propagates to a browser build, that browser binary refuses plaintext HTTP to any `*.eugnel.uk` for as long as the entry remains in the list AND for the user's `max-age` window after the entry is removed.
- Removal is via `https://hstspreload.org/removal/` and is **best-effort**: it removes the entry from the next Chromium build (and, via the upstream list, from Firefox / Safari / Edge on their own cadences). Browsers that have already cached the rule continue to enforce it for up to `max-age` (two years at our setting).
- Worst case for an ill-advised preload: two-year HTTPS-only commitment on every subdomain, with partial recovery only after a second browser-update cycle. A sub-service that unexpectedly needs HTTP (e.g. an appliance firmware endpoint) is unrecoverable via the preload-removal path alone.

Mitigating factors specific to KS2 Mastery:
- The platform is HTTPS-only by architecture: every surface sits behind Cloudflare with TLS terminated there. (`upgrade-insecure-requests` is currently omitted because the CSP is shipped Report-Only — browsers ignore the directive in that mode. The enforcement-flip PR re-adds it alongside the header-name change.)
- `includeSubDomains` is already active (Phase 1), so a downgrade vector today is already limited to first-visit / unvisited-subdomain traffic.
- The risk added by `preload` is the commitment length, not the technical shape.

## Risks and blockers to preload submission

Open risks that MUST be closed before the follow-up preload-submission PR lands. Each is `TBD-operator` today:

- **Apex `eugnel.uk` HSTS header.** Preload requires the apex to serve HSTS directly. The Worker currently binds only to `ks2.eugnel.uk` (`APP_HOSTNAME` in `wrangler.jsonc`). Operator confirms: does `eugnel.uk` (bare apex) serve HTTPS at all? If yes, what is the response and what is its HSTS header? If it is a redirect, does the redirect response itself carry HSTS?
- **`dev-ks2.eugnel.uk` HTTPS posture.** `.claude/launch.json` references `https://dev-ks2.eugnel.uk` as a dev origin. Operator confirms: is this host live today? Does it serve HTTPS only? What is its HSTS header? Note that preload + `includeSubDomains` would break any HTTP-only access to this dev host.
- **Unknown subdomains.** Operator enumerates the full DNS zone (Cloudflare dashboard export or `dig AXFR` if enabled). Any `A` / `AAAA` / `CNAME` record that serves HTTP (not just MX / TXT) must appear in the enumeration table.
- **Third-party services on subdomains.** Examples to check (TBD-operator): status page (Statuspage.io / BetterUptime CNAME), documentation site (GitHub Pages / Read-the-Docs CNAME), email-landing tracker, analytics host, support desk (Zendesk / Intercom CNAME). Every one that answers over HTTP today becomes an operational hazard after preload.
- **Legacy / historical hosts.** Operator confirms no abandoned subdomain (old marketing site, retired product, hack-day demo) still resolves. A subdomain that no longer has a live backend but still has a CNAME record can still be preload-blocked by browsers.
- **Cloudflare / Workers / Pages routing coverage.** Operator confirms every active subdomain terminates HTTPS at Cloudflare (either by a proxied DNS record or by a direct Workers route). Any grey-cloud DNS-only record that reaches an origin without HTTPS is a blocker.

## Recommendation

**DEFER preload submission** until every item below is closed. This unit produces the audit artefact; the operator-gated follow-up PR cites this document as its entry requirement.

Operator completes before the follow-up PR:

- [ ] Full `eugnel.uk` DNS zone enumerated; every HTTP-serving subdomain has a row above with non-`TBD` cells.
- [ ] Apex `eugnel.uk` confirmed to serve HTTPS with a valid HSTS header (or explicitly confirmed to serve no HTTP at all).
- [ ] `dev-ks2.eugnel.uk` confirmed HTTPS-only OR acknowledged as in-scope for the two-year commitment.
- [ ] Every enumerated third-party subdomain (status, docs, blog, analytics, support) confirmed HTTPS-only with valid certificates.
- [ ] No legacy / decommissioned subdomain still resolves to an HTTP-only endpoint.
- [ ] Operator has read the rollback implications above and accepts the two-year commitment.
- [ ] Operator has reviewed the in-scope follow-up PR that:
  - flips `HSTS_VALUE` in `worker/src/security-headers.js` to include `; preload`,
  - updates every `_headers` block to match,
  - asserts parity via a manual diff against the `_headers` file today; an automated `verify:header-drift` script is future work (no such npm script exists at time of writing — see `package.json`),
  - and is accompanied by an `https://hstspreload.org/` submission confirmation screenshot or ticket ID.

## Operator sign-off

_To be completed by the operator. Until every field is non-empty, preload submission is not authorised._

- **Operator name:** ________________________________
- **Date of review:** ________________________________
- **DNS enumeration method used** (Cloudflare API export, dashboard CSV, `dig`, other): ________________________________
- **Apex `eugnel.uk` HTTPS posture verified by:** ________________________________
- **`dev-ks2.eugnel.uk` HTTPS posture verified by:** ________________________________
- **Third-party subdomains enumerated and HTTPS-only:** yes / no (if yes, list below; if no, document deferral reason):
  - ________________________________
- **Any HTTP-only subdomain (legacy or planned):** yes / no (if yes, STOP — preload is unsafe; document below):
  - ________________________________
- **Operator decision:** _proceed with preload submission PR_ / _continue deferral_ (strike whichever does not apply)
- **If proceeding:** link to follow-up PR that flips `HSTS_VALUE`: ________________________________
- **If deferring:** reason and planned re-review date: ________________________________

---

## U7 Hardening-Residuals Status Update (2026-04-27)

**Assessment:** The DNS audit remains incomplete. All `TBD-operator` cells in the subdomain enumeration table above are still unfilled. No HSTS header change is warranted at this time.

**Current HSTS header:** `max-age=63072000; includeSubDomains` (confirmed in `worker/src/security-headers.js::HSTS_VALUE` on 2026-04-27 — no `preload` directive present).

**What is needed before preload can proceed:**
1. Operator must enumerate the full `eugnel.uk` DNS zone and fill every `TBD-operator` cell above.
2. Operator must verify apex `eugnel.uk` serves HTTPS with a valid HSTS header.
3. Operator must verify `dev-ks2.eugnel.uk` is HTTPS-only.
4. Operator must confirm no legacy or third-party subdomain depends on plaintext HTTP.
5. Operator must complete the sign-off block above.

**No header changes made by this unit.** The `preload` directive will be added in a separate operator-gated PR that cites this audit with a completed sign-off block.

---

## P4 U10 — HSTS Preload Operator Sign-Off Gate (2026-04-27)

**Unit:** U10 of `2026-04-27-004-feat-production-certification-post-p3-revalidation-plan.md`
**Purpose:** Formalise the preload decision as an operator-gated code path.

### Code-level gate

`worker/src/security-headers.js` now exports:

```js
export const HSTS_PRELOAD_ENABLED = false;
```

When `HSTS_PRELOAD_ENABLED` is `false` (the current default), the HSTS header is:

```
max-age=63072000; includeSubDomains
```

When the operator flips the constant to `true` after completing the sign-off below, the header becomes:

```
max-age=63072000; includeSubDomains; preload
```

The `_headers` file must be updated in the same PR that flips the constant, so that Worker and static headers remain in lockstep. Tests enforce this parity.

### Operator preload activation checklist

The operator must complete every item below before flipping `HSTS_PRELOAD_ENABLED` to `true`. Each item corresponds to a risk or blocker documented in the sections above.

- [ ] **DNS zone enumeration complete.** Every HTTP-serving subdomain under `eugnel.uk` has a non-`TBD` row in the subdomain enumeration table above.
- [ ] **Apex `eugnel.uk` HTTPS verified.** The apex serves HTTPS with `Strict-Transport-Security: max-age>=31536000; includeSubDomains; preload`.
- [ ] **`dev-ks2.eugnel.uk` HTTPS-only confirmed.** The development origin serves HTTPS-only, or the operator accepts the two-year preload commitment for it.
- [ ] **Third-party subdomains verified.** Every CNAME-delegated subdomain (status page, docs, blog, analytics, support) serves HTTPS-only with valid certificates.
- [ ] **No HTTP-only subdomains exist.** No current or near-term planned subdomain depends on plaintext HTTP.
- [ ] **Rollback implications accepted.** The operator has read the "Rollback implications" section above and accepts the two-year HTTPS-only commitment across all `*.eugnel.uk` subdomains.
- [ ] **Anti-preload enforcement points updated.** The PR that flips `HSTS_PRELOAD_ENABLED` must also update every hardcoded anti-preload assertion that will otherwise reject the change: `scripts/lib/headers-drift.mjs` (preload rejection in `assertHeadersBlockIsFresh`), `scripts/production-bundle-audit.mjs` (live HEAD check rejects HSTS preload), and `tests/security-headers.test.js` (no-preload assertions on `_headers` content and `serialiseHeadersBlock` output). All four sites must accept preload before the activation PR can pass CI.
- [ ] **`_headers` file updated.** The PR that flips `HSTS_PRELOAD_ENABLED` also updates every HSTS line in `_headers` to include `; preload`.
- [ ] **`hstspreload.org` submission confirmed.** The submission has been completed and the confirmation screenshot or ticket ID is attached to the PR.

### Operator activation sign-off

_To be completed by the operator at the time of flipping `HSTS_PRELOAD_ENABLED` to `true`. Do not fill in until every checklist item above is ticked._

| Field | Value |
| --- | --- |
| **Approver name** | |
| **Date of activation** | |
| **DNS enumeration method** | |
| **PR that flips the constant** | |
| **hstspreload.org submission ID** | |

**No header changes made by this unit.** `HSTS_PRELOAD_ENABLED` is `false`. The constant and this sign-off gate are the deliverables.

---

**End of audit skeleton.** Any change to this file after operator sign-off requires a new dated sign-off block appended below (never rewrite a signed block).

---

## P5 Status Update (2026-04-28)

No new operator DNS audit information available. All `TBD-operator` cells remain unfilled.

## P6 Status Update (2026-04-28)

**Decision:** Continue deferral. P6 has no new operator DNS enumeration, apex-domain HTTPS proof, `dev-ks2.eugnel.uk` proof, third-party subdomain inventory, or signed preload acceptance.

The current gate remains:

1. Keep `HSTS_PRELOAD_ENABLED = false`.
2. Keep the shipped HSTS value at `max-age=63072000; includeSubDomains`.
3. Do not add `; preload` to `worker/src/security-headers.js` or `_headers`.
4. Complete every operator checklist item above before opening a preload activation PR.

P6 therefore records a dated deferral only. This is not an engineering blocker for 30-learner certification; it is an operator-owned DNS and rollback-risk decision.
`HSTS_PRELOAD_ENABLED` remains `false` in `worker/src/security-headers.js`.

**Decision:** Deferred; operator DNS audit incomplete. HSTS preload activation is not blocked by engineering — it is blocked by the DNS zone enumeration and operator sign-off checklist.

**Next review:** When operator completes DNS zone enumeration and verifies all subdomains HTTPS-only.
