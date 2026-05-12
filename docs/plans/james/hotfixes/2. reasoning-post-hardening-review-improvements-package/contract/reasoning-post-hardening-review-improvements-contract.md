# Reasoning post-hardening review + improvement contract

## Source boundary

Primary authority is the uploaded lean ZIP snapshot `ks2-mastery-lean-05121226.zip`. GitHub was treated as a permitted supplement for repository orientation only; this package does not claim that a live deployment or GitHub `main` already contains the patch.

Local validation proves behaviour only for the extracted ZIP snapshot in this environment.

## Scope

Reasoning subject only:

- `shared/reasoning/content.js`
- `worker/src/subjects/reasoning/engine.js`
- `src/subjects/reasoning/command-actions.js`
- `src/subjects/reasoning/components/ReasoningPracticeSurface.jsx`
- `tests/reasoning-engine-rewards.test.js`

No cross-subject engine changes. No global subject registry changes. No direct modifications to Spelling, Grammar, Punctuation, Reading, Arithmetic, or general monster/Hero policy.

## Product contract

Reasoning should behave as a first-class production subject while preserving the core learning loop:

1. Independent attempt first for Smart Review, Skill Practice, Trouble Drill, SATs Single, and SATs Mini-Set unless the mode is explicitly Worked or Faded.
2. No early solution leakage, and no early skill/domain hint leakage in strict/SATs-style states.
3. Support may help learning, but supported/worked/faded answers must not count as full independent evidence for monster/star progression.
4. Due retry should be exact and durable: starting a retry should not consume it until the learner finalises the item.
5. Feedback must belong to the current question only.
6. Saved responses in list/SATs-style flows must allow answers to be cleared, not leave stale values behind.
7. Learner working/method should be captured where the UI asks for it, including mini-set/list flows.
8. Deterministic marking should accept common KS2 unit suffixes where the answer is numerically identical, without weakening distinct-unit money marking.

## Patch acceptance gates

Required gates for rollout/staging:

```bash
patch --binary --dry-run -p1 < patches/003-reasoning-post-hardening-review-improvements.patch
patch --binary -p1 < patches/003-reasoning-post-hardening-review-improvements.patch
node --test tests/reasoning-content-contract.test.js tests/reasoning-engine-rewards.test.js tests/reasoning-production-smoke.test.js tests/reasoning-subject-registry.test.js
```

Recommended CI/release gates after dependencies are installed:

```bash
npm test
npm run build
```

Live production is not certified by this package. Production acceptance still needs deployed smoke evidence with origin, timestamp, release identity, and pass/fail result.
