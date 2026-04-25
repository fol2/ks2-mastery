I audited the punctuation plans, James’s punctuation audit notes, the current shared/Worker/React implementation, and the release smoke/test surfaces. My read is: **Punctuation is no longer just a prototype or placeholder, but the repo is overclaiming completeness in a few places.** The implementation has a real service, Worker command path, redacted read models, React surface, generated/fixed item support, and tests. But several details from the plans are either missing, thin, or flawed enough that I would not call the subject “perfected” yet.

The repo README itself warns that Grammar and Punctuation have crossed the production boundary but are not yet finished as full-subject product layers, and that production should use the Worker/auth/API route rather than browser-local prototype paths. ([GitHub][1]) The punctuation production plan also set very specific rules: writing-skill practice, a full 14-skill map, Smart Review rhythm, repeated clean evidence before mastery, deterministic marking, misconception tags, safe redaction, session-state handling, and no browser-local production engine. ([GitHub][2]) The later legacy-parity plan says the current production release is real and covers the 14 skill IDs, but also admits the missing feature areas: guided learn, sentence combining/rewrite, paragraph repair, weak-spots drill, true GPS test, richer transfer, AI context pack, and analytics. ([GitHub][3])

Here is the practical audit.

## Highest-risk flaws to fix first

**1. The product copy and docs overclaim “full 14-skill” readiness.**
The current production docs declare release `punctuation-r4-full-14-skill-structure` and say the Punctuation subject is “full legacy HTML learner-facing parity”. ([GitHub][4]) The React setup surface also falls back to the line “This Punctuation release covers all 14 KS2 punctuation skills” when no published scope copy is present. ([GitHub][5]) That is too strong unless the parity matrix and release smoke prove guided, weak, GPS, combine, paragraph, transfer, AI-context, analytics, redaction, and reward behaviour end to end. The plan explicitly said not to claim complete KS2 Punctuation mastery in the first slice. ([GitHub][2])

Fix: change the default learner-facing copy to something honest, for example: “Punctuation covers the 14-skill progression, with production practice currently strongest in Smart Review, guided focus, GPS-style review, combining, paragraph repair, and transfer tasks.” Then only switch to “complete” after the parity smoke matrix passes.

**2. Client/adult analytics appear to count published reward units as secured reward units.**
In the client read model, `securedRewardUnits` is set to `publishedRewardUnits.length`, and the overview does the same. ([GitHub][6]) That means a learner can appear to have secured all available reward units simply because the units exist in the published release, not because the learner has demonstrated repeated clean evidence. This directly conflicts with the mastery rule in the plans: one correct answer must not secure a unit, and repeated clean evidence with spacing is required. ([GitHub][2])

Fix: compute secured units from reward-unit state, not publication state. Something like: `securedRewardUnits = rewardUnits.filter(u => u.status === 'secured' || u.securedAt).length`. Also add tests for a brand-new learner: 14 published units, 0 secured units, 0% mastery.

**3. The summary read-model redaction is weaker than the active-item redaction.**
The Worker read model has a strong forbidden-field check for active items, blocking fields such as accepted answers, correct indexes, rubrics, validators, seeds, generators, hidden queues, and unpublished content. But `safeSummary(summary)` currently returns a cloned serialisable summary. ([GitHub][7]) That is a future leak waiting to happen, especially because GPS summary/review needs to show corrections after the session but must still avoid answer-bank or validator leakage. The plan explicitly says read-model tests should fail if accepted answers, solutions, generators, or hidden queues leak. ([GitHub][2])

Fix: make summary redaction allowlist-based, not clone-based. Add a recursive forbidden-key scan across active item, feedback, summary, GPS review, Parent/Admin fixtures, and AI context pack outputs.

**4. Guided skill selection is lost in the local module path.**
The React surface passes a `skillId` when starting guided learning, and the Worker command action also includes `skillId`. ([GitHub][5]) But the local module handler only passes `mode` and `roundLength` into `service.startSession`; it omits `data.skillId`. ([GitHub][8]) Even if production should use Worker commands, this creates inconsistent behaviour in local preview/tests and makes debugging guided mode misleading.

