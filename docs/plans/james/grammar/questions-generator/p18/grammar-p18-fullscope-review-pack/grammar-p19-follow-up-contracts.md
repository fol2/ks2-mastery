# Grammar P19 follow-up contracts

## Contract A — Open-response marking fairness

**Goal:** No learner-facing free-text explanation/build/transfer task should be scored as mastery evidence from one exact golden sentence unless the prompt asks for an exact phrase.

### Acceptance criteria

1. Add an audit that fails any `text`/`textarea` item that:
   - asks the learner to `Explain`, `Build`, `Transfer`, `Write one sentence`, `Mixed check`, or similar open task; and
   - has `answerSpec.kind` in `normalisedText` or `acceptedSet`; and
   - has fewer than 3 accepted variants; and
   - is not `manualReviewOnly` / `nonScored`.
2. Convert affected templates to one of:
   - selected-response explanation choice;
   - structured multi-field exact task;
   - manualReviewOnly / non-scored transfer evidence;
   - acceptedSet with sufficient paraphrase coverage and negative nearMiss vectors.
3. Regenerate render inventory, quality register, distractor audit, marking matrix and status map.
4. Run production release verification and production smoke.

## Contract B — Copy polish and article agreement

**Goal:** Remove child-visible copy defects such as `a adverb`, `a adjective`, `a exclamation`.

### Acceptance criteria

1. Generated manual-expansion text normalises article agreement before emission.
2. Content-quality audit flags article agreement as a hard failure.
3. P18/P19 render inventory has 0 matches for `a adverb`, `a adjective`, `a exclamation` across prompt, feedback, options and solution lines.

## Contract C — Pronoun-cohesion logical correction

**Goal:** No prompt about unclear pronoun reference can have feedback saying the pronouns are clear.

### Acceptance criteria

1. Correct all 12 `pronouns_cohesion:application_transfer` source cases.
2. Regenerate `manual-expansion.generated.js`.
3. Add a regression audit for contradiction pairs:
   - prompt contains `unclear` / `wrong` / `confusing`; feedback must not contain `clearly refer` unless it also explains the contrast.
4. Quality register examples must include at least one fixed case.

## Contract D — Workflow / UX sample broadening

**Goal:** The 8-path learner-surface audit should remain, but broader scheduling and click-path simulations should prove a 510-template pool does not regress into repeated learner surfaces.

### Acceptance criteria

1. Simulate at least 200 smart-practice sessions across learner profiles: first-time, returning, weak, due-heavy, post-Mega, focus concept, recent misses.
2. Hard fail if a normal 5-question smart round contains duplicate template IDs or duplicate learner-visible surfaces when the active pool can avoid it.
3. Report concept spread, question-type spread, constructed/selected mix, support-surface triggers and repeated surface exposure.
4. Keep retry/trouble/spaced retrieval exceptions explicit and explainable.
