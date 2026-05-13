# Reasoning world-class variety hardening contract

## Evidence boundary

Primary authority is the uploaded ZIP snapshot `ks2-mastery-lean-05130813.zip`. GitHub was used only as repository-context supplementation, not as proof of this ZIP's content. Local validation proves behaviour for the extracted ZIP snapshot only. Live production is not certified by this package.

## Goal

Improve the Reasoning subject itself toward a genuinely world-class KS2 reasoning product: deeper variety, less visible repetition, safer deterministic scheduling, KS2-first preparation, and a small controlled extra-credit lane beyond KS2.

## Scope

Reasoning-only files:

- `shared/reasoning/content.js`
- `shared/reasoning/metadata.js`
- `worker/src/subjects/reasoning/engine.js`
- `scripts/reasoning-production-smoke.mjs`
- `tests/reasoning-content-contract.test.js`
- `tests/reasoning-engine-rewards.test.js`
- `tests/reasoning-production-smoke.test.js`

No other subject engine is changed. No Monster, Hero, Spelling, Grammar, Punctuation, Reading or Arithmetic implementation files are changed by this patch.

## Content changes

The Reasoning content release id is bumped from `reasoning-poc-promoted-2026-05-11` to `reasoning-variety-hardening-2026-05-13`, because this patch changes the deterministic content bank and should not masquerade as the previous release.

The promoted Reasoning content bank expands from 110 template families to 124 template families.

New content adds:

- 12 reusable context theme packs: school fair, eco club, space mission, museum trip, sports day, library week, wildlife rescue centre, robotics club, music festival, science lab, train station and community café.
- 14 new context-themed template families.
- 1 extra-credit template, deliberately marked `satsFriendly: false`, so it can enrich mastery practice without polluting strict SATs mini-set selection.

The new template families cover:

- digit constraints and rounding
- equal groups with shortfall
- fraction of amount plus comparison
- percentage comparison
- ratio scale-total reasoning
- mixed-unit length gaps
- timetable wait/duration reasoning
- area plus pack-rounding decisions
- triangle/point angle chaining
- missing statistical totals and range
- estimation choice with exact money check
- money budget and leftover
- mixed-unit error analysis
- extra-credit rate-pattern transfer

## Scheduler changes

The Reasoning scheduler now avoids obvious template repeats within a round whenever unused eligible templates are available. When a focus area has fewer eligible template families than the requested round length, the scheduler cycles through the eligible set instead of repeatedly selecting the same first template.

New question seeds are salted by position inside generated rounds. This prevents exact duplicate item ids in a single generated round under deterministic or degenerate random streams.

Due retry fidelity is preserved. A due retry still returns its exact requested `{ templateId, seed }` pair and is not re-seeded or theme-mutated.

## Marking and reward boundaries

The patch does not change deterministic marking rules except through the added templates. It does not award monster evidence for supported success. It does not alter Reasoning reward projection, Hero claim logic, monster state ids, or cross-subject systems.

## Acceptance checks

Required checks for this patch:

1. Patch dry-run from a fresh extraction passes.
2. Patch apply from a fresh extraction passes.
3. Targeted Reasoning/Hero/runtime tests pass.
4. The content audit confirms all 124 templates generate stable item ids, no malformed maths text, safe browser read models, and finite marker outputs across 1,000 seeds per template.
5. The scheduler adversarial probe confirms the old exact-repeat pattern is removed.
6. `npm test`, `npm run build`, and live production smoke should be re-run in a dependency-complete and network-capable environment before production certification.

## Apply command

```bash
patch --binary -p1 < patches/004-reasoning-world-class-variety-hardening.patch
```

The `--binary` flag is recommended because the source ZIP files use CRLF line endings.
