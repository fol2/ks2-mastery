# Grammar 05080102 validation audit + UI hotfix package

This package recreates the Grammar validation/hotfix bundle for `ks2-mastery-lean-05080102.zip`.

Primary source snapshot: uploaded ZIP `/mnt/data/ks2-mastery-lean-05080102.zip`.

Patch included:

- `patches/001-grammar-session-readonly-end-round.patch`

Patch purpose:

- In `src/subjects/grammar/components/GrammarSessionScene.jsx`, the normal-session `End round` ghost button now disables when the runtime is read-only, not only while a command is pending.
- In `tests/ui-action-engine-contract.test.js`, a parser-level regression test locks this behaviour.

Files changed by the patch:

- `src/subjects/grammar/components/GrammarSessionScene.jsx`
- `tests/ui-action-engine-contract.test.js`

No Grammar content, answer marking, question generation, Stars, rewards, monsters, Hero Mode, or subject-progress logic is changed.

Apply from the repository root with:

```bash
patch -p1 < patches/001-grammar-session-readonly-end-round.patch
```

Validation logs are in `validation/`.
