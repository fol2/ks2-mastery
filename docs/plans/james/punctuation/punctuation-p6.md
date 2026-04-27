---
title: Punctuation Phase 6 — Star Truth, Reward Narrative, and Production Hardening Contract
type: product-engineering-contract
status: proposed
date: 2026-04-27
scope: Punctuation subject only
origin:
  - docs/plans/james/punctuation/punctuation-p5-completion-report.md
  - current main repo review on 2026-04-27
audience: next implementation-planning agent
---

# Punctuation Phase 6 — Star Truth, Reward Narrative, and Production Hardening Contract

## 1. Purpose

Phase 6 is a hardening contract, not an implementation ticket list.

The next agent should read this document, inspect the current repo, and then produce its own implementation plan with units, exact files, tests, PR sequencing, and reviewer assignments. This document defines what must be true about the product and engineering behaviour after that implementation is complete.

Phase 6 exists because Phase 5 correctly changed the direction of Punctuation: the subject now uses a 100-Star evidence model, child-facing monster stage labels, and a mission-dashboard landing page. However, Phase 5 also left follow-on risks around data wiring, monotonic reward display, star/evolution consistency, anti-grinding, Curlune calibration, and production-surface truth. Those are product-contract risks, not just code polish.

Phase 6 must make Punctuation feel trustworthy to a child and defensible to an adult:

- A child should understand what they are doing today, which monster they are helping, and how far that monster is from Mega.
- A parent or teacher should be able to trust that Stars and Mega mean durable punctuation evidence, not repeated clicks or a short lucky round.
- Engineering should be able to prove that the same Star truth flows through Worker command responses, bootstrap hydration, landing, summary, map, home/dashboard, and any codex/monster surface that claims to show Punctuation progress.

## 2. Non-goals

Phase 6 must not add new Punctuation curriculum content, new item modes, new monsters, new AI learner explanations, or a new child report surface.

Phase 6 must not widen the release scope, change the content release id, or alter deterministic marking behaviour unless a blocker is found that invalidates the current learning contract.

Phase 6 must not become a root-level engineering ticket plan. The implementation agent may create that plan later. This file should remain the stable contract that the implementation plan is judged against.

## 3. Current product state after Phase 5

Punctuation is a rollout-gated, Worker-command-backed production subject slice. It has a 14-skill release, Smart Review, Wobbly Spots, GPS Check, guided/focused practice, generated/fixed items, deterministic marking, safe read models, a Punctuation Map, and a 3-direct-plus-1-grand monster roster.

Active Punctuation monsters are:

- Pealark — Endmarks, Speech, Boundary.
- Claspin — Apostrophes.
- Curlune — Comma / Flow, List / Structure.
- Quoral — grand aggregate across all 14 reward units.

Reserved monsters remain reserved and must not appear on child-facing active Punctuation surfaces:

- Colisk.
- Hyphang.
- Carillon.

Phase 5 introduced a Star projection with direct monsters on a 100-Star scale, Grand Stars for Quoral, and child-facing labels such as Not caught, Egg Found, Hatch, Evolve, Strong, and Mega.

Phase 5 also moved the Punctuation landing page away from the old three-button wall. The target landing shape is now a mission dashboard: one primary CTA, a monster companion, a compact progress row, star meters, a map entry, and secondary practice controls.

## 4. Phase 6 product outcomes

Phase 6 is complete only when these outcomes are true.

### 4.1 Star truth is visible everywhere it is promised

The same Star truth must be visible on every child-facing surface that claims to show Punctuation progress.

Required surfaces:

- Punctuation landing / setup.
- Punctuation summary.
- Punctuation Map.
- Home / subject card / dashboard tile, if it displays Punctuation progress.
- Monster Codex / Monster Meadow / reward surface, if it displays Punctuation progress.

If a surface cannot yet receive canonical Punctuation Star data, it must not pretend to show it. It should either hide that metric or show an honest loading/degraded state.

A child must never see one Punctuation Star count on the landing page and a different count on the summary or map for the same learner state.

### 4.2 Stars are learning evidence, not activity points

Punctuation Stars must represent learning evidence. They must not be equivalent to raw attempts, button clicks, session starts, or time spent.

Meaningful effort can earn early Stars and should help a child find an egg quickly. Mega must require durable mastery evidence.

The core rule is:

> Egg should be easy to find. Mega should be hard to earn, but clearly possible.

### 4.3 The reward narrative is one system, not two competing systems

