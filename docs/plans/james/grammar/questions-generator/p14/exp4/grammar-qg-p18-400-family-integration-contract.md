# Grammar QG P18 — 400-Family Manual Expansion Integration Contract

This is a content integration contract for the new **400-family / 4,800-case** manual Grammar QG bench. It is not a request to build AI generation. The content pack is authored as structured expert content and must be integrated through the existing Grammar QG safety pipeline.

## Inputs

- Delta pack: `grammar-qg-p18-manual-expansion-delta-100-families.json`
- Combined pack: `grammar-qg-p18-manual-expansion-400-families.json`
- Audit: `grammar-qg-p18-manual-expansion-400-families-audit.json`

## Acceptance target

After review and selective promotion, Grammar should have a materially broader bench than P14/P17, with the combined proposed manual bench offering 400 families and 4,800 cases before certification trimming.

## Non-negotiables

- New content enters as `draft_only`.
- No learner scheduling until each family has a quality-register decision.
- No same-template repeat in ordinary short sessions.
- No recent-surface repeat unless deliberate retry/trouble/spaced retrieval.
- All constructed-response cases require a marking matrix.
- All selected-response cases require distractor rationale and exactly one defensible correct answer unless explicitly multi-select/table.
- All prompt-cue/read-aloud surfaces require semantic audit.

## Release work

1. Import P18 delta or combined source.
2. Generate reviewer artefacts for all P18 families.
3. Fix rejected/limited cases.
4. Promote accepted families.
5. Regenerate P18/P19 artefacts with a new release ID.
6. Run `verify:grammar-qg-production-release`.
7. Deploy and run production smoke.

## Telemetry after release

Track: duplicate template exposure, duplicate visible surface exposure, unique family count per learner per week, weak-concept recovery, time-on-task by depth tier, Star progress pace, and abandonment by template family.
