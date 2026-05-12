# Source boundary

Primary implementation snapshot: uploaded lean ZIP `ks2-mastery-lean-05111556.zip`.

Source ZIP SHA-256:

`596ac6308b01dc16150d584123f9c00303bd102e73b3b977aea034ef852d108b`

Patch target: production repository root. Apply from repository root with:

```bash
git apply patches/001-arithmetic-post-review-hardening.patch
```

Production repository target after post-review hardening: `origin/main` at `7bbf968601d84b6f72d6ad5f1c4eaa6bb95ce20e` before applying this package.

The refreshed patch was dry-run and applied against a clean worktree at that commit. The package now includes production-ready validation, deployment, and live-smoke artefacts in `validation/logs/production-ready-*-2026-05-11.log` and `validation/production-ready-*.json`.

The uploaded Arithmetic PoC HTML was used as the behaviour reference for answer-form tolerance, especially mixed-number and Unicode fraction entry forms.
