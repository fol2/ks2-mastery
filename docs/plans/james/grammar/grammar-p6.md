# Grammar Phase 6 — Star Evidence Authority, Content Reliability, and Production Trust Contract

Status: proposed contract  
Owner intent: product + engineering contract only  
Not an implementation plan: this document intentionally does not break work into units, exact files, PR order, or test sequencing. The next agent should use this contract to write its own implementation plan.

## 1. Why Phase 6 exists

Phase 5 successfully changed Grammar from a raw concept-count monster curve to a child-facing 100-Star evidence curve. That was the right product move. It fixed the small-denominator problem where a small monster could reach Mega too quickly, simplified the landing page to one primary action, and made the reward language clearer for children and adults.

Phase 6 exists because Phase 5 also made Star progress more important. Once Stars become the child-facing truth, the system must prove that every Star is backed by durable, server-owned learning evidence. Phase 6 is therefore not a feature-expansion phase first. It is a trust phase.

The central Phase 6 question is:

> When a child sees “Bracehart — 17 / 100 Stars”, can we prove those Stars came from real learning evidence, will never disappear, are not inflated by support, AI, Writing Try, wrong answers, or client-only read-model artefacts, and are consistent with what the adult view says?

Only after that is proven should Phase 6 take on controlled content and answer-spec migration.

## 2. Current inherited product state

Grammar currently has four active monsters:

- Bracehart
- Chronalyx
- Couronnail
- Concordium

Glossbloom, Loomrill, and Mirrane remain reserved assets and must not appear as active Grammar rewards.

Grammar uses a universal 100-Star display scale:

| Stars | Child stage |
|---:|---|
| 0 | Not found yet |
| 1–14 | Egg found |
| 15–34 | Hatched |
| 35–64 | Growing |
| 65–99 | Nearly Mega |
| 100 | Mega |

The product rule remains:

> Egg is encouragement. Mega is mastery.

A child should be able to find an Egg quickly. Mega must require repeated, varied, independent, spaced evidence.

Phase 5 defines five evidence tiers:

- firstIndependentWin
- repeatIndependentWin
- variedPractice
- secureConfidence
- retainedAfterSecure

The 5 / 10 / 10 / 15 / 60 weighting is accepted for now. The retained-after-secure tier is deliberately dominant because Mega should prove durable retention, not just immediate performance.

## 3. Phase 6 product outcomes

Phase 6 should deliver these outcomes, regardless of the exact implementation plan chosen later.

### 3.1 Stars become authoritative, not temporary

If the UI displays a Star, the system must be able to recover that Star after refresh, after navigation, after the rolling recent-attempt window changes, and after another session.

A child must never see Stars go backwards.

A child must never earn visible Stars from client-only calculations that the Worker or persisted reward state cannot later reconstruct.

### 3.2 The first Star must really catch the Egg

The Phase 5 product contract says 1 Star catches the Egg. Phase 6 must make that true not only in read-model display, but also in reward state and reward events.

If the first valid learning evidence is an independent first-attempt correct answer, the child should be able to see the Egg state reliably. If the product emits toasts, the Egg/caught event must be emitted once and only once.

This must not depend on a concept reaching secure status.

### 3.3 Stars remain learning evidence, not XP

Stars are not “+1 per question”. They are not engagement points. They are not coins. They are not daily completion rewards.

Stars may come only from real Grammar evidence:

- valid answer attempt evidence;
- correct practice with the required independence/support constraints;
- distinct practice shapes where the answer evidence is valid;
- secure confidence from the existing Grammar mastery model;
- post-secure retention evidence.

Stars must not come from:

- browsing Grammar Bank;
- reading a worked example without attempting;
- Writing Try;
- AI explanations;
- parent summaries;
- view-only actions;
- opening the page;
- wrong answers;
- repeated demonstrations of the same already-earned tier.

### 3.4 Landing remains simple

The Phase 5 landing simplification is correct and should not be undone.

The child-facing Grammar landing page should keep:

- one obvious primary action: Start Smart Practice;
- a compact four-monster Star strip;
- secondary links for Grammar Bank, Mini Test, and Fix Trouble Spots;
- More practice collapsed by default;
- no adult/developer language.

