# Grammar P18 full-scope quality review

**Primary source:** uploaded ZIP `ks2-mastery-lean-05030023.zip` extracted locally.  
**Supplement:** GitHub exact-file checks for P18 report and production smoke.  
**Release reviewed:** `grammar-qg-p18-2026-05-02`.

## Executive verdict

P18 is credible as a post-deploy production release: the release denominator, manifest, runtime certification source, semantic prompt-cue audit, content-quality hard-fail audit, and production smoke evidence all line up. The pool is now materially broader than P14: **510 templates**, **15,300 render inventory items**, **7,293 unique learner-visible surfaces**, and **5,795 unique prompt texts**.

However, the full-scope content review found **three quality issues that should be fixed before treating P18 as a mature long-term Grammar product**, even though they do not invalidate the release safety smoke:

1. **Article-agreement wording defects**: learner-facing text contains phrases like `a adverb`, `a adjective`, and `a exclamation`.
2. **Open-ended text/textarea prompts are often exact-scored**: 2,730 render items across 91 templates ask for explanations / builds / transfer but mark against a single exact normalised answer. This is too strict for children and will create false negatives.
3. **One pronoun-cohesion family has contradictory feedback**: `Explain why this version is unclear: Amira picked up the map. It folded she carefully.` is answered with “The pronouns clearly refer back...”, which contradicts the prompt.

## What is good

- Content release: `grammar-qg-p18-2026-05-02`.
- Concepts: 18.
- Templates: 510.
- Selected-response templates: 317.
- Constructed-response templates: 193.
- Explain templates: 126.
- Mixed-transfer templates: 26.
- Deep audit: 0 generated signature collisions / repeated variants / low-depth generated templates.
- Semantic prompt-cue audit: 15,300 checked, passed=True, findings=0.
- Content-quality audit: 15,300 checked, hard failures=0, advisories=188.
- Distractor audit: 7,680 selected-response items, S0=0, S1=0.
- Marking matrix: 945 entries.
- Quality register: 506 approved + 4 approved_with_limitation, 0 blocked.

## Findings requiring follow-up

### S1: open-ended explain/build/transfer tasks are exact-scored

I found 2,730 render items across 91 template families where a text/textarea item asks for an explanation, build, mixed check, or transfer but the answer spec is `normalisedText`/`acceptedSet` with a narrow golden answer. This is the highest product-quality issue because a child can give a grammatically correct explanation in different words and still be marked wrong.

Examples:

- `qg_p18_p16_adverbials_explain_fronted_comma`: asks why the comma is used, but accepts one exact wording.
- `qg_p18_p17_*_transfer_apply`: asks the child to solve an item **and** write a new example, but accepts a stock phrase such as `Answer: ... New example should show the same rule.`
- `qg_p18_p18_*_application_transfer`: many are explanation-style textareas with one golden sentence.

**Recommendation:** convert these to either selected-response explanation choices, structured multi-field closed tasks, or manual-review-only/non-scored transfer evidence. Do not treat exact free-text explanation as mastery evidence.

### S2: article-agreement defects in visible copy

Article agreement defects found:

| Pattern | Items, all fields | Prompt-only items | Template count |
|---|---:|---:|---:|
| `a adverb` | 64 | 27 | 9 |
| `a adjective` | 54 | 18 | 10 |
| `a exclamation` | 73 | 23 | 9 |

These are not usually answerability blockers, but they look unprofessional and undermine trust.

### S1: pronoun-cohesion contradictory feedback

`qg_p18_p18_pronouns_cohesion_application_transfer` asks why an unclear pronoun sentence is unclear, but the accepted answer and feedback say the pronouns clearly refer back. This is logically wrong for at least 9 inventory items.

Example prompt:

> Explain why this version is unclear: Amira picked up the map. It folded she carefully.

Current feedback:

> The pronouns clearly refer back to Amira and the map.

**Recommendation:** correct all 12 source cases in this family and regenerate manual expansion.

### S2: noisy curly-apostrophe advisory

The content-quality audit reports 188 reversed-curly-quote advisories. Most are possessive apostrophes such as `dog’s`, not reversed quotation marks. The regex should only flag a closing curly quote used at the start of a word, not an apostrophe after a word character.

### S2: learner-surface audit sample is too small for 510 templates

`grammar-qg-p18-learner-surface-audit.json` has 8 click-paths and passes, which is useful, but it is not enough as a full workflow UX audit for a 510-template pool. Keep it, but add a broad session simulation over many seeds/profiles.

## Workflow / UX / UI judgement

The core Grammar workflow is now safer than earlier phases: no same-template repeat was observed in a 20-session smart-practice simulation, the semantic cue audit passes, and the production smoke covers read-model / answer-leak / cue assertions. The remaining UX concern is **not the screen chrome**; it is **marking fairness and wording polish** inside the enlarged content pool.

A child-facing flow can still feel unfair if:

- a free-text explanation is correct but not identical to the golden sentence;
- feedback uses awkward generated copy such as “a adverb”;
- a transfer prompt says “write a new sentence” but the marker expects a fixed stock phrase.

## Recommendation

Keep P18 live, but treat the issues above as a **P19 quality-hardening follow-up**, not as new feature work. Do not add more families until the exact-scored open-response issue is resolved or explicitly converted to non-scored/manual review.
