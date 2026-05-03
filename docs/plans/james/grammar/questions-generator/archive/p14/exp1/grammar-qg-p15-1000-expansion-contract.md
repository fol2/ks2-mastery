# Grammar QG P15 — 1000+ Manual Bench Expansion and Anti-Repetition Contract

**Language:** UK English  
**Base release:** `grammar-qg-p14-2026-05-01`  
**Expansion pack:** `grammar-qg-p15-manual-expansion-1000.json`  
**Purpose:** add enough human-authored depth and variety that children stop feeling they are seeing the same Grammar questions.

## 1. Product judgement

P14 is production-certified for safety, release evidence and deployment smoke. It is not the end of content depth. P15 is a content-depth phase, not another certification-cleanup phase.

P15 must treat question variety as a learner-facing product requirement:

- a five-question smart-practice round must not repeat the same template unless the mode is explicitly retry/trouble/spaced-retrieval;
- a learner should not see the same learner-visible surface again within a short recent-history window;
- deep practice must be a distinct path from quick practice;
- Star/Mega pacing must be simulated after the expanded content lands;
- no added case enters production without review and oracle coverage.

## 2. Delivered draft pack

The draft expansion pack contains:

| Metric | Count |
|---|---:|
| Additional authored cases | 1,080 |
| New proposed template families | 90 |
| Concepts covered | 18 |
| Cases per concept | 60 |
| Unique learner-visible surfaces | 1,069 |
| Selected/fill/choice/explain/classify cases | 948 |
| Constructed text/textarea cases | 240 |

The pack is deliberately `draft_for_review_not_scheduler_ready`. It is a content input to the production pipeline, not a production artefact by itself.

## 3. Required import model

Add a new draft-only source file, for example:

```text
worker/src/subjects/grammar/manual-bench-p15.json
```

The importer must preserve:

- `caseId`
- `templateFamilyId`
- `conceptIds`
- `questionType`
- `inputType`
- `promptText`
- `options` and `rationale` where present
- `correctAnswer`
- `acceptedAnswers`
- `nearMisses`
- `feedbackLong`
- `depthTier`
- `status`

No case may be scheduled while `status !== 'approved_for_scheduler'`.

## 4. Promotion gate

A P15 case can move from draft to live only when all checks pass:

1. **Answerability:** a KS2 pupil can see all information needed to answer.
2. **Grammar logic:** the stated correct answer is the only defensible answer for the prompt.
3. **Distractors:** every selected-response distractor has a misconception rationale and is not also correct.
4. **Marking:** constructed-response accepted answers, near misses, empty/raw probes and smart-punctuation variants are tested.
5. **Cue/read-aloud:** prompt-cue, screen-reader and read-aloud surfaces match the intended target.
6. **Surface uniqueness:** no accidental duplicate learner-visible surface unless deliberately marked as spaced retrieval.
7. **Scheduler safety:** approved case belongs to an approved template family and concept.
8. **Quality register:** the template family has a review decision.
9. **Status map:** the template family appears in the certification status map.
10. **Production smoke:** after deployment, smoke evidence proves the expanded release ID.

## 5. Required release targets after integration

When the pack is integrated and promoted, the next content release should target at least:

| Measure | Current P14 | P15 target |
|---|---:|---:|
| Active template families | 110 | 160+ |
| Render inventory items over 30 seeds | 3,300 | 4,800+ |
| Unique learner-visible surfaces | 2,496 | 4,000+ |
| Low-diversity active families | 0 by P14 definition | Remain 0 |
| Same-template duplicates in normal 5-question sessions | 0 | Remain 0 |
| Newly added manual cases | — | 1,000+ |

## 6. Scheduler exposure contract

After P15 integration, scheduling must include these hard constraints:

- do not select the same `templateFamilyId` twice in one ordinary smart-practice round;
- do not select the same learner-visible surface again inside the recent exposure window;
- prefer concept variety in five-question rounds;
- allow repeats only when tagged as retry, trouble, spaced retrieval or post-miss repair;
- report duplicate-template count, duplicate-surface count and low-diversity exposure in telemetry.

## 7. Star and mastery pacing contract

Do not nerf Stars before improving depth. After P15 integration, run a Star-pacing simulation using the expanded pool:

- simulate quick practice, deep practice, retry, mini-test and trouble modes;
- verify shallow repeated cases cannot rapidly complete late-stage Star progress;
- verify deep/mixed/retained evidence is required for high-stage progress;
- verify children are not punished for needing retry or support;
- report time-to-Mega distribution before and after P15.

## 8. Production release contract

The P15 integrated release must not be called production-certified until it has:

- new content release ID;
- regenerated render inventory;
- regenerated quality register;
- regenerated distractor audit;
- regenerated marking matrix;
- regenerated certification status map;
- semantic prompt-cue audit over the new denominator;
- production release validator pass;
- live production smoke evidence for the new release.

## 9. Non-goals

P15 must not change:

- scoring rules,
- mastery formula,
- Stars/Mega thresholds,
- Hero Mode / Hero Coins,
- monster progression,
- reward projection.

Those systems can be reviewed after depth is improved. Changing reward pacing before fixing content variety would only stretch a shallow loop.
