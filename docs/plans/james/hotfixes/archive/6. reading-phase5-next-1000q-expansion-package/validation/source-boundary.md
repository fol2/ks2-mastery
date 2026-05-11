# Source Boundary

Primary source for the package validation: uploaded lean ZIP `ks2-mastery-lean-05102302.zip`.

Prerequisite patches applied before this package:

1. `reading-validation-hotfix-expansion-package.zip` - Reading v3 hotfix and expansion layer.
2. `reading-phase4-1000q-expansion-package.zip` - first 1000-question expansion layer.

This package was originally a follow-on Phase 5 patch and was not, by itself, evidence that GitHub `main` or production already contained Phase 5.

The repo rollout completed that boundary on 2026-05-11:

- Implementation commit: `a6dca8dd68aa62c6dc778319f1233caa627ccc10`
- GitHub `main`: synced to `a6dca8dd68aa62c6dc778319f1233caa627ccc10`
- Cloudflare deploy: `npm run deploy`
- Cloudflare version ID: `2de6f127-c763-4aac-b313-e79027511c3c`
- Production origin: `https://ks2.eugnel.uk`
- Live Reading production smoke: `validation/production/reading-phase5-production-smoke-2026-05-11.json`

The live smoke confirms production Reading content version 5 with 210 passages, 2072 questions, 75 papers, and the expected genre and long-passage counts.
