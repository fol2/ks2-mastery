# Reading Phase 7 Review and Scale Plan

## Review finding

The uploaded Reading snapshot is materially improved from earlier waves: Reading is at version 6, Stretch mode exists, the official content audit is clean, and the subject has moved beyond 4K questions. The current weakness is no longer a single critical runtime bug; it is scale relative to the product ambition.

A 4K Reading bank is useful, but it is still below the bar set by other subjects that can reach 10K+ more easily. Reading is harder because passage quality, evidence integrity and model-answer markability must all be controlled. That means the scale plan should be staged, not smaller.

## What this patch does

This patch adds Phase 7, moving the Reading bank to 7,112 questions and 714 passages while keeping the existing Reading runtime, interface and Stretch mode intact. It adds a new deterministic content module and tightens the recent-expansion audit to include Phase 7 stem-shape repetition.

## Why not jump straight to 10K in this patch

A one-shot 6K addition would create a higher risk of template leakage, repeated question feel and unreviewable content drift. The better route is:

- Phase 7: cross 7K with strict audit gates.
- Phase 8: add roughly 2.5K questions and introduce deeper source-form variety.
- Phase 9: cross 10K and add calibration/retirement evidence to identify weak, over-easy or over-repeated items.

## Reading-only boundaries

No platform, reward, Hero, monster or other-subject files are changed. Browser-safe metadata is updated with counts only; answer keys remain in the shared/Worker content layer.

## Dependency-complete follow-up

The original lean ZIP apply-check environment did not include `esbuild`, so it could not run `tests/reading-session-interface.test.js`. The implementation worktree has since installed dependencies and run that interface test directly: 14 passed, 0 failed. Full `npm test` and `npm run check` also pass before deployment.
