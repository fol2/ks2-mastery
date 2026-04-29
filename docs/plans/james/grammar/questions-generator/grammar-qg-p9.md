---
phase: grammar-qg-p9
title: Grammar QG P9 — Evidence-Locked Production Certification and Learner-Surface Hardening
status: proposed
date: 2026-04-29
baseline_content_release_id: grammar-qg-p8-2026-04-29
default_content_release_policy: bump only when learner-facing content, serialisation, or rendering contract changes
scoring_or_mastery_change: "false"
reward_or_star_change: "false"
hero_mode_change: "false"
default_template_denominator: 78
---

# Grammar QG P9 — Evidence-Locked Production Certification and Learner-Surface Hardening

## Product sentence

P9 turns the P8 Grammar Question Generator work from a strong automated-certification story into an evidence-locked production certification: every claim, generated report, learner-visible cue, review decision, and production smoke result must be reproducible from committed code or attached evidence.

P9 is not a template-growth phase. The default denominator remains 18 concepts and 78 templates. New templates should not be added unless a blocked template must be replaced and the replacement goes through the same evidence gate.

## Why P9 exists

P8 delivered valuable work. It fixed the known `speech_punctuation_fix` no-op defect, added production-marker-based audit rules, introduced a P8 verify gate, generated inventory/review artefacts, and created structural UX checks.

However, P8 should not yet be treated as final production certification without qualification. The current repo evidence shows several gaps between the certification language and the committed evidence:

1. The in-repo P8 final report still contains placeholder release frontmatter even though P8 claims placeholder governance was hardened.
2. The committed P8 inventory artefacts cover 234 question instances over 3 seeds, while the completion report claims 2,340 instances over 30 seeds.
3. The inventory rows still carry `reviewStatus: pending`, while the completion report says all templates were adult-reviewed and signed off.
4. The review register is auto-generated as accepted with generic “adult review confirmed” notes; this is not sufficient evidence of independent adult judgement.
5. The automated oracle suite uses mixed seed windows, not a uniform 30-seed certification window across every oracle family.
6. The learner UI still renders plain `promptText`, so rich prompt cues such as “the underlined word” can be lost before the child sees the question.
7. `table_choice` still uses global columns for every row, which is unsafe for heterogeneous mixed-transfer tables.
8. P7’s explanation-event expansion still recognises `explanation` tags, but real template tagging must be checked against `explain` and `questionType: explain`.
9. Mobile layout, keyboard navigation, screen-reader behaviour, and iOS smart-punctuation tolerance remain manual-review gaps.
10. Post-deploy production smoke has not been attached to the certification evidence.

The P9 goal is to remove ambiguity. After P9, “certified” must mean that the repo contains enough evidence to reproduce the claim.

## Certification vocabulary

Use these terms consistently in reports, PR descriptions, and release gates.

| Term | Meaning |
| --- | --- |
| `NOT_CERTIFIED` | One or more S0/S1 issues remain, or evidence is missing for a production-critical claim. |
| `CERTIFIED_WITH_LIMITATIONS` | Automated gates pass, but deployment smoke or manual UX/accessibility evidence is missing. Limitations must be named. |
| `CERTIFIED_PRE_DEPLOY` | Repo-local gates, deterministic evidence artefacts, learner-surface checks, and review evidence pass. Post-deploy smoke is explicitly not yet run. |
| `CERTIFIED_POST_DEPLOY` | `CERTIFIED_PRE_DEPLOY` plus successful post-deploy Grammar production smoke with attached evidence. |

P8 should be treated as `CERTIFIED_WITH_LIMITATIONS` until P9 evidence locking is complete.

## Non-negotiables

P9 must not change Grammar scoring, mastery, Stars, Mega, Hero Mode, Concordium, reward semantics, or learner economy.

P9 must not add template count by default. Fix broken templates, block unsafe templates, or replace only when necessary.

P9 must not render raw unsanitised HTML from content. Learner-visible emphasis must be represented through a safe structured prompt contract.

P9 must not allow generated reports to be manually edited into a passing state without deterministic validation.

P9 must not let a final report claim post-deploy smoke passed unless the evidence file exists and is validated.

P9 must not auto-approve adult review decisions. A generator may create a draft register, but final acceptance must require review evidence.

