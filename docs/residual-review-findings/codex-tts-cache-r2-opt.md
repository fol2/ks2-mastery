## Residual Review Findings

- P2 `scripts/production-performance-probe.mjs:644` Measure TTS through real client path — filed as https://github.com/fol2/ks2-mastery/issues/904

Source context:

- Review run: LFG step 3 multi-agent review for `docs/plans/2026-06-07-002-perf-tts-cache-followup-plan.md`.
- Applied mitigation: `--browser-tts` is now explicitly reported as `browser-direct-audio`, so it no longer claims to exercise the real app TTS port.
- Residual: a future authenticated UI probe should drive the real spelling replay control and collect `[ks2-tts-cache-latency]` from the app path without adding a public diagnostics hook.
