# Source Boundary Summary

## ZIP evidence

Primary snapshot: `/mnt/data/ks2-mastery-lean-05161311.zip`.

This proves only the uploaded lean snapshot. It does not prove GitHub `main`, any PR, CI, or production. The ZIP has no `.git` metadata and omits real assets/reports by review-profile manifest.

## GitHub evidence

GitHub repo metadata was fetched for `fol2/ks2-mastery`; default branch is `main`.

GitHub `main` was used only as a supplemental exact-file comparison for `shared/punctuation/marking.js`. The fetched snippets showed the same relevant logic pattern as the ZIP for:

- direct-speech punctuation acceptance: terminal check using suffix logic and outside-punctuation check;
- paragraph passage shape: stripped-word comparison and sentence-boundary count without strict final terminal/capital checks.

This does not prove full ZIP/GitHub identity.

## Local-run evidence

Local commands were run from the extracted ZIP snapshot and patched working copy. They prove only behaviour in this local environment for that snapshot.

Local environment:

- Node `v22.16.0`
- npm `10.9.2`
- `.nvmrc` = `22`

Local validation passed for the patch:

- patch dry-run/apply;
- targeted marking/speech/paragraph tests;
- P20 expansion suite;
- adversarial acceptance probes for duplicated terminal, missing terminal, and lowercase starts;
- reward/Stars/monster subset.

## Production evidence

No live production evidence is proven here.

The local P20 production-evidence validator failed because the required production smoke JSON is missing. Production status must remain `IMPLEMENTED + LOCAL VERIFIED — PRODUCTION NOT PROVEN` until `https://ks2.eugnel.uk` is checked after hard refresh with release/build identity and a specific user journey.
