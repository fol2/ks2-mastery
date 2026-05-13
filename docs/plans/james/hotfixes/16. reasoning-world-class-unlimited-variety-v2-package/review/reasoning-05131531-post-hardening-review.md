# Reasoning-only post-hardening review for ks2-mastery-lean-05131531.zip

## Verdict

The post-hardening implementation is structurally healthy. The existing Reasoning engine is Worker-owned, isolated, deterministic, live-registered, Hero-compatible, and covered by targeted tests. The baseline targeted suite passed 46/46 on the uploaded ZIP snapshot.

The remaining gap was not a basic correctness bug. It was a world-class product-quality gap: the bank was already numerically large, but context variation could still repeat in a visible way inside a short session, and extra-credit content could be selected for a cold learner under an adversarial high-roll scheduler path.

## Findings

### Finding 1: themed sessions could repeat surface context too visibly

The previous build had 12 themes and 14 themed templates. Under an adversarial high-roll Smart Review probe, a 12-question session selected 12 themed questions but only 8 unique themes. `train_station`, `music_festival`, and `eco_club` repeated in the same short round.

This is not a catastrophic correctness bug, but it is noticeable. For a world-class Reasoning subject, the learner should feel that the pool is effectively unlimited: new numbers, new structures, and fresh surface worlds.

Patch response: expand to 23 themes and make the Reasoning scheduler reroll themed seeds to avoid repeated context themes within one generated round where alternatives exist.

### Finding 2: extra credit could appear for a cold learner

The previous bank had one extra-credit template. It was excluded from SATs because it was `satsFriendly: false`, but the general Smart Review selector could still choose it for a new learner under an adversarial high-roll path.

Patch response: extra-credit templates are now gated until the learner has enough independent evidence. Cold learners get KS2-secure practice first. Ready learners can receive stretch transfer.

### Finding 3: content variety needed deeper structures, not just more skins

The new templates deliberately cover high-value KS2 reasoning structures: rounding bounds, inverse multi-step stories, remainders that require rounding up, fractions of measures, mixed-unit comparison, percent discounts, ratio from total, timetable duration, isosceles angles, composite area, missing mean, constraint equations, FDP ordering, and one beyond-KS2 crossing-rule transfer.

This expands variety without turning Reasoning into a generic random maths worksheet engine.

## Scope boundary

Runtime and test changes are limited to Reasoning content, Reasoning engine, Reasoning metadata, Reasoning smoke expectations, and Reasoning tests. The repository also adds a `.gitattributes` rule for this package folder so patch and checksum evidence stay LF-normalised on Windows checkouts. No other subject engine or reward system is altered.

## Local validation summary

- Baseline targeted Reasoning suite on uploaded ZIP: 46/46 passed.
- Patched targeted Reasoning suite: 49/49 passed.
- Fresh patch dry-run: passed.
- Fresh patch apply: passed.
- Fresh patchcheck targeted suite: 49/49 passed.
- Current repository `git apply --check`: passed against `origin/main` `cf165dae`.
- Patched content audit: 138 templates × 300 seeds = 41,400 generated cases, 0 failures.
- Fresh patchcheck content audit: 41,400 generated cases, 0 failures.
- Current repository contract target list: 50/50 passed.
- Current repository content audit: 41,400 generated cases, 0 failures.
- Current repository placeholder leak regression: safe input placeholders do not award marks before marking.
- Current full `npm test`: 111,536 pass, 0 fail, 12 skipped against `cf165dae`.
- Current `npm run check`: Cloudflare dry-run build, public build assertion, and client-bundle audit completed against `cf165dae`.
- Current package evidence: `.gitattributes` pins the package folder to LF, and `SHA256SUMS.txt` verifies after normalisation.

## Local limits and current evidence

Full `npm test` and `npm run build` were not completed in the original lean ZIP extraction because `node_modules` were absent; those historical logs show missing `react`/`esbuild`. That limitation no longer applies to the current repository worktree evidence. The current logs are recorded under `validation/current-npm-test.log` and `validation/current-npm-run-check.log`. Live production deployment evidence remains a separate post-merge/deploy gate.
