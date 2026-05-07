# Punctuation P20 real-scheduler + session UI hotfix package

This is a recreated package with a fresh filename after the prior sandbox upload handle expired.

Source reviewed: `/mnt/data/ks2-mastery-lean-05070029.zip`

Main patch:

`patches/001-punctuation-p20-real-scheduler-and-session-ui-hardening.patch`

Apply from repo root:

```bash
git apply patches/001-punctuation-p20-real-scheduler-and-session-ui-hardening.patch
```

Patch scope:

- `shared/punctuation/scheduler.js`
- `src/subjects/punctuation/components/PunctuationSessionScene.jsx`
- `tests/punctuation-qg-p20-real-scheduler-heavy-play.test.js`
- `tests/punctuation-session-input-hardening.test.js`

It does not change Punctuation marking semantics, Stars/rewards, Hero Mode, monsters, or subject progression.