## Baseline denominator

The baseline is the P8 release:

| Measure | Baseline |
| --- | ---: |
| Content release ID | `grammar-qg-p8-2026-04-29` |
| Concepts | 18 |
| Templates | 78 |
| Selected-response templates | 58 |
| Constructed-response templates | 20 |
| Generated templates | 52 |
| Fixed templates | 26 |
| Answer-spec templates | 47 |
| Constructed-response answer-spec templates | 20 / 20 |
| Manual-review-only templates | 4 |
| Explanation templates | 17 |
| Mixed-transfer templates | 8 |

If P9 changes only evidence scripts, tests, reports, and validation gates, the content release ID may remain `grammar-qg-p8-2026-04-29`. If P9 changes learner-visible question serialisation, prompt cues, input contract, template data, answer specs, or renderer behaviour that affects what learners see, bump to `grammar-qg-p9-2026-04-29` or the actual release date.

## Severity model

| Severity | Definition | Release effect |
| --- | --- | --- |
| S0 | Learner cannot answer fairly, wrong answer accepted as correct, correct answer impossible, hidden answer leak, or production marking corrupts mastery. | Block release. |
| S1 | Question is answerable but materially unfair, ambiguous, misleading, inaccessible, or review evidence is missing for a learner-facing item. | Block certification. |
| S2 | Governance, telemetry, report, or UX evidence gap that does not directly make a learner-facing item invalid. | May ship only with explicit limitation. |
| S3 | Documentation, copy, or maintenance issue with no learner impact. | Does not block, but must be tracked. |

## Implementation units

### U0 — P8 truth reconciliation and report governance

Bring the P8 reports into a single truthful state before doing new work.

Required changes:

- Amend the in-repo P8 final report so its frontmatter contains real PR and commit references, or explicitly rename it as an in-PR draft that must not be used as the canonical completion report.
- Add a P8 validation addendum recording the exact status: what was verified, what was claimed, what is unsupported, and what P9 will fix.
- Update `scripts/validate-grammar-qg-completion-report.mjs` so the CLI path calls `validateReleaseFrontmatter()` before returning PASS.
- Reject placeholder-like values in all final reports, including `pending-*`, `*-pending`, `todo-*`, `tbd-*`, `unknown-*`, and similar compound tokens.
- Add a regression test that the current placeholder-bearing P8 final report fails validation until corrected.

Acceptance criteria:

- `node scripts/validate-grammar-qg-completion-report.mjs <canonical-report>` fails on placeholder frontmatter.
- The canonical P8 report and P8 completion report no longer contradict each other on PR, merge commit, inventory size, adult review status, CI status, or smoke status.
- A report that claims `CERTIFIED_POST_DEPLOY` without smoke evidence fails validation.

### U1 — Evidence-locked inventory manifest

The inventory claim must match committed artefacts exactly.

Required changes:

- Add a deterministic certification manifest, for example `reports/grammar/grammar-qg-p9-certification-manifest.json`.
- The manifest must include:
  - content release ID;
  - template denominator;
  - seed window per evidence type;
  - generated inventory item count;
  - expected output paths;
  - generator script version or hash;
  - generation command;
  - generated-at timestamp;
  - whether answer internals are included or redacted.
- Regenerate the certification inventory for the intended window. If the certification window is 78 templates × 30 seeds, the committed full inventory must contain 2,340 items. If the intended window is 60 seeds, the report must say 4,680 items. Do not mix these.
- Replace `reviewStatus: pending` in certification artefacts with a state that reflects real evidence: `accepted`, `watchlist`, `rejected`, or `draft_only`. `pending` is allowed only in draft artefacts that are clearly excluded from certification.

Acceptance criteria:

- A test reads the committed inventory JSON and validates its item count against the manifest.
- The Markdown inventory summary matches the JSON summary.
- The redacted inventory has no answer-spec internals.
- A stale inventory generated over 3 seeds cannot pass a 30-seed certification claim.

### U2 — Adult review evidence contract

Adult review must be evidence, not an auto-filled sentence.

Required changes:

- Split the review generator into two modes:
  - `draft` mode creates `pending_review` entries.
  - `finalise` mode validates reviewer evidence and writes accepted/watchlist/rejected decisions.