Fix: pass `skillId` through the module fallback as well, and add one test: guided start with `skillId: "speech_direct"` must produce a speech-focused guided session in both Worker and local service paths.

**5. The React active-item controls do not appear to implement pending/read-only disabling properly.**
The plan calls out duplicate clicks, pending commands, read-only degradation, and disabled controls as required behaviours. ([GitHub][2]) The current React active item renders choice/text inputs with `disabled={false}`. ([GitHub][5]) That means double-submit, late-submit, and degraded-state bugs are more likely.

Fix: introduce a small UI state machine: `idle`, `submitting`, `feedback`, `summary`, `readOnly`, `degraded`. Disable answer controls during pending submit, after summary, and when the read model says commands are unavailable.

## Missing or thin features against the punctuation plans

**6. The release smoke is too narrow for the parity claim.**
The current production smoke checks default gating, one Smart Review round, one GPS round, Parent/Admin evidence redaction, and spelling smoke. ([GitHub][9]) That is useful, but it does not prove guided learn, weak-spots drill, combine/rewrite, paragraph repair, transfer validators, AI context-pack safety, or analytics correctness. The parity plan specifically calls for these as units U2 through U10. ([GitHub][3])

Fix: expand release smoke to a matrix, not a single happy path. At minimum: Smart Review, Guided Speech, Weak Spots with seeded weak evidence, Sentence Combine, Paragraph Repair, GPS delayed feedback, Transfer validation, AI context pack redaction, Parent/Admin analytics, and disabled/degraded command behaviour.

**7. The “legacy parity” test is more descriptive than behavioural.**
The legacy parity test checks statuses from a parity report/fixture, but that alone can pass even if the learner-facing behaviour is incomplete. ([GitHub][10]) James’s audit says the legacy HTML had a full skill map, item bank, generators, adaptive selection, spaced review, guided learn, GPS mode, local learner profile, AI context pack, keyboard support, and analytics, but also warned not to drop the legacy file directly into production. ([GitHub][11]) So parity should be proven by behaviour, not by “ported/replaced/rejected” labels.

Fix: keep the parity report, but add golden behavioural tests that actually start sessions and complete items for each legacy job type: choose, insert, fix, combine, paragraph, transfer, guided, weak, GPS.

**8. Focus-mode discoverability is incomplete.**
The service contract supports modes including `smart`, `guided`, `weak`, `gps`, `endmarks`, `apostrophe`, `speech`, `comma_flow`, `boundary`, and `structure`. ([GitHub][12]) The React setup gives buttons for Guided, Weak Spots, GPS, Speech, Comma, Boundary, and Structure, but not direct Endmarks or Apostrophe buttons. ([GitHub][5]) The first production slice was originally based around Endmarks, Apostrophe, and Speech, so this is a strange omission. ([GitHub][2])

Fix: add a proper “Focus practice” section with all six clusters: End marks, Apostrophes, Speech punctuation, Commas and flow, Sentence boundaries, and Structural punctuation. Keep the skill selector for exact 14-skill guided work.

**9. AI context pack exists in the architecture but is not productised in the visible React surface.**
The Worker and shared directories include AI/context-pack-related surfaces, and the parity plan says AI enrichment should be server-side only and never authoritative. ([GitHub][13]) But the visible practice surface does not obviously expose a safe “teacher context pack” or explain when AI enrichment is unavailable. ([GitHub][5])

Fix: decide whether AI context pack is teacher/admin only or learner-facing. If teacher/admin only, document that in the production docs and hide it from learner copy. If learner-facing, add a controlled button after feedback only, with server-side command, redacted atoms, and no accepted answer bank.

**10. The production docs contain a mastery-key detail that looks malformed.**
The production docs mention the stable mastery key as `punctuation:::`. ([GitHub][4]) That looks like a placeholder rather than the real stable key format. For reward and analytics debugging, that matters.

Fix: document the actual key format, for example: `punctuation:<releaseId>:<clusterId>:<rewardUnitId>`, and add a fixture that proves old release evidence migrates or remains readable.

