# Limitations

1. Production is not proven.

No live authenticated hard-refresh journey was completed on `https://ks2.eugnel.uk` in this package. The local production-evidence validator failed because `reports/punctuation/punctuation-qg-p20-production-smoke.json` is missing and therefore cannot prove origin, environment, release ID, runtime count, deployment source, authenticated coverage, admin hub coverage, smart-six evidence, or dash-acceptance evidence.

2. Lean ZIP omits assets and reports by design.

The uploaded ZIP is a review-profile lean snapshot. Its manifest omits `assets/**`, `reports/**`, `output/**`, and most docs. This is why `npm run check` failed locally at monster visual manifest generation: `assets/monsters` is absent from the ZIP. This does not prove a production asset defect; it proves that full build/deploy certification needs a full checkout or a full asset bundle.

3. GitHub was not treated as the patch authority.

GitHub `main` was used only as a supplemental source comparison for the relevant marking code. The uploaded ZIP is the patch base. If the local agent applies this on a different branch/ref, they must re-check source drift before applying.

4. Review evidence is not all item-level.

The review pack contains 15,072 items, but only 92 item-level reviewer decisions appear as `approved`; 14,980 item-level decisions are missing in the pack. The generated governance evidence is family-level: the P20 review register has 126 approved generated-family decisions and inherited fixed-bank approval. Do not overclaim individual adult review for every generated item unless stronger evidence exists on the target branch/ref.

5. Open transfer extra-word tolerance remains an advisory.

The adversarial `appendExtra` probe still finds 18 accepted answers after the patch. These are open transfer/free-writing surfaces. Tightening them may be appropriate, but it should be a separate, explicit product/marking-policy decision so legitimate transfer sentences are not over-rejected.

6. Hero UI adjacent tests need a full checkout.

The reward/Stars/monster subset passed locally. A broader Hero-backdrop UI group could not run in this lean ZIP because `esbuild` was unavailable to `tests/helpers/punctuation-scene-render.js`. Run those UI checks again in a full checkout with dependencies installed.
