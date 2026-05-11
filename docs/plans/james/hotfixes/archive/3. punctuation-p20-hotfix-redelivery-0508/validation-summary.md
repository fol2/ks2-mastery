# Punctuation P20 Validation Audit + Hotfix Package

## Source

Uploaded ZIP: `ks2-mastery-lean-05080102.zip`

Source ZIP SHA-256: `b8f30cefff6178f7db18bfc47e53387b4ebd680d3ae35eee5aeba0ee4b91fe50`

This package was rebuilt after the previous artifact disappeared from `/mnt/data`. It was reconstructed from the uploaded ZIP and freshly revalidated in the current environment.

Environment:

```text
node=v22.16.0
npm=10.9.2
.nvmrc=22
```

## Main finding

The P20 runtime bank is broadly healthy, but the baseline uploaded ZIP has six exact duplicate learner-facing fixed-bank parenthesis choice surfaces. They are reported by the baseline audit as `legacyFixedDuplicateSurfaceGroups: 6` while generated duplicates are already zero.

Baseline summary:

```json
{
  "source": "baseline uploaded ZIP",
  "status": "PASS",
  "counts": {
    "runtimeItems": 15072,
    "uniqueLearnerSurfaces": 15066,
    "duplicateSurfaceGroups": 0,
    "legacyFixedDuplicateSurfaceGroups": 6
  },
  "duplicateSamples": [
    {
      "count": 2,
      "itemIds": [
        "fx12_parenthesis_001",
        "fx12_parenthesis_021"
      ]
    },
    {
      "count": 2,
      "itemIds": [
        "fx12_parenthesis_002",
        "fx12_parenthesis_022"
      ]
    },
    {
      "count": 2,
      "itemIds": [
        "fx12_parenthesis_003",
        "fx12_parenthesis_023"
      ]
    },
    {
      "count": 2,
      "itemIds": [
        "fx12_parenthesis_004",
        "fx12_parenthesis_024"
      ]
    },
    {
      "count": 2,
      "itemIds": [
        "fx12_parenthesis_005",
        "fx12_parenthesis_025"
      ]
    },
    {
      "count": 2,
      "itemIds": [
        "fx12_parenthesis_006",
        "fx12_parenthesis_026"
      ]
    }
  ]
}
```

## Hotfix

Patch: `patches/001-punctuation-p20-fixed-duplicate-surface-and-gate.patch`

Patch SHA-256: `51eea511f8bf2b6f8cbc2cbf9bd32220f76e38e03f6db9ba1d5c2cacdde6295d`

The patch resolves the duplicated parenthesis pairs by replacing the `fx12_parenthesis_001` to `fx12_parenthesis_006` side of each pair with new KS2-appropriate surfaces. The matching `fx12_parenthesis_021` to `fx12_parenthesis_026` items remain as the original approved surfaces. The patch also hardens the P20 audit/validator so full runtime duplicate surfaces are blocked, including fixed-bank duplicates.

## Fresh validation results

Patch apply check:

```text
git apply --check --ignore-whitespace: PASS
```

Fresh applied audit summary:

```json
{
  "source": "patched fresh extraction",
  "status": "PASS",
  "counts": {
    "runtimeItems": 15072,
    "uniqueLearnerSurfaces": 15072,
    "duplicateSurfaceGroups": 0,
    "generatedDuplicateSurfaceGroups": 0,
    "fixedDuplicateSurfaceGroups": 0,
    "legacyFixedDuplicateSurfaceGroups": 0
  },
  "duplicateSamples": []
}
```

Patched runtime uniqueness test:

```text
1..1
# tests 1
# pass 1
# fail 0
```

Patched targeted runtime/scheduler/input tests:

```text
1..30
# tests 49
# pass 49
# fail 0
```

Patched session UI/input tests:

```text
1..20
# tests 20
# pass 20
# fail 0
```

Patched P20 expansion tests:

```text
1..7
# tests 7
# pass 7
# fail 0
```

Patched P20 verifier tail:

```text
> ks2-mastery@0.1.0 audit:punctuation-qg:p20-expansion
> node scripts/audit-punctuation-qg-p20-expansion.mjs --out reports/punctuation/punctuation-qg-p20-expansion-audit.json

Punctuation QG P20 expansion audit: PASS
  release: punctuation-qg-p20-15072-2026-05-04
  runtime/generated/fixed: 15072/14560/512
  unique surfaces/signatures: 15072/15072
  generated families: 126
  failing gates: none
P20 expansion report validation: PASS
  release: punctuation-qg-p20-15072-2026-05-04
  runtime/generated/fixed: 15072/14560/512
  unique surfaces/signatures: 15072/15072

> ks2-mastery@0.1.0 verify:punctuation-qg:p20-live
> node scripts/validate-punctuation-qg-p20-live-evidence.mjs reports/punctuation/punctuation-qg-p20-production-smoke.json && node --test tests/punctuation-qg-p20-production-evidence.test.js

Punctuation QG P20 live evidence validation: PASS
TAP version 13
# Subtest: P20 production smoke certifies deployed punctuation heavy-play release
ok 1 - P20 production smoke certifies deployed punctuation heavy-play release
  ---
  duration_ms: 4.257277
  type: 'test'
  ...
# Subtest: P20 live evidence validator requires persisted dash acceptance outcomes
ok 2 - P20 live evidence validator requires persisted dash acceptance outcomes
  ---
  duration_ms: 1.677625
  type: 'test'
  ...
1..2
# tests 2
# suites 0
# pass 2
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 210.857739
```

## Files in this package

- `contract/punctuation-p20-runtime-surface-uniqueness-hotfix-contract.md`
- `patches/001-punctuation-p20-fixed-duplicate-surface-and-gate.patch`
- `validation/` logs and JSON audit outputs
- `interface-recommendations/punctuation-session-interface-next-contract.md`

## Limit

This package verifies the patched ZIP snapshot locally. It does not certify that the new hotfix has been deployed to production.
