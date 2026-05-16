# Monster Subject Asset Alignment Contract

## Scope

Complete the outstanding monster asset alignment for the active Reading, Arithmetic, and Reasoning subject rosters.

## Requirements

- Every active Reading, Arithmetic, and Reasoning monster has a subject-owned asset folder under `assets/monsters/<monsterId>/`.
- Every subject-owned folder in this rollout has both `b1` and `b2` branches because those branches already exist in the approved source-family art used for this alignment package.
- Every branch has stages `0` to `4`.
- Every stage ships `320`, `640`, and `1280` WebP files using the canonical name `<monsterId>-<branch>-<stage>.<size>.webp`.
- Runtime `monsterAsset()` and `monsterAssetSrcSet()` resolve these subjects by their own monster ids, not by `assetId` aliases to Grammar, Punctuation, or Spelling art families.
- `src/platform/game/monster-asset-manifest.js` includes the new assets deterministically.
- Reading setup renders progressed Reading monsters from Reading-owned paths.
- The Cloudflare production build path accepts the expanded manifest.

## Variation Semantics

The monster runtime supports variation branches through `MONSTER_BRANCHES` and
the generated manifest. This package requires `b1` and `b2` for the active
Reading, Arithmetic, and Reasoning families because each family is being
materialised from an existing two-branch source family. That is a release
coverage rule for this package, not a permanent requirement that every future
monster species must ship two visual variations. A future one-branch art package
can narrow its own branch coverage only if the manifest, tests, and runtime
fallback expectations are updated in the same contract.

## Generation And Alignment Boundary

This package is a runtime asset-alignment release. The production deliverable is
that active Reading, Arithmetic, and Reasoning monsters use subject-owned asset
paths in the manifest and runtime helpers, while preserving the visual tuning of
their approved source families where the shipped art was cloned from an existing
family.

The user-requested image generation evidence for this iteration is the Phaeton
`b2` stage `4` mega-form prompt and output. That image is recorded as art
direction evidence and is not consumed by the runtime manifest in this structural
alignment release. Replacing every subject-owned runtime illustration with newly
generated artwork remains outside this package unless a separate art replacement
contract is opened.

Source-family provenance for each copied subject-owned asset family is recorded
in `evidence/asset-provenance/subject-monster-asset-provenance-2026-05-13.md`.

## Active Monster Families

Reading:

- `readbloom`
- `readrill`
- `inferane`
- `structurillon`
- `lorequill`

Arithmetic:

- `sumkrab`
- `carryfin`
- `fractail`
- `perciva`
- `arithon`

Reasoning:

- `numdrake`
- `fractalon`
- `measuron`
- `georune`
- `proofwyrm`
- `strategon`

## Non-Goals

- No mastery threshold, reward-state, D1 schema, R2, login, or subject-command behaviour changes.
- No Punctuation, Grammar, or Spelling roster changes.
- No removal of legacy reserve art folders.
