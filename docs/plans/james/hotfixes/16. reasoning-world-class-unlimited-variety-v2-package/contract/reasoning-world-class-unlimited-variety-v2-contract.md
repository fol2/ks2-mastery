# Reasoning world-class unlimited variety v2 contract

## Evidence boundary

Primary implementation snapshot: uploaded ZIP `ks2-mastery-lean-05131531.zip`.

This package is Reasoning-only. It does not change Spelling, Grammar, Punctuation, Reading, Arithmetic, Hero economy, monster projection, shared reward rules, or platform subject routing beyond the existing Reasoning-owned files and tests listed below.

The repository also pins this package folder to LF line endings in `.gitattributes` so the patch and checksum evidence remain byte-stable on Windows checkouts. That is evidence hygiene only; it does not change runtime behaviour.

The original implementation package was derived from the uploaded ZIP snapshot. The refreshed repository patch in this folder is generated against current `origin/main` so it can be applied directly in the live repository.

## Patch

Apply from the repository root with:

```bash
git apply "docs/plans/james/hotfixes/16. reasoning-world-class-unlimited-variety-v2-package/patches/005-reasoning-world-class-unlimited-variety-v2.patch"
```

The refreshed repository patch is generated with `git diff --binary` and is verified with `git apply --check` against pre-merge base commit `cf165dae`.

## Release id

New Reasoning content release id:

`reasoning-variety-expansion-v2-2026-05-13`

This is a Reasoning content/scheduler release bump. It is intentionally distinct from the previous `reasoning-variety-hardening-2026-05-13` release because the content denominator and scheduling behaviour changed.

## Files modified

- `.gitattributes` (line-ending stability for this package folder only)
- `shared/reasoning/content.js`
- `shared/reasoning/metadata.js`
- `worker/src/subjects/reasoning/engine.js`
- `scripts/reasoning-production-smoke.mjs`
- `tests/reasoning-content-contract.test.js`
- `tests/reasoning-engine-rewards.test.js`

## Required behaviour after patch

1. Reasoning exposes 138 deterministic template families.
2. Strict SATs practice excludes extra-credit templates.
3. Extra-credit templates are gated out for new/cold learners and become available only after enough independent evidence.
4. Reasoning exposes 23 reusable context themes and 28 themed template families.
5. The scheduler avoids repeated context themes inside a generated round when enough alternatives exist.
6. Exact due retry fidelity is preserved. Due retries still return the original `templateId:seed`; theme rerolling applies only to newly generated non-retry questions.
7. Safe browser read models still do not expose evaluators, solution lines, domain/skill hints, or answer metadata before marking/support.
8. Monster/reward evidence remains independent-success only. Supported/worked/faded success must not award Reasoning evidence stars.
9. Existing Hero integration remains a launch/provider orchestration boundary only; this patch does not alter Hero economy or monster ownership.

## New content added

The patch adds 11 new context themes:

`coding_jam`, `beach_clean`, `bakery_day`, `drama_rehearsal`, `market_garden`, `film_club`, `mountain_camp`, `weather_station`, `art_studio`, `city_farm`, `aquarium_visit`.

The patch adds 14 template families:

- `theme_rounding_range_inventory`
- `theme_inverse_two_step_boxes`
- `theme_remainder_transport_decision`
- `theme_fraction_measure_leftover`
- `theme_decimal_measure_compare`
- `theme_percent_sale_budget`
- `theme_ratio_total_split`
- `theme_timetable_total_duration`
- `theme_triangle_base_angles`
- `theme_composite_area_remaining`
- `theme_statistics_missing_mean`
- `theme_logic_total_constraints`
- `theme_fdp_ordering_transfer`
- `theme_extra_credit_crossing_rules`

The new content extends rounding bounds, inverse reasoning, remainder interpretation, fractions of measures, unit conversion, percentage discounts, ratio from total, timetable duration, isosceles angle reasoning, composite area, missing mean, two-clue constraints, FDP ordering, and beyond-KS2 crossing-rule transfer.

## Acceptance checks

Minimum local acceptance checks from this package:

```bash
node --test tests/reasoning-content-contract.test.js tests/reasoning-engine-rewards.test.js tests/reasoning-subject-registry.test.js tests/hero-reasoning-integration.test.js tests/reasoning-production-smoke.test.js tests/subject-command-actions.test.js
REASONING_AUDIT_SEEDS=300 node "docs/plans/james/hotfixes/16. reasoning-world-class-unlimited-variety-v2-package/validation/scripts/reasoning-v2-content-audit.mjs"
node "docs/plans/james/hotfixes/16. reasoning-world-class-unlimited-variety-v2-package/validation/scripts/reasoning-v2-variety-probe.mjs"
```

The audit script is package-only validation support. It is not part of the production repository patch.

## Verification notes

The uploaded lean ZIP did not include `node_modules`, so the original package extraction could not complete full `npm test` or `npm run build`. After applying the package in the normal repository worktree with dependencies installed, the current verification evidence is:

- `validation/current-contract-targeted-tests.log`: contract target list passed 50/50 against `cf165dae`.
- `validation/current-content-audit-41400.json`: 41,400 generated Reasoning cases, 0 failures.
- `validation/current-variety-probe.json`: cold and ready adversarial probes both returned 12 unique themes; cold learners received no extra-credit templates.
- `validation/current-npm-test.log`: full `npm test` passed with 111,536 pass, 0 fail, 12 skipped against `cf165dae`.
- `validation/current-npm-run-check.log`: `npm run check` completed the Cloudflare dry-run build and client-bundle audit against `cf165dae`.
- `SHA256SUMS.txt`: verified after LF normalisation under the package `.gitattributes` rule.