Phase 6 may polish visual clarity, but it must not re-expand the landing page into an eight-mode decision screen.

### 3.5 Adult truth and child motivation stay separate

Adult confidence labels remain live and honest. Child Stars remain monotonic.

It is acceptable for an adult view to show a concept as needs repair while the child still keeps previously earned Stars. The child progress system is a high-water motivational display. The adult report is a live diagnostic tool.

The UI must not blur those two purposes.

## 4. Phase 6 engineering contract

### 4.1 Server-owned Star authority

Phase 6 must define where Star authority lives.

The current direction should be:

> Star evidence is derived from Worker-owned Grammar state and persisted reward/evidence state. The browser can display Stars but must not be the authority that grants them.

A valid implementation may use a persisted per-concept Star evidence ledger, an expanded reward-state latch, or a Worker-side Star projection that updates the high-water state. The exact data model is left to the implementation plan. The contract is not optional:

- every displayed Star must be reproducible from server-owned state;
- Star high-water must persist when sub-secure evidence earns early Stars;
- the persisted state must survive rolling recent-attempt truncation;
- reward events must be emitted from server-side transitions, not from client rendering.

### 4.2 Canonical production attempt shape

Phase 6 must lock the canonical attempt shape used by Star derivation.

Production Grammar attempts currently carry concept IDs as an array because a template can cover more than one concept. Star derivation must therefore support the canonical shape:

```js
{
  conceptIds: ['clauses'],
  result: { correct: true, score: 1, maxScore: 1 },
  templateId: '...',
  itemId: '...',
  questionType: '...',
  firstAttemptIndependent: true,
  supportUsed: 'none',
  supportLevelAtScoring: 0,
  createdAt: 1234567890
}
```

Star derivation must not rely only on a test-only shape such as:

```js
{
  conceptId: 'clauses',
  correct: true
}
```

It can accept both shapes defensively during migration, but the production shape must be the primary contract and the test fixtures must exercise it.

### 4.3 Correctness gates for each evidence tier

The five Star tiers must be defined precisely enough that two future agents would implement the same behaviour.

#### firstIndependentWin

Counts only when:

- the attempt is correct;
- the target concept is included in the attempt’s concept IDs;
- `firstAttemptIndependent === true`;
- no worked/faded/pre-answer support contributed to the scored response.

A nudge retry does not count as firstIndependentWin.

#### repeatIndependentWin

Counts only when:

- the concept has at least two distinct independent correct attempts;
- attempts are distinct by item/session/request, not duplicate replay;
- both attempts satisfy the firstIndependentWin independence rule.

#### variedPractice

Counts only when:

- the concept has valid correct answer evidence across at least two distinct templates, question shapes, or generated items;
- wrong answers alone cannot unlock variedPractice;
- view-only exposure cannot unlock variedPractice.

Supported correct answers may contribute to variedPractice if the product intentionally keeps the support-only ceiling above Hatch, but they must not unlock independent tiers.

#### secureConfidence

Uses the existing Grammar confidence/mastery model. Secure must remain a learning state, not a reward shortcut.

Secure confidence alone must not be enough for Mega.

#### retainedAfterSecure

Counts only when:

- the concept had previously reached secureConfidence;
- a later independent correct attempt happened after that secure point;
- the later attempt is meaningfully later, preferably after a due interval or in a later session/day;
- the later attempt is not a pre-secure historical correct answer being reinterpreted.

Phase 6 should not accept “secure + two independent corrects somewhere in recentAttempts” as a final retention contract unless it also proves temporal ordering.

### 4.4 Rolling-window safety

Star evidence must not depend on a rolling recent-attempt window in a way that can silently remove earned Stars.

Recent attempts can help derive new evidence. They must not be the only store of already-earned evidence tiers.

If the implementation keeps using recentAttempts for derivation, then the moment a new tier is earned the system must persist that tier or persist a Star high-water that is sufficient to preserve the user-facing display.

### 4.5 Reward event semantics

Reward events must represent meaningful monster transitions.

Required semantics:

