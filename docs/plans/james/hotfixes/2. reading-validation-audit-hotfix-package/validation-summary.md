# Reading validation rebuild summary

## Source

Uploaded ZIP: `ks2-mastery-lean-05080102.zip`

Source ZIP SHA-256: `b8f30cefff6178f7db18bfc47e53387b4ebd680d3ae35eee5aeba0ee4b91fe50`

Primary evidence layer: uploaded ZIP and local fresh-apply checks.

## Verdict

The rebuilt package supplies a Reading-only patch for one real marking risk and one UI clarity improvement.

The marking risk is that local negation of an otherwise correct phrase could still receive Reading credit. The patch makes phrase, keyword, and evidence-overlap matching contradiction-aware.

The UI improvement replaces the generic one-question delayed-feedback `Finish now` action with mode-specific labels and a short hint:

- `Mark now`
- `Mark this section`
- `Mark whole paper`

## Content quality audit

- Passages: `21`
- Questions: `182`
- Papers: `12`
- Skills/domains: `12`
- Fiction passages: `8`
- Non-fiction passages: `8`
- Poetry passages: `5`
- Long passages: `7`
- Duplicate normalised stem groups: `0`
- Duplicate model answer groups: `0`

## Adversarial negation audit

This rebuild uses an expanded audit that probes `not`, `never`, `no`, and `opposite of` across exact phrase, contains phrase, keyword, evidence, and rubric checks. It skips expected-answer phrases that are intrinsically negative, such as valid answers containing `not`, to avoid false positives.

| Snapshot | Negated matcher acceptances | Negated evaluation risks |
| --- | ---: | ---: |
| Baseline uploaded ZIP | 5100 | 1008 |
| Patched working tree | 0 | 0 |
| Fresh ZIP apply | 0 | 0 |

## Test results

- Baseline core Reading tests: `30/30` pass.
- Patched core Reading tests: `32/32` pass.
- Fresh ZIP apply core Reading tests: `32/32` pass.
- Patch dry-run on fresh extraction: pass.
- Patch apply on fresh extraction: pass.

## Environment limitation

The local Node runtime is `v22.16.0`, matching `.nvmrc` major version `22`, but the lean ZIP has no `node_modules` and the React-backed Reading session-interface test imports `esbuild`. That test cannot run faithfully here without dependency installation. The failure is included as an environment limitation.

## Production limit

No live production deploy or smoke was performed in this rebuild. Production certification still requires live evidence with origin, timestamp, release/commit ID, and pass result.
