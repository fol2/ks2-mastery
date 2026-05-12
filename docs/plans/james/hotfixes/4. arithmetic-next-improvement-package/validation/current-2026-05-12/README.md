# Arithmetic current validation evidence, 2026-05-12

This folder contains the current repository validation evidence for the Arithmetic next improvement contract.

Final validation base: `origin/main` at `58ca56f63550fa926a947beb2c73e10c641a5321`.

Production deployment version: `6cbf20f3-56e9-4f2d-ada0-71eba10a7b39`.

## Authoritative evidence

- `audits/arithmetic-custom-audit-2026-05-12.json` - current repository audit, including malformed percentage-unit rejection.
- `logs/worker-arithmetic-runtime-test-2026-05-12.log` - Arithmetic runtime regression suite.
- `logs/react-arithmetic-surface-test-2026-05-12.log` - React/jsdom True Test answer-field remount regression.
- `logs/npm-test-final-rerun-2026-05-12.log` - final full repository `npm test` pass.
- `logs/npm-run-check-final-2026-05-12.log` - final `npm run check` Cloudflare dry-run pass.
- `logs/npm-run-deploy-2026-05-12.log` - production deployment through the OAuth-safe package script.
- `production-arithmetic-smoke-2026-05-12.json` - live Arithmetic production smoke against `https://ks2.eugnel.uk`.
- `logs/production-arithmetic-smoke-2026-05-12.log` - stdout for the JSON-producing production smoke run.
- `logs/patch-apply-check-clean-origin-main-2026-05-12.log` - final patch applies to clean `origin/main`.
- `logs/patch-apply-check-clean-origin-main-cached-2026-05-12.log` - final patch applies to the clean `origin/main` index.
- `logs/patch-reverse-check-2026-05-12.log` - final patch reverses from the patched worktree.
- `patch-sha256.txt` - SHA-256 for `patches/001-arithmetic-next-improvement.patch`.

## Superseded logs

`superseded/` contains pre-fix or failed full-suite runs kept for traceability only. They were superseded by targeted reruns and the final full-suite pass listed above.
