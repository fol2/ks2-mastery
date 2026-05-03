# Punctuation QG P12 — 3000+ Question Pool Expansion and Quality Contract

## Source boundary

This add-on is prepared against the uploaded lean ZIP snapshot `ks2-mastery-lean-05012344.zip`. The ZIP proves the local source snapshot. PR #822 proves that P11 was merged and that its production-smoke artefact reported 1,268 Punctuation runtime items. This P12 pack is not live-production evidence until it is applied, deployed, and followed by a new production smoke against the deployed release.

## Product problem being solved

P11 proved a 1,268-item pool, but the learner-facing feel can still become repetitive for children who practise frequently. P12 moves the source pool to a much larger denominator and widens the first-click and generated-template surfaces.

The target is:

- at least 500 fixed items;
- at least 2,500 generated items;
- at least 3,000 total runtime items;
- 100 generated templates per family;
- model/correct answers must all mark correctly;
- Smart Practice must continue to use a varied mode route rather than a single repeated question shape.

## Delivered source changes

P12 adds:

- `shared/punctuation/fixed-expansion-items-p12.js` — 364 additional hand-authored fixed choice items across all 14 published skills.
- `shared/punctuation/manual-deep-expansion-bank.js` — 60 additional manually authored generated templates for each of the 28 generated families.
- `PRODUCTION_DEPTH = 100`, producing 2,800 generated runtime items.
- Release id `punctuation-qg-p12-3000-2026-05-02` and seed `punctuation-r5-depth100-3000-plus`.
- A stale UX copy fix: the skill modal no longer tells the learner that every focused round is “four questions”.
- `scripts/audit-punctuation-qg-p12-expansion.mjs` and `tests/punctuation-qg-p12-expansion.test.js`.

## Expected pool after applying the pack

- fixed items: 512
- P12 fixed additions: 364
- generated families: 28
- templates per family: 100
- generated items: 2,800
- total runtime pool: 3,312

This intentionally invalidates P11’s fixed 1,268-count verifier assertions. P11 remains a historical release gate. P12 must use the P12 audit/test gate.

## Quality rules

Every generated family must have exactly 100 templates, 100 unique stems, and 100 unique models inside that family. Cross-family/model duplicates are reported separately because some choose/insert modes intentionally teach the same sentence through different answer surfaces. Every generated model answer and every fixed choice answer must mark correct under the production marker. The audit samples sessions from the service layer to check that Smart/Guided rounds do not immediately repeat an item and that mode variety is still visible.

## Production acceptance gates

Before calling this live production-ready, require:

1. `npm run verify:punctuation-qg:p12-expansion`
2. `node --test tests/punctuation-qg-p12-expansion.test.js`
3. `node scripts/audit-punctuation-qg-p12-expansion.mjs --json --out reports/punctuation/punctuation-qg-p12-expansion-audit.json`
4. Existing punctuation marking/session tests affected by the count and release-id change.
5. A regenerated reviewer/surface pack for the 3,312-item pool.
6. A production smoke artefact with origin, timestamp, release id, runtime count 3,312, generated depth 100, command-path generated-item evidence, Smart round evidence, Parent Hub evidence, and worker/deployment identity if available.

## Honest claim boundary

After local gates pass, the correct claim is:

> Punctuation QG P12 source expansion is locally verified for a 3,312-item runtime pool.

The correct production claim is only available after deployment smoke:

> Punctuation QG P12 is live in production and serving the 3,312-item pool.

Do not claim that from this source pack alone.