**11. Local/browser service boundaries need another hard check.**
The plan says the production bundle must not import the raw punctuation service, marking, scheduler, or repository. ([GitHub][2]) There is a client-side `src/subjects/punctuation/service.js` that re-exports the shared punctuation service. ([GitHub][14]) That may be intended for local/dev only, but it deserves a bundling assertion because the repo also says production should use Worker-backed APIs, not browser-local `?local=1`. ([GitHub][1])

Fix: add a production bundle audit that fails if `shared/punctuation/service`, `marking`, `scheduler`, `repository`, `generators`, or raw accepted answer data are included in the learner bundle.

## Execution plan to finalise Punctuation

### Phase 1: correctness blockers

Start here. These are not polish; they affect trust.

First, fix the analytics/reward projection bug. Change secured-unit counting to use actual secured evidence, not published-unit count. Add tests for: brand-new learner, one correct answer, one guided-supported answer, repeated spaced clean evidence, and weak evidence decay. The acceptance rule should be: 14 published units does not mean 14 secured units.

Second, harden redaction. Replace `safeSummary(summary)` clone behaviour with explicit summary allowlists. Add a recursive `assertNoForbiddenFields()` over active item, feedback, summary, GPS review, Parent/Admin read models, and AI context-pack output. The forbidden list should include accepted answers, correct indexes, validators, rubrics if not phase-safe, seeds, generators, hidden queues, unpublished content, and raw solution banks.

Third, repair guided `skillId` routing in the local module path. Worker and local fallback must behave the same. Add a parity test that starts guided mode for an exact skill and verifies the item/reward unit matches that skill.

Fourth, implement pending/read-only UI states. Answer controls must disable while submitting, after final feedback, in GPS summary, in read-only/degraded mode, and while a command is already in flight. This will stop double-submits and strange duplicate event logs.

### Phase 2: prove parity behaviour, not parity labels

Create a `punctuation-production-parity-smoke.test` that starts and completes one representative session for each required learner mode.

The minimum matrix should be:

Smart Review: one independent item, deterministic marking, reward event, no hidden answer leak.

Guided Learn: one guided item with support; support helps learning but does not secure full mastery alone.

Weak Spots: seed weak evidence, start weak mode, verify it selects the weak unit first.

Endmarks focus: direct mode works and maps to the right reward units.

Apostrophe focus: direct mode works and maps to the right reward units.

Speech focus: accepts strict UK direct speech punctuation variants.

Comma/flow focus: list commas, fronted adverbials, subordinate clauses, and clarity cases route correctly.

Boundary focus: sentence boundary and comma splice repair cases work.

Structure focus: colon, semicolon, dash, parentheses, bullet/list punctuation cases work.

Sentence Combine: validates meaning preservation and punctuation quality.

Paragraph Repair: validates multiple facets and gives partial feedback.

GPS Test: no feedback until summary; review is safe and useful.

Transfer: validates rewrite/free-text answers without exact-match brittleness.

AI context pack: server command only, no raw accepted answers, no client API key, safe when disabled.

Parent/Admin analytics: no hidden answers, correct secured count, correct weak units.

This is the difference between “it has files” and “it is finished.”

### Phase 3: finish the learner UX

Rework the setup screen into three clear groups.

The first group should be “Recommended”: Smart Review, Guided Learn, Weak Spots, GPS Test.

The second group should be “Focus practice”: End marks, Apostrophes, Speech punctuation, Commas and flow, Sentence boundaries, Structural punctuation.

The third group should be “Advanced writing tasks”: Sentence combining, Paragraph repair, Transfer/rewrite practice.

Each mode needs a one-line honest description. Also add a safe “Why this question?” line after item start, such as “Chosen because speech punctuation is due for review” or “Chosen because comma placement was weak recently.” Do not expose hidden scheduler data.

Feedback should show three layers: result, misconception/facet, next action. For example: “Correct punctuation, but the reporting clause comma is missing. Try one more direct speech item later.” This aligns with the plan’s requirement that misconceptions are first-class data and that one correct answer does not equal mastery.

### Phase 4: finish Parent/Admin and Codex polish

Parent/Admin should show:

Actual secured units / published units.

Weakest three punctuation skills.

Recent misconception/facet patterns.

