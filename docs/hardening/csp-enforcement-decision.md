<!-- SH2-U8 (sys-hardening p2): 7-day Report-Only observation + enforcement decision record. -->

# CSP enforcement decision record

**Plan pointer:** `docs/plans/2026-04-26-001-feat-sys-hardening-p2-plan.md` SH2-U8 (L619-L664).

**Baseline entry:** `docs/hardening/p2-baseline.md` — "CSP Report-Only -> Enforced flip is open" (Access / privacy faults).

**Header source of truth:** `worker/src/security-headers.js::SECURITY_HEADERS` — currently ships `Content-Security-Policy-Report-Only`, NOT `Content-Security-Policy`. **THIS PR DOES NOT CHANGE THAT LINE.** The flip to enforced is a separate follow-up PR gated on this decision record.

---

## Observation window

| Field | Value |
| --- | --- |
| Observation start | **2026-04-27T00:00:00Z** (recorded by U7 hardening-residuals unit on 2026-04-27. The 7-day clock starts from this date. The CSP header remains `Content-Security-Policy-Report-Only` throughout the observation window. The enforcement flip to `Content-Security-Policy` is a SEPARATE follow-up PR gated on 7+ days with zero unexpected violations.) |
| Observation end | **2026-05-04T00:00:00Z** (observation-start + 7 days) |
| Report endpoint | `/api/security/csp-report` (already wired; see `worker/src/app.js` and `tests/csp-report-endpoint.test.js`) |
| Log token | `[ks2-csp-report]` — operator grep the Worker tail for this prefix during the window |
| Violation threshold for flip | **Zero unexpected violations** across the 7-day window. "Expected" = violations whose `violated-directive` + `blocked-uri` pair is an `ALLOWLIST.md` entry signed by the adversarial reviewer in the flip PR (this PR ships NO allowlist — an allowlist is only added if violations appear). |

### Observation procedure

1. After this PR lands on `main` and is deployed, the operator records the UTC timestamp of the first production request served with the SH2-U8 header set in the field `Observation start` above and opens a tracking PR that replaces the placeholder.
2. Daily, run: `npx wrangler tail --format pretty 2>&1 | grep '\[ks2-csp-report\]'` and append a row to the **Daily log** section below with:
   - date (UTC)
   - count of `[ks2-csp-report]` lines in that calendar day
   - unique `violated-directive` + `blocked-uri` pairs seen
   - subjective operator note on whether any of them look like unexpected first-party violations
3. After 7 calendar days, the operator adds an `Operator sign-off` row under **Sign-off** and opens the flip PR (below).

### Daily log (placeholder — to be filled during observation window)

| Day | Date (UTC) | `[ks2-csp-report]` count | Unique violations | Operator note |
| --- | --- | --- | --- | --- |
| 1 | — | — | — | — |
| 2 | — | — | — | — |
| 3 | — | — | — | — |
| 4 | — | — | — | — |
| 5 | — | — | — | — |
| 6 | — | — | — | — |
| 7 | — | — | — | — |

---

## Decision

**Current decision (2026-04-27, U7 hardening-residuals update):** **DEFER — observation window now open**. The 7-day observation window opened on 2026-04-27. The CSP header remains `Content-Security-Policy-Report-Only` in `worker/src/security-headers.js`. The enforcement flip (renaming the header to `Content-Security-Policy`) ships in a SEPARATE follow-up PR after the observation window closes on or after 2026-05-04 with zero unexpected violations.

The enforcement flip (rename header from `Content-Security-Policy-Report-Only` to `Content-Security-Policy` in `worker/src/security-headers.js`) ships in a SEPARATE follow-up PR after the observation window closes with zero unexpected violations. That PR references this decision record.

### Flip criteria (follow-up PR precondition)

The flip PR is in scope IF AND ONLY IF all of the following are true:

1. The **Daily log** table above is fully populated with 7 dated rows.
2. Every row's "Unique violations" field is either empty (`—`), zero (`0`), or contains only entries that appear in the flip PR's ALLOWLIST.md with adversarial-reviewer sign-off.
3. The operator has added an `Operator sign-off` row under **Sign-off** below dated within the 7 days preceding the flip PR's open date.
4. `tests/csp-inline-style-budget.test.js` still passes (the migration from SH2-U8 has not regressed).

### Violation volume thresholds (P4-U4 addendum)

The flip criteria above require zero unexpected violations. The following
thresholds formalise what "unexpected" means in terms of volume and origin:

| Category | Threshold | Action |
| --- | --- | --- |
| **Third-party** `violated-directive` + `blocked-uri` pairs (e.g. CDN, analytics, browser extension) | **≤ 5 unique pairs** across the full 7-day window | Add each pair to ALLOWLIST.md with adversarial-reviewer sign-off; proceed with flip. |
| **Third-party** pairs | **> 5 unique pairs** | Defer flip; investigate whether the CSP allowlist is incomplete for the production request mix. Restart the observation window after allowlist PR lands. |
| **First-party** violation — any `blocked-uri` that is `self`, relative, or matches the repo production domain | **Any (≥ 1)** | **Defer flip unconditionally.** First-party blocks mean the policy is stricter than our own assets require. The correct response is an inventory-driven migration (style/script extraction) or a narrow allowlist, not the enforcement flip. |

