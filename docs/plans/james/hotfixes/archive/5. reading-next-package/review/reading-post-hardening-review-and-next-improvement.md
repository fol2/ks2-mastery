# Reading Post-Hardening Review + Next Improvement

## Source boundary

The named new ZIP, `ks2-mastery-lean-05121226.zip`, was not present in `/mnt/data` during this session. I therefore reviewed Reading using:

- a local reconstruction from `ks2-mastery-lean-05111651.zip` plus the previous Reading post-implementation hardening package;
- GitHub Reading commits as supplementary evidence for the completed post-hardening rollout;
- local tests/audits on the reconstructed snapshot.

## Review verdict

Reading v5 is in strong shape after the post-hardening implementation. The previous hardening package addressed the major learner-facing copy and marking drift issues, and GitHub supplementary evidence shows production deployment, API smoke, UI smoke, full `npm test`, and `npm run check` all passed for that hardening rollout.

I did not find a new critical Reading runtime bug in the reconstructed snapshot. The next highest-value subject-only improvement is product/learning-depth: Reading now has a huge v5 bank, but the mode system still lacks an explicit extra-credit routine for high-attainment learners who need deeper KS2-plus challenge without being pushed into a full 50-mark SATs paper.

## Findings

### F1: No explicit extra-credit Reading routine

The current mode set has useful routines: Smart, Guided, Evidence, Vocab, Inference, Punctuation, Stamina and Test. However, a high-attainment learner who wants harder work has to infer the right combination of difficulty, stamina and focus filters. That is friction, and it weakens the product goal of being the most effective KS2 preparation path with a decent challenge beyond KS2.

Patch response: add `Stretch challenge` mode.

### F2: Stretch should not inflate mastery or replace SATs papers

A stretch routine should not be a new scoring economy, a second paper system, or a reward shortcut. It should be a subject-owned practice mode that chooses harder long-text/deeper-question work and uses delayed feedback.

Patch response: stretch is non-strict practice, uses delayed feedback, selects six high-depth questions, and preserves all normal Reading command and marking boundaries.

### F3: The setup interface should not add a second primary action

Reading already follows the mature subject-shell pattern with one start button. Adding a flashy extra-credit CTA would make the setup more confusing.

Patch response: stretch appears under More Reading practice, not as a new primary button.

### F4: Interface source needs a regression guard for duplicate hero-card attributes

The post-hardened snapshot I reconstructed has only one `data-text-tone={textTone}` attribute. The next patch adds a static guard so this does not regress while Reading setup continues to use hero backdrop contrast tokens.

## Patch summary

The patch changes eight files:

- `shared/reading/content.js`
- `shared/reading/metadata.js`
- `src/subjects/reading/metadata.js`
- `src/subjects/reading/components/ReadingPracticeSurface.jsx`
- `worker/src/subjects/reading/engine.js`
- `tests/reading-content-contract.test.js`
- `tests/reading-session-interface.test.js`
- `tests/worker-reading-runtime.test.js`

It does not change passage/question/paper counts.

## Validation summary

Local reconstructed snapshot:

- Official Reading content audit: 0 failures, 0 advisories.
- Focused non-React Reading tests: 44 passed, 0 failed.
- Stretch probe: 182 eligible passages and 1474 eligible questions; sample stretch session delayed-feedback, non-strict, 6 questions, long difficulty-5 passage, 16 marks.
- Start-session performance: stretch P95 about 4.3 ms locally across 200 starts.

Lean environment limitation:

- `tests/reading-session-interface.test.js` cannot run here because `esbuild` is absent. It is still updated in the patch and should run in dependency-complete CI.