- 1 Star: caught / Egg found;
- 15 Stars: hatch or evolve event depending on existing event taxonomy;
- 35 Stars: evolve;
- 65 Stars: evolve;
- 100 Stars: Mega;
- one event per monster per transition;
- no duplicate event on refresh;
- no event from client-only recomputation;
- no event from Writing Try, AI explanation, view-only actions, or adult report generation.

If multiple thresholds are crossed in one server-side update, the implementation must define a deterministic priority. The Phase 5 “caught wins first” cascade is acceptable if preserved deliberately.

### 4.6 No contentReleaseId bump for pure reward projection fixes

Fixing Star projection, Star persistence, dashboard read paths, reward event semantics, visual rendering, or tests should not bump Grammar content release ID.

A content release ID bump is required only for content or marking-behaviour changes.

### 4.7 Content and answer-spec work must be release-disciplined

Phase 6 may include content/answer-spec work only after the Star evidence authority issues are either fixed or explicitly split into an earlier release.

If Phase 6 includes content expansion, it must follow the existing content audit:

- prioritise thin-pool concepts;
- lift active_passive and subject_object first because they have only one question-type family each;
- increase explain coverage;
- pair every new template with a declarative answerSpec from day one;
- bump contentReleaseId when content or marking behaviour changes;
- refresh oracle fixtures for the new release;
- preserve the old oracle baseline.

If Phase 6 includes answer-spec migration, it must follow the existing answer-spec audit:

- selected-response exact migrations may be batched if behaviour is byte-identical;
- constructed-response migration must be per-template or small-batch, with golden accepted answers and near-miss rejections;
- behaviour-changing migrations require contentReleaseId bump and oracle refresh;
- manualReviewOnly must remain non-scored unless a human-review phase is explicitly designed.

## 5. Known risks Phase 6 must resolve or explicitly accept

### 5.1 Star derivation may not match production attempt shape

Production answer attempts store `conceptIds` and nested `result.correct`. Current Star derivation appears to filter on singular `conceptId` and top-level `correct`. If true, independent-win and retention tiers may not unlock from real Worker attempts, even though tests using synthetic fixture shapes pass.

Phase 6 must prove production-shape attempts unlock the same evidence tiers as test fixtures.

### 5.2 Dashboard may read recentAttempts from the wrong read-model path

The Worker and client normaliser expose recent attempts under `analytics.recentAttempts`. The current setup surface appears to read `grammar.recentAttempts`. If true, the dashboard monster strip may compute Stars without recent-attempt evidence.

Phase 6 must make the dashboard consume one canonical Star projection or one canonical attempts path.

### 5.3 1-Star Egg may be display-only rather than reward-authoritative

The current reward subscriber appears to react to `grammar.concept-secured` events. If it ignores ordinary correct answer events, then the product rule “1 Star catches the Egg” may not produce a persisted caught reward when the first Star comes from sub-secure evidence.

Phase 6 must decide and enforce whether Egg is:

- a display-only read-model state; or
- a persisted reward state with an event/toast.

The recommended contract is persisted reward state.

### 5.4 starHighWater may lag behind displayed sub-secure Stars

If Stars are computed from recentAttempts on read but high-water is written only when a concept-secured event occurs, then a learner can see Stars that are not yet persisted. That violates the spirit of monotonic Stars.

Phase 6 must close that gap.

### 5.5 retainedAfterSecure needs stronger temporal proof

The current simplified check of “secure + two independent corrects” is not enough as a final retention contract. It can approximate retention in tests, but the product claim “retained after secure” requires after-secure timing.

Phase 6 must persist or derive enough timing evidence to prove post-secure retention.

### 5.6 variedPractice must not count wrong-only exposure

Varied practice should mean correct evidence across varied forms, not merely seeing multiple templates or answering them wrongly.

Phase 6 must lock this rule.

### 5.7 Visual correctness remains under-tested

Phase 5 added CSS and layout changes, but rendered browser visual review and Playwright extension were deferred. Phase 6 must require real-browser checks for the landing page, monster strip, mobile layout, and post-session Star updates.

### 5.8 Grand Concordium timeline must be intentional

