# Validation summary

Source ZIP: `/mnt/data/ks2-mastery-lean-05070029.zip`

Targeted patch apply was checked against a fresh extraction of the source ZIP.

## Results

- `git apply --check --ignore-whitespace`: pass
- `git apply --ignore-whitespace`: pass
- `node --test tests/worker-reading-runtime.test.js tests/reading-content-contract.test.js tests/reading-subject-registry.test.js`: 30/30 pass in fresh ZIP extraction
- `node --test tests/worker-reading-runtime.test.js tests/reading-content-contract.test.js tests/reading-subject-registry.test.js tests/reading-session-interface.test.js`: 35/35 pass in repository `main`
- `node --test tests/button-label-consistency.test.js`: pass as part of the full repository gate
- `npm test`: 109154/109154 pass, 12 skipped
- `npm run check`: pass
- Reading content audit: 0 duplicate normalised stems, 0 duplicate model answers
- Reading UI static audit: 1 `Save and next` path, active delegated form present

## Not run

- Fresh live production smoke before repository application. Final production closure evidence is recorded in `completion-report.md` after deployment.
