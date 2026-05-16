# Limitations

1. Production is now proven in the full-checkout execution.

The original handoff package did not include production proof. The 2026-05-16 full-checkout execution supersedes that limitation. The Punctuation marking hardening landed in `99fbe5ee09a4b9cac56b69593cb7d6066f4f57e8`; the production command-path multiline payload fix landed in `07c0151b222e8815f3a3396d85e5c2a93fb711fd`; final live verification was rerun after `origin/main` advanced to deployed build `6a0551ab3c5f3064aef5c92ce674fba9aeb41a0d`, Worker version `34cdc3d4-9cbe-4862-931c-ecfddf7b3c17`. `npm run verify:punctuation-qg:p20-live` passed against the final `reports/punctuation/punctuation-qg-p20-production-smoke.json`.

2. Lean ZIP omits assets and reports by design.

The uploaded ZIP is a review-profile lean snapshot. Its manifest omits `assets/**`, `reports/**`, `output/**`, and most docs. This is why `npm run check` failed locally at monster visual manifest generation: `assets/monsters` is absent from the ZIP. This does not prove a production asset defect; it proves that full build/deploy certification needs a full checkout or a full asset bundle.

3. GitHub was not treated as the patch authority.

GitHub `main` was used only as a supplemental source comparison for the relevant marking code. The uploaded ZIP is the patch base. If the local agent applies this on a different branch/ref, they must re-check source drift before applying.

4. Review evidence is not all item-level.

The review pack contains 15,072 items, but only 92 item-level reviewer decisions appear as `approved`; 14,980 item-level decisions are missing in the pack. The generated governance evidence is family-level: the P20 review register has 126 approved generated-family decisions and inherited fixed-bank approval. Do not overclaim individual adult review for every generated item unless stronger evidence exists on the target branch/ref.

5. Open transfer extra-word tolerance remains product-policy tolerance.

The adversarial `appendExtra` probe still finds 18 accepted answers after the patch. These are open transfer/free-writing surfaces, outside this terminal-punctuation false-positive hotfix. The current execution records them as deliberate product-policy tolerance, not as a blocker for duplicated terminals, missing final punctuation, or lower-case starts.

6. The command-path newline issue is fixed, not a remaining limitation.

During production verification, the live Punctuation command route initially collapsed multiline `payload.typed` strings before marking bullet-list text answers. The fix in `worker/src/subjects/punctuation/engine.js` preserves `typed` and `answer` payload strings as typed-answer objects. Regression coverage is in `tests/worker-punctuation-runtime.test.js`, and final live command-path probes prove multiline bullet answers are accepted on production build `6a0551ab`.

7. Hero UI adjacent tests passed in the full checkout.

The reward/Stars/monster subset passed locally. The lean ZIP could not run the broader Hero-backdrop UI group because `esbuild` was unavailable, but the full-checkout execution reran the adjacent Hero UI subset and it passed `35/35`.
