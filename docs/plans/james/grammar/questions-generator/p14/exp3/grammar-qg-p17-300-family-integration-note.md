# Grammar QG P17 — 300-Family Manual Expansion Integration Note

This is an implementation note for importing the 300-family manual expansion pack. It is not a replacement for production certification.

## Required import order

1. Import `grammar-qg-p17-manual-expansion-delta-100-families.json` if the P15/P16 packs are already in the repo.
2. Import `grammar-qg-p17-manual-expansion-300-families.json` if a single combined source is preferred.
3. Keep every family `draft_only` until review and oracle integration are complete.
4. Generate a reviewer pack with prompt, visible options/rows, accepted answers, near misses, feedback and read-aloud text for every case.
5. Require every selected-response option to have a defensible rationale and every constructed-response family to have a marking matrix.
6. Promote families gradually into production; do not dump all 300 families into the scheduler at once.

## Production acceptance gates

- 0 S0/S1 grammar logic failures.
- 0 answer leaks in learner-facing payloads.
- 0 semantic prompt-cue findings.
- 0 repeated learner-visible surface within a normal short session.
- All new families appear in the quality register and certification status map.
- Production smoke passes after deployment.

## Product target

With P14's 110 active templates and this 300-family manual bench, the long-term target is approximately 400+ active Grammar template families after review. This should materially reduce repetition complaints, provided scheduler exposure controls are enforced.