The app must not have one stage system for monster-codex events and a different stage system for visible Stars.

If the learner sees “Pealark reached Hatch,” then the event/toast/history/codex surfaces must not say something inconsistent such as Pealark evolved to a different stage because a separate mastered-count threshold fired.

If an internal Tier 1 count-based monster projection remains necessary for compatibility, it must not create child-visible narrative contradictions. Child-facing milestone events must be aligned to the Star-stage contract or clearly separated as non-stage bookkeeping.

### 4.4 Landing page remains a mission dashboard

The Punctuation landing page must stay clear, stable, and child-oriented.

Above the fold, it should have one dominant primary action. Secondary actions are allowed, but they must not compete with the primary mission.

The landing page must not return to the old pattern of equal-weight buttons such as Smart Review, Wobbly Spots, GPS Check, focus modes, round length, and map all competing for attention.

The landing page before a session and after returning from a session must use the same skeleton. Data and copy may update; the layout contract must not change.

### 4.5 Punctuation remains compatible with future Hero Mode

Punctuation Stars are subject-owned learning evidence.

Any future Hero Mode or cross-subject daily mission may read Punctuation readiness, launch a Punctuation task, or reward a daily Hero contract. It must not directly mint, mutate, or inflate Punctuation Stars.

Punctuation Stars, secure units, deep-secure evidence, Quoral Grand Stars, and Punctuation monster stages remain owned by the Punctuation subject contract.

## 5. Star and stage contract

### 5.1 Public scale

Every active direct Punctuation monster uses this child-facing scale:

| Visible State | Star threshold | Meaning |
| --- | ---: | --- |
| Not caught | 0 | No meaningful evidence yet. |
| Egg Found | 1+ | The child made a genuine start for that monster family. |
| Hatch | 10+ | The child has begun to show repeatable practice evidence. |
| Evolve | 30+ | The child has useful independent practice and variety. |
| Strong | 60+ | The child has spaced, mixed, or secure evidence. |
| Mega | 100 | The child has deep, durable evidence across the monster family. |

Quoral uses 100 Grand Stars, but its gates are harder. It should feel like a grand creature, not a free duplicate of the direct monsters.

### 5.2 Egg policy

Egg Found should be achievable early. A child who genuinely attempts meaningful Punctuation work for a monster family should be able to find that monster’s egg without first proving full security.

However, Egg Found must still reject spam. Skips, empty answers, duplicate replay, unsupported fake attempts, and telemetry-only events must not mint an egg.

### 5.3 Mega policy for direct monsters

A direct monster may only reach Mega when all reward units owned by that monster have durable evidence.

For this release:

- Pealark Mega requires durable evidence across all 5 Pealark reward units.
- Claspin Mega requires durable evidence across both apostrophe reward units, plus mixed/spaced evidence so it cannot become Mega just because the denominator is small.
- Curlune Mega requires durable evidence across all 7 Curlune reward units. Curlune must not reach Mega with only 3 of 7 units, even if those units have strong mixed-mode evidence.

The Star meter may show progress before all units are deep-secure, but 100 Stars must mean the whole monster family is genuinely secure.

### 5.4 Quoral Grand policy

Quoral is the grand Punctuation monster. Quoral Grand Stars must not be the sum of Pealark + Claspin + Curlune Stars.

Quoral Stars must come from breadth and depth across the whole 14-unit release.

Quoral may tease early progress as “watching” or similar copy, but it must not feel caught or evolved from a single direct-monster success.

Grand Quoral at 100 Stars requires:

- all 14 Punctuation reward units deep-secure;
- breadth across Pealark, Claspin, and Curlune;
- mixed or GPS-style evidence;
- no recent unresolved lapse that should block deep-secure status.

### 5.5 Star categories

The current four-category model remains valid:

- Try Stars — genuine attempt breadth.
- Practice Stars — independent correct answers, near-retry repair, and variety.
- Secure Stars — secure memory and reward-unit evidence.
- Mastery Stars — deep-secure evidence, mixed context, spacing, and no unresolved lapse.

The category caps should remain conceptually stable at 10 + 30 + 35 + 25 = 100 unless a future product review explicitly changes the public Star contract.

### 5.6 Anti-grinding rules

Stars must be protected against grinding.

Required anti-grinding rules:

