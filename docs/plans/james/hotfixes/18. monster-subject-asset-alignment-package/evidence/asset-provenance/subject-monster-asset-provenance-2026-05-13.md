# Subject Monster Asset Provenance

Date: 2026-05-13

## Purpose

This evidence records the source-family provenance for the subject-owned
Reading, Arithmetic, and Reasoning monster folders added by the monster subject
asset alignment package.

The existing production metadata already treated these subject monsters as
separate state ids while resolving their visual identity through `assetId`
aliases to approved source-family art. This package removes those runtime
aliases by materialising the same approved visual families into subject-owned
folders and file names. The copied WebP files preserve the existing silhouette,
stage progression, branch coverage, visual tuning, and in-app collectible feel
while fixing the state and visual-key collision boundary.

## Provenance Map

| Subject | Monster | Source family | Coverage |
| --- | --- | --- | --- |
| Reading | `readbloom` | `glossbloom` | `b1`, `b2`, stages `0`-`4`, sizes `320`, `640`, `1280` |
| Reading | `readrill` | `loomrill` | `b1`, `b2`, stages `0`-`4`, sizes `320`, `640`, `1280` |
| Reading | `inferane` | `mirrane` | `b1`, `b2`, stages `0`-`4`, sizes `320`, `640`, `1280` |
| Reading | `structurillon` | `carillon` | `b1`, `b2`, stages `0`-`4`, sizes `320`, `640`, `1280` |
| Reading | `lorequill` | `phaeton` | `b1`, `b2`, stages `0`-`4`, sizes `320`, `640`, `1280` |
| Arithmetic | `sumkrab` | `colisk` | `b1`, `b2`, stages `0`-`4`, sizes `320`, `640`, `1280` |
| Arithmetic | `carryfin` | `hyphang` | `b1`, `b2`, stages `0`-`4`, sizes `320`, `640`, `1280` |
| Arithmetic | `fractail` | `glossbloom` | `b1`, `b2`, stages `0`-`4`, sizes `320`, `640`, `1280` |
| Arithmetic | `perciva` | `carillon` | `b1`, `b2`, stages `0`-`4`, sizes `320`, `640`, `1280` |
| Arithmetic | `arithon` | `phaeton` | `b1`, `b2`, stages `0`-`4`, sizes `320`, `640`, `1280` |
| Reasoning | `numdrake` | `colisk` | `b1`, `b2`, stages `0`-`4`, sizes `320`, `640`, `1280` |
| Reasoning | `fractalon` | `hyphang` | `b1`, `b2`, stages `0`-`4`, sizes `320`, `640`, `1280` |
| Reasoning | `measuron` | `curlune` | `b1`, `b2`, stages `0`-`4`, sizes `320`, `640`, `1280` |
| Reasoning | `georune` | `carillon` | `b1`, `b2`, stages `0`-`4`, sizes `320`, `640`, `1280` |
| Reasoning | `proofwyrm` | `mirrane` | `b1`, `b2`, stages `0`-`4`, sizes `320`, `640`, `1280` |
| Reasoning | `strategon` | `phaeton` | `b1`, `b2`, stages `0`-`4`, sizes `320`, `640`, `1280` |

## Runtime Tuning Preservation

`src/platform/game/monster-visual-config.js` maps each subject-owned monster
back to its approved source family for baseline facing, meadow path, and
foot-pad defaults. This keeps the copied art visually aligned with its existing
renderer tuning while allowing the manifest and asset helper paths to resolve by
the subject-owned monster id.

## Image Generation Boundary

The generated Phaeton `b2` stage `4` mega-form image is retained as art
direction evidence in `evidence/imagegen/`. It is not substituted into the
runtime WebP manifest in this structural alignment release because the
production asset pipeline consumes branch/stage/size WebP files and this package
is scoped to removing cross-subject visual aliasing without introducing a mixed
PNG/WebP runtime surface.
