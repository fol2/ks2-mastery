# KS2 Mastery Hardening Charter

## Stabilisation Rule

**During hardening, no new learner-visible feature is accepted unless it fixes an existing broken, confusing, unsafe, slow, or inaccessible behaviour.**

Every PR opened during this sprint is reviewed against this rule. Work that cannot be framed as a fix is redirected to a follow-up plan; work that fits the rule is accepted even when the surface area is small.

## Allowed Scope

The following categories of change are in scope for this pass:

- Layout fixes (clipping, overflow, spacing, responsive breakpoints, card breakage on narrow viewports).
- Bug fixes in existing learner flows (spelling, grammar, punctuation, parent hub, admin hub, demo flow).
- Broken states (blank screens, missing empty-state copy, modal-scroll traps, toast overlap, sprite/effect layering glitches).
- Stale-write recovery affordances (409 stale-write, 409 idempotency reuse, blocked-stale banners, retry transparency).
- Better loading and error affordances (skeletons, retry buttons, error copy, degraded-mode banner polish).
- Server hot-path bounding (bootstrap caps, command validation, projection bounding — continuation of PRs #126-#139).
- Smaller bundles (splitting vendor/app, trimming dead imports, dropping unused locales).
- Safer response headers (CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `frame-ancestors`, COOP, CORP).
- Test coverage for the bugs fixed and for regressions that could reintroduce them (parser-level contract tests, Playwright golden paths, chaos tests at the HTTP boundary, access-matrix tests).
- Production smoke checks (bootstrap, dense-history spelling, response-header audit, bundle audit extensions).
- Rollback readiness (evidence artefacts under `reports/capacity/`, dated launch-evidence rows in `docs/operations/capacity.md`).

## Disallowed Scope

The following categories are out of scope for this pass and redirect to follow-up plans:

- New question types in any subject.
- New game systems, reward mechanics, or monster behaviours.
- New analytics panels, dashboards, or reporting surfaces.
- New subjects, new adult workflows, or new learner-account types.
- Major art redesign or visual identity change.
- Expanding AI behaviour (new prompt flows, new model providers, new AI-driven features).
- Browser-owned runtime re-entry (production scoring, queue selection, progress mutation, reward projection stay Worker-owned).
- Third-party analytics or tag-manager integrations.
- Migration of Cloudflare Workers assets to Cloudflare Pages.

## Residual Risk: CSP `style-src 'unsafe-inline'`

This pass ships a Content-Security-Policy that accepts `style-src 'unsafe-inline'` as a scope concession. React has 93+ inline `style={}` sites across component files. Migrating them to stylesheet-only rules is a multi-week refactor that sits outside the stabilisation charter.

The residual XSS-via-CSS vector (CSS `url()` exfiltration, attribute-selector side-channels, and attribute-driven data leaks) is bounded by two active mitigating controls:

- `img-src 'self' data: blob:` — CSS `url()` fetches for background images, list-style images, border images, and cursor images are constrained to the same origin. This closes the main exfiltration path that arbitrary inline style injection would otherwise unlock.
- `font-src 'self' https://fonts.gstatic.com` — font-family fetches are constrained to the same origin plus the explicitly allowed Google Fonts CDN. Attacker-controlled `@font-face src: url(...)` cannot reach arbitrary external origins.

The residual vector retires when the `style={}` migration lands as a separate plan. Until then, the CSP string explicitly documents the trade-off.

## Audit-Gated Notes

### HSTS `preload` deferral

This pass ships HSTS with `max-age=63072000; includeSubDomains` only. The `preload` directive is deliberately omitted.

Submitting `eugnel.uk` to the HSTS preload list is a one-way commitment that forces every subdomain of `eugnel.uk` to serve HTTPS-only for two years. Without a signed subdomain-tree audit confirming every existing and planned subdomain can meet that requirement, preload is unsafe. The preload flip is a separate PR with a signed `eugnel.uk` subdomain-tree audit as its entry requirement.

### COOP `same-origin-allow-popups` choice

This pass ships `Cross-Origin-Opener-Policy: same-origin-allow-popups` rather than the stricter `same-origin`. OAuth popup flows (social login) may retain cross-origin window references to the popup opener; the strict `same-origin` value would sever that reference and break the popup-based OAuth redirect path.

This choice is revisited if OAuth migrates to a top-level redirect model, at which point `same-origin` becomes the safer default.

### Logout `Clear-Site-Data`

The `/api/auth/logout` response emits `Clear-Site-Data: "cache", "cookies", "storage"`. KS2 Mastery is used on shared school and family devices, so full browsing-state cleanup on logout is the safer default.

## Sign-off

Signed at sprint start by James To — 2026-04-25.
