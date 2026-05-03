# Punctuation QG P9 — Productionisation Truth Gate, Closed-Item Lockdown, and Release Evidence

**Date:** 30 April 2026  
**Phase type:** Production-readiness correction and truth-hardening plan  
**Status:** Proposed  
**Required before:** public production certification, depth-6 activation, or any claim that Punctuation QG is fully production-certified  
**Production depth:** Keep at 4  
**Primary evidence source:** uploaded lean ZIP `ks2-mastery-lean-04301326.zip`  
**Supplementary evidence:** exact GitHub `main` file reads for P8 report, verifier, and reviewer-decision fixture  
**Production evidence:** not proven unless a live smoke artefact with origin, timestamp, release ID, commit SHA, and pass/fail result is supplied

---

## Executive decision

P8 is a strong engineering phase, but it is not yet a clean production certification phase.

P8 materially improved the Punctuation question generator: wrong speech reporters are rejected, token-only transfer fragments are rejected, negative vectors exist, choice options are visible in the reviewer pack, and there is an AI multi-perspective decision fixture for the 192 depth-4 production items.

However, P8 still has production-blocking gaps:

1. Some closed questions still accept short added words, such as `today` or `in class`, even though the task is to fix or add punctuation to the given sentence.
2. Closed speech items can still accept extra lexical material outside the quoted speech/reporting clause.
3. The reviewer cluster decisions in the fixture do not align with the cluster IDs produced by the reviewer pack.
4. The report mixes AI pre-review, human QA wording, and production-certification wording too freely.
5. The canonical verifier command needs reproducibility hardening; leaf checks pass, but the full command must exit cleanly and visibly in the expected Node 22 environment.
6. The P8 report has stale counts and wording drift: negative vector count, test count, depth-readiness evidence count, and legacy decision-fallback wording need correction.

P9 is therefore not a feature expansion. P9 is the production truth gate: it must close the remaining marking gaps, align reviewer evidence with the real reviewer pack, and make the release evidence honest.

---

## Non-negotiable release posture

Until P9 passes:

- Do not raise `PRODUCTION_DEPTH` above 4.
- Do not call the 192-item fixture “human QA approved” unless a named human/product-owner review actually exists.
- Do not call the generator “production-certified”. Use “P8-hardened, awaiting P9 production certification”.
- Do not use depth-6 activation as the next phase. Depth 6 belongs after P9.
- Do not rely on long-tail extra-word examples only. Short tails are the current leak.

After P9 passes, the correct claim is:

> Punctuation QG is production-quality certified for the depth-4 item pool from source and local verification evidence. Live production remains separately proven only by a live smoke artefact.

---

## P9 acceptance summary

P9 is complete only when all of these are true:

1. `npm run verify:punctuation-qg:p9` exits `0` under Node 22 without hanging, hidden open handles, or a manual timeout.
2. All P8 regression protections still pass:
   - wrong speech reporter rejected;
   - missing speech reporter rejected;
   - token-only transfer fragments rejected;
   - existing model answers accepted;
   - fixed and generated negative vectors rejected through `markPunctuationAnswer()`.
3. Every closed `insert`, `fix`, and `combine` item rejects added lexical material unless an explicit item-level exception allows it.
4. Closed speech items reject extra words outside the required reporting clause and quoted speech.
5. The reviewer pack summary and decision fixture use the same cluster IDs.
6. Required cluster decisions are populated, non-blocking, and visible in `--summary` output.
7. AI review and human review are labelled separately in the decision fixture and completion report.
8. P8/P9 reports are updated so the counts match the source of truth.
9. Depth 6 remains blocked until all 50 candidate-only items have aligned item and cluster decisions.
10. Live production certification is not claimed without live deployment evidence.

---

## Observed P8 gaps that P9 must close

### Gap 1 — Closed preservation still allows short extra words

P8 fixed the earlier long-tail examples such as `in the cupboard`, but the preservation oracle still allows answers whose word count is up to two words longer than the expected preserved sentence.

That means closed repair/insert items can still pass with short additions, for example:

