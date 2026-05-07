# Validation summary

Source ZIP:

`/mnt/data/ks2-mastery-lean-05070029.zip`

Source ZIP SHA-256:

`fb4bfc0fb0dc0ca92dd17513de33a9f2eb722d1edb9bce4cc664d29e6f19be9a`

## Real-service Smart-session probe

Baseline uploaded ZIP:

```json
{
  "exposures": 300,
  "uniqueItems": 157,
  "uniqueSignatures": 157,
  "immediateRepeats": 0,
  "sessionsWithDuplicateItems": 0,
  "sessionsWithDuplicateSignatures": 0,
  "sessionsWithFewerThanFourModes": 0
}
```

Patched extraction:

```json
{
  "exposures": 300,
  "uniqueItems": 262,
  "uniqueSignatures": 262,
  "immediateRepeats": 0,
  "sessionsWithDuplicateItems": 0,
  "sessionsWithDuplicateSignatures": 0,
  "sessionsWithFewerThanFourModes": 0
}
```

## Completed validation logs included

- `validation/patch-git-apply-check.log`
- `validation/patch-git-apply.log`
- `validation/real-scheduler-heavy-play-test.log`
- `validation/session-input-and-scheduler-tests.log`
- `validation/audit-punctuation-qg-p20-expansion.log`
- `validation/validate-punctuation-qg-p20-live-evidence.log`
- `validation/punctuation-qg-p20-production-evidence-test.log`

## Notes

The package was rebuilt using `/tmp` working directories and only the final small ZIP is left under `/mnt/data`, to avoid upload-status trouble from large extracted repo folders.