Evidence type: independent, guided, GPS, transfer, paragraph.

Whether practice is production Worker-backed or local/dev.

Release gate status.

The Punctuation Codex or subject map should show the 14 skills, grouped by cluster, with stable mastery keys and examples. It should not imply a monster/reward is secured until the scheduler says the unit is secured.

### Phase 5: release gate

Do not flip the public gate just because the docs say “full parity”. Use this release checklist:

`PUNCTUATION_SUBJECT_ENABLED=0` blocks learner access but allows internal smoke.

All parity smoke paths pass.

Production bundle audit confirms no raw service/marking/scheduler/answer-bank imports.

Redaction scan passes across active, feedback, summary, GPS, Parent/Admin, and AI context pack.

Brand-new learner shows 0 secured units.

Guided-supported success does not secure a reward unit alone.

GPS gives no feedback until summary.

Duplicate submit creates one event, not two.

Copy no longer overclaims completion.

Only after those pass should the release note say “Punctuation full 14-skill production release.”

## Suggested file-level task list

Make these changes first:

`src/subjects/punctuation/read-model.js`
Fix `securedRewardUnits`, `hasEvidence`, and any overview progress values that currently mirror published units rather than demonstrated mastery. Add zero-state and partial-evidence tests.

`worker/src/subjects/punctuation/read-models.js`
Replace clone-based `safeSummary` with allowlisted summary fields plus recursive forbidden-field assertion.

`src/subjects/punctuation/module.js`
Pass `skillId` into local `service.startSession()` for guided/focus paths.

`src/subjects/punctuation/components/PunctuationPracticeSurface.jsx`
Add pending/read-only disabled states; add Endmarks and Apostrophe focus buttons; improve setup grouping; show safe scope copy from content instead of hardcoded “full 14” fallback.

`tests/punctuation-production-release-smoke.test.js`
Expand from smart + GPS to the full parity matrix.

`tests/punctuation-legacy-parity.test.js`
Keep the report check, but add behavioural golden paths for choose, insert, fix, combine, paragraph, transfer, guided, weak, and GPS.

`docs/punctuation-production.md`
Downgrade overclaiming copy until the expanded smoke passes; fix the mastery key example; explain which legacy behaviours are ported, replaced, rejected, or still gated.

My blunt recommendation: **treat Punctuation as “production-capable but not production-perfect.”** The biggest danger is not lack of code; it is false confidence from “14-skill/full parity” wording while analytics, redaction, guided routing, and smoke coverage still have holes.

[1]: https://github.com/fol2/ks2-mastery "GitHub - fol2/ks2-mastery: KS2 Unified — browser-side React prototype of a KS2 (UK Year 5/6) study app · GitHub"
[2]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/docs/plans/2026-04-24-001-feat-punctuation-production-subject-plan.md "raw.githubusercontent.com"
[3]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/docs/plans/2026-04-24-002-feat-punctuation-legacy-parity-plan.md "raw.githubusercontent.com"
[4]: https://raw.githubusercontent.com/fol2/ks2-mastery/refs/heads/main/docs/punctuation-production.md "raw.githubusercontent.com"
[5]: https://raw.githubusercontent.com/fol2/ks2-mastery/refs/heads/main/src/subjects/punctuation/components/PunctuationPracticeSurface.jsx "raw.githubusercontent.com"
[6]: https://raw.githubusercontent.com/fol2/ks2-mastery/refs/heads/main/src/subjects/punctuation/read-model.js "raw.githubusercontent.com"
[7]: https://raw.githubusercontent.com/fol2/ks2-mastery/refs/heads/main/worker/src/subjects/punctuation/read-models.js "raw.githubusercontent.com"
[8]: https://raw.githubusercontent.com/fol2/ks2-mastery/refs/heads/main/src/subjects/punctuation/module.js "raw.githubusercontent.com"
[9]: https://raw.githubusercontent.com/fol2/ks2-mastery/refs/heads/main/tests/punctuation-release-smoke.test.js "raw.githubusercontent.com"
[10]: https://raw.githubusercontent.com/fol2/ks2-mastery/refs/heads/main/tests/punctuation-legacy-parity.test.js "raw.githubusercontent.com"
[11]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/docs/plans/james/punctuation/ks2_punctuation_engine_audit_report_zh-HK.md "raw.githubusercontent.com"
[12]: https://raw.githubusercontent.com/fol2/ks2-mastery/refs/heads/main/src/subjects/punctuation/service-contract.js "raw.githubusercontent.com"
[13]: https://github.com/fol2/ks2-mastery/tree/main/worker/src/subjects/punctuation "ks2-mastery/worker/src/subjects/punctuation at main · fol2/ks2-mastery · GitHub"
[14]: https://raw.githubusercontent.com/fol2/ks2-mastery/refs/heads/main/src/subjects/punctuation/service.js "raw.githubusercontent.com"

