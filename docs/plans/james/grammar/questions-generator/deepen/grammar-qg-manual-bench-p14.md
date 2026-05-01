# Grammar QG Manual Bench Expansion P14

This is a separate content-bench line. It is not another certification-only phase. It extends the P14 production-candidate bench with a draft manual layer before any generator integration.

## Summary

- Pack ID: `grammar-qg-manual-bench-p14-2026-05-01`
- Current P14 content release: `grammar-qg-p14-2026-05-01`
- Current certified template families: 110
- New human-authored template families in this pack: 78
- Total target after integration: 188 template families
- Hand-authored seed cases in this pack: 156
- Language: UK English
- Status: draft for engineering integration and adult review

## Why this exists

P14 materially deepened Grammar QG by adding 32 production-candidate template families, expanding the former 23 low-diversity fixed-bank families to at least 10 learner-visible surfaces each, and certifying a 110-family / 3300-instance render inventory. This separate pack goes beyond P14: it adds a draft manual bench layer for broader conceptual coverage after the P14 U2 repetition blocker has been cleared.

## Concept distribution

- `active_passive`: 6 new template families
- `adverbials`: 4 new template families
- `apostrophes_possession`: 4 new template families
- `boundary_punctuation`: 4 new template families
- `clauses`: 9 new template families
- `formality`: 4 new template families
- `hyphen_ambiguity`: 4 new template families
- `modal_verbs`: 4 new template families
- `noun_phrases`: 6 new template families
- `parenthesis_commas`: 5 new template families
- `pronouns_cohesion`: 4 new template families
- `punctuation_precision`: 1 new template family
- `relative_clauses`: 4 new template families
- `sentence_functions`: 4 new template families
- `speech_punctuation`: 5 new template families
- `standard_english`: 4 new template families
- `subject_object`: 5 new template families
- `tense_aspect`: 5 new template families
- `word_classes`: 7 new template families

## Integration rules

1. Do not replace the existing 110 P14 templates. Add these as a new manual bench layer.
2. New templates must start `draft_only` / blocked from learner scheduling until oracle, prompt-cue, marking and adult-review evidence passes.
3. No scoring, mastery, Stars, Mega, Hero Mode or reward change belongs in this line.
4. Every selected-response option must have a misconception/rationale. Every constructed-response item must have golden, accepted variants and near-miss negatives before production.
5. After integration, rerun diversity analysis by learner-visible surface, not just template count.

## Files

- `grammar-qg-manual-bench-p14.json`: complete machine-readable content pack
- This markdown file: product/engineering orientation

## First acceptance target

Integrating this pack should raise the active template-family denominator from 110 to 188 and reduce same-surface repetition. It should not be counted as production content until it passes the same quality gates as P13/P14.
