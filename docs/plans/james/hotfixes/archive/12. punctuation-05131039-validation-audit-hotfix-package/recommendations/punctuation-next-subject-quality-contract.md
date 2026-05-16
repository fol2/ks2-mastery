# Next Punctuation subject-quality contract recommendation

After P23 proper-noun capitalisation is implemented, the next highest-value Punctuation quality ring should be a model-answer typography and task-scope audit.

## Why

The subject is now strong on runtime scale, anti-repeat behaviour, hyphen quality, contraction grammar, and proper-name capitalisation. The next visible quality frontier is not more quantity; it is ensuring every model answer teaches exactly one intended punctuation target without accidental secondary corrections.

## Proposed next gate

Add a `singleTargetCorrectionQuality` audit that samples or scans generated open-response items and flags model/stem pairs where the answer requires extra unadvertised corrections beyond the task skill.

Examples to block:

- a comma task where the model also changes capitalisation;
- a speech task where the model also rewrites wording;
- a semicolon task where the model also fixes a list comma;
- a parenthesis task where the model changes sentence content rather than only punctuation;
- an answer where a proper noun or article is repaired incidentally outside the advertised skill.

## Acceptance

- Each generated open-response item must have a declared target punctuation delta.
- The audit must compare stem/model and classify edits as target punctuation, allowed formatting, or out-of-scope content change.
- Out-of-scope content-change findings must be zero.
- Stems may intentionally include errors only when the prompt clearly asks for that error class.
- The report validator must fail on non-zero out-of-scope findings.

## Product reason

Top-world KS2 practice should not make a child guess which hidden English repair is wanted. One item should teach one clear skill, or a declared mixed-skill paragraph task. This protects trust and makes feedback sharper.
