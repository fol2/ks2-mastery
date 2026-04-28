# Punctuation Question Generator P3 — Generator DSL and Authoring Tools

Date: 28 April 2026  
Status: next-phase implementation instruction  
Subject: Punctuation  
Audience: engineering, content, QA, and product review

## 1. Current validated position

P1 and P2 have moved Punctuation from a small hand-authored bank into a governed deterministic question-generation system. P2 should now be treated as the baseline release shape:

| Area | Current P2 baseline |
|---|---:|
| Release id | `punctuation-r4-full-14-skill-structure` |
| Fixed items | 92 |
| Published generator families | 25 |
| Generated variants per family | 4 |
| Generated runtime items | 100 |
| Total runtime items | 192 |
| Published reward units | 14 |
| Generated duplicate signatures | 0 |

P2 completed the right governance work: the Punctuation content audit is now a PR gate, Star evidence is scoped to the active release, generated active-item metadata has an explicit transport/redaction policy, dash variants and Oxford-comma behaviour are tested, and production smoke checks the live Worker command path.

P3 must not treat this as permission to increase runtime volume. The next problem is authoring quality, not runtime quantity.

## 2. P3 goal

P3 should make deterministic question authoring faster, safer, and easier to review by introducing a small generator DSL and reviewer tooling.

The goal is:

> Authors should be able to create and review high-quality deterministic Punctuation templates where the prompt, learner-visible stem, model answer, validator, misconception tags, readiness tags, and golden tests are generated from one explicit teacher-authored specification.

P3 is successful when the system has stronger authoring machinery while the production learner-facing volume remains stable at `generatedPerFamily = 4`.

## 3. Non-negotiable product rules

1. Do not introduce runtime AI question generation.
2. Do not introduce browser-owned question generation.
3. Do not raise production `GENERATED_ITEMS_PER_FAMILY` above 4 in P3.
4. Do not change the 14 published reward-unit denominator in P3.
5. Do not make Stars easier to earn by adding more generated surfaces.
6. Do not expose template internals, validators, accepted answers, generator family ids, or raw generator payloads to learner, review, Parent Hub, or Admin evidence surfaces.
7. Keep generated `variantSignature` opaque and boring. It may exist only where the current active generated item needs it for submission/evidence binding.
8. Treat duplicate generated signatures as a hard failure.
9. Treat duplicate generated stems/models as review signals unless the team explicitly upgrades them to hard failures.
10. Preserve P1/P2 smoke and audit behaviour throughout the phase.

## 4. Main P3 scope

### P3-U1 — Define a minimal deterministic template DSL

Add a small DSL layer for Punctuation generator authoring. It may live in a new file such as:

```text
shared/punctuation/template-dsl.js
```

or as an equivalent module if the implementation team prefers a different internal layout.

A template definition should be explicit and boring. Suggested shape:

```js
{
  id: 'fronted_adverbial_combine_v1',
  version: 1,
  familyId: 'gen_fronted_adverbial_combine',
  mode: 'combine',
  skillIds: ['fronted_adverbial'],
  clusterId: 'comma_flow',
  rewardUnitId: 'fronted_adverbial',
  difficultyBand: 'y4-core',
  cognitiveDemand: 'constrained-transfer',
  readiness: ['constrained_transfer', 'misconception'],
  misconceptionTags: ['comma.fronted_adverbial_missing'],

  slots: {
    adverbial: ['After lunch', 'Before sunrise', 'Without warning'],
    mainClause: [
      'the class packed away the books',
      'the goalkeeper dived left'
    ]
  },

  build({ adverbial, mainClause }) {
    return {
      prompt: 'Combine the adverbial and main clause into one sentence.',
      stem: `${adverbial}\n${capitalise(mainClause)}.`,
      model: `${adverbial}, ${mainClause}.`,
      validator: {
        type: 'combineFrontedAdverbial',
        phrase: adverbial,
        mainClause,
      },
    };
  },

  tests: {
    accept: [
      'After lunch, the class packed away the books.',
    ],
    reject: [
      'After lunch the class packed away the books.',
      'After lunch. The class packed away the books.',
    ],
  },
}
```

The exact object shape can differ, but it must preserve these properties:

- one teacher-authored source of truth;
- model answer and validator built from the same slots;
- stable `templateId` and opaque `variantSignature` generation;
- explicit misconception and readiness metadata;
- golden accept/reject tests attached to the template;
- deterministic output for a given family, seed, and variant index.

### P3-U2 — Convert priority families first

Convert or wrap the following priority generator families first:

1. `gen_sentence_endings_insert`
2. `gen_apostrophe_contractions_fix`
3. `gen_comma_clarity_insert`
4. `gen_dash_clause_fix`
5. `gen_dash_clause_combine`
6. `gen_hyphen_insert`
7. `gen_semicolon_list_fix`

These were the right families to prioritise because they were previously thin, easy to over-repeat, or sensitive to marking policy.

For each converted family:

- preserve the first four production variants unless there is a deliberate, reviewed reason to change them;
- support at least eight audit-only variants with eight distinct generated signatures;
- keep all generated model answers passing the marking engine;
- keep validators and rubrics attached to generated items;
- document any learner-visible prompt/stem/model drift caused by the conversion.

### P3-U3 — Add golden accept/reject tests per template

Every DSL-backed template must ship with golden marking tests.

For each template, include at least:

- the canonical model answer;
- one common misconception answer that must fail;
- one legitimate alternate form that should pass, where the marking policy allows alternatives;
- one false-positive guard that should fail even if it contains the target punctuation mark.

Examples of required coverage:

- dash-clause templates must accept spaced hyphen, en dash, and em dash where the prompt is about using a dash;
- list-comma templates must respect the current Oxford-comma policy;
- direct-speech templates must handle straight and curly quotation marks;
- apostrophe templates must handle straight and curly apostrophes;
- semicolon-list templates must reject simple comma-only lists when semicolons are required;
- hyphen templates must distinguish ambiguity-resolving hyphens from decorative punctuation.

### P3-U4 — Add an author preview tool

Create a reviewer-facing CLI that renders generated variants without requiring a learner session.

Suggested command:

```bash
npm run preview:punctuation-templates -- --family gen_dash_clause_combine --variants 8
```

Acceptable equivalent command names are fine, but the output should be easy for a teacher/content reviewer to read.

The preview should show, per generated variant:

- item id;
- family id;
- template id;
- variant signature;
- mode;
- skill ids;
- cluster id;
- prompt;
- stem;
- model answer;
- validator type;
- rubric type, if present;
- misconception tags;
- readiness tags;
- golden accept/reject test results.

A `--json` option should also be available for tooling and CI diffs.

### P3-U5 — Improve audit output for human review

Keep the existing strict audit gate. Add an optional reviewer mode that gives clearer content signals.

Suggested command:

```bash
npm run audit:punctuation-content -- --strict --generated-per-family 4 --reviewer-report
```

The reviewer report should include:

- top duplicate generated stems;
- top duplicate generated models;
- per-family spare capacity at `generatedPerFamily = 8`;
- per-skill mode coverage;
- per-skill validator/rubric coverage;
- per-family template count;
- per-family signature count;
- generated model-answer marking failures;
- templates missing accept/reject tests;
- templates with no legitimate alternate-answer test where alternates are expected;
- families still using legacy non-DSL templates.

Duplicate signatures remain a hard fail. Duplicate stems and models should remain review signals in P3 unless the team explicitly chooses to upgrade selected duplicate classes to hard failures.

### P3-U6 — Decide the context-pack policy

P2 leaves context-pack machinery in place but not child-facing by default. P3 must make an explicit decision:

- keep context packs teacher/admin-only for now; or
- allow a very narrow post-feedback learner surface; or
- postpone productisation entirely.

The recommended P3 default is teacher/admin-only.

If context packs are expanded in P3, they must be converted into deterministic, teacher-reviewed slot pools. AI output must not become a learner-facing question directly. Context-pack atoms should be sanitised, reviewed, and then compiled into deterministic template inputs.

### P3-U7 — Resolve the redaction-contract wording

There is a small but important contract-cleanup task from P2.

The current documentation says the recursive forbidden-key scan throws in test and emits a structured warning plus strips the field in production. The current Worker path appears to enforce the guard by throwing when forbidden read-model keys are present, except for the explicit active generated `variantSignature` allowance.

P3 should decide the intended behaviour and make code and documentation match.

Recommended decision:

- fail closed in all environments for default subject read-model generation;
- keep production smoke responsible for catching deployed leakage;
- remove wording that implies production silently strips forbidden fields unless that behaviour is actually implemented and tested.

### P3-U8 — Update docs and handover materials

Update the relevant docs so future contributors do not bypass the DSL.

At minimum, update or add:

- Punctuation production documentation;
- generator authoring documentation;
- audit command documentation;
- preview-tool documentation;
- P3 completion report template.

The docs should explain:

- why runtime AI generation is not used;
- how a teacher-authored DSL template is built;
- how model answers and validators stay aligned;
- how generated signatures are used;
- how to run preview and audit tools;
- how to add a new template safely;
- what must never be exposed to the browser.

## 5. Out of scope for P3

Do not do these in P3:

- increase production `generatedPerFamily` above 4;
- chase the final 280–420 mature portfolio target;
- redesign the child-facing Punctuation UI;
- change the 100-Star reward semantics;
- add Hero Mode coupling;
- add runtime AI question generation;
- add a broad scheduler rewrite;
- treat more questions as automatically better learning;
- publish context-pack-generated child questions without a separate product review.

## 6. Acceptance criteria

P3 is complete only when all of the following are true:

1. Production `GENERATED_ITEMS_PER_FAMILY` remains 4.
2. Runtime item count remains 192 unless a separate, reviewed fixed-anchor PR intentionally changes it.
3. Published reward units remain 14.
4. At least the seven priority families are DSL-backed or DSL-wrapped.
5. Each converted priority family supports eight audit-only variants with eight distinct signatures.
6. Each converted priority family has golden accept/reject tests.
7. Generated model answers still pass the marking engine.
8. The strict content audit still passes at `generatedPerFamily = 4`.
9. Capacity-mode audit for converted priority families passes at `generatedPerFamily = 8`.
10. Existing P2 production smoke still passes.
11. No learner/review/adult evidence surface exposes forbidden generated metadata.
12. Documentation and implementation agree on redaction behaviour.
13. The P3 completion report lists any prompt/stem/model drift caused by DSL conversion.

## 7. Suggested verification commands

Use the current repository command names where possible. Add the preview command and any new test targets as part of P3.

```bash
npm run audit:punctuation-content -- --strict --generated-per-family 4

npm run audit:punctuation-content -- --strict --generated-per-family 8 \
  --min-generated-by-family gen_sentence_endings_insert=8,gen_apostrophe_contractions_fix=8,gen_comma_clarity_insert=8,gen_dash_clause_fix=8,gen_dash_clause_combine=8,gen_hyphen_insert=8,gen_semicolon_list_fix=8 \
  --min-templates-by-family gen_sentence_endings_insert=8,gen_apostrophe_contractions_fix=8,gen_comma_clarity_insert=8,gen_dash_clause_fix=8,gen_dash_clause_combine=8,gen_hyphen_insert=8,gen_semicolon_list_fix=8 \
  --min-signatures-by-family gen_sentence_endings_insert=8,gen_apostrophe_contractions_fix=8,gen_comma_clarity_insert=8,gen_dash_clause_fix=8,gen_dash_clause_combine=8,gen_hyphen_insert=8,gen_semicolon_list_fix=8

npm run preview:punctuation-templates -- --family gen_dash_clause_combine --variants 8
npm run preview:punctuation-templates -- --family gen_dash_clause_combine --variants 8 --json

node --test tests/punctuation-generators.test.js
node --test tests/punctuation-content-audit.test.js
node --test tests/punctuation-marking.test.js
node --test tests/punctuation-read-models.test.js
node --test tests/punctuation-release-smoke.test.js

npm test
npm run check
npm run smoke:production:punctuation
```

If command names differ after implementation, the P3 completion report must list the actual commands run.

## 8. Risks to manage

### Risk: DSL churn changes learner-visible items accidentally

Mitigation: preserve the first four production variants for converted families where possible. If drift is intentional, list every changed prompt/stem/model in the completion report.

### Risk: the DSL becomes too abstract

Mitigation: keep the first DSL minimal. It should reduce authoring mistakes, not become a general language.

### Risk: golden tests are too shallow

Mitigation: require accept and reject examples per template. Test both the model answer and common misconceptions.

### Risk: context-pack work quietly becomes AI-generated questions

Mitigation: keep context packs teacher/admin-only unless a separate product decision changes that. AI output may suggest context, but learner questions must come from deterministic, reviewed templates.

### Risk: duplicate stems/models are ignored because signatures are clean

Mitigation: keep duplicate signatures as the hard gate, but improve reviewer reporting for duplicate stems and models. Repetition is a learning-quality problem even when the identity system is technically correct.

### Risk: reward inflation through more surfaces

Mitigation: P3 must not change production generated volume or Star semantics. Evidence/scheduler maturity belongs in P4.

## 9. Required P3 completion report contents

The P3 completion report should include:

- final runtime counts;
- final generated-per-family value;
- final published reward-unit count;
- list of converted DSL families;
- per-family template/signature counts at production depth 4;
- per-family template/signature counts at audit-only depth 8 for converted families;
- generated duplicate signature count;
- generated duplicate stem/model review summary;
- golden accept/reject test summary;
- redaction-contract decision and evidence;
- context-pack policy decision;
- preview-tool examples;
- commands run;
- residual risks;
- explicit recommendation on whether P4 should start.

## 10. Expected phases after P3

After P3, expect two main Punctuation QG phases before the content system should be considered mature.

### P4 — Evidence and scheduler maturity

P4 should prove children are transferring punctuation skill, not merely seeing more surfaces.

Likely focus:

- spaced-return requirements by skill;
- varied-evidence requirements before deep secure;
- sibling-template retry after misconception;
- per-signature exposure limits;
- generated-repeat-rate telemetry;
- weak-skill recovery analytics;
- retention-after-secure checks.

### P5 — Mature content portfolio and monitoring

P5 should decide whether the production generated volume can safely rise above 4.

Likely prerequisites:

- most generator families have 8–12 genuinely distinct templates or slot combinations;
- duplicate stems/models are reduced or explicitly justified;
- fixed anchors remain healthy across reward units;
- monitoring can show generated-repeat rate, marking failures, Star inflation risk, and family coverage;
- a go/no-go checklist exists for larger generated volume.

A P6 should only be needed if Punctuation QG becomes part of a wider cross-subject authoring framework or Hero Mode orchestration contract. It should not be assumed necessary for the Punctuation generator itself.

## 11. Bottom line

P2 made deterministic generation governable. P3 should make deterministic generation authorable.

Do not make the bank bigger yet. Make it easier to write, review, test, and safely expand.