----

Yes — this **does need a plan/update**, but it is a focused update, not a rewrite of the whole Punctuation learning plan.

The 14-skill Punctuation learning scope can stay. What must change is the **reward/monster projection layer**, docs, fixtures, and tests. Right now the repo still describes and implements Punctuation as seven active Bellstorm Coast creatures: Endmarks → Pealark, Apostrophe → Claspin, Speech → Quoral, Comma/Flow → Curlune, Structure → Colisk, Boundary → Hyphang, and aggregate → Carillon. The production doc says exactly that old mapping. ([GitHub][1]) The current `MONSTERS_BY_SUBJECT.punctuation` also still includes all seven names, and `quoral` is currently configured like a direct Speech monster while `carillon` is configured as the aggregate/grand monster. ([GitHub][2]) The current shared mastery constant also has `PUNCTUATION_GRAND_MONSTER_ID = 'carillon'`, so this is not just copy; it affects actual reward projection. ([GitHub][3])

My recommendation: **do not change the 14 skills, the six learning clusters, or the focus practice modes.** Keep `endmarks`, `apostrophe`, `speech`, `comma_flow`, `boundary`, and `structure` as internal learning clusters because they are useful for scheduling, analytics, guided practice, GPS, weak spots, and focused sessions. Only collapse the **monster reward mapping** down to 3 direct monsters + 1 grand monster.

The clean target model should be:

```txt
Active Punctuation monsters:
- pealark
- curlune
- claspin
- quoral

Grand Punctuation monster:
- quoral

Reserved future monsters:
- colisk
- hyphang
- carillon
```

To avoid ambiguity, I would define the production reward mapping like this:

```txt
Pealark:
- sentence-endings-core
- speech-core
- semicolons-core
- dash-clauses-core
- hyphens-core

Curlune:
- list-commas-core
- fronted-adverbials-core
- comma-clarity-core
- parenthesis-core
- colons-core
- semicolon-lists-core
- bullet-points-core

Claspin:
- apostrophe-contractions-core
- apostrophe-possession-core

Quoral, grand:
- all 14 published reward units
```

That gives Pealark the sentence-boundary and voice family, Curlune the flow/structure family, Claspin the apostrophe family, and Quoral the full-release grand progression.

The important implementation warning is this: **Quoral is currently a direct Speech monster in the repo.** If we simply change `PUNCTUATION_GRAND_MONSTER_ID` to `quoral` without migration/normalisation, old Quoral state may still have `publishedTotal: 1`, which could make grand progress display wrongly. So the update needs a small compatibility step, not just a constant change.

## Plan update needed

Add a new plan note or patch section called something like:

```txt
Punctuation monster roster reduction: 3 direct + 1 grand
```

It should state:

```txt
Decision:
Punctuation now uses three active direct monsters plus one grand monster:
Pealark, Curlune, Claspin, and grand Quoral.

Reserved for future Punctuation expansions:
Colisk, Hyphang, Carillon.

Learning scope remains 14 published skills and 14 reward units.
Learning clusters remain available for scheduling and analytics.
Only reward projection and Codex presentation are collapsed.
```

## Code changes to make

First, update `src/platform/game/monsters.js`.

Keep all seven monster definitions in `MONSTERS`, because the visual config plan deliberately covers every monster asset folder, including dormant or not-yet-active monsters. ([GitHub][4]) But change the active subject list:

