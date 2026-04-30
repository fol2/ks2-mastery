---
phase: grammar-qg-p11
title: Grammar QG P11 — Production Launch Fixes and Post-Deploy Certification Contract
status: proposed
owner: grammar-engineering
language: UK English
baseline_content_release_id: grammar-qg-p10-2026-04-29
content_release_id_policy: bump only if learner-visible serialisation/content changes after P10
scoring_or_mastery_change: false
reward_or_star_change: false
hero_mode_change: false
primary_goal: production readiness, not content expansion
---

# Grammar QG P11 — Production Launch Fixes and Post-Deploy Certification Contract

## 1. Product position

P1–P10 have built a strong Grammar Question Generator engine, evidence pack, scheduler guard, render inventory, and quality register. P11 is not another content-building phase. It is the final production-readiness contract for the current 78-template pool.

P11 exists because P10 is materially better than P9, but the supplied P10 snapshot still contains learner-surface and evidence-truth issues that should not be carried into a full production claim.

The product standard remains simple:

> A child must see and hear exactly the information required to answer. The question must have one defensible expected answer, fair distractors, fair marking, useful feedback, and a live production proof before we call it production-certified.

No new Grammar templates should be added in P11 unless a defect fix requires a replacement item. Any new or changed template must enter blocked/draft status until it has the same evidence as the rest of the pool.

## 2. P10 validation summary that P11 must address

The P10 evidence pack fixed several P9 gaps. The manifest and render inventory now align on `grammar-qg-p10-2026-04-29`, and the render inventory contains 2,340 items across 78 templates × 30 seeds. The content-quality audit over seeds 1–30 reports 2,340 checks, 0 hard failures and 0 advisories.

However, P10 is still `CERTIFIED_PRE_DEPLOY`, not production-certified. Post-deploy smoke remains deferred.

The following gaps are launch-blocking or launch-risk items:

1. `target-sentence` prompt-cue extraction can choose the wrong `<strong>` content. In `identify_words_in_sentence`, the target sentence is read aloud as `adverbs`, `determiners`, `conjunctions` or `pronouns`. In `subject_object_choice`, it is read aloud as `subject` or `object`. This is caused by using the first `<strong>` block rather than the actual sentence block.
2. `qg_p4_voice_roles_transfer` now underlines the correct noun phrase visually, but assistive text still says `Target word` / `underlined word` for a noun phrase.
3. Several target-sentence read-aloud strings end with double punctuation, for example `The sentence is: ... .` after an already punctuated sentence.
4. `scripts/audit-grammar-prompt-cues.mjs` passes the current P10 pool but misses the semantic target failure above because it only checks that screen-reader/read-aloud text contains `focusCue.targetText`, not whether `focusCue.targetText` is the correct cue target.
5. The P10 report claims 190 marking matrix entries, but the committed marking matrix metadata records 80 entries for seeds 1–5. That may still be adequate evidence, but the report wording must match the artefact.
6. The quality register has 74 `approved` entries and 4 `approved_with_limitation` entries. The report may summarise the pool as approved, but the precise evidence wording must preserve the limitations.
7. The distractor audit records 0 S0/S1 failures, but also records 18 ambiguous templates and 540 item rows requiring adult review. That is not the same as an oracle proving every selected-response distractor is semantically unambiguous.
8. `validateReleaseIdConsistency()` exists, but the certification evidence CLI must call it in its default report-validation path, not only expose it for unit tests.
9. The frontmatter/report PR accounting is inconsistent: many PRs are listed in `implementation_prs`, the body says “6 PRs”, and `post_merge_fix_commits` mentions `#722` while `implementation_prs` stops at `#721`.
10. Full production readiness is not proven until a deployed Worker smoke is attached with release ID, URL, timestamp, command, item-creation result, answer-submission result, read-model update result, and no-answer-leak assertion.

## 3. Production decision for P11

P11 has only two acceptable exit states:

| Exit state | Meaning |
|---|---|
| `CERTIFIED_POST_DEPLOY` | All P11 gates pass and live production smoke for the exact release passes. |
| `BLOCKED_PRE_DEPLOY` | Any S0/S1 learner-surface, marking, evidence, or production-smoke gap remains. |

Do not create another “complete but still maybe later” state. If the current pool cannot satisfy production evidence, keep it pre-deploy and block the affected templates or surfaces.

## 4. Scope

### In scope

- Fix prompt-cue target extraction.
- Fix read-aloud and screen-reader copy generated from prompt cues.
- Add semantic prompt-cue audits that fail on the current P10 snapshot.
- Reconcile report and artefact counts.
- Strengthen distractor/adult-review evidence for ambiguous selected-response templates.
- Make the certification CLI the single source of truth.
- Run production smoke and attach evidence.
- Keep the scheduler fail-closed.

