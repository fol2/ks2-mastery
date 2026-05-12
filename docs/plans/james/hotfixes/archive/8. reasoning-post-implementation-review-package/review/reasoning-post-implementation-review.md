# Reasoning post-implementation review

## Verdict

The Reasoning subject implementation is close to the intended architecture: it is Worker-owned, registered as a live subject, has its own isolated content engine, uses the shared React subject surface patterns, and is wired into Hero/monster evidence without becoming a browser-only bespoke app.

The post-implementation review found six Reasoning-only defects worth patching before rollout. Two are direct learner-facing or session-contract bugs. Four are learning-flow and evidence-boundary issues.

## Review perspectives

### Content accuracy

The promoted 110-template bank is broad and generally well aligned with upper-KS2 reasoning practice: place value, calculation structure, fractions/FDP, measure, geometry, statistics, estimation, and error analysis.

The important content failure was `fraction_error_analysis`, which produced malformed generated text at some seeds. The baseline audit found two malformed cases in the 2,200 seed/template check. This is patched and covered by a new content contract test.

### Engine determinism and answer contract

Reasoning session refs depend on stable `templateId:seed` identity. The baseline audit found five `reason_better_estimate` cases where the returned item ID drifted from the requested seed because the generator recursed to a different seed. The production-readiness review then extended this check to 1,000 seeds per template and found the same contract risk in other recursive generated templates, so the final patch removes seed-changing recursion across the Reasoning bank.

That is not merely cosmetic. It can make a browser submit an expected question ID that the Worker does not recognise as the active ref, especially when exact due retries or read-model IDs are involved. The patch preserves external item identity while internally re-rolling tied or invalid generated parameters.

### Learning-flow quality

The biggest UX/learning issue was support timing. The subject brief and previous PoC design emphasised independent first attempts, then nudge, then support. The implemented UI and command path allowed support before effort in non-strict modes.

The patch makes the Worker authoritative: support is blocked before effort, blocked in strict SATs mode, and blocked after marking. The client support actions now send expected session and question IDs, and the UI mirrors that state instead of advertising buttons the Worker should not accept.

Worked/Faded modes are also strengthened. They now seed the intended support level at session creation, rather than merely labelling the session presentation.

### Read-model safety

The first-wrong nudge should not ship full worked-solution data to the client. In the baseline implementation, the feedback read model included the question with `includeFeedback: true` even before support/finalisation.

The patch withholds solution/check/reflection data and answer-bearing result fields until support is requested or the answer is final. Persisted first-wrong state stores only the nudge-safe result shape, and public bootstrap redaction rebuilds Reasoning UI from the safe read model so older full-result state cannot leak through reload. This keeps the engine aligned with the no-answer-leakage learning loop.

### Monster/evidence integration

The Reasoning monster model itself looked structurally sound in this review: Reasoning evidence uses Reasoning-specific IDs and does not write other subjects' monster state.

The review found an event hygiene issue: duplicate mastery keys could still re-emit `reasoning.evidence-earned`. The patch suppresses duplicate evidence-earned events while preserving ordinary answer/practice recording.

### Performance

No broad performance regression was found in the Reasoning-only local checks. The content audit generated and serialised 110,000 Reasoning questions quickly under Node 22. The patch adds only small constant-time guards:

- bounded internal loops in generated templates that previously changed the public seed recursively;
- support-state initialisation proportional to session question count;
- stricter boolean checks in support and feedback read-model construction.

Those changes are negligible relative to existing template generation and Worker command processing.

### Enrichment

The safest enrichment boundary remains: deterministic maths first; optional enrichment should not alter answers or marking. This patch does not add AI/enrichment features. It improves the prerequisite safety layer by preventing early support leakage and preserving deterministic item identity.

## Baseline validation summary

On the uploaded ZIP snapshot before patch:

- Targeted direct `node --test`: `13/13` pass.
- Reasoning content audit: `2,200` generated seed/template cases checked; `7` failures.
  - `2` malformed generated-text failures.
  - `5` unstable item-id failures.
- `npm test`: not runnable through preflight because the lean extraction has no `node_modules`.

## Patched validation summary

After the production-ready patch:

- Patch dry-run: passed.
- Patch apply: passed.
- Targeted direct `node --test`: `20/20` pass.
- Fresh patchcheck targeted tests after applying patch to a new ZIP extraction: `20/20` pass.
- Reasoning content audit: `110,000` generated seed/template cases checked; `0` failures.
- Syntax checks for Reasoning shared/Worker/client JS and updated tests: passed.

## Remaining limits

This review did not certify live production deployment, Cloudflare/D1 runtime behaviour, or visual asset completeness from the lean ZIP. The lean ZIP is enough for this Reasoning code/content patch review, but production smoke still needs live environment evidence if you want a deployment sign-off.
