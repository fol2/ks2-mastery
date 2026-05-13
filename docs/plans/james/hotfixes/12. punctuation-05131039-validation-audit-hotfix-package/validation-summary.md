# Punctuation 05131039 validation summary

## Source identity

Reviewed uploaded ZIP:

```text
/mnt/data/ks2-mastery-lean-05131039.zip
```

SHA-256:

```text
c0ae1a89e53a6c8d73ad09501fa529e312fb19d0c09e37cbd8409d1ee2ed247f
```

The user-stated filename was `ks2-mastery-lean-05130839.zip`, but the actual uploaded file available in `/mnt/data` was `ks2-mastery-lean-05131039.zip`.

## Baseline status

The uploaded snapshot already carried the prior P22 duplicate, hyphen, and apostrophe-contraction hardening:

```text
npm run verify:punctuation-qg:p20-expansion: PASS
release: punctuation-qg-p22-15072-2026-05-13
runtime/generated/fixed: 15072/14560/512
unique surfaces/signatures: 15072/15072
failing gates: none
```

The new baseline probe found lowercase proper names in model answers and accepted answers:

```json
{
  "runtimeItems": 15072,
  "findingCount": 2560,
  "uniqueAffectedItems": 1160
}
```

## Patch

Patch file:

```text
patches/001-punctuation-05131039-proper-noun-capitalisation-quality-gate.patch
```

Patch-id matches the actual landed fix from `5c95335e^..5c95335e`: `4ccd5aa6b5be7af0422c905e32b9c7a4037a798f`.

Patch changes:

- fixes P20 sentence-ending generated model answers to restore proper-name capitals;
- fixes P20 fronted-adverbial generated model answers to use capitalised proper names after the comma;
- adds a shared registered proper-noun token set covering P20 actors plus fixed pupil, place, country, city, and weekday tokens;
- adds `properNounCapitalisationQuality` audit evidence and `properNounCapitalisationFindings`;
- hardens the P20 expansion report validator against stale proper-noun failures;
- adds proper-noun runtime/audit regression tests, including registry-wide non-actor coverage;
- includes the new test in `verify:punctuation-qg:p20-expansion`;
- bumps release ID to `punctuation-qg-p23-15072-2026-05-13`;
- refreshes P20 audit, review-register, heavy-play, and negative-vector artefacts for P23.

The shared token registry is a scoped fix for the proper-noun gate. The contract requires proper names in model and accepted answers to be capitalised, and an actor-only detector would miss fixed proper names already present in the Punctuation content bank. The registry is limited to existing Punctuation pupil/place/calendar vocabulary and is used by the audit/test boundary rather than by learner-facing runtime logic.

## Fresh patch validation

Fresh patch checks from a clean `5c95335e^` worktree:

```text
git apply --check: PASS
git apply --cached --check: PASS
git apply: PASS
node --test tests/punctuation-proper-noun-capitalisation-quality.test.js: PASS 6/6
npm run verify:punctuation-qg:p20-expansion: PASS 24/24
```

Patched expansion evidence:

```text
release: punctuation-qg-p23-15072-2026-05-13
runtime/generated/fixed: 15072/14560/512
unique surfaces/signatures: 15072/15072
generated families: 126
failing gates: none
properNounCapitalisationFindings: 0
```

Targeted runtime/UI/scheduler/marking validation:

```text
node --test tests/punctuation-qg-p20-runtime-surface-uniqueness.test.js tests/punctuation-qg-p20-real-scheduler-heavy-play.test.js tests/punctuation-session-input-hardening.test.js tests/punctuation-session-ui.test.js tests/punctuation-scheduler.test.js tests/punctuation-golden-marking.test.js
PASS 71/71
GOLDEN MARKING: 452 templates tested, 612 accept cases passed, 1348 reject cases passed
```

Full local verification after rebase:

```text
npm test: PASS 111507/111519, 0 failed, 12 skipped
npm run check: PASS
```

## Production validation

Current deployed production evidence was generated after rebasing to latest `origin/main` and verifying `125cacb6374103fec99010caf347a0d2feb61b54` on `https://ks2.eugnel.uk`.

```text
npm run deploy: PASS before latest main verification
Production bundle audit: PASS before latest main verification
latest-main production smoke: PASS
```

Production smoke:

```text
node scripts/punctuation-production-smoke.mjs --env production --authenticated --admin-hub --commit-sha 125cacb6374103fec99010caf347a0d2feb61b54 --out reports/punctuation/punctuation-qg-p20-production-smoke.json --timeout-ms 30000
PASS
origin: https://ks2.eugnel.uk
worker SHA: 125cacb6374103fec99010caf347a0d2feb61b54
release: punctuation-qg-p23-15072-2026-05-13
runtime items: 15072
authenticatedCoverage: true
adminHubCoverage: true
smartSix: 6 unique items, 0 immediate repeats
dashAcceptance: spaced-hyphen, en-dash, and em-dash accepted
```

Live/full gates:

```text
npm run verify:punctuation-qg:p20-live: PASS 4/4
npm run verify:punctuation-qg:p20: PASS 24/24 expansion + 4/4 live
```