```js
export const MONSTERS_BY_SUBJECT = {
  spelling: ['inklet', 'glimmerbug', 'phaeton', 'vellhorn'],
  punctuation: ['pealark', 'curlune', 'claspin', 'quoral'],
  punctuationReserve: ['colisk', 'hyphang', 'carillon'],
  grammar: ['bracehart', 'glossbloom', 'loomrill', 'chronalyx', 'couronnail', 'mirrane', 'concordium'],
};
```

Then update Quoral’s metadata so it no longer reads as only a Speech monster:

```js
quoral: {
  id: 'quoral',
  name: 'Quoral',
  blurb: 'The grand Bellstorm Coast creature for full Punctuation mastery.',
  accent: '#2E8479',
  secondary: '#8FD6C7',
  pale: '#E5F3EF',
  nameByStage: ['Quoral Egg', 'Quoral', 'Voiceling', 'Choruscrest', 'Grand Quoral'],
  masteredMax: 14,
},
```

Carillon should remain in `MONSTERS`, but its blurb should say reserved/future rather than “currently published Punctuation release”.

Second, update `src/platform/game/mastery/shared.js`.

Change:

```js
export const PUNCTUATION_GRAND_MONSTER_ID = 'carillon';
```

to:

```js
export const PUNCTUATION_GRAND_MONSTER_ID = 'quoral';
export const PUNCTUATION_RESERVED_MONSTER_IDS = Object.freeze(['colisk', 'hyphang', 'carillon']);
```

Also make sure `PUNCTUATION_MONSTER_IDS` resolves only the active four from `MONSTERS_BY_SUBJECT.punctuation`.

Third, update `shared/punctuation/content.js`.

Keep the six learning clusters, but remap their `monsterId` values:

```js
export const PUNCTUATION_CLUSTERS = Object.freeze([
  {
    id: 'endmarks',
    name: 'Endmarks',
    monsterId: 'pealark',
    published: true,
    skillIds: ['sentence_endings'],
  },
  {
    id: 'apostrophe',
    name: 'Apostrophe',
    monsterId: 'claspin',
    published: true,
    skillIds: ['apostrophe_contractions', 'apostrophe_possession'],
  },
  {
    id: 'speech',
    name: 'Speech',
    monsterId: 'pealark',
    published: true,
    skillIds: ['speech'],
  },
  {
    id: 'comma_flow',
    name: 'Comma / Flow',
    monsterId: 'curlune',
    published: true,
    skillIds: ['list_commas', 'fronted_adverbial', 'comma_clarity'],
  },
  {
    id: 'structure',
    name: 'List / Structure',
    monsterId: 'curlune',
    published: true,
    skillIds: ['parenthesis', 'colon_list', 'semicolon_list', 'bullet_points'],
  },
  {
    id: 'boundary',
    name: 'Boundary',
    monsterId: 'pealark',
    published: true,
    skillIds: ['semicolon', 'dash_clause', 'hyphen'],
  },
]);

export const PUNCTUATION_GRAND_MONSTER = Object.freeze({
  id: 'published_release',
  name: 'Published Punctuation release',
  monsterId: 'quoral',
});
```

This file is load-bearing because the reward subscriber calculates direct monster totals from each cluster’s `monsterId`, and then calls `recordPunctuationRewardUnitMastery()` with that monster ID. ([GitHub][5])

Fourth, update `src/platform/game/mastery/punctuation.js`.

Do not let stale Quoral-as-Speech state distort Quoral-as-Grand progress. Add a compatibility normaliser before progress is calculated or before state is saved.

The goal:

```txt
Old quoral direct Speech evidence should still count.
Old carillon aggregate evidence should migrate/read into quoral grand evidence.
Old colisk/hyphang direct evidence should be preserved but not shown as active.
Structure keys should count toward Curlune.
Boundary keys should count toward Pealark.
```

A safe migration rule:

```js
const RESERVED_TO_ACTIVE_PUNCTUATION_MONSTER = Object.freeze({
  colisk: 'curlune',
  hyphang: 'pealark',
  carillon: 'quoral',
});

const PUNCTUATION_CLUSTER_MONSTER_ID = Object.freeze({
  endmarks: 'pealark',
  speech: 'pealark',
  boundary: 'pealark',
  apostrophe: 'claspin',
  comma_flow: 'curlune',
  structure: 'curlune',
});
```

