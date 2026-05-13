# Punctuation Next Subject-Quality Contract

This round fixed a concrete surface-language issue. The next improvement ring should stay focused on the subject itself and avoid widening into UI/reward work unless a direct learner bug appears.

## Recommended next audit ring

Add semantic-shape checks for high-value punctuation skills:

1. **Semicolon balance**: both sides should be independent clauses, not fragments joined by a semicolon.
2. **Colon-list coherence**: list introductions should be natural and list members should be distinct, concrete items.
3. **Direct-speech reporter coherence**: speaker names in the stem, model answer, and reporting clause should stay aligned.
4. **Dash-clause purpose**: dash clauses should add emphasis, interruption, or extra information; they should not be random sentence splices.
5. **Explanation usefulness**: generated explanations should mention the exact target rule and the concrete punctuation mark being practised.

## Quality rule

Every learner-facing model should pass two tests:

- It teaches the target punctuation clearly.
- It reads like a normal KS2 sentence outside the target punctuation change.

Wrong options and malformed stems may be intentionally incorrect, but they should test a real misconception rather than expose generator artefacts.

## Suggested acceptance gate

Create a `surfaceLanguageQuality` family of checks in the existing P20 expansion audit. It should eventually cover:

```text
redundantPhraseFindings === 0
dashTypographyFindings === 0
semicolonIndependentClauseFindings === 0
colonListCoherenceFindings === 0
directSpeechSpeakerMismatchFindings === 0
explanationSpecificityFindings === 0
```

Do not add a single vague "quality pass" boolean. Keep counters specific so future regressions are easy to diagnose.

## Extra-credit direction

For beyond-KS2 challenge, add optional extension examples that compare:

- hyphen vs dash,
- colon vs semicolon,
- brackets vs commas for parenthesis,
- commas in lists vs commas after fronted adverbials.

These should be labelled as extra credit and should never be required to unlock the core KS2 readiness path.
