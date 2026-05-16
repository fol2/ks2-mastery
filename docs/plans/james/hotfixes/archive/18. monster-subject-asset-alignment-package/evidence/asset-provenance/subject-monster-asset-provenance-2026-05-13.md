# Subject Monster Asset Provenance

Date: 2026-05-13
Superseded by: 2026-05-14 subject-owned artwork closure

## Purpose

This evidence originally recorded the source-family aliasing used before the final subject-owned artwork closure. It is retained only as historical context for why Nelson's duplicate-art counterexample was valid.

The current production contract is stricter:

- Reading, Arithmetic, and Reasoning monster names and IDs remain unchanged.
- Runtime artwork must resolve from each subject monster's own asset family.
- Subject artwork must not be byte-identical to Hero Camp reserve families, Phaeton, Curlune, or any other monster family.
- Branch and stage artwork within each subject monster must also be distinct.
- Published or cached visual config must be invalidated when WebP bytes change.

## Historical Duplicate Source Families

The earlier implementation copied or aliased these source families and is now superseded:

| Subject | Monster | Historical source family | Current status |
| --- | --- | --- | --- |
| Reading | `readbloom` | `glossbloom` | Superseded by subject-owned WebP artwork |
| Reading | `readrill` | `loomrill` | Superseded by subject-owned WebP artwork |
| Reading | `inferane` | `mirrane` | Superseded by subject-owned WebP artwork |
| Reading | `structurillon` | `carillon` | Superseded by subject-owned WebP artwork |
| Reading | `lorequill` | `phaeton` | Superseded by subject-owned WebP artwork |
| Arithmetic | `sumkrab` | `colisk` | Superseded by subject-owned WebP artwork |
| Arithmetic | `carryfin` | `hyphang` | Superseded by subject-owned WebP artwork |
| Arithmetic | `fractail` | `glossbloom` | Superseded by subject-owned WebP artwork |
| Arithmetic | `perciva` | `carillon` | Superseded by subject-owned WebP artwork |
| Arithmetic | `arithon` | `phaeton` | Superseded by subject-owned WebP artwork |
| Reasoning | `numdrake` | `colisk` | Superseded by subject-owned WebP artwork |
| Reasoning | `fractalon` | `hyphang` | Superseded by subject-owned WebP artwork |
| Reasoning | `measuron` | `curlune` | Superseded by subject-owned WebP artwork |
| Reasoning | `georune` | `carillon` | Superseded by subject-owned WebP artwork |
| Reasoning | `proofwyrm` | `mirrane` | Superseded by subject-owned WebP artwork |
| Reasoning | `strategon` | `phaeton` | Superseded by subject-owned WebP artwork |

## Current Evidence

The current closure evidence is:

- `validation/monster-subject-codex-and-art-validation-2026-05-14.json`
- `validation/production-monster-subject-codex-and-art-smoke-2026-05-14.json`
- `evidence/runtime-preview/subject-monsters-b1-all-stages-contact-sheet-2026-05-14.png`
- `evidence/runtime-preview/subject-monsters-b2-all-stages-contact-sheet-2026-05-14.png`

The 2026-05-14 validation and production smoke reports are the authoritative evidence for subject-owned artwork and duplicate absence.
