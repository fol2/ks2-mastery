# Reading Phase 6 Scale Expansion Contract

## Scope

Reading-only follow-on patch after the completed stretch challenge/interface hardening work.

The contract expands Reading toward the same long-term scale as the other subjects while preserving the quality gates already established for Reading:

- server-owned Reading content and marking remain unchanged in architecture;
- browser-safe metadata remains answer-safe;
- Reading v5 post-hardening and stretch mode stay intact;
- no reward, monster, Hero Mode, account, auth, capacity, grammar, punctuation, spelling, arithmetic or reasoning changes are in scope.

## Product goal

Reading should move toward a 10K+ question bank in staged, reviewable waves. Phase 6 is the next scale step, not the final scale target.

## Required content outcome

After applying this patch:

- `READING_CONTENT_VERSION` is `6`.
- Reading total passages: `414`.
- Reading total questions: `4112`.
- Reading strict papers: `143`.
- Genre split: `139` fiction, `139` non-fiction, `136` poetry.
- Long passages: `370`.

Phase 6 contributes:

- `204` new long passages.
- `2040` new questions.
- `68` new strict 50-mark papers.
- `68` fiction, `68` non-fiction, `68` poetry.

## Quality requirements

- Every Phase 6 passage has 10 questions.
- Every Phase 6 passage is long and difficulty 4 or 5.
- Every Phase 6 passage includes retrieval, vocabulary, inference/evidence, summary, author/language effect, structure, comparison/matching, ordering, multi-select and punctuation-support coverage.
- Every Phase 6 strict paper contains one fiction text, one non-fiction text and one poetry text.
- Every Phase 6 strict paper totals exactly 50 marks.
- No unresolved `undefined`, `null` or `NaN` learner-facing copy.
- No duplicate normalised question stems.
- No duplicate model answers.
- Evidence snippets must exist in their source passage and remain markable by the Reading matcher.
- Model answers for short/evidence/open questions must be accepted by their own checks/rubrics.

## Interface and runtime requirements

- Existing Reading modes, including `stretch`, remain available.
- Stretch mode must benefit from the enlarged high-difficulty/long-text pool.
- Reading session selection must remain low-latency enough for normal learner use.
- Production smoke expected counts must be updated to version 6.

## Acceptance commands

From a dependency-complete repo:

```bash
node --check shared/reading/phase6-expansion.js
npm run audit:reading-content
node --test tests/reading-content-contract.test.js tests/reading-phase5-next1000-contract.test.js tests/reading-phase6-scale-contract.test.js tests/worker-reading-runtime.test.js tests/reading-subject-registry.test.js
node --test tests/reading-session-interface.test.js
npm test
npm run check
```

In the lean ZIP environment, `tests/reading-session-interface.test.js` may fail if `esbuild` is not installed. That is an environment limitation only; dependency-complete CI must still run it.

## Production requirement

After implementation, deploy and run a fresh Reading production smoke with `--expected-content-version=6`. Existing production evidence for version 5 does not certify this patch.