- Extend each review entry with:
  - `reviewerId` or `reviewerRole`;
  - `reviewMethod`;
  - `reviewedSeedWindow`;
  - `reviewedPromptSurface`;
  - `reviewedAnswerSpec`;
  - `reviewedFeedback`;
  - `decision`;
  - `severity`;
  - `notes`;
  - `actionRequired`;
  - `signedOffAt`.
- Reject final certification if every entry has identical generic notes.
- Reject final certification if accepted entries were created by the generator without review metadata.
- Permit concept-level sign-off only when the reviewer also confirms all templates in that concept were sampled according to the manifest.

Acceptance criteria:

- `tests/grammar-qg-p9-review-evidence.test.js` proves the committed final register is not simply the generator’s default auto-accepted output.
- Every rejected or watchlist entry has severity and action.
- Every accepted entry has enough review metadata to audit who reviewed what surface.
- Manual-review-only templates are explicitly reviewed as non-scored learner tasks.

### U3 — Learner-visible prompt cue contract

A question is not certified if the child cannot see the cue needed to answer it.

Required changes:

- Add a safe structured prompt representation to the serialised question, for example:

```ts
type PromptPart =
  | { kind: 'text'; text: string }
  | { kind: 'emphasis'; text: string }
  | { kind: 'underline'; text: string; cue: 'target-word' }
  | { kind: 'lineBreak' }
  | { kind: 'sentence'; text: string };

type SerialisedGrammarQuestion = {
  promptText: string;
  promptParts?: PromptPart[];
  screenReaderPromptText?: string;
  readAloudText?: string;
  focusCue?: {
    type: 'underline' | 'bold' | 'quoted-word' | 'target-sentence';
    text: string;
    occurrence?: number;
  };
};
```

- Preserve backwards compatibility with `promptText`, but the React learner surface must prefer `promptParts` when present.
- Add a renderer for prompt parts that uses semantic markup, not raw untrusted HTML.
- Add screen-reader copy that says the cue aloud, for example: “Target word: it.”
- Add read-aloud copy that includes the target word or cue.
- Update review inventory so it records the learner-visible prompt surface, not only stripped text.

Templates that must be explicitly covered:

- `word_class_underlined_choice`;
- any prompt whose `promptText` contains “underlined”, “bold”, “circle”, “tick”, “copy”, “sentence below”, “shown in brackets”, or similar visual-cue wording;
- all direct-speech punctuation fixes where quotes and punctuation placement are central to the task.

Acceptance criteria:

- A DOM or React render test proves the target word in `word_class_underlined_choice` is visually underlined or otherwise clearly cued.
- A screen-reader/read-aloud test proves the same target word is announced.
- An audit fails when a prompt says “underlined” but the serialised item has no `focusCue` or `promptParts` cue.
- Certification inventory includes both raw text and learner-rendered prompt surface.

### U4 — Row-specific table choices and heterogeneous transfer safety

A table is safe only when every row has the right set of choices for that row.

Required changes:

- Extend `table_choice` to support either global columns or row-specific options:

```ts
type TableChoiceInputSpec = {
  type: 'table_choice';
  columns?: string[];
  rows: Array<{
    key: string;
    label: string;
    options?: string[];
    ariaLabel?: string;
  }>;
};
```

- Update the React `TableChoice` component to use `row.options` when present, falling back to global `columns`.
- Update response normalisation so each row validates against its own allowed values when `row.options` exists.
- Update evaluation code and tests so row-specific values are accepted only for the correct row.
- Review whether heterogeneous mixed-transfer tables should instead be migrated to `multi` fields.

Templates that must be audited:

- `qg_p4_word_class_noun_phrase_transfer`;
- `qg_p4_voice_roles_transfer`;
- every `table_choice` mixed-transfer template.

Acceptance criteria:

- A heterogeneous table no longer shows irrelevant options in unrelated rows.
- Global-column tables still work unchanged.
- Invalid row-specific submissions are rejected during normalisation.
- Mobile table review includes horizontal overflow or stacked-row behaviour.

### U5 — Real-template explanation analytics repair

P7 analytics must classify explanation events from actual template tags, not only synthetic tags.

Required changes:

- Change explanation detection to:

```js
const isExplanation =
  tags.includes('explain') ||
  tags.includes('explanation') ||
  event.questionType === 'explain';
```

- Add a fixture built from a real explanation template, not only a synthetic event.
- Add a regression test proving P3 explanation templates expand with `isExplanation: true`.
- Confirm health-report and calibration outputs do not undercount explanation work.

Acceptance criteria:

- `tests/grammar-qg-p9-event-expansion-real-tags.test.js` fails on the old implementation and passes on the new one.
- Mixed-transfer detection remains unchanged.
- Existing P7 event-expansion tests still pass.

### U6 — Oracle seed-window alignment

Reports must describe exactly what the oracles did.

Required changes:

- Decide one of two approaches:
  - Expand all oracle families to the 30-seed certification window; or
  - keep the current mixed windows, but report them honestly and justify why each is sufficient.
- Write the chosen seed windows into the certification manifest.
- Add a report validator that rejects vague claims such as “all 78 templates × 30 seeds pass automated oracles” unless every named oracle family actually uses that window.
- Keep the content-quality audit over at least 30 seeds.

Acceptance criteria:

- The report validator compares the manifest with the final report.
- Selected-response, constructed-response, manual-review-only, and redaction oracles each declare their seed window.
- If the report claims 2,518 oracle tests, the test suite can reproduce that number or the claim is removed.

### U7 — Learner-surface UX, accessibility, and device smoke

Structural input checks are not enough. P9 must test the rendered learner surface.

Required changes:

- Add render-level tests for all six input families:
  - `single_choice`;
  - `checkbox_list`;
  - `table_choice`;
  - `textarea`;
  - `multi`;
  - `text`.
- Add tests for:
  - visible prompt cue retention;
  - label association;
  - `aria-describedby` error linkage;
  - keyboard navigation into and through inputs;
  - table row/column labelling;
  - no answer leaks in rendered DOM;
  - read-aloud text for cue-heavy prompts.
- Add a mobile/narrow-width check for table layout. This may be a Playwright smoke, a DOM class contract, or a deterministic CSS/layout assertion.
- Add iOS smart punctuation normalisation tests for punctuation-sensitive answer specs: curly quotes, straight quotes, apostrophes, en dash/em dash, and whitespace.

Acceptance criteria:

- P9 has at least one render-level test per input family.
- Table-choice narrow-width handling is documented and tested.
- Screen-reader-relevant labels are present for cue-heavy prompts.
- iOS smart punctuation does not cause a correct speech-punctuation answer to be marked wrong unless the grammar is actually wrong.

### U8 — Production smoke evidence gate

Post-deploy certification must be evidence-backed.

Required changes:

- Keep pre-deploy and post-deploy certification states separate.
- Add or update production smoke script output so it writes a release-specific evidence file:

```text
reports/grammar/grammar-production-smoke-<release-id>.json
```

- The evidence file must include:
  - release ID;
  - deployed URL or environment;
  - timestamp;
  - command;
  - learner/session fixture type;
  - item creation result;
  - answer submission result;
  - read-model update result;
  - no answer leak assertion;
  - failure details if any.
- Update report validation so post-deploy claims are rejected without this file.

Acceptance criteria:

- A report claiming `CERTIFIED_POST_DEPLOY` fails without the evidence file.
- A report saying “post-deploy smoke not run” can pass only as `CERTIFIED_PRE_DEPLOY` or `CERTIFIED_WITH_LIMITATIONS`.
- The smoke evidence release ID matches the report release ID.

### U9 — Template blocklist and scheduler safety

A template without certification evidence must not silently enter learner scheduling.

Required changes:

- Add a certification status map, for example:

```json
{
  "word_class_underlined_choice": {
    "status": "approved",
    "evidence": ["prompt-cue-render", "oracle", "review"]
  },
  "qg_p4_voice_roles_transfer": {
    "status": "blocked",
    "reason": "row-specific-options-required"
  }
}
```

- The scheduler must exclude `blocked` templates from normal learner practice.
- Adult/debug review mode may include blocked templates only with an explicit flag.
- The final report must list any blocked templates and the denominator impact.

Acceptance criteria:

- A blocked template cannot be selected by smart practice, mini-set, trouble drill, or Hero-launched Grammar practice.
- A test proves the scheduler excludes blocked templates.
- No blocked template is counted as production-certified.

### U10 — P9 final report and release gate

The final report must be a machine-checkable evidence package.

Required final report fields:

```yaml
---
phase: grammar-qg-p9
implementation_prs:
  - "#..."
final_content_release_commit: "<sha>"
post_merge_fix_commits: []
final_report_commit: "<sha>"
baseline_content_release_id: grammar-qg-p8-2026-04-29
final_content_release_id: "<release-id>"
content_release_id_changed: "true|false"
scoring_or_mastery_change: "false"
reward_or_star_change: "false"
certification_decision: "CERTIFIED_PRE_DEPLOY|CERTIFIED_POST_DEPLOY|CERTIFIED_WITH_LIMITATIONS|NOT_CERTIFIED"
evidence_manifest: reports/grammar/grammar-qg-p9-certification-manifest.json
post_deploy_smoke_evidence: "reports/grammar/grammar-production-smoke-<release-id>.json|not-run"
---
```

Required report sections:

- executive summary;
- exact certification decision;
- denominator;
- evidence manifest summary;
- oracle seed windows;
- inventory item count;
- review evidence summary;
- learner-surface UX evidence;
- table-choice contract status;
- analytics/event-expansion status;
- production smoke status;
- known limitations;
- commands run;
- files changed;
- release ID decision;
- no scoring/mastery/reward-change confirmation.

Acceptance criteria:

- `npm run verify:grammar-qg-p9` validates the final report against live audits and committed evidence.
- The final report contains no placeholder values.
- The report does not claim more than the evidence proves.

## Proposed files

Add or modify the following files.

### New files

| File | Purpose |
| --- | --- |
| `docs/plans/james/grammar/questions-generator/grammar-qg-p9.md` | This contract |
| `tests/grammar-qg-p9-report-evidence-lock.test.js` | Validates report/frontmatter/manifest truthfulness |
| `tests/grammar-qg-p9-inventory-manifest.test.js` | Validates committed inventory counts and seed windows |
| `tests/grammar-qg-p9-review-evidence.test.js` | Validates adult review evidence rather than auto-approval |
| `tests/grammar-qg-p9-learner-surface.test.js` | Render-level prompt cue and input-family tests |
| `tests/grammar-qg-p9-table-choice-contract.test.js` | Row-specific options and scheduler safety tests |
| `tests/grammar-qg-p9-event-expansion-real-tags.test.js` | Real explanation tag/event regression |
| `scripts/validate-grammar-qg-certification-evidence.mjs` | Single evidence validator used by report and CI |
| `scripts/generate-grammar-qg-certification-manifest.mjs` | Writes the evidence manifest |
| `reports/grammar/grammar-qg-p9-certification-manifest.json` | Exact committed evidence manifest |
| `reports/grammar/grammar-qg-p9-question-inventory.json` | Full certification inventory for the declared seed window |
| `reports/grammar/grammar-qg-p9-question-inventory-redacted.md` | Redacted inventory for learner/parent-safe inspection |
| `reports/grammar/grammar-qg-p9-content-review-register.json` | Final review evidence register |
| `reports/grammar/grammar-qg-p9-ux-render-audit.md` | Render-level UX/accessibility audit |
| `docs/plans/james/grammar/questions-generator/grammar-qg-p9-completion-report.md` | Final P9 completion report |

### Modified files

| File | Expected change |
| --- | --- |
| `package.json` | Add `verify:grammar-qg-p9` script chaining P8 plus P9 gates |
| `scripts/validate-grammar-qg-completion-report.mjs` | Run frontmatter validation in CLI path |
| `scripts/generate-grammar-qg-quality-inventory.mjs` | Emit manifest-aware summaries and non-pending certification status |
| `scripts/generate-grammar-qg-review-register.mjs` | Split draft generation from final review evidence validation |
| `scripts/grammar-qg-expand-events.mjs` | Recognise real explanation tags and question type |
| `worker/src/subjects/grammar/content.js` | Add structured prompt cues where required; content release bump only if learner-facing data changes |
| `worker/src/subjects/grammar/engine.js` | Serialise cue fields; normalise row-specific table choices |
| `src/subjects/grammar/components/GrammarSessionScene.jsx` | Render structured prompt parts and row-specific table options safely |
| `worker/src/subjects/grammar/selection.js` | Exclude blocked templates from learner scheduling |
| `tests/grammar-qg-p8-*` | Keep P8 tests; do not weaken historical gates |

