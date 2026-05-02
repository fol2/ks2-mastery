# Grammar QG P17 — 300-Family Manual Bench Integration Contract

## Purpose

P17 is a content-bench expansion step. It accepts the P16 200-family pack as completed and adds 100 more expert-authored manual families, bringing the proposed new bench to **300 template families / 3,600 cases**.

This is not an AI generation integration. It is structured human-authored grammar content that must be imported, reviewed and certified before learner scheduling.

## Files to import

Use the delta if P16 is already imported:

`/mnt/data/grammar-qg-p17-manual-expansion-delta-100-families.json`

Use the combined pack if the importer wants one source:

`/mnt/data/grammar-qg-p17-manual-expansion-300-families.json`

## Acceptance gates before scheduling

1. Import all P17 cases as `draft_only`.
2. Generate reviewer pack by concept and template family.
3. Validate every selected-response case has exactly one defensible answer.
4. Validate every distractor has a misconception rationale.
5. Convert constructed-response draft accepted answers into explicit answer specs or mark as manual-review-only.
6. Run semantic prompt-cue and read-aloud checks.
7. Run no-duplicate learner-visible surface checks against the live P14/P15/P16 pool.
8. Promote only `approved` or `approved_with_limitation` families into scheduler status map.
9. Regenerate render inventory, quality register, distractor audit, marking matrix and certification status map.
10. Run production smoke after deployment.

## Product gate

The goal is not merely a larger denominator. The release should prove that ordinary short Grammar sessions do not feel repetitive. At minimum:

- no same-template repeat inside ordinary 5-question smart practice when enough templates exist;
- no same learner-visible surface within the recent exposure window;
- every concept has identify, classify, explain, repair and transfer surfaces;
- quick practice, deep practice and mini-test copy are clearly distinguished.

## Current pack audit

- Combined families: 300
- Combined cases: 3600
- P17 delta families: 100
- P17 delta cases: 1200
- Audit status: pass
