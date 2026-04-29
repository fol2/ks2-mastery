# Grammar QG P10 — Production Question Pool Quality Lock and Release-to-Production Contract

**Date:** 2026-04-29  
**Owner:** Grammar / KS2 Mastery  
**Language:** UK English  
**Phase:** P10 — final production-quality lock, learner-surface hardening, and deploy evidence  
**Baseline:** `grammar-qg-p9-2026-04-29` implementation branch / lean ZIP evidence  
**Target release ID:** `grammar-qg-p10-2026-04-29` if learner-visible content, serialisation, cue, marking, scheduler, or evidence artefacts change

---

## 1. Purpose

P1–P9 built the Grammar Question Generator engine, calibration infrastructure, certification tooling, review artefacts, learner-surface cue support, row-specific table input support, blocklist safety, and pre-deploy evidence gates.

P10 is not another feature-expansion phase. P10 is the production-quality phase that returns to first principles:

> We are putting real questions in front of children. Every question must be logical, answerable, age-appropriate, unambiguous, correctly marked, correctly rendered, accessible enough for production use, and backed by evidence that can be reproduced from the repository and from the deployed production surface.

The P10 outcome must be a question pool that is not merely “certified by report”, but proven by code, committed artefacts, adult judgement, render checks, marking matrices, and post-deploy smoke evidence.

---

## 2. Current validation result from P9 review

The uploaded lean ZIP was used as the primary evidence source. GitHub API may be used as a supplement, but the ZIP state is the authoritative review snapshot for this contract.

### 2.1 P9 strengths that should be preserved

P9 did ship meaningful infrastructure and should not be dismissed:

- The live Grammar code now reports `GRAMMAR_CONTENT_RELEASE_ID = grammar-qg-p9-2026-04-29`.
- The core denominator remains stable: 18 concepts, 78 templates, 58 selected-response templates, 20 constructed-response templates, 52 generated templates, 26 fixed templates, 17 explanation templates, and 8 mixed-transfer templates.
- `audit-grammar-question-generator.mjs --json` passes locally from the lean ZIP and reports no legacy repeated variants or generated signature collisions in the default audit output.
- `audit-grammar-content-quality.mjs --seeds=1..30 --json` passes locally with 2,340 checked template/seed instances, 0 hard failures, and 0 advisories.
- P9 fixed the P7 explanation analytics issue in `grammar-qg-expand-events.mjs` by recognising `explain`, `explanation`, and `questionType === 'explain'`.
- P9 added row-specific `table_choice` options for the two heterogeneous mixed-transfer templates.
- P9 added `promptParts`, `focusCue`, `screenReaderPromptText`, and `readAloudText` serialisation fields for some cue-based prompts.
- P9 added fail-closed certification status map plumbing.

These are good foundations. P10 should harden them, not restart the system.

### 2.2 P9 certification gaps that P10 must close

The P9 report should not yet be treated as full production certification. The following gaps are blocking or near-blocking for a production-quality claim.

#### G0 — P9 evidence package is release-inconsistent

The P9 completion report claims final release `grammar-qg-p9-2026-04-29`, but the committed P9 certification manifest in the lean ZIP says:

```json
"contentReleaseId": "grammar-qg-p8-2026-04-29"
```

The committed P9 question inventory also has:

```json
"summary": {
  "contentReleaseId": "grammar-qg-p8-2026-04-29",
  "totalItems": 2340,
  "uniqueTemplates": 78,
  "seeds": 30
}
```

Every inventory item sampled also carries `contentReleaseId: grammar-qg-p8-2026-04-29`.

This means the evidence package is stale relative to the P9 code and report. P9’s validator did not catch this mismatch.

#### G1 — P9 final report frontmatter is still not clean

The P9 final report frontmatter still contains:

```yaml
final_report_commit: "pending-this-commit"
```

It also uses inline empty-list syntax:

```yaml
post_merge_fix_commits: []
```

The local completion-report validator fails this report at the frontmatter gate because the parser does not accept inline `[]` as a list. Separately, `pending-this-commit` is semantically still a placeholder and must never appear in a final certification report.

#### G2 — P9 certification validator is too narrow

`validate-grammar-qg-certification-evidence.mjs` validates manifest schema, oracle-window wording, and smoke evidence gating. It passes the P9 report + manifest even though:

- the manifest release ID is P8;
- the report release ID is P9;
- the code release ID is P9;
- the final report commit is still a placeholder.

P10 must make the certification validator a single authoritative release-evidence gate, not a partial oracle-window checker.

#### G3 — Inventory review status does not match production-certification wording

The P9 inventory contains 2,340 items, but every item has:

```json
"reviewStatus": "draft_only"
```

The P9 status map separately says 78 templates are approved, but the inventory itself does not represent production item approval. P10 must either make the inventory status reflect the final certification decision or remove misleading item-level status fields from the final artefact.

#### G4 — Adult review evidence is still too templated

The P9 register improves on P8 by adding reviewer metadata and 78 unique notes, but the notes are generated from template IDs and concept names, for example:

```text
word class underlined choice — core template for word classes. 10/10 seeds verified; prompts clear, answers unambiguous, feedback supports learning.
```

This is better than P8’s identical “adult review confirmed” text, but it is not yet strong evidence of real item-level judgement. P10 must require concrete review notes for representative generated items, especially edge-case seeds and all cue/mixed-transfer templates.

#### G5 — Prompt cue rendering still has answerability problems

P9 fixed the most obvious “underlined word not visible” issue for `word_class_underlined_choice`, but the cue enrichment is still too heuristic.

Local generated examples show these issues:

- `word_class_underlined_choice` renders promptParts where the first text part already contains the full sentence, then the styled sentence is appended again. The learner can see the sentence twice.
- `qg_p4_voice_roles_transfer` asks for the role of the “underlined noun phrase”, but the generated promptParts underline the whole sentence rather than the target noun phrase. There is no `focusCue` or `screenReaderPromptText` for that target.
- `qg_p4_word_class_noun_phrase_transfer` seed 3 asks for the “underlined word” in a noun phrase, but the promptParts underline the whole phrase, not the word `incredibly`.
- `qg_p3_noun_phrases_explain` seed examples ask about an “underlined group” but the generated underline part can become the whole sentence rather than the noun phrase only.
- Several prompts have `promptParts` but no `focusCue`, meaning the visible cue and screen-reader cue are not guaranteed to stay aligned.

P10 must move cue metadata out of fragile HTML/string heuristics and into explicit template-owned target metadata.

#### G6 — Read-aloud does not use the new `readAloudText`

P9 serialises `readAloudText`, but the current read-aloud builder still reads `item.promptText`, `item.checkLine`, and inputSpec-derived labels. It does not use `item.readAloudText` or `screenReaderPromptText` as the primary prompt source. Heterogeneous table read-aloud also still describes global columns, not row-specific choices.

This means P9’s “readAloudText includes the cue” evidence is incomplete: the field exists, but the production read-aloud path is not actually using it.

#### G7 — Table-choice tests have a false-negative hole

The P9 table-choice test names a homogeneous template ID `sentence_function_classify`, but the actual template is `sentence_type_table`. Because the helper returns no questions for the wrong ID, that homogeneous branch can silently add zero test cases.

P10 must require every generated dynamic test suite to assert the target template exists and produced at least one checked case.

#### G8 — Post-deploy production smoke is still not run

P9 correctly marks post-deploy smoke as not run, so this is not a false claim. But the system cannot be described as fully production-certified until the deployed Worker serves the intended release and a production grammar item can be created, answered, read back, and checked for answer leakage.

---

## 3. P10 product principle

P10 must optimise for question quality, not report quality.

A question is production-quality only if all of the following are true:

1. The child can see or hear every cue needed to answer.
2. The task has one defensible correct answer, or clearly declares manual review / non-scored status.
3. Distractors are plausible misconceptions, not alternative correct answers.
4. Feedback explains the grammar reason, not just the answer.
5. Constructed-response marking is neither too strict nor too lenient for a KS2 child.
6. The UI shape matches the grammar task shape.
7. The question remains answerable in mini-test mode, review mode, read-aloud mode, mobile layout, and keyboard-only use.
8. The scheduler cannot serve uncertified or blocked templates.
9. Evidence artefacts match the actual code release and deployed release.

---

## 4. Non-goals

P10 must not do any of the following unless needed to fix a certified blocker:

- No Star, Mega, Hero Mode, Hero Coin, Concordium, reward, or mastery semantic changes.
- No broad template expansion before the existing 78 templates are clean.
- No cosmetic-only redesign work.
- No new scoring model.
- No AI-generated “adult review” text presented as human evidence.
- No post-deploy certification claim without live smoke evidence.

---

## 5. Severity model

Use this severity model for the P10 issue register.

| Severity | Meaning | Production action |
|---|---|---|
| S0 | Wrong answer, unanswerable prompt, no-op fix task, answer leak, marker accepts a clearly wrong answer as fully correct | Block immediately; cannot ship |
| S1 | Ambiguous prompt, missing/incorrect visual cue, plausible alternative correct option, misleading feedback, broken row-specific UI | Block unless fixed in P10 |
| S2 | Evidence mismatch, validator hole, accessibility/read-aloud gap, mobile/keyboard issue that affects some users but not core correctness | Fix or explicitly certify with limitation before deploy |
| S3 | Wording polish, layout refinement, non-blocking review note | Can ship if tracked |

P10 success means 0 S0, 0 unresolved S1, and all S2 items either fixed or explicitly accepted as non-blocking with owner and follow-up.

---

## 6. Implementation units

### U0 — Evidence truth reset

Fix the evidence foundation before touching more content.

Required changes:

- Replace `final_report_commit: "pending-this-commit"` with the real final report commit SHA.
- Make `post_merge_fix_commits: []` parse correctly, or require block-list YAML syntax consistently.
- Regenerate P9/P10 manifest and inventory so `contentReleaseId` matches `GRAMMAR_CONTENT_RELEASE_ID`.
- Add validator checks that compare:
  - report final release ID;
  - manifest release ID;
  - inventory summary release ID;
  - every inventory item release ID;
  - `GRAMMAR_CONTENT_RELEASE_ID` imported from code;
  - production smoke evidence release ID when present.
- Fail if any final report contains `pending`, `todo`, `tbc`, `tbd`, `unknown`, `n/a`, or compound variants anywhere in release-evidence frontmatter.

Acceptance:

```bash
node scripts/validate-grammar-qg-completion-report.mjs docs/plans/james/grammar/questions-generator/grammar-qg-p10-final-completion-report-2026-04-29.md --json
node scripts/validate-grammar-qg-certification-evidence.mjs reports/grammar/grammar-qg-p10-certification-manifest.json docs/plans/james/grammar/questions-generator/grammar-qg-p10-final-completion-report-2026-04-29.md --json
```

Both must fail on the current P9 stale-manifest case and pass after P10 fixes.

---

### U1 — Canonical learner-render inventory

The existing inventory is too data-oriented. P10 needs an inventory of what a child actually sees and hears.

Deliver:

- `reports/grammar/grammar-qg-p10-render-inventory.json`
- `reports/grammar/grammar-qg-p10-render-inventory.md`
- `reports/grammar/grammar-qg-p10-render-inventory-redacted.md`

For each template × seed in the certification window, include:

- template ID;
- seed;
- concept IDs;
- input type;
- learner-visible prompt as rendered text;
- resolved `promptParts` display sequence;
- focus cue target;
- screen-reader prompt;
- read-aloud text actually used by the production read-aloud function;
- visible options/rows/fields as rendered;
- row-specific options, if applicable;
- expected answer summary in internal-only artefact;
- feedback summary in internal-only artefact;
- certification status.

Acceptance:

- The render inventory release ID must match code release ID.
- The render inventory must contain 2,340 items for 78 × 30 if that is the declared certification window.
- The redacted artefact must contain no answer internals.
- The internal artefact must be safe for adult review but not learner-facing.

---

### U2 — Explicit prompt target contract

Replace heuristic prompt-cue inference with explicit template-owned cue metadata.

Required model:

```js
promptCue: {
  type: 'underline' | 'bold' | 'target-sentence' | 'target-phrase' | 'none',
  targetText: string,
  targetOccurrence?: number,
  visibleInstruction: string,
  screenReaderInstruction: string,
  readAloudInstruction: string
}
```

Rules:

- If a prompt says “underlined word”, `targetText` must be that word, not the whole sentence or phrase.
- If a prompt says “underlined noun phrase/group”, `targetText` must be that phrase, not the whole sentence.
- `promptParts` must not duplicate the same sentence once plain and once styled.
- A question may not have `promptParts` without either `focusCue` or an explicit `cueNotRequiredReason`.
- The prompt cue must survive serialisation, render, mini-test mode, read-aloud, and screen-reader text.

