# Grammar AI Provider Decision

This decision closes the open Grammar follow-up about whether to connect a live AI provider to the non-scored enrichment safe lane.

## Decision

Do not connect a live third-party AI provider to Grammar in this slice.

The deterministic fallback remains the production contract for Grammar AI enrichment until a separate reviewed integration plan lands. The current safe lane already gives learners explanation, revision-card, and parent-summary drafts through Worker-owned commands, marks every enrichment response as non-scored, and passes any supplied provider-style response through the existing validator before it reaches the read model.

## Production Contract

- Grammar scoring, mastery mutation, retry scheduling, reward projection, and Concordium progress stay deterministic and Worker-owned.
- Provider keys must stay server-side. Browser-held keys and React provider calls remain rejected behaviours.
- A live provider may only be added behind the Worker subject command boundary, never as a browser direct call.
- Provider output must pass the existing Grammar AI enrichment validator, including rejection of score-bearing fields, hidden answers, rubrics, unknown deterministic drill templates, and malformed payloads.
- Provider failure must return contained non-scored failure or deterministic fallback content, not a broken Grammar session.

## Rejected For Now

- Browser-held API keys are rejected.
- React-side provider calls are rejected.
- AI-authored scored Grammar items are rejected.
- AI-marked Grammar answers are rejected.
- Making live provider availability a release blocker is rejected.

## Integration Requirements For A Future Plan

Any future live provider integration needs a separate reviewed plan before implementation. That plan must define the server-side provider configuration, prompt/data minimisation rules, rate limits, privacy copy, provider failure semantics, deterministic fallback behaviour, redaction tests, production smoke coverage, and external CI evidence expected before merge.

Until that plan exists, Grammar should keep deterministic enrichment fallback as the operationally safe path and treat externally supplied AI-shaped payloads only as validator test inputs.