## Suggested verify script

```json
{
  "verify:grammar-qg-p9": "npm run verify:grammar-qg-p8 && node --test tests/grammar-qg-p9-report-evidence-lock.test.js tests/grammar-qg-p9-inventory-manifest.test.js tests/grammar-qg-p9-review-evidence.test.js tests/grammar-qg-p9-learner-surface.test.js tests/grammar-qg-p9-table-choice-contract.test.js tests/grammar-qg-p9-event-expansion-real-tags.test.js"
}
```

If production smoke is run separately after deploy, do not put it in the repo-local verify script unless CI has the required deployed environment. Instead, validate the smoke evidence file in the final report gate.

## Release decision rules

P9 may finish as `CERTIFIED_PRE_DEPLOY` when:

- repo-local verify gate passes;
- all reports and manifests are deterministic and consistent;
- learner-surface prompt cues pass render tests;
- row-specific table choice or equivalent migration is complete for heterogeneous tables;
- real explanation-event expansion passes;
- adult review evidence is valid;
- no S0/S1 items remain;
- post-deploy smoke is explicitly marked `not-run`.

P9 may finish as `CERTIFIED_POST_DEPLOY` only when all `CERTIFIED_PRE_DEPLOY` criteria pass and post-deploy Grammar smoke evidence is attached and validated.

P9 must finish as `CERTIFIED_WITH_LIMITATIONS` if any S2 evidence gap remains, such as mobile visual testing or assistive-technology testing not completed.

P9 must finish as `NOT_CERTIFIED` if any S0/S1 issue remains, including lost learner-visible cue, auto-approved review evidence, inventory mismatch, or a blocked template still entering normal learner scheduling.

## Product acceptance checklist

Before closing P9, answer these questions with evidence:

- Can a child see every cue needed to answer the question?
- Can a screen reader or read-aloud surface identify every target word or target sentence?
- Does every generated report match the code that generated it?
- Does the inventory item count match the claimed seed window?
- Does adult review evidence show real judgement rather than generator defaults?
- Do the oracle seed windows match the final report wording?
- Are heterogeneous mixed-transfer tasks rendered with the right options per row?
- Are explanation events counted correctly in analytics?
- Are blocked templates excluded from all learner schedulers?
- Is post-deploy smoke either attached or honestly marked as not run?
- Have scoring, mastery, Stars, Mega, Hero Mode, and reward semantics remained unchanged?

## Recommended build order

Start with U0 and U1. Do not add new UX work until the project can tell the truth about its existing evidence.

Then do U3 and U4 because these directly affect whether children can answer questions fairly.

Then do U5 and U6 to repair analytics truth and report wording.

Then do U2 and U7 to make certification evidence meaningful beyond automated structure.

Then do U8, U9, and U10 to close production certification.

## Out of scope

The following are explicitly out of scope for P9:

- Hero Mode economy, Hero Coins, Hero Camp, or Hero monster progression.
- Grammar Stars, Mega, mastery thresholds, confidence semantics, or reward projection.
- New Grammar concepts or broad template expansion.
- AI-generated new question content.
- Parent dashboards outside the evidence needed for certification.
- Arithmetic, Reasoning, Reading, Spelling, or Punctuation changes except where shared infrastructure requires a harmless compatibility update.

## Final expected outcome

P9 should leave the system in a state where the team can say one of two truthful things:

If post-deploy smoke has not yet run:

> Grammar QG is certified pre-deploy for release `<release-id>`. The repository contains deterministic evidence for the declared question pool, learner-surface rendering, review sign-off, analytics tagging, and scheduler safety. Post-deploy smoke is not yet run.

If post-deploy smoke has run:

> Grammar QG is certified post-deploy for release `<release-id>`. The repository contains deterministic pre-deploy evidence and attached production smoke evidence for the deployed release.

Anything stronger than those statements must fail the report validator unless the evidence exists.