Templates requiring special attention:

- `word_class_underlined_choice`
- `qg_p4_voice_roles_transfer`
- `qg_p4_word_class_noun_phrase_transfer`
- `qg_p3_noun_phrases_explain`
- any template whose prompt contains “underlined”, “bold”, “brackets”, “sentence below”, “focus”, or equivalent visual cue language.

Acceptance:

```bash
node scripts/audit-grammar-prompt-cues.mjs --seeds=1..30 --json
```

Must prove:

- no duplicated prompt target;
- no whole-sentence underline when the prompt asks for a word/phrase;
- no cue-language prompt without explicit cue metadata;
- `screenReaderPromptText` and actual read-aloud text mention the same target.

---

### U3 — Read-aloud and accessibility alignment

Make the read-aloud path consume the same learner-surface contract as the visual renderer.

Required changes:

- `buildGrammarSpeechText()` must prefer `item.readAloudText` or `item.screenReaderPromptText` over plain `item.promptText` when present.
- For `table_choice`, read-aloud must announce row-specific choices per row, not only the global columns.
- For `promptParts`, read-aloud must not duplicate the sentence.
- Add tests for mini-test current item read-aloud.
- Add tests for heterogeneous table read-aloud.
- Add tests proving prompt cue target is read aloud.

Acceptance:

- Read-aloud text for `word_class_underlined_choice` says which word is underlined.
- Read-aloud text for `qg_p4_voice_roles_transfer` says which noun phrase is underlined.
- Read-aloud text for row-specific tables lists the valid choices for each row.

---

### U4 — Table-choice and multi-field production UX

P9’s row-specific table direction is correct, but P10 must make it production-solid.

Required changes:

- Fix the homogeneous table test target from `sentence_function_classify` to `sentence_type_table`, or derive the homogeneous template dynamically and assert at least one test case exists.
- Any generated test loop must fail if it checks zero cases unexpectedly.
- Render row-specific table choices with clear row labels and row-local option groups.
- Normalise response values per row in both session and mini-test paths.
- Read-aloud and screen-reader output must match row-local choices.
- Keep the UI functional on narrow mobile widths; avoid cosmetic redesign.

Acceptance:

- Heterogeneous templates show only relevant options per row.
- Homogeneous tables still use global columns correctly.
- Wrong-row option values are rejected in normalisation and marking.
- Browser/React tests cover the actual GrammarSessionScene output for at least one heterogeneous and one homogeneous table.

---

### U5 — Full question quality register

Create a real production-quality register, not just generated sign-off notes.

Deliver:

- `reports/grammar/grammar-qg-p10-quality-register.json`
- `reports/grammar/grammar-qg-p10-quality-register.md`

Each template must have:

- decision: `approved`, `approved_after_fix`, `blocked`, or `retire_candidate`;
- severity if not approved;
- reviewer ID;
- reviewer method;
- reviewed seed window;
- concrete reviewed examples, not generic template-derived notes;
- prompt answerability judgement;
- grammar logic judgement;
- distractor quality judgement;
- marking judgement;
- feedback judgement;
- UI/read-aloud/accessibility judgement;
- final action.

At least these high-risk template classes require deeper notes:

- all mixed-transfer templates;
- all constructed-response templates;
- all visual-cue templates;
- all manual-review-only templates;
- all templates involving formal/informal judgement;
- all templates involving subject/object and active/passive role transfer.

Acceptance:

- No generated placeholder notes such as “prompts clear, answers unambiguous” without concrete examples.
- Every blocked template is excluded from the scheduler.
- Every approved template has enough review evidence for another adult to understand why it was approved.

---

### U6 — Distractor and ambiguity audit

Selected-response questions must test misconceptions, not accidental alternatives.

Deliver:

```bash
node scripts/audit-grammar-distractor-quality.mjs --seeds=1..30 --json
```

For each selected-response option, classify:

- correct answer;
- distractor grammar misconception;
- why it is wrong;
- whether it could be defensible under another reading;
- whether the prompt removes that alternative reading.

Acceptance:

- Every single-choice question has exactly one defensible answer.
- Checkbox questions have a complete correct set and no missing defensible options.
- Any plausible alternative answer must either be removed, reworded, or marked as accepted if constructed-response.
- Adult review must explicitly sign off ambiguous areas such as modal certainty, formality, subject/object in passive voice, and relative/subordinate clause contrasts.

---

### U7 — Constructed-response marking matrix

Constructed-response marking is where production trust is easiest to lose. P10 must build a matrix for every constructed-response template.

Deliver:

- `reports/grammar/grammar-qg-p10-marking-matrix.json`
- `reports/grammar/grammar-qg-p10-marking-matrix.md`

Each constructed-response template must include:

- golden answers;
- accepted variants;
- near misses;
- raw prompt / no-op probes;
- smart punctuation variants;
- case and whitespace variants;
- common child mistakes;
- expected score;
- feedback and misconception tag.

Acceptance:

- All golden and accepted variants mark correct.
- Near misses and raw prompts do not mark fully correct.
- Smart punctuation variants are handled symmetrically where intended.
- The answer spec is not so strict that a correct KS2 answer is rejected for harmless formatting.
- The answer spec is not so loose that a grammar mistake is accepted.

---

### U8 — Scheduler safety and production blocklist

The blocklist must be driven by the P10 quality register and must fail closed.

Required changes:

- Generate certification status map from the P10 quality register, not from a static all-approved assertion.
- Unknown templates remain blocked by default.
- Blocked templates are excluded from:
  - smart practice queue;
  - mini-test pack;
  - retry queue rehydration;
  - similar problem generation;
  - any direct template launch unless debug/review mode explicitly allows it.
- Direct template launch should produce a clear review-only/admin error if a learner tries to access a blocked template.

Acceptance:

- Add a synthetic uncertified template in test and prove it cannot enter any learner scheduling route.
- Add a synthetic blocked status and prove all scheduler surfaces exclude it.
- Debug/review bypass must not be available in normal learner mode.

---

### U9 — Render-level browser smoke, not just structural object tests

P9 mostly validates object shape. P10 must validate rendered learner surface for representative questions.

Required checks:

- React render test for `word_class_underlined_choice`: one visible sentence, target word underlined, no duplicate sentence.
- React render test for `qg_p4_voice_roles_transfer`: target noun phrase/subject is visibly marked, not the whole sentence.
- React render test for `qg_p4_word_class_noun_phrase_transfer`: the intended word or phrase target is marked correctly.
- React render test for a homogeneous table and a heterogeneous table.
- Keyboard navigation check for radio groups, checkbox lists, multi-field groups, textarea, and table rows.
- Mobile-width assertion at 375px/390px equivalent layout constraints, without relying on screenshots as the only evidence.

Acceptance:

```bash
node --test tests/grammar-qg-p10-render-surface.test.js
```

No test may pass by checking zero generated cases.

---

### U10 — Production smoke and deployed release proof

P10 is not fully production-certified until this runs after deployment.

Deliver:

- `reports/grammar/grammar-production-smoke-grammar-qg-p10-2026-04-29.json`
- `reports/grammar/grammar-qg-p10-post-deploy-smoke.md`

Smoke must prove:

- deployed app / Worker reports Grammar release `grammar-qg-p10-2026-04-29`;
- a learner can start a Grammar session;
- a generated certified template can be served;
- the item serialisation contains no answer internals;
- a valid answer can be submitted;
- a wrong answer gives expected feedback and does not unlock reward incorrectly;
- read model updates reference the correct release;
- blocked templates cannot be served;
- smoke evidence records URL, timestamp, command, fixture learner, release ID, item IDs, result shape, and failure details.

Certification rule:

- Before production smoke: `CERTIFIED_PRE_DEPLOY_WITH_LIMITATIONS` is allowed.
- After production smoke: `CERTIFIED_POST_DEPLOY` is allowed only if the smoke evidence exists and validates.

---

### U11 — Final report validator as the single gate

The final report must be a machine-checkable product contract.

Required final command:

```bash
npm run verify:grammar-qg-p10
```

The command must chain all prior gates and P10 gates:

- P6/P7/P8/P9 verification;
- P10 evidence truth gate;
- P10 render inventory gate;
- P10 prompt cue audit;
- P10 distractor ambiguity audit;
- P10 constructed-response marking matrix;
- P10 quality register validation;
- P10 scheduler blocklist tests;
- P10 production smoke validator when report claims post-deploy certification.

