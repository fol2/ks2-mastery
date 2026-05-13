# Reading Post-Hardening Review and Phase 6 Scale Plan

## Review verdict

The uploaded post-hardening Reading snapshot is healthy at the existing quality gates: Reading v5 content audit is clean, the focused non-UI Reading tests pass in the lean environment, and GitHub evidence shows the previous stretch challenge package received dependency-complete and production-oriented validation.

The remaining strategic weakness is scale. Reading at roughly 2K questions is no longer acceptable if the product target is world-class KS2 preparation and the other subjects are moving beyond 10K questions.

## What this patch improves

This patch makes the next large Reading scale move:

- +204 passages.
- +2040 questions.
- +68 strict papers.
- Reading content version 6.
- Final bank: 4112 Reading questions.

It deliberately keeps a staged approach because Reading questions require passage quality, evidence quality and self-marking checks. The correct bar is not “generate 8K in one risky jump”; the correct bar is “ship repeated, audited waves that keep zero duplicate stems, zero duplicate model answers, exact evidence snippets and paper totals”.

## Product direction toward 10K+

Phase 6 gets Reading beyond 4K questions. A realistic next path is:

- Phase 7: another 2500 to 3000 questions with more varied literary/non-fiction forms.
- Phase 8: another 2500 to 3000 questions plus more SATs-paper assemblies.
- Phase 9: calibration and item-retirement layer using learner performance data.

This makes 10K+ achievable while preserving quality and auditability.

## Review notes

No emergency runtime issue was found in this pass. The risk addressed here is under-supply: with stretch mode and a high-attainment path now present, the Reading bank needs enough breadth that learners do not noticeably loop texts or stems.

The patch also updates production smoke expectations so a post-deploy smoke must prove version 6 counts, not the previous version 5 counts.
