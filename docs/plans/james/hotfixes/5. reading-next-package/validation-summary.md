# Reading Stretch Challenge + Interface Hardening Validation Summary

## Verdict

Ready as a Reading-only follow-on patch after the post-implementation hardening package.

The patch adds a `Stretch challenge` mode for high-attainment / extra-credit Reading practice, while keeping Reading v5 content totals unchanged and preserving answer-safe browser metadata.

## What changed

- Adds `stretch` to Reading server and browser-safe mode metadata.
- Adds a learner-facing `Stretch challenge` option under More Reading practice.
- Adds Worker selection logic for stretch practice:
  - long or high-difficulty passages;
  - six questions;
  - delayed feedback;
  - no punctuation-only questions;
  - weighted toward open/evidence/match/order/high-depth questions;
  - type variety before filling remaining slots.
- Adds mode-specific UI copy: `Mark challenge`.
- Adds static regression guards for duplicate hero-card `data-text-tone` attributes.

## Reading counts unchanged

```json
{
  "version": 5,
  "passageCount": 210,
  "questionCount": 2072,
  "paperCount": 75,
  "genres": {
    "fiction": 71,
    "non-fiction": 71,
    "poetry": 68
  },
  "longPassageCount": 166
}
```

## Validation evidence

Fresh apply-check after applying prior post-hardening patch:

- `validation/patch-apply-check.log`
- `validation/applycheck-reading-content-quality-audit.json`
- `validation/applycheck-focused-reading-tests.log`
- `validation/applycheck-stretch-mode-probe.json`

Current patched reconstruction:

- `validation/patched-reading-content-quality-audit.json`
- `validation/patched-focused-reading-tests.log`
- `validation/patched-stretch-mode-probe.json`
- `validation/patched-start-session-performance.json`

Results:

- Official Reading content audit: 0 failures, 0 advisories.
- Focused Reading tests: 44 passed, 0 failed.
- Stretch mode probe: advertised in server/browser metadata, 182 eligible passages, 1474 eligible questions.
- Sample stretch session: delayed feedback, non-strict, 6 questions, long difficulty-5 passage, mixed question types, 16 marks.
- Start-session performance: stretch P95 4.344 ms locally across 200 starts.

## Local limitation

`tests/reading-session-interface.test.js` cannot run in this lean environment because `esbuild` is absent. The limitation is captured in:

- `validation/lean-session-interface-env-limit.log`
- `validation/applycheck-lean-session-interface-env-limit.log`

Run that test in dependency-complete CI before deployment.