- repeated attempts on the same item are capped;
- same-day easy-item accumulation is capped;
- Practice Stars have a daily throttle, not only Try Stars;
- supported or guided answers can support learning, but they cannot mint Secure or Mastery Stars by themselves;
- near-retry corrections only count toward Practice Stars when the correction is independent;
- recent lapse blocks Mastery Stars until there is recovery evidence;
- no child can reach Mega in one sitting;
- no child can reach Mega from a narrow subset of a monster family.

The implementation may choose the exact throttle values, but the public behaviour must satisfy the above constraints.

## 6. Data and read-model contract

### 6.1 Canonical Star view

There must be one canonical Punctuation Star view available to the child app after Worker hydration and after Worker command responses.

The shape does not have to match this example exactly, but it must contain equivalent information:

```js
starView: {
  schemaVersion: 1,
  releaseId: 'punctuation-r4-full-14-skill-structure',
  generatedAt: 0,
  perMonster: {
    pealark: {
      total: 0,              // 0..100 visible Stars
      tryStars: 0,
      practiceStars: 0,
      secureStars: 0,
      masteryStars: 0,
      starDerivedStage: 0,
      displayStage: 0,
      maxStageEver: 0,
      gates: {
        megaEligible: false,
        missing: []          // parent/admin-safe reasons only
      },
      evidence: {
        ownedRewardUnits: 5,
        securedRewardUnits: 0,
        deepSecuredRewardUnits: 0
      }
    }
  },
  grand: {
    monsterId: 'quoral',
    grandStars: 0,
    total: 100,
    starDerivedStage: 0,
    displayStage: 0,
    gates: {
      megaEligible: false,
      missing: []
    },
    evidence: {
      ownedRewardUnits: 14,
      securedRewardUnits: 0,
      deepSecuredRewardUnits: 0
    }
  }
}
```

Child surfaces should consume only child-safe fields. Parent/Admin surfaces may show more explanation, but must still avoid hidden answer data, validators, answer banks, raw rubrics, hidden queues, generator seeds, or unpublished content.

### 6.2 Worker and bootstrap parity

The Worker command read model and bootstrap/public hydration path must expose equivalent Punctuation Star truth.

It is not acceptable for Stars to appear correctly immediately after a command response but disappear or reset to zero after refresh, login, or bootstrap hydration.

It is not acceptable for local/dev service paths to pass while the Worker-backed production path does not expose Star data.

### 6.3 `stats.grandStars`

If the Home/dashboard subject card uses a single Punctuation percentage/progress field, that field should be derived from Quoral Grand Stars or another explicitly documented Star-based measure.

If `stats.grandStars` exists, it must match `starView.grand.grandStars`.

If it is unavailable, the app must not silently fall back to a legacy mastered-count ratio while still showing Star-language copy.

### 6.4 Monotonic child reward display

Child-facing monster identity should not regress.

A child who has seen a monster Hatch should not later see that monster become Not caught because a projection recalculated temporary evidence health downward.

There may be a separate adult-facing “needs a guardian check” or “evidence health has weakened” signal, but the child-facing stage and earned-Star narrative must be monotonic unless there is an explicit content-release migration with clear communication.

The implementation may store high-water Star totals, high-water stages, or another equivalent monotonic display guard. The contract is the child-facing behaviour, not the storage design.

### 6.5 Deep-secure truth

If a read model exposes `deepSecuredRewardUnits`, it must be calculated from real deep-secure evidence or omitted from child surfaces.

It must not remain a permanent placeholder value that suggests zero deep-secure evidence when the Star projection has already used deep-secure evidence internally.

### 6.6 Release and key documentation

The public/engineering documentation must stop showing malformed mastery-key examples.

The stable key format must be documented as:

```txt
punctuation:<releaseId>:<clusterId>:<rewardUnitId>
```

For the current release, a real example is:

```txt
punctuation:punctuation-r4-full-14-skill-structure:speech:speech-core
```

## 7. UI contract

### 7.1 Landing page

The landing page should answer four child questions quickly:

1. What should I do now?
2. Which monster am I helping?
3. How many Stars does it have?
4. Where can I check my Punctuation skills?

The landing page should not lead with adult metrics. Accuracy, secure unit count, and due count may exist as compact support information, but the main visual hierarchy should be mission + monster + primary CTA.

Required landing sections:

- Bellstorm Coast hero / mission.
- One primary CTA.
- Compact progress row.
- Monster Star row.
- Punctuation Map entry.
- Secondary practice controls, visually subordinate.

The same sections must appear for a fresh learner, a learner returning after a session, and a learner with due/wobbly work. Values and copy may change; the structure must not.