### Out of scope

- New Grammar template expansion.
- Scoring, mastery, Stars, Mega, Concordium, Hero Mode, Hero Coins, monster evolution, or reward semantics.
- Cosmetic UI work not required for answerability, accessibility, or production evidence.
- Rebranding or copy-only changes unless they remove ambiguity for children.

## 5. Severity definitions

| Severity | Meaning | Launch rule |
|---|---|---|
| S0 | Wrong answer, impossible question, answer leak, unsafe scoring, or production smoke failure | Must fix before any launch |
| S1 | Child cannot see/hear the required cue; assistive/read-aloud path is materially misleading; ambiguous answer accepted as certified | Must fix or block affected templates before launch |
| S2 | Evidence/report mismatch, adult-review gap, device/browser manual QA gap | Must either fix or explicitly downgrade certification wording |
| S3 | Cosmetic or editorial issue with no answerability impact | May ship with tracking |

The current `target-sentence` read-aloud issue is S1 because read-aloud can tell a child “The sentence is: object/adverbs” instead of the actual sentence.

## 6. Implementation units

### U0 — Evidence truth reconciliation

Fix the P10 report and validator before changing learner code.

Deliverables:

- Update P10 report wording or add an addendum:
  - marking matrix: use the artefact’s real count (`80` entries, seeds `1..5`) or regenerate the artefact to the claimed count;
  - quality register: report `74 approved + 4 approved_with_limitation`, not just “78 approved”, unless the wording explicitly defines limitations as approved-for-ship;
  - PR accounting: reconcile `implementation_prs`, body PR count, and `#722` post-merge fix reference;
  - distractor audit: distinguish “0 S0/S1 structural failures” from “all ambiguous distractors have human sign-off”.
- Wire `validateReleaseIdConsistency()` into `validate-grammar-qg-certification-evidence.mjs` CLI when a report path is provided.
- The CLI must validate: manifest ↔ code release ID, report frontmatter release ID, inventory metadata/items, report claim counts, smoke state, and placeholder frontmatter.

Acceptance:

```bash
node scripts/validate-grammar-qg-certification-evidence.mjs \
  reports/grammar/grammar-qg-p10-certification-manifest.json \
  docs/plans/james/grammar/questions-generator/grammar-qg-p10-final-completion-report-2026-04-29.md
```

This command must fail if the manifest, report, code, or inventory release IDs disagree. It must also fail if the report claims 190 marking matrix entries while the artefact records 80.

### U1 — Prompt-cue target extraction fix

Replace heuristic “first `<strong>` wins” extraction with an explicit cue-target resolver.

Required resolver order:

1. Use an explicit template field if present: `question.focusTarget`, `question.targetSentence`, or `question.promptCue`.
2. For `target-sentence`, parse paragraph blocks and choose the last sentence-like block after the instruction paragraph, not the first bold token.
3. Reject target-sentence candidates that are grammar labels such as `subject`, `object`, `adverbs`, `determiners`, `pronouns`, `conjunctions`, or other short answer-target labels.
4. Require target-sentence candidates to be sentence-like: normally ≥16 characters, containing whitespace, and either sentence punctuation or a blank marker such as `___`.
5. For `underline`, use explicit target metadata first; then use `<u>`; then fall back only when the prompt semantics prove a word/phrase target.
6. Delete internal fields from serialised output.

Suggested implementation shape:

```js
function extractParagraphTextBlocks(stemHtml) {
  return [...stemHtml.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => stripLegacyHtml(match[1]))
    .map(cleanSpaces)
    .filter(Boolean);
}

function isSentenceCueCandidate(text) {
  const value = cleanSpaces(text);
  if (value.length < 16) return false;
  if (!/\s/.test(value)) return false;
  if (!(/[.!?]/.test(value) || value.includes('___'))) return false;
  if (/^(subject|object|adverbs?|determiners?|pronouns?|conjunctions?)$/i.test(value)) return false;
  return true;
}

function resolveTargetSentence(question, plainPrompt) {
  if (question.targetSentence && isSentenceCueCandidate(question.targetSentence)) {
    return question.targetSentence;
  }
  const blocks = extractParagraphTextBlocks(question.stemHtml || '');
  const candidate = [...blocks].reverse().find(isSentenceCueCandidate);
  return candidate || null;
}
```

Acceptance examples that must pass:

| Template | Seed | Required result |
|---|---:|---|
| `identify_words_in_sentence` | 1 | `focusCue.targetText` is `Nina carefully and quietly packed the glass vase.`; read aloud does not say `Sentence: adverbs`. |
| `identify_words_in_sentence` | 7 | target sentence is `Luca laughed because Maya slipped and nearly dropped the map.` |
| `subject_object_choice` | 1 | target sentence is `The noisy gull stole the sandwich from Max.`; read aloud does not say `The sentence is: object.` |
| `subject_object_choice` | 2 | target sentence is `On Friday morning, our science club visited the museum.` |
| `subordinate_clause_choice` | 1 | target sentence remains visible and spoken. |
| `proc_semicolon_choice` | 1 | target sentence is the sentence with `___`, no double full stop. |

### U2 — Cue-kind-specific accessibility copy

Add cue-kind metadata so read aloud and screen reader copy match the prompt semantics.

Required serialised shape:

```ts
focusCue: {
  type: 'underline' | 'bold' | 'quoted-word' | 'target-sentence',
  targetKind: 'word' | 'noun-phrase' | 'sentence' | 'group' | 'pair',
  targetText: string,
  targetOccurrence: number
}
```

Required copy rules:

- `underlined word` → “The underlined word is: …”
- `underlined noun phrase` → “The underlined noun phrase is: …”
- `sentence below` → “The sentence is: …”
- Avoid double punctuation: never append `.` when `targetText` already ends in `.`, `!`, `?`, or `___` plus punctuation.

Acceptance examples:

- `qg_p4_voice_roles_transfer` seed 1 should read “The underlined noun phrase is: The trophy”, not “The underlined word is: The trophy”.
- `parenthesis_replace_choice` and `proc_semicolon_choice` must not produce `..` at the end of read-aloud text.

### U3 — Semantic prompt-cue audit that fails on current P10

Extend `scripts/audit-grammar-prompt-cues.mjs` or add `scripts/audit-grammar-prompt-cues-semantic.mjs`.

The audit must inspect all 78 templates × 30 seeds and fail if:

- `sentence below` prompt has no sentence-like target;
- `target-sentence` target is a grammar label rather than the actual sentence;
- screen-reader/read-aloud text contains `Sentence: subject`, `Sentence: object`, `Sentence: adverbs`, etc.;
- `underlined noun phrase` is announced as `word`;
- read-aloud text ends with duplicated punctuation;
- promptParts omit the sentence after sentence extraction;
- a dynamic audit checks zero applicable cases.

The current P10 snapshot should fail this new audit with findings for at least:

- `identify_words_in_sentence` — 30 seeds;
- `subject_object_choice` — 30 seeds;
- `qg_p4_voice_roles_transfer` — noun phrase announced as word;
- double full-stop cases in sentence-target read-aloud.

After U1/U2, the same audit must pass with zero S0/S1 failures.

### U4 — Render and read-aloud regression tests

Add explicit tests for the exact bug classes found in P10.

Required tests:

- `identify_words_in_sentence` seed 1 visible prompt includes the full sentence, screen reader names the full sentence, and read aloud names the full sentence.
- `subject_object_choice` seed 1/2 never use `subject` or `object` as target-sentence text.
- `qg_p4_voice_roles_transfer` uses `targetKind: noun-phrase` and speaks “noun phrase”.
- All sentence-target read-aloud strings avoid duplicated terminal punctuation.
- Existing p10 render tests must still fail if they exercise zero cases.

If JSDOM is required, the test dependency must be declared in `package.json` or the render-level test must be rewritten to avoid undeclared dependencies.

### U5 — Ambiguous selected-response review closure

The P10 distractor audit’s `ambiguousTemplates` and `requiresAdultReview` flags must become actionable evidence, not background data.

Deliverables:

- For each ambiguous template, add an adult-review decision section to the quality register.
- For each reviewed ambiguous template, include at least:
  - the exact ambiguous risk;
  - why the prompt disambiguates it;
  - one accepted example;
  - one rejected plausible alternative;
  - reviewer ID and date;
  - final status: `approved_with_review`, `approved_with_limitation`, `blocked`, or `retire_candidate`.
- Any `requiresAdultReview: true` item without linked review evidence blocks production certification.

Acceptance:

- `reports/grammar/grammar-qg-p10-distractor-audit.json` may still contain ambiguous concept areas, but every such row must link to review evidence or be blocked.
- Certification status map must be generated from quality-register decisions.

### U6 — Marking matrix truth and expansion decision

Resolve the marking matrix count mismatch.

Choose one of two options:

Option A: keep the current matrix window and report it honestly.

