# Punctuation P20 validation hotfix package

Generated: 2026-05-07
Source ZIP: `/mnt/data/ks2-mastery-lean-05070029.zip`
Source ZIP SHA-256: `fb4bfc0fb0dc0ca92dd17513de33a9f2eb722d1edb9bce4cc664d29e6f19be9a`

This package contains a repo-root patch, a contract, and local validation logs for the Punctuation P20 real-scheduler, session-input hardening, and related P20 generated-family cluster metadata patch.

Apply from the repository root:

```bash
git apply --check --ignore-whitespace patches/001-punctuation-p20-real-scheduler-and-session-ui-hardening.patch
git apply --ignore-whitespace patches/001-punctuation-p20-real-scheduler-and-session-ui-hardening.patch
```

The original package was expanded during repo application because full-window validation exposed an in-contract P20 metadata blocker: the generated `parenthesis` and `semicolon` primary skill cluster IDs were inverted. The expanded patch corrects only those two cluster metadata values and does not change P20 item surfaces, answers, generator templates, release IDs, or item counts.

Patch SHA-256: `d57fed5db7454350398c503bc0b0490f9403ba5aa7e6ec06b372dc128da8b3f5`