```text
lc_insert_supplies
Model: We needed pencils, rulers and glue.
Accepted by current P8: We needed pencils, rulers and glue today.
Accepted by current P8: We needed pencils, rulers and glue in class.

pa_insert_museum
Model: The museum, a former station, was busy.
Accepted by current P8: The museum, a former station, was busy today.
Accepted by current P8: The museum, a former station, was busy today now.
```

This breaks the learner contract. In a closed punctuation repair question, the child is not being asked to improve, extend, or rewrite the sentence. They are being asked to preserve the sentence and fix the punctuation.

### Gap 2 — Speech rubric can bypass closed preservation

Speech rubric marking checks quote shape, speech punctuation, reporting comma, reporting-clause words, and spoken-word preservation. That is useful, but it does not currently lock the whole closed sentence.

Examples that must be rejected in P9:

```text
sp_insert_question
Model: Ella asked, "Can we start now?"
Currently accepted: Ella asked, "Can we start now?" today.
Currently accepted: Ella asked, "Can we start now?" in the cupboard.

sp_fix_question
Model: "Where are we meeting?" asked Zara.
Currently accepted: "Where are we meeting?" asked Zara in class.
Currently accepted: "Where are we meeting?" asked Zara in the cupboard.
```

P8 correctly rejects changed reporters such as `Tom shouted`, but P9 must also reject extra lexical tails after the correct reporter.

### Gap 3 — Generated closed items need the same lockdown

The leak is not limited to the fixed bank. Generated closed templates in list commas, fronted adverbials, comma clarity, semicolons, dashes, hyphens, parenthesis, apostrophe possession, and speech also need exact preservation checks.

P9 must validate both fixed and generated item paths. A fixed-bank-only patch is not enough.

### Gap 4 — Reviewer cluster decisions are not aligned with the reviewer pack

The fixture contains cluster decisions, but the cluster IDs do not match the stable cluster IDs produced by the reviewer pack. As a result, the item gate can pass while the cluster review is effectively unreviewed.

P9 must decide one of two designs and implement it consistently:

- **Option A:** all reviewer-pack clusters are review-required, so the fixture must contain decisions for every generated stable cluster ID; or
- **Option B:** only selected clusters are review-required, so the pack must mark `reviewRequired: true | false`, and the cluster gate must check only the required cluster IDs.

Either way, the fixture and pack must speak the same ID language.

### Gap 5 — AI pre-review is not the same as human production QA

The current decision fixture is useful as AI pre-review evidence. It is not enough to claim human acceptance unless a named human or product owner actually reviewed and signed the decisions.

P9 must preserve this distinction in the schema, verifier, and completion report.

### Gap 6 — Canonical verifier reproducibility must be hardened

P8 leaf tests can pass, but the production verifier must be the evidence command. It should not be possible for the command to appear stuck because subtests retain open handles or because child-process output is hidden until all gates finish.

P9 must make the verifier boring, visible, and reproducible.

### Gap 7 — Report counts and wording drift must be corrected

The P8 report currently contains stale or inconsistent values. P9 should correct or append an audit addendum for:

- negative vector count;
- negative-vector test count;
- depth-6 evidence-check count;
- legacy decision-fallback wording;
- AI review versus human review wording;
- whether production QA is implemented, AI pre-reviewed, human-approved, or live-production-proven.

---

## P9 deliverables

### U1 — Exact closed-item preservation preflight

Add one shared preservation preflight that runs before validator/rubric-specific success can mark a closed item correct.

Scope:

- `insert` items with a source stem;
- `fix` items with a source stem;
- `combine` items with a source stem or known source sentences;
- closed speech items with fixed reporting clause/stem;
- generated items as well as fixed items.

Default policy:

```text
Closed punctuation item = punctuation may change, lexical words may not change.
```

Exceptions must be explicit, item-level, and rare. For example, `dc_fix_signal_team` can keep using explicit `preserveTokens` where the model intentionally removes a conjunction from the malformed stem. The exception must not reopen arbitrary extra words.

Suggested implementation shape:

```js
function isClosedPunctuationItem(item) {
  return ['insert', 'fix', 'combine'].includes(item.mode)
    && typeof item.stem === 'string'
    && item.stem.trim().length > 0
    && item.allowLexicalChange !== true;
}

function normaliseWordsForPreservation(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/[^a-z0-9'\-]+/gi, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function expectedPreservationWords(item) {
  if (Array.isArray(item.preserveTokens) && item.preserveTokens.length > 0) {
    return item.preserveTokens.map((token) => String(token).toLowerCase());
  }
  return derivePreserveTokens(item.stem || '')
    .map((token) => String(token).toLowerCase());
}

function evaluateExactClosedPreservation(answer, item) {
  const expected = expectedPreservationWords(item);
  if (expected.length === 0) {
    return { pass: true, reason: 'no_expected_words' };
  }

  const actual = normaliseWordsForPreservation(answer);

  if (actual.length !== expected.length) {
    return {
      pass: false,
      reason: actual.length > expected.length ? 'extra_words' : 'missing_words',
      expected,
      actual,
    };
  }

  for (let i = 0; i < expected.length; i += 1) {
    if (actual[i] !== expected[i]) {
      return {
        pass: false,
        reason: 'changed_or_reordered_words',
        index: i,
        expected,
        actual,
      };
    }
  }

  return { pass: true, expected, actual };
}
```

Important: do not keep a default `expectedCount + 2` tolerance for closed items. That tolerance is the leak.

### U2 — Speech outer-text lock

Speech needs both speech-specific checks and the closed preservation preflight.

For fixed speech insert/fix questions:

- preserve the required reporting-clause words;
- preserve the spoken words;
- reject extra words before the opening quote unless they are the required preposed reporting clause;
- reject extra words after the closing quote unless they are the required postposed reporting clause;
- reject extra words after the valid reporting clause;
- keep flexible transfer speech items flexible only when the item has no fixed source sentence or reporting clause.

Recommended path:

1. Run `evaluateExactClosedPreservation()` before allowing `evaluateSpeechRubric()` to make the item correct.
2. Keep `reporting_clause_words` as a distinct facet for actionable feedback.
3. Add a distinct misconception tag for speech extra-tail failures, for example `speech.extra_words_outside_reporting_clause`.

Child-facing feedback:

```text
Keep the reporting words from the question and do not add extra words.
```

### U3 — Negative vectors v2: short-tail and generated coverage

The negative vector pack must prove the exact leak is closed.

Add fixed-bank vectors for every relevant closed fixed item:

```json
{
  "itemId": "lc_insert_supplies",
  "failureType": "changed_content_short_tail",
  "answer": "We needed pencils, rulers and glue today.",
  "expectCorrect": false,
  "expectedMisconception": "content.changed_extra_words"
}
```

Required failure types:

- `changed_content_short_tail`;
- `changed_content_extra_phrase`;
- `speech_extra_tail`;
- `speech_extra_outer_words`;
- `generated_closed_extra_tail`.

The generated DSL should also contain rejection examples so generated families are protected without relying only on one seed.

P9 must prove these examples reject through production marking:

```text
lc_insert_supplies + today                     -> reject
lc_insert_supplies + in class                  -> reject
pa_insert_museum + today                       -> reject
pa_insert_museum + in class                    -> reject
sp_insert_question + today                     -> reject
sp_insert_question + in the cupboard           -> reject
sp_fix_question + in class                     -> reject
generated speech insert + in the cupboard      -> reject
generated list/semicolon/dash/hyphen/etc tail  -> reject
```

### U4 — Reviewer cluster-decision alignment

Fix the cluster gate so it proves what the reviewer pack actually shows.

Required implementation:

- `buildVarietyClusters(pool)` must produce the IDs that the fixture uses; or
- the fixture must be regenerated from `buildVarietyClusters(pool)`; and
- the verifier must call a real cluster gate against those IDs.

Suggested verifier check:

```js
const pool = buildProductionReviewPool();
const clusters = buildVarietyClusters(pool);
const requiredClusterIds = clusters
  .filter((cluster) => cluster.reviewRequired !== false)
  .map((cluster) => cluster.stableId);

const clusterGate = evaluateClusterGate(decisions, requiredClusterIds);
if (!clusterGate.pass) {
  throw new Error(`Cluster review incomplete: ${JSON.stringify(clusterGate.blockers.slice(0, 5))}`);
}
```

