# Grammar QG P18 — Manual Expansion to 400 Families

Status: **draft for review, not scheduler-ready**  
Base release: `grammar-qg-p14-2026-05-01`  
Created: 2026-05-02T18:10:40.560171+00:00

## Counts

| Pack | Families | Cases |
|---|---:|---:|
| P17 baseline combined | 300 | 3,600 |
| P18 delta | 100 | 1200 |
| Combined P18 | 400 | 4800 |

## Combined variety

- Unique learner-visible surfaces: **4759**
- Unique prompt texts: **4165**
- Concepts covered: **18**
- Minimum cases per family: **12**

## Delta design

P18 adds 100 more proposed template families with 12 cases each. The delta includes five new family patterns per concept across all 18 Grammar concepts, plus ten mixed-transfer families. These cases are intended to deepen the bench, not to bypass production certification.

## Use

Use the delta pack if P17 has already been imported:

`grammar-qg-p18-manual-expansion-delta-100-families.json`

Use the combined pack if engineering wants one import source:

`grammar-qg-p18-manual-expansion-400-families.json`

## Required before scheduling

1. Import as `draft_only`.
2. Generate reviewer packs.
3. Run answerability, grammar logic, distractor, constructed-response marking, prompt-cue and read-aloud reviews.
4. Promote only approved / approved_with_limitation families.
5. Regenerate render inventory, quality register, distractor audit, marking matrix, certification status map and runtime source.
6. Deploy under a new content release ID and run production smoke.