### 7.2 Primary CTA

The primary CTA should route to the best current practice path.

Default: Start today’s round / Smart Review.

If there is an active session: Continue your round.

If weak evidence is genuinely present: Tackle wobbly spots may become the primary route, but it should be clear why.

The CTA must not be ambiguous. A child should not need to understand internal mode names to start.

### 7.3 Secondary controls

Wobbly Spots, GPS Check, round length, and any focus practice entry are secondary controls.

They may be visible, but they must not look like the main required action.

Round length should not be treated as a major product decision. Default short practice remains acceptable.

### 7.4 Punctuation Map

The Punctuation Map remains the Word Bank equivalent.

It must show all 14 skills grouped under active monsters only. It must never show Colisk, Hyphang, or Carillon as active learner rewards.

Skill status should be child-readable: New, Learning, Due, Wobbly, Secure, Unknown/Check back later if analytics are explicitly degraded.

If analytics are missing because the learner is fresh, the Map may show New. If analytics are explicitly unavailable/degraded, it must not pretend everything is New.

### 7.5 Copy rules

Child-facing Punctuation surfaces must not show these terms as primary learner copy:

- XP.
- Stage X of 4.
- reward unit.
- release id.
- mastered count.
- projection.
- validator.
- rubric.
- hidden queue.
- generator.
- X/Y secure as the main reward label.

Allowed child-facing reward language includes:

- Not caught.
- Egg Found.
- Hatch.
- Evolve.
- Strong.
- Mega.
- Stars.
- Grand Stars.
- Needs another go.
- Ready today.

## 8. Reward event and toast contract

Reward events and toast copy must reflect the child-visible reward narrative.

A `caught` event should mean the child has genuinely found the monster egg.

An `evolve` event should mean the child-visible monster stage moved forward.

A `mega` event should mean the child-visible monster reached Mega under the Star/evidence contract.

If legacy count-based transitions remain for compatibility or internal aggregation, they must not create child-facing caught/evolve/mega toasts that contradict the Star surface.

Duplicate or replayed events must remain idempotent.

## 9. Production hardening contract

### 9.1 Worker-first proof

Phase 6 must be proven on the Worker-backed path, not only local service or SSR tests.

A valid proof must cover:

- bootstrap hydration with existing Punctuation progress;
- Worker command start -> answer -> feedback -> summary;
- return to landing after summary;
- refresh/rebootstrap after progress;
- Home/dashboard progress after progress;
- Map and Summary reading the same Stars as Landing.

### 9.2 Test-harness versus production divergence

The Punctuation history has repeatedly found bugs where tests passed against fixture-only shapes while production paths used different data. Phase 6 must explicitly guard against that class.

Implementation plans should include tests that build state through production-like command/read-model paths rather than only injecting ideal UI fixtures.

### 9.3 Telemetry safety

Telemetry remains useful but must not become the reward source.

Punctuation telemetry may record user journey health, but it must not mint Stars, secure units, or monster stages.

Before telemetry is enabled in production, the following must be true:

- per-session/per-learner event rate limiting exists;
- query endpoint reads are audited;
- allowed event fields remain closed and PII-safe;
- answer text, prompt text, typed text, validators, rubrics, and hidden answer data remain rejected.

### 9.4 Rollout gates

Punctuation remains rollout-gated.

Before enabling or widening exposure, the implementation plan must prove:

- `PUNCTUATION_SUBJECT_ENABLED=false` hides subject access and command execution as expected;
- `PUNCTUATION_SUBJECT_ENABLED=true` exposes only after Worker-backed smoke passes;
- production bundle audit still excludes raw shared punctuation engine/content/marking/scheduler/generator modules from the learner bundle;
- reserved monsters do not appear on active child surfaces;
- no hidden answer fields leak through item, feedback, summary, GPS review, analytics, map, or parent/admin evidence payloads.

## 10. Learning-science contract

Punctuation must keep the learning loop, not just the game loop.

The Star system must reward evidence that supports durable learning:

- independent first attempt;
- specific corrective feedback;
- near retry after an error;
- spacing across days;
- mixed review;
- transfer or GPS-style evidence for late-stage mastery;
- recovery after lapse.

Support and guided examples are valuable for learning, but they must not become a shortcut to Secure or Mega.

Mega should mean a child is genuinely strong in that monster family, not that they completed enough visible tasks in a short period.

## 11. Hero Mode boundary

