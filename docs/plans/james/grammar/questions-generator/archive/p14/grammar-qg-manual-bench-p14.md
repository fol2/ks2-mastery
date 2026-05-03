# Grammar QG Manual Bench Expansion P14

This is a separate content-bench line. It is not another certification-only phase. It manually doubles the template-family bench before generator integration.

## Summary

- Pack ID: `grammar-qg-manual-bench-p14-2026-05-01`
- Current certified template families: 78
- New human-authored template families in this pack: 78
- Total target after integration: 156 template families
- Hand-authored seed cases in this pack: 156
- Language: UK English
- Status: draft for engineering integration and adult review

## Why this exists

The previous phases made Grammar QG safer and production-certified, but they did not materially deepen the bench. This pack addresses the product problem directly: more distinct, manually authored question families with better conceptual spread.

## Concept distribution

- `active_passive`: 5 new template families
- `adverbials`: 4 new template families
- `apostrophes_possession`: 4 new template families
- `boundary_punctuation`: 4 new template families
- `clauses`: 5 new template families
- `formality`: 4 new template families
- `hyphen_ambiguity`: 4 new template families
- `modal_verbs`: 4 new template families
- `noun_phrases`: 5 new template families
- `parenthesis_commas`: 4 new template families
- `pronouns_cohesion`: 4 new template families
- `punctuation_precision`: 0 new template families
- `relative_clauses`: 4 new template families
- `sentence_functions`: 4 new template families
- `speech_punctuation`: 5 new template families
- `standard_english`: 4 new template families
- `subject_object`: 4 new template families
- `tense_aspect`: 5 new template families
- `word_classes`: 5 new template families

## Integration rules

1. Do not replace the existing 78 templates. Add these as a new manual bench layer.
2. New templates must start `draft_only` / blocked from learner scheduling until oracle, prompt-cue, marking and adult-review evidence passes.
3. No scoring, mastery, Stars, Mega, Hero Mode or reward change belongs in this line.
4. Every selected-response option must have a misconception/rationale. Every constructed-response item must have golden, accepted variants and near-miss negatives before production.
5. After integration, rerun diversity analysis by learner-visible surface, not just template count.

## Files

- `grammar-qg-manual-bench-p14.json`: complete machine-readable content pack
- This markdown file: product/engineering orientation

## First acceptance target

Integrating this pack should raise the active template-family denominator from 78 to 156 and reduce same-surface repetition. It should not be counted as production content until it passes the same quality gates as P13.

