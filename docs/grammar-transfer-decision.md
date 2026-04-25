# Grammar Paragraph Transfer Decision

This decision closes the open Grammar follow-up about paragraph-level transfer.

## Decision

Grammar paragraph transfer will ship, when implemented, as a non-scored transfer lane first.

It will ask learners to apply secured Grammar choices in short writing, but it must not mark paragraph writing, mutate mastery, schedule retries, unlock monsters, or count towards Concordium. The existing Worker-marked Grammar engine remains the only score-bearing authority for Grammar mastery.

## Rejected For Now

- Teacher-reviewed paragraph marking is not promised. It needs a separate workflow, reviewer role model, moderation rules, and adult-facing evidence design before product copy can mention it.
- Deterministic paragraph scoring is not the first transfer lane. Paragraph writing creates too many valid answers for the current template/accepted-answer model, and false precision would weaken the secured-evidence contract.
- AI-marked paragraph scoring is rejected. AI may support non-scored explanation or drafting only after server-side validation; it must not author or mark score-bearing Grammar evidence.

## Implementation Contract

- Transfer prompts may use concepts, recent weak areas, and visible analytics to choose a writing target.
- Transfer output is practice artefact only until a later reviewed scoring plan exists.
- Transfer may be stored as non-scored activity or adult-readable evidence, but it must be clearly separated from mastery events, retry queues, reward projection, and question-type strength.
- Any future score-bearing transfer path requires a new content-release decision, deterministic marking tests, production smoke coverage, and explicit no-regression checks for Spelling, Punctuation, D1, R2, and rewards.
- Bellstorm Coast remains the separate Punctuation subject. Punctuation-for-grammar concepts still count inside the 18-concept Grammar denominator for GPS mastery.

## Next Slice

The next implementation slice should add a non-scored paragraph transfer activity behind the existing locked placeholder, with no mastery mutation and with adult evidence copy that clearly labels it as writing application rather than scored Grammar progress.
