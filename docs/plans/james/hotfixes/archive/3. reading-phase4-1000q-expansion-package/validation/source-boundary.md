# Source Boundary

Primary implementation authority for this round: GitHub `main` Reading version-3 shape, as represented by the current content contract and the latest Reading hotfix completion evidence.

Local build authority: the uploaded lean ZIP was used as the reproducible workout snapshot. The prior Reading hotfix-expansion package patch was first applied to the ZIP to recreate the GitHub-current version-3 Reading baseline, then this Phase 4 patch was generated against that v3 baseline.

Production authority: claimed after the repository integration landed on GitHub `main` and the deployed `https://ks2.eugnel.uk` Reading smoke recorded content version 4, 108 passages, 1052 questions, 41 papers, immediate-round success, delayed-paper success, and stale-write guard success. The deployed app does not expose a production-reported commit SHA, so the authority is behaviour-bound to the live origin and the smoke runner records the repository head used for the check separately. Evidence: `validation/production/reading-phase4-production-smoke-2026-05-11.json`.
