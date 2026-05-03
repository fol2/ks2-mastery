# Punctuation QG manual content expansion notes

Source snapshot: `/mnt/data/ks2-mastery-lean-04302325.zip`.

This is a source patch, not a live deployment. It deliberately changes the product content surface, not just verifier wording.

## Delivered content

- New manual generated-template bank: `shared/punctuation/manual-expansion-bank.js`.
- New fixed-choice expansion bank: `shared/punctuation/fixed-expansion-items.js`.
- `shared/punctuation/generators.js` now merges existing 8 DSL templates with 32 manual templates per family.
- `PRODUCTION_DEPTH` is raised to 40 so the generated production pool is 28 families × 40 templates = 1120 generated items.
- Three generated `choose` families expand the first-click surface beyond the fixed choice bank.
- `shared/punctuation/content.js` now includes 56 new fixed choice questions across the published punctuation skill set.
- New audit script: `scripts/audit-punctuation-manual-expansion.mjs`.
- New regression test: `tests/punctuation-manual-expansion.test.js`.

## Local audit result

```json
{
  "ok": true,
  "fixedItems": 148,
  "fixedExpansionItems": 56,
  "generatedFamilies": 28,
  "generatedChooseFamilies": 3,
  "templatesPerFamilyMin": 40,
  "templatesPerFamilyMax": 40,
  "productionDepth": 40,
  "capacityDepth": 40,
  "generatedItems": 1120,
  "totalRuntimePool": 1268,
  "uniqueGeneratedModels": 850,
  "generatedModelDuplicateGroups": 270,
  "uniqueGeneratedStems": 985,
  "generatedStemDuplicateGroups": 135,
  "manifestErrors": [],
  "familyTemplateProblems": [],
  "generatedModelFailures": [],
  "fixedExpansionChoiceFailures": []
}
```

## Important follow-up after applying

The old P8/P9/P10 reviewer fixtures remain historical evidence for the depth-4 / 192-item world. P11 now treats those checks as composed historical gates and uses `npm run verify:punctuation-qg:p11` as the current source gate for the 1268-item pool.