#### Inline style count prerequisite

The enforcement flip additionally requires `tests/csp-inline-style-budget.test.js`
to pass at merge time. This test guards the `style-src 'unsafe-inline'`
surface — if the inline-style count has regressed above the committed budget,
enforcement would generate a flood of first-party `style-src-elem` violations
that drown genuine attack signal. The budget test acts as a mechanical gate:
no ratchet regression, no flip.

### Deferral criteria (no flip — stay on Report-Only)

The flip does NOT happen in a follow-up PR if any of the following appear during the window:

1. Any `[ks2-csp-report]` row whose `violated-directive` is `script-src` / `script-src-elem` / `style-src` / `style-src-elem` and whose `blocked-uri` is a first-party (`self`, relative, or repo domain) path. First-party blocks indicate the CSP policy is more restrictive than our own inline assets need — the correct response is an inventory-driven migration (another SH2-U8-style slice) or a narrow allowlist, NOT the flip.
2. Any burst of reports indicating a rate-limited loop (> 100 reports / 5-minute window from a single IP, which `worker/src/rate-limit.js::consumeRateLimit` should already cap at 429 but log for review).
3. Operator judgement that the sample size is too low (e.g. < 50 page loads during the window — low traffic should extend the window, not trigger the flip).

If deferred, the operator amends this file with:

- A new **Deferral reasoning** section immediately below the decision line.
- A restart of the 7-day clock (new `Observation start` + new **Daily log** table under a `## Observation window 2` heading).
- If an allowlist is warranted, the operator opens a separate allowlist PR BEFORE restarting the clock.

---

## Sign-off

**PR-open sign-off:** James To — 2026-04-26.

**Operator sign-off:** `<to be added at observation-window close — must be dated within 7 days preceding the flip PR>`

---

## Why this is a DEFER, not a FLIP

Flipping the CSP header is a one-line worker change but a zero-margin customer-facing risk: a missed inline-style site becomes a broken page for every learner on every route that hits the site.

This PR lowers that risk two ways:

1. **Migrates 25 of the 282 inline-style sites** (SH2-U8 migration slice — `css-var-ready` and `shared-pattern-available` classification only). Post-migration total is 257 sites; see `docs/hardening/csp-inline-style-inventory.md` for the per-file breakdown.
2. **Installs a budget guard** (`tests/csp-inline-style-budget.test.js`) that fails CI if the count regresses. This is the mechanical floor — not a flip precondition, but a regression prevention so the next migration slice lands against a steady baseline.

The remaining 257 inline-style sites keep `style-src 'self' 'unsafe-inline'` safely shipped in **Report-Only** mode. A flip today would emit 257+ page-load violations before the first real attacker had a chance to trip a real CSP violation — noise drowns signal and the operator cannot tell a real attack from a legitimate first-party page render.

The 7-day window gives us:

- Signal on whether production traffic hits any `'none'`-directive violation we missed.
- Confidence that `challenges.cloudflare.com` / `fonts.googleapis.com` / `fonts.gstatic.com` third-party allowances are sufficient for the actual request mix (not just the test fixture mix).
- An operator log that later SH2-U8-style migration PRs can cite when they reduce the `'unsafe-inline'` surface further.

## P5 Cross-Assertion (2026-04-28)

Added mechanical test in `tests/security-headers.test.js` that enforces agreement between `CSP_ENFORCEMENT_MODE` and the header key in `SECURITY_HEADERS`. The mode constant is no longer dead — if the flip PR changes the mode without updating the header key (or vice versa), tests fail.

**Observation window status:** Open (2026-04-27 to 2026-05-04). Daily log remains unpopulated. The enforcement flip or dated deferral will be executed after the window closes.

## P6 Status Update (2026-04-28)

**Decision:** Continue deferral. P6 cannot honestly flip CSP enforcement on 2026-04-28 because the active observation window does not close until 2026-05-04T00:00:00Z and the Daily log table above still contains placeholder rows.

The current gate remains:

1. Keep `CSP_ENFORCEMENT_MODE` in `report-only` mode.
2. Populate the 7 dated Daily log rows after the observation window closes.
3. Confirm zero unexpected first-party violations, or document an allowlist/deferral with reviewer sign-off.
4. Keep `tests/security-headers.test.js` and `tests/csp-inline-style-budget.test.js` passing in the flip or deferral PR.

P6 therefore records a dated deferral only. Any enforced-mode change before 2026-05-04 would bypass the owner-approved observation contract.