Then, on read/projection, union old mastered keys into the new active monster buckets based on the `clusterId` inside the mastery key:

```txt
punctuation:<releaseId>:<clusterId>:<rewardUnitId>
```

Do not delete old stored entries. Just hide reserved monsters from active summaries and use a normalised active view.

Fifth, update public redaction/public codex surfaces.

The repository currently has a public spelling-only monster allowlist in `worker/src/repository.js`, and Punctuation projection has been added elsewhere through command projections. Make sure the public Punctuation codex view, if exposed, allows exactly these four active Punctuation monster IDs:

```txt
pealark
curlune
claspin
quoral
```

and not:

```txt
colisk
hyphang
carillon
```

Reserved monsters should still exist for Admin visual review and asset validation, but they should not show as active learner Punctuation rewards.

## Test changes needed

Update or add tests for these cases:

```txt
Punctuation active monster roster is exactly:
pealark, curlune, claspin, quoral.

Punctuation reserved monster roster is exactly:
colisk, hyphang, carillon.

PUNCTUATION_GRAND_MONSTER_ID is quoral.

Speech reward units no longer award direct Quoral progress.
Speech reward units award Pealark direct progress and Quoral grand progress.

Structure reward units award Curlune direct progress and Quoral grand progress.

Boundary reward units award Pealark direct progress and Quoral grand progress.

Securing all 14 reward units takes Quoral to stage 4 / grand.

Colisk, Hyphang, and Carillon do not appear in active Punctuation summaries.

Old Carillon aggregate state is read as Quoral grand progress.

Old Quoral direct Speech state does not leave Quoral stuck with publishedTotal: 1.

Duplicate unit-secured events still do not double-award mastery keys.
```

Also update asset tests: they should verify reserved assets still exist but are classified as reserve, not active.

## Docs to update

Update `docs/punctuation-production.md`, especially the Events and Rewards section. Replace the old seven-monster mapping with:

```txt
Reward projection maps secure units to four active Bellstorm Coast creatures:

- Pealark: sentence endings, speech punctuation, and sentence-boundary marks
- Curlune: commas, flow, parenthesis, colons, semi-colon lists, and bullet-point punctuation
- Claspin: apostrophes for contraction and possession
- Quoral: grand release creature for all 14 published Punctuation reward units

Reserved future Bellstorm Coast creatures:
- Colisk
- Hyphang
- Carillon
```

Also add one sentence to prevent future confusion:

```txt
Reserved monsters remain in the asset manifest and Admin visual tooling, but they are not learner-facing Punctuation reward targets for this release.
```

That matters because the Monster Visual Config plan intentionally keeps dormant/not-yet-active monsters in the asset/config workflow. ([GitHub][4])

## My recommended execution order

Do it in this order:

```txt
1. Update plan/docs first so the decision is explicit.
2. Update MONSTERS metadata and active/reserve roster.
3. Change grand monster constant from carillon to quoral.
4. Remap PUNCTUATION_CLUSTERS monsterId values.
5. Add compatibility normalisation for old quoral/carillon/colisk/hyphang state.
6. Update reward projection tests.
7. Update Codex/public read-model tests.
8. Run punctuation smoke and bundle/public-output audits.
```

The blunt version: **yes, update the plan now.** Otherwise the implementation will keep awarding and displaying the old seven-monster system, and Quoral will be especially risky because it is changing role from direct Speech monster to grand monster.

[1]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/docs/punctuation-production.md "raw.githubusercontent.com"
[2]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/platform/game/monsters.js "raw.githubusercontent.com"
[3]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/platform/game/mastery/shared.js "raw.githubusercontent.com"
[4]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/docs/plans/2026-04-24-002-feat-monster-visual-config-centre-plan.md "raw.githubusercontent.com"
[5]: https://raw.githubusercontent.com/fol2/ks2-mastery/main/src/subjects/punctuation/event-hooks.js "raw.githubusercontent.com"