- Report `80 matrix entries`, seed range `1..5`, and total probes by category.
- Explain that “entries” means template-seed rows, not individual answer probes.

Option B: expand the matrix.

- Increase the seed window or categories and regenerate artefacts.
- Report the generated count exactly from metadata.

Either option is acceptable. The report must not claim a count not present in the artefact.

Acceptance:

- Report validator cross-checks marking-matrix `metadata.totalEntries` against report wording.
- Any mismatch fails CI.

### U7 — Production smoke and post-deploy certification

Run the production smoke after deployment and attach evidence for the exact release.

Required evidence path:

```text
reports/grammar/grammar-production-smoke-grammar-qg-p10-2026-04-29.json
```

Required fields:

```json
{
  "releaseId": "grammar-qg-p10-2026-04-29",
  "deployedUrl": "https://...",
  "timestamp": "...",
  "command": "npm run smoke:production:grammar -- --json --evidence-origin post-deploy",
  "learnerFixtureType": "...",
  "itemCreationResult": { "pass": true },
  "answerSubmissionResult": { "pass": true },
  "readModelUpdateResult": { "pass": true },
  "noAnswerLeakAssertion": { "pass": true },
  "promptCueAssertion": { "pass": true },
  "readAloudAssertion": { "pass": true },
  "failureDetails": null
}
```

Acceptance:

- `CERTIFIED_POST_DEPLOY` is forbidden unless this file exists, validates, and matches the release ID.
- If smoke is not run, the report must remain `CERTIFIED_PRE_DEPLOY` or `BLOCKED_PRE_DEPLOY`.

### U8 — Scheduler blocklist final guard

If any S0/S1 issue remains, block affected templates before any deployment.

Minimum affected-template policy if U1/U2 are not fixed immediately:

- Block `identify_words_in_sentence` and `subject_object_choice` for read-aloud/a11y mis-targeting.
- Optionally block `qg_p4_voice_roles_transfer` until noun-phrase copy is corrected.
- Do not mark the pool fully production-certified while blocks are active unless the report states the reduced denominator.

Acceptance:

- Scheduler excludes blocked templates in practice queue and mini-pack.
- Render inventory and certification manifest record the reduced active denominator if blocks are used.

### U9 — Final report as generated evidence, not prose

The P11 final report must be generated or validated from artefacts.

Required final report fields:

- exact release ID;
- exact implementation PRs;
- exact report commit;
- exact active template denominator;
- exact render inventory count;
- exact quality-register status counts;
- exact distractor audit counts, including ambiguous/review-required counts;
- exact marking-matrix metadata;
- exact smoke evidence status;
- exact list of blocked templates, if any;
- explicit no scoring/mastery/reward/Hero changes.

Acceptance:

A single command must validate the final report:

```bash
npm run verify:grammar-qg-production-release
```

This command must include:

- P6→P10 verify chain;
- semantic prompt-cue audit;
- evidence validator;
- marking matrix/report count validator;
- quality-register/status-map coherence;
- production smoke validator when decision is `CERTIFIED_POST_DEPLOY`.

## 7. Product acceptance checklist

P11 may be accepted only when all answers are “yes”.

| Question | Required answer |
|---|---|
| Does every visual cue point to the intended word/phrase/sentence? | Yes |
| Does read aloud speak the same target that the child sees? | Yes |
| Does screen-reader copy use the correct target kind: word, noun phrase, sentence? | Yes |
| Does every sentence-below prompt expose the actual sentence, not a grammar label? | Yes |
| Are selected-response distractors either unambiguous or explicitly reviewed? | Yes |
| Are constructed-response marking boundaries truthfully reported? | Yes |
| Do all evidence counts match committed artefacts? | Yes |
| Are all S0/S1 issues fixed or blocked? | Yes |
| Has live production smoke passed for the exact release? | Yes for post-deploy certification |
| Did scoring, mastery, Stars, Mega, Hero Mode and rewards remain unchanged? | Yes |

## 8. Recommended release path

1. Fix U0–U4 first. These are direct learner-surface and evidence-truth issues.
2. Close U5/U6 before certification wording is upgraded.
3. Run all local and CI gates.
4. Deploy.
5. Run U7 production smoke.
6. Publish P11 final report as `CERTIFIED_POST_DEPLOY` only if every gate passes.

If production smoke cannot be run in this phase, ship no stronger claim than `CERTIFIED_PRE_DEPLOY`, and keep the current affected templates blocked or documented.

## 9. Non-goals reminder

Do not touch Hero Coins, Hero Camp, Stars, Mega, Concordium, monster evolution, or reward projection in P11. Grammar QG production quality must stay subject-owned and evidence-led.
