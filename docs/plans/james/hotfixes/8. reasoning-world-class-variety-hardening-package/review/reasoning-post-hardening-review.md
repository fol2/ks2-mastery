# Reasoning post-hardening review

## Verdict

The post-hardening Reasoning implementation is strong and no longer looks like a placeholder subject. It is Worker-owned, live-registered, isolated from other subject engines, integrated with shared UI, and wired to Monster/Hero layers without taking over their responsibilities.

Baseline targeted Reasoning/Hero/runtime checks passed 27/27 on the uploaded ZIP snapshot before this new patch.

## Findings

### 1. Content pool was mathematically large but visually/thematically thinner than the ambition

The original promoted content bank already had 110 deterministic template families and very large seed space. That is a good base. The issue is that learners can still notice repeated surface situations over time, because many templates have small hard-coded context arrays. For mathematics this is not a numerical-pool problem; it is a reasoning-surface and context-transfer problem.

Patch response: added a reusable context theme layer plus 14 theme-rich template families. Each of those families rotates through 12 real contexts while keeping deterministic arithmetic and marking.

### 2. Scheduler could produce exact repetition under degenerate random streams

A deterministic probe using `random: () => 0` showed Smart Review, Skill Practice and Trouble Drill could produce 12 copies of the same template and the same item id in a 12-question round. Production randomness is not normally degenerate, but a world-class engine should be robust to bad RNG, deterministic replay, tests, and edge conditions.

Patch response: eligible templates are now consumed before repeats are allowed, and generated seeds are salted by question position. Due retry exactness remains intact.

### 3. Content release id needed to represent the new bank

Adding families and changing content summary while keeping the previous release id would make audit/evidence semantics muddy.

Patch response: bumped Reasoning content release id to `reasoning-variety-hardening-2026-05-13` and updated tests/smoke expectations.

## What was deliberately not changed

- No React redesign.
- No cross-subject Monster or Hero reward logic changes.
- No other subject engine changes.
- No AI-generated marking or untrusted AI-generated maths.
- No SATs mini-set pollution from extra-credit content.

## Production-readiness note

This package is production-ready as a code patch for the supplied ZIP snapshot, subject to normal CI/dependency build and live smoke. It is not live-production proof because this environment could not reach the production demo endpoint and the lean ZIP has no `node_modules`.