Reviewer summary acceptance:

```text
production items: 192
approved item decisions: 192
required clusters: > 0
approved required clusters: all
unreviewed required clusters: 0
blocked required clusters: 0
```

If the team wants only cross-mode clusters reviewed, then the reviewer pack must explicitly expose which clusters are cross-mode and review-required. Hidden assumptions are not acceptable for production QA.

### U5 — Review-authority truth model

Replace ambiguous review wording with explicit authority fields.

Recommended schema addition:

```json
{
  "_meta": {
    "schema_version": 3,
    "items_reviewed": 192,
    "ai_pre_review": {
      "status": "complete",
      "method": "multi-perspective teacher/engineer/parent simulation",
      "date": "2026-04-30"
    },
    "human_acceptance": {
      "status": "not_started",
      "reviewer": null,
      "role": null,
      "reviewedAt": null
    },
    "production_certification": {
      "status": "blocked_pending_human_acceptance_and_p9_gates"
    }
  }
}
```

The production gate can have two levels:

- `aiPreReviewGate`: useful, non-final;
- `humanProductionGate`: required for production certification.

Do not delete the AI review. It is useful. Just label it honestly.

### U6 — Verifier and CLI reproducibility hardening

Create `scripts/verify-punctuation-qg-p9.mjs`.

It must:

- check Node 22 before imports;
- stream progress per gate;
- run leaf tests in a mode that exits cleanly;
- fail on timeout with a clear gate name;
- include the real reviewer summary CLI as a gate;
- include exact short-tail adversarial probes as a gate;
- include the real cluster-decision gate;
- include report-count consistency checks.

Recommended command behaviour:

```text
npm run verify:punctuation-qg:p9
  ✓ P8 composed gates
  ✓ exact closed preservation probes
  ✓ speech outer-text probes
  ✓ fixed and generated negative vectors v2
  ✓ reviewer item decisions
  ✓ reviewer cluster decisions
  ✓ reviewer summary CLI exits cleanly
  ✓ review-authority truth labels
  ✓ report-count consistency
  ✓ depth-6 remains blocked
```

Avoid hidden-output child process execution for long gates. If a gate takes time, show which gate is running.

### U7 — Production evidence pack

Add a release evidence file only when the evidence really exists.

Suggested path:

```text
reports/punctuation/punctuation-qg-p9-production-evidence.json
```

Minimum schema:

```json
{
  "releaseId": "punctuation-r4-full-14-skill-structure",
  "commitSha": "...",
  "source": {
    "zipSha256": "...",
    "githubRef": "main",
    "verifiedPaths": []
  },
  "localVerification": {
    "node": "22.x",
    "command": "npm run verify:punctuation-qg:p9",
    "status": "pass",
    "completedAt": "..."
  },
  "liveProductionSmoke": {
    "status": "not_run",
    "environment": null,
    "origin": null,
    "completedAt": null,
    "result": null
  }
}
```

If live smoke is not run, the report must say so. Local production-quality verification and live production verification are different evidence layers.

### U8 — P8 report addendum and wording correction

Add an addendum to the P8 report or create a P9 audit note that corrects the source-of-truth drift.

Required corrections:

- Negative vectors are no longer 144 if the fixture contains more; use the actual count from the fixture.
- Negative-vector test count must match the test runner output.
- Depth-readiness evidence count must match `DEPTH_ACTIVATION_EVIDENCE.length`.
- If legacy decision fallback still exists, do not say legacy fallback was removed.
- If review decisions are AI-generated, say “AI pre-review”, not “human QA”.
- If the full verifier cannot be reproduced in the review environment, do not claim local reproduction.
- If no live deployed smoke was checked, do not claim live production proof.

---

## Exact regression probes required in P9

Add a dedicated adversarial test file:

```text
tests/punctuation-closed-preservation-productionisation.test.js
```

Minimum probes:

```js
const cases = [
  {
    itemId: 'lc_insert_supplies',
    bad: 'We needed pencils, rulers and glue today.',
  },
  {
    itemId: 'lc_insert_supplies',
    bad: 'We needed pencils, rulers and glue in class.',
  },
  {
    itemId: 'pa_insert_museum',
    bad: 'The museum, a former station, was busy today.',
  },
  {
    itemId: 'pa_fix_author',
    bad: 'The author, who won the prize, smiled in class.',
  },
  {
    itemId: 'sp_insert_question',
    bad: 'Ella asked, "Can we start now?" today.',
  },
  {
    itemId: 'sp_insert_question',
    bad: 'Ella asked, "Can we start now?" in the cupboard.',
  },
  {
    itemId: 'sp_fix_question',
    bad: '"Where are we meeting?" asked Zara in class.',
  },
];
```

For each case:

```js
const result = markPunctuationAnswer(item, bad);
assert.equal(result.correct, false);
assert.ok(
  result.misconceptions.includes('content.changed_extra_words')
  || result.misconceptions.includes('speech.extra_words_outside_reporting_clause')
  || result.feedback.some((message) => /changed|extra|do not add/i.test(message))
);
```

Generated coverage must sample every generated closed family at production depth and add at least one short tail. The test must fail if it inspects zero generated cases.

---

## Suggested marking-layer design

The cleanest design is a preflight inside `markPunctuationAnswer()` before any validator, exact-answer, or speech rubric can return correct.

```js
export function markPunctuationAnswer(item, answer) {
  const closedPreservation = shouldApplyClosedPreservation(item)
    ? evaluateExactClosedPreservation(answer, item)
    : { pass: true };

  if (!closedPreservation.pass) {
    return buildIncorrectResult({
      item,
      answer,
      facet: 'content_preservation',
      misconception: item.skill === 'speech_punctuation'
        ? 'speech.extra_words_outside_reporting_clause'
        : 'content.changed_extra_words',
      feedback: item.skill === 'speech_punctuation'
        ? 'Keep the reporting words from the question and do not add extra words.'
        : 'You changed the sentence — only add or fix the punctuation.',
      details: closedPreservation,
    });
  }

  // Existing validator / rubric / exact-answer marking follows here.
}
```

This keeps the rule simple: closed preservation is not a validator-specific behaviour; it is a contract of the item mode.

---

## P9 verifier gates

`npm run verify:punctuation-qg:p9` should contain these gates:

| Gate | Evidence |
|---|---|
| P8 composed verifier | Existing P8 gates still pass or are imported with fixed runner behaviour |
| Exact closed preservation | Short-tail probes reject for fixed and generated closed items |
| Speech outer-text lock | Correct reporter plus extra lexical tail rejects |
| Negative vectors v2 | Fixture includes and proves short-tail/generated failures |
| Reviewer item decisions | 192/192 depth-4 production item decisions are non-blocking |
| Reviewer cluster decisions | Required cluster IDs from actual reviewer pack are non-blocking |
| Reviewer summary CLI | `review:punctuation-questions --summary --json` exits cleanly and reports the same counts |
| Review-authority truth | AI pre-review and human acceptance are separately represented |
| Report consistency | Counts in report match source files/tests |
| Depth posture | depth 4 retained; depth 6 remains blocked until candidate review and deployment evidence exist |
| Production evidence boundary | local and live-production evidence are separately labelled |

---

## P10 should only start after P9

P10 should be depth-6 activation only if P9 is green.

P10 should then focus on:

1. reviewing the 50 depth-6 candidate-only items;
2. resolving candidate cluster decisions;
3. updating production depth and release ID;
4. proving deployment commit SHA and live smoke if claiming live production;
5. keeping the P9 preservation and review gates in the activation verifier.

If P9 is not complete, P10 must not become a depth-6 raise. It should remain blocked.

---

## Final P9 definition of done

P9 is done when the team can honestly say:

> The depth-4 Punctuation QG pool has exact closed-item preservation, speech reporting-clause integrity, meaningful transfer gating, fixed and generated negative-vector proof, aligned reviewer item and cluster decisions, reproducible Node 22 verification, and honest release evidence boundaries. Depth 6 remains a separate candidate-review decision.

That is the point where productionisation becomes defensible.
