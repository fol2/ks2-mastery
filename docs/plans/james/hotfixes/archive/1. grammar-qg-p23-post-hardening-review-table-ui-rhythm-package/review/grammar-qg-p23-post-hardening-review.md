# Grammar QG P23 Post-Hardening Review

## Source boundary

Primary authority: uploaded ZIP `ks2-mastery-lean-05121226.zip`.

Supplementary authority: GitHub commit metadata for the already-implemented P22 hardening lineage. GitHub was not used to override the ZIP snapshot.

Production authority: not certified by this package.

## Snapshot verdict

The implemented post-hardening Grammar snapshot is broadly healthy. P21/P22 quality and repetition gates remain green in the supplied ZIP:

- Grammar template inventory remains `546`.
- P21 local repetition audit passes with `0` violations and `0` warnings.
- Content quality seeds `1..3` pass with `1638` checks, `0` hard failures, and `0` advisories.
- P19 smart-practice audit passes with `33` sessions, `0` failures, and `0` advisories.
- P21 pool expansion tests pass.

Two Grammar-only issues were found.

## Finding 1 — heterogeneous table-choice rows lost their row-specific options

Severity: learner-facing UI correctness / accessibility.

A generated table-choice item can have row-specific choices. Example from the ZIP:

- row 0 options: `the`, `rusty`, `old`, `bicycle`
- row 1 options: `noun`, `adjective`, `adverb`, `determiner`

The raw generated item was correct, but `safeInputSpec()` stripped `rows[].options` and `rows[].ariaLabel` before sending the public read model. That meant the UI could only fall back to global columns, mixing word-token choices and word-class choices into both rows.

Impact:

- The learner may see irrelevant choices in a row.
- The table-choice surface is less intuitive than intended.
- Screen-reader context is weaker because row aria labels are lost.

P23 fix:

- Preserve safe row options and row aria labels in the read model.
- Add Worker/read-model regression coverage.

## Finding 2 — extended focused sessions could form long same-shape runs

Severity: learner-experience / practice effectiveness.

The P21 local repetition gate caught exact/near prompt repeats, but it did not block long interaction-shape runs. A 10-question focused queue could still produce eight or nine `choose` items in a row even when other question types were available.

Baseline probe examples:

- `satsset/formality`, seed `198`: run of `9` `choose` items.
- `smart/parenthesis_commas`, seed `163`: run of `8` `choose` items.
- `trouble/parenthesis_commas`, seed `163`: run of `8` `choose` items.

Baseline scan found `1084` cases with a same-question-type run of length `>= 4`.

P23 fix:

- Add a question-type run ceiling of `3` inside queue selection.
- Prefer candidate or broad-fallback alternatives before selecting a fourth same-shape item.
- Add regression coverage across `smart`, `trouble`, `satsset`, all concepts, and deterministic seeds.

Patched scan result: `0` cases with a same-question-type run of length `>= 4` in the scanned scenario window.

## Finding 3 — performance tripwire skips were not ZIP/runtime-safe

Severity: test harness hygiene.

The lean environment is Node 18 while `.nvmrc` expects Node 22. The performance tripwire contained two skip calls using the wrong API and a call-count probe requiring Node 22 module mocking.

P23 fix:

- Use `t.skip()` correctly.
- Add an explicit Node major-version guard for the call-count probe.
- Preserve the full probe for Node 22 release environments.

## Product interpretation

P23 improves the subject without changing the curriculum pool:

- Table-choice questions become more precise and easier to use.
- Focused sessions feel less monotonous.
- Existing P21/P22 gates stay green.

This is the right kind of next step after pool expansion: keep widening the pool later, but also harden the lived learner experience so the same content feels varied, deliberate, and fair.