Hero Mode, if developed later, may use Punctuation as a ready subject provider.

Punctuation exposes read-only signals that Hero Mode may consume:

- due/wobbly counts;
- recommended mode;
- Star totals;
- evidence health;
- completed-session status.

Hero Mode must not:

- write Punctuation Stars;
- write Punctuation secure/deep-secure units;
- bypass Punctuation scheduling;
- mark Punctuation answers;
- inflate Punctuation monster stage;
- turn Punctuation Stars into a daily-login currency.

Punctuation Stars are subject mastery evidence. Any Hero Coins or Hero Pool rewards must be separate from Punctuation subject Stars.

## 12. Known risks to resolve or explicitly accept

The implementation agent must review these before writing the Phase 6 implementation plan.

### 12.1 StarView wiring risk

Phase 5 introduced `starView`, but the current repo must prove that `starView` reaches the actual Worker-backed subject UI and bootstrap path, not only client-side learner read models or test fixtures.

If a surface falls back to zero Stars because `starView` is absent, that is a blocker.

### 12.2 GrandStars dashboard risk

If Home/dashboard still reads a legacy ratio while the subject surface reads Grand Stars, the product will show inconsistent progress.

The next implementation plan must make Home/dashboard progress either Star-derived or honestly non-Star.

### 12.3 Monotonicity risk

Pure evidence projection can decrease after lapses. That may be useful diagnostically, but it is bad child-facing reward behaviour if it makes a monster appear to de-evolve.

The implementation must decide how earned Stars/stages remain monotonic while still preserving adult-visible evidence-health warnings.

### 12.4 Curlune calibration risk

Curlune must not reach Mega with a small subset of its 7 units.

Any weight normalisation must avoid saturation cliffs. A monster with 7 units should require broad evidence across those units before 100 Stars.

### 12.5 Claspin gate fragility

Claspin’s Mega gate must derive from the apostrophe cluster’s published reward units or skills, not from hardcoded skill string checks that will break when the curriculum changes.

### 12.6 Practice Star throttle risk

Practice Stars must have a daily throttle. Try Stars alone are not enough to prevent a child from inflating progress in one long sitting.

### 12.7 Public codex/bootstrap risk

If public bootstrap or codex projection still filters public monster state to Spelling-only monsters, Punctuation Codex claims must either be disabled or the public codex projection must include active Punctuation monsters safely.

### 12.8 Deep-secure placeholder risk

If `deepSecuredRewardUnits` remains a placeholder while Stars already depend on deep-secure evidence, adult and engineering diagnostics will contradict the Star system.

### 12.9 Documentation drift risk

Production docs must be updated after Phase 5/6. They should not keep stale Phase 2/Phase 4 wording, malformed mastery keys, or claims that no longer match the Star economy.

## 13. Acceptance contract

Phase 6 is acceptable only if all of the following are true.

### Child product acceptance

A child can open Punctuation and see one clear mission, one clear primary action, one visible monster companion, and Star progress that matches Summary and Map after a round.

The child can quickly understand:

- “I can find an egg by trying.”
- “I need to keep practising over time to reach Mega.”
- “100 Stars means Mega.”
- “Quoral is the grand Punctuation monster.”

### Adult trust acceptance

A parent or teacher can trust that:

- Stars are not raw attempts;
- Mega is not reachable from one day of narrow practice;
- guided/support-only work cannot fake mastery;
- direct monsters require broad evidence across their families;
- Quoral requires deep evidence across the full 14-skill release.

### Engineering acceptance

Engineering can prove:

- Worker and bootstrap Star data agree;
- Landing, Summary, Map, Home/dashboard, and any Codex surface agree;
- Star display is monotonic for the child;
- Star evidence remains non-leaky and redacted;
- no reserved monsters appear as active;
- telemetry cannot mint reward;
- production bundle audit still blocks raw engine/content modules;
- existing Punctuation command, redaction, GPS, reward-idempotency, and Spelling startup smoke still pass.

## 14. Handoff instruction for the next agent

The next agent should not copy this into tickets verbatim.

The next agent should:

1. Pull or inspect the latest repo.
2. Verify which Phase 5 follow-ons have already been fixed since the completion report.
3. Produce a separate implementation plan with units, exact files, tests, sequencing, and reviewer strategy.
4. Treat this document as the product and engineering contract that those units must satisfy.
5. Keep the phase limited to hardening unless a blocker requires a narrow implementation addition.

