# Punctuation QG manual content expansion notes

Source snapshot: `/mnt/data/ks2-mastery-lean-04302325.zip`.

This is a source patch, not a live deployment. It deliberately changes the product content surface, not just verifier wording.

## Delivered content

- New manual generated-template bank: `shared/punctuation/manual-expansion-bank.js`.
- New fixed-choice expansion bank: `shared/punctuation/fixed-expansion-items.js`.
- `shared/punctuation/generators.js` now merges existing 8 DSL templates with 32 manual templates per family.
- `PRODUCTION_DEPTH` is raised to 40 so the generated production pool is 25 families × 40 templates = 1000 generated items.
- `shared/punctuation/content.js` now includes 56 new fixed choice questions across the published punctuation skill set.
- New audit script: `scripts/audit-punctuation-manual-expansion.mjs`.
- New regression test: `tests/punctuation-manual-expansion.test.js`.

## Local audit result

```json
{
  "ok": true,
  "fixedItems": 148,
  "fixedExpansionItems": 56,
  "generatedFamilies": 25,
  "templatesPerFamilyMin": 40,
  "templatesPerFamilyMax": 40,
  "productionDepth": 40,
  "capacityDepth": 40,
  "generatedItems": 1000,
  "totalRuntimePool": 1148,
  "uniqueGeneratedModels": 730,
  "generatedModelDuplicateGroups": 270,
  "uniqueGeneratedStems": 864,
  "generatedStemDuplicateGroups": 136,
  "manifestErrors": [],
  "familyTemplateProblems": [],
  "generatedModelFailures": [],
  "fixedExpansionChoiceFailures": []
}
```

## Important follow-up after applying

The old P8/P9/P10 verifiers and reviewer fixtures were written for the depth-4 / 192-item world. After applying this content patch, count-based verifier expectations and reviewer-decision fixtures must be regenerated for the 1148-item pool.