Simulation shows Grand Concordium is not reached within 150 days for any profile. That may be acceptable because Concordium is the ultimate Grammar achievement. Phase 6 must explicitly decide whether “5+ months” is desirable, or whether the product wants a nearer grand milestone before full Grand Concordium.

The default contract is: keep Grand Concordium hard; do not weaken it without a separate product decision.

## 6. Product acceptance contract

A Phase 6 implementation plan should be considered product-complete only when all of the following are true.

### 6.1 Child experience

- The child lands on a simple Grammar dashboard.
- One primary CTA remains obvious.
- The monster strip always shows four active monsters only.
- Every active monster uses 0–100 Stars.
- 1 Star reliably shows Egg found.
- 15 / 35 / 65 / 100 thresholds are consistent everywhere.
- A child never sees Stars go down.
- A child never sees adult/developer language in the child flow.
- A child can understand: “Get 1 Star to find the Egg. Reach 100 Stars for Mega.”

### 6.2 Learning integrity

- Independent first attempts are protected.
- Nudge retries do not count as firstIndependentWin.
- Worked/faded support cannot unlock independent tiers.
- Wrong answers cannot unlock Star tiers.
- Writing Try remains non-scored and gives 0 Stars.
- AI explanations remain post-marking enrichment and give 0 Stars.
- Mega requires retention evidence across every concept assigned to that monster.
- Concordium Mega requires full 18-concept aggregate evidence.

### 6.3 Engineering trust

- Production attempt shape and test fixture shape are aligned.
- Star evidence survives the 80-attempt rolling window.
- Persisted high-water state is updated when Stars are earned, not only when concepts become secure.
- Reward events are idempotent.
- Refresh, two tabs, retry requests, and stale reads do not duplicate rewards or lower Stars.
- Star computation is deterministic for the same learner state.
- Forbidden read-model keys remain forbidden.
- The browser is not the authority for awarding Stars.

### 6.4 Content reliability, if included

- Thin-pool concepts are improved first.
- active_passive and subject_object receive highest priority.
- New templates include declarative answerSpec at creation.
- Behaviour-changing content/marking work bumps contentReleaseId.
- Oracle fixtures are refreshed for the new release.
- The old baseline remains reproducible.

## 7. Non-goals

Phase 6 should not introduce:

- new Grammar modes;
- new active Grammar monsters;
- Hero Mode;
- Hero Coins;
- cross-subject reward economy;
- new AI scoring;
- automatic scoring for Writing Try;
- a new child analytics dashboard;
- a broad redesign of the whole app shell.

Hero Mode may later read Grammar Stars, but it must not own or mutate them. Grammar Stars remain subject-owned learning evidence.

## 8. Recommended sequencing for the next agent to derive

This is not an implementation plan, but the next implementation plan should probably derive its sequence from these dependency facts:

1. Star authority and production-shape alignment must come before content expansion.
2. Dashboard/read-model Star display must consume the same canonical projection as reward events.
3. Retention timing must be solved before any claim that Mega equals retained mastery.
4. Visual/browser validation must happen before calling the landing simplification complete in production.
5. Content expansion and answer-spec migration should be split from Star-authority fixes if the implementation becomes too large.

## 9. Review prompts for the next agent

Before writing an implementation plan, the next agent should answer these questions explicitly:

1. What is the canonical Star evidence store?
2. Which Worker command or event updates Star high-water for sub-secure evidence?
3. Does the reward subscriber need to consume `grammar.answer-submitted`, or should the Grammar Worker emit a dedicated Star transition event?
4. How does the system prove retainedAfterSecure happened after secure status?
5. How are production `conceptIds` attempts normalised for Star derivation?
6. What browser path proves that a first independent correct answer changes the monster strip to Egg found and persists after refresh?
7. Which content/answer-spec work, if any, is safe to include in the same phase without hiding Star-authority bugs?
8. What must be true before the team can call Grammar reward progression production-trustworthy?

## 10. Final contract sentence

Grammar Phase 6 should make this sentence true:

> Grammar Stars are simple for children, honest for adults, and authoritative for engineering: 1 Star finds the Egg, 100 Stars means retained mastery, and every visible Star is backed by durable Worker-owned evidence.