Final report must fail if:

- any release ID mismatch exists;
- any final report frontmatter placeholder exists;
- any evidence artefact is stale;
- inventory item count does not match template × seed denominator;
- any `draft_only` item is claimed as production-approved without a corresponding quality-register approval;
- any S0/S1 issue remains open;
- post-deploy certification is claimed without production smoke evidence.

---

### U12 — Expansion only after lock

Only after U0–U11 pass may P10 optionally add new question variants. Expansion is not the main objective.

Expansion rule:

- Add variants only where the quality register or P7 calibration evidence shows a real weakness: shallow coverage, repeated stems, weak retention, missing transfer, or over-reliance on fixed templates.
- New variants must enter as `draft_only` and remain blocked until they pass the same P10 review and evidence gates.

---

## 7. Required P10 artefacts

P10 must deliver these files:

| File | Purpose |
|---|---|
| `docs/plans/james/grammar/questions-generator/grammar-qg-p10.md` | Product/engineering contract |
| `docs/plans/james/grammar/questions-generator/grammar-qg-p10-final-completion-report-2026-04-29.md` | Final evidence report |
| `reports/grammar/grammar-qg-p10-certification-manifest.json` | Single source of truth for release, seed windows, item counts, artefact hashes |
| `reports/grammar/grammar-qg-p10-render-inventory.json` | Internal learner-render inventory |
| `reports/grammar/grammar-qg-p10-render-inventory-redacted.md` | Learner-safe render inventory |
| `reports/grammar/grammar-qg-p10-quality-register.json` | Template/item quality decisions |
| `reports/grammar/grammar-qg-p10-quality-register.md` | Human-readable quality register |
| `reports/grammar/grammar-qg-p10-marking-matrix.json` | Constructed-response marking matrix |
| `reports/grammar/grammar-qg-p10-distractor-audit.json` | Selected-response ambiguity/distractor audit |
| `reports/grammar/grammar-qg-p10-open-issues.json` | S0–S3 issue ledger |
| `reports/grammar/grammar-production-smoke-grammar-qg-p10-2026-04-29.json` | Required only for post-deploy certification |

---

## 8. Definition of done

P10 is done only when all of the following are true:

1. `npm run verify:grammar-qg-p10` passes from a clean checkout.
2. The final report has no placeholder frontmatter and all release IDs match.
3. The manifest, inventory, quality register, certification status map, code release ID, and smoke evidence refer to the same release.
4. 78/78 existing templates have final quality decisions.
5. 0 S0 and 0 unresolved S1 issues remain.
6. Any S2 limitations are explicitly documented, owned, and non-blocking.
7. Prompt cue rendering is correct for all cue-language templates.
8. Read-aloud uses the actual prompt cue contract.
9. Row-specific table choices render, mark, normalise, and speak correctly.
10. Constructed-response marking has a signed-off matrix.
11. All blocked/unknown templates are excluded from learner scheduling.
12. A deployed production smoke file exists before any `CERTIFIED_POST_DEPLOY` claim.

---

## 9. Recommended certification wording

Until production smoke has run:

> Grammar QG P10 is certified pre-deploy with zero known S0/S1 question-quality issues, but is not yet post-deploy certified. Production certification is pending live smoke evidence for release `grammar-qg-p10-2026-04-29`.

After production smoke has run and validated:

> Grammar QG P10 is certified post-deploy for release `grammar-qg-p10-2026-04-29`. The repository evidence, deployed Worker smoke evidence, scheduler safety gates, learner-render inventory, adult review register, and marking matrix all agree on the same release and approved question pool.

---

## 10. Suggested implementation order

1. U0 evidence truth reset.
2. U2 prompt target contract for known cue failures.
3. U3 read-aloud alignment.
4. U4 table-choice test and render hardening.
5. U1 render inventory generation.
6. U5 quality register.
7. U6 distractor/ambiguity audit.
8. U7 constructed-response marking matrix.
9. U8 scheduler status map generation from the quality register.
10. U9 browser/render smoke.
11. U10 production smoke after deployment.
12. U11 final report and verify gate.
13. U12 optional expansion only if evidence demands it.

This order prevents the team from producing another impressive certification report before the learner-facing question quality is actually locked.
