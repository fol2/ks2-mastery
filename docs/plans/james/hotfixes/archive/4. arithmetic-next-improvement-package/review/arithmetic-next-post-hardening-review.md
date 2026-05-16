# Arithmetic post-hardening review and next improvement pass

Source boundary: I used `ks2-mastery-lean-05121221.zip` as the primary implementation snapshot. GitHub was used only as a supplementary exact-file/reference check for Arithmetic source, not as a replacement for the uploaded ZIP. This review identified the Arithmetic contract gaps; final production deployment evidence is recorded in `../arithmetic-next-improvement-completion-report-2026-05-12.md` and `../validation/current-2026-05-12/`.

## Review verdict

Arithmetic is now a real integrated subject and the previous post-hardening pass is broadly healthy. The subject has an isolated content/marking engine, Worker command runtime, client surface, read-model plumbing, reward-unit projection, Hero launch/provider wiring, and Arithmetic-specific tests. The next problems I found are not integration blockers; they are learner-facing quality and polish issues inside Arithmetic itself.

The review found three Arithmetic-only issues worth fixing before the next implementation round.

## 1. Marking accuracy: stray unit symbols were accepted too broadly

The Worker answer parser stripped `%` and `£` from numeric answers globally. That meant a learner could answer `44%` or `£44` to a plain missing-number question where the correct answer was `44`, and it would be marked correct.

This is not harmless tolerance. In Arithmetic, form matters. `50%` is acceptable only when the question asks for a percentage value, not when the item asks for a plain number, a missing digit, a quotient, a place-value part, or a final written-method answer.

Baseline audit over 45,000 generated cases found:

```text
badPercentUnitAcceptances: 37005
poundAccepted: 37005
```

The fix makes numeric parsing unit-aware. `%` is now accepted only when the expected answer explicitly allows a percentage symbol, and `£` is rejected unless a future money question explicitly allows currency. Current Arithmetic has no money-answer items.

## 2. True Test interface: stale input and summary denominator risk

The Arithmetic React surface used uncontrolled fields with `defaultValue` for True Test answer and working inputs. When moving between paper questions, React can preserve the same input DOM node unless the form is keyed by the current question. That creates a stale-answer risk in a no-feedback test mode.

The test summary also calculated accuracy from `answered`, so a blank 12-question test could appear as a `0/0` style summary even though the paper had 12 questions. That is confusing for parents and weakens the diagnostic value of True Test Mode.

The fix keys the answer form by question id/index, restores saved response and working per paper entry, and reports test summaries against the full paper denominator while still showing how many responses were answered.

## 3. Content enrichment: some high-frequency pools were too small

The earlier hardening made the engine safer, but several procedural pools were still narrow enough to feel repetitive in long-term daily use. The main hotspots were mental subtraction, mental multiplication, fraction add/subtract, multiplying fractions, fraction-decimal-percentage links, and fraction/decimal hybrids.

The fix expands those generators without changing the subject contract or increasing hidden coupling. It keeps the same 30 templates and 90 reward units, but increases the variety of generated stems and adds stronger FDP/stretch material, including eighths, sixteenths, twentieths, decimal-percentage links such as `12.5%`, and more varied mental-number structures.

## Improvements shipped in this patch

Files changed:

```text
shared/arithmetic/content.js
worker/src/subjects/arithmetic/engine.js
src/subjects/arithmetic/components/ArithmeticPracticeSurface.jsx
tests/worker-arithmetic-runtime.test.js
tests/react-arithmetic-surface.test.js
```

Changes made:

- Made numeric answer parsing unit-aware.
- Preserved acceptance of a single trailing percentage symbol, such as `50%`, only for explicit percentage-output questions.
- Rejected malformed percentage placements such as `%50`, `5%0`, and `50%%`.
- Rejected `%` and `£` on ordinary number, digit, quotient, decimal, and written-method answers.
- Expanded mental subtraction generator variety.
- Expanded mental multiplication generator variety.
- Expanded fraction add/subtract generation.
- Expanded multiplying-fractions pools.
- Expanded FDP equivalents, including extra-credit stretch links.
- Expanded fraction/decimal hybrid pools.
- Added full-paper `questionCount` into Arithmetic test summaries.
- Keyed the Arithmetic answer form by current question to avoid stale uncontrolled input during True Test navigation.
- Added an Arithmetic runtime regression test for the unit-symbol marking bug.
- Added a React/jsdom regression test proving True Test answer and working fields reload from the current paper entry when the learner moves between questions.
- Strengthened the blank True Test regression test so it checks the full paper denominator.

## Scope deliberately not touched

This patch does not change other subjects, monsters, Hero Mode, reward thresholds, global subject routing, platform commands, the database schema, or non-Arithmetic UI. Arithmetic reward units remain at 90 and the engine remains isolated from other subjects.

## Independent reviewer closure

Final review target:

```text
origin/main: 58ca56f63550fa926a947beb2c73e10c641a5321
```

Code Reviewer: GREEN. No blockers or advisory-level blockers remained after adding the React/jsdom True Test answer-field remount regression, rerunning targeted gates, and confirming the rebased full-suite/deploy/smoke evidence.

Contract Auditor: GREEN. No blockers or advisory-level blockers remained after confirming `git diff --check origin/main..HEAD`, patch SHA/apply/reverse evidence, same-folder validation artefacts, production deploy evidence, and live Arithmetic smoke evidence.

## Out-of-contract future work

No remaining blocker is carried for this contract after the 2026-05-12 closure pass. A deeper written-method upgrade, richer two-mark long multiplication or long division variants, more missing-digit written-method puzzles, and a parent-facing diagnostic split between fact-recall errors and written-method errors are separate future contract candidates only.
