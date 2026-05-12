# Next Punctuation Subject quality contract

The question-session interface is not the current blocker. The existing frame already supports the main usability needs: one primary submit action, disabled blank text submissions, editable text surfaces where needed, and anti-repeat scheduling. The next best improvement is subject-quality hardening, not another UI surface.

## Next ring: precision-language lint for all generated punctuation items

Punctuation questions must teach the target mark while still modelling clean English around it. A child should never see a generated option that looks like a renderer glitch, grammar mistake, or broken string concatenation.

Add a reusable generated-content quality lint that checks every runtime item for:

- missing-space joins such as `word-wordnoun`;
- article agreement around generated adjective/noun phrases;
- adverbial `-ly` hyphen compounds;
- obvious repeated words caused by template stitching;
- double spaces and missing spaces around punctuation;
- malformed quote spacing;
- distractors that are wrong only because they are nonsensical rather than because they represent a punctuation misconception.

## Question quality principle

Wrong options should be educationally wrong, not broken. A good distractor should reveal a specific misconception, such as wrong hyphen boundary, missing comma, comma splice, unbalanced parenthesis, or wrong speech punctuation. It should not look like `ice-colddesign` or rely on surrounding grammar mistakes.

## Scheduler/interface principle

Keep the current one-primary-action question frame. Do not add more buttons or mode choices inside the session. Improve intuitiveness through short mode-specific instruction text and cleaner examples, not by widening the frame.

## Extra-credit challenge principle

For beyond-KS2 stretch, use constrained transfer rather than obscure terminology. Good challenge examples are:

- choosing the best punctuation in a sentence where two plausible marks compete;
- fixing punctuation while preserving every word;
- transferring a rule to a new context;
- explaining why a distractor is wrong after the answer.

Do not add advanced challenge by using rare punctuation trivia or malformed distractors.
