# Content Operations Production Proof

This runbook captures repeatable proof for Content Operations releases that affect learner-facing spelling runtime surfaces.

## When To Run

Run the proof after any deployment that changes one of these areas:

- Content Operations package approval, publish, rollback, or release history.
- Spelling runtime resolution from the global Content Operations release.
- Word Bank rows, word audio, or sentence audio.
- Hero / Codex exposure for spelling reward tracks.
- Monster image assets published through a Content Operations package.

The pre-deploy gates remain:

```powershell
npm test
npm run check
```

## Authentication

The Content Operations proof script needs an admin session because it reads admin release metadata and can optionally capture proof into Release History.

Use one of these:

- `KS2_CONTENT_OPS_ADMIN_COOKIE` containing a `ks2_session=...` cookie.
- `--cookie "ks2_session=..."`.
- `KS2_SMOKE_ACCOUNT_EMAIL` and `KS2_SMOKE_ACCOUNT_PASSWORD` for the dedicated smoke account.

Do not commit cookies, passwords, or raw session headers into reports.

## Content Operations Release Proof

Read-only verification:

```powershell
npm run smoke:production:content-operations -- --out reports/content-operations/production-proof.json
```

Capture proof into Release History:

```powershell
npm run smoke:production:content-operations -- --capture-proof --out reports/content-operations/production-proof.json
```

When the release changes word or sentence audio, generate the audio proof first and pass it into the release-level capture:

```powershell
npm run smoke:production:spelling-audio-proof -- --require-word-hit --out reports/content-operations/spelling-audio-proof.json
npm run smoke:production:content-operations -- --capture-proof --audio-proof reports/content-operations/spelling-audio-proof.json --out reports/content-operations/production-proof.json
```

The script verifies:

- Admin overview and release list can read the latest release.
- Release detail includes history and the published snapshot.
- `/api/content/spelling` is sourced from `content_operation_release`, with the same release id and snapshot hash.
- Demo bootstrap exposes Spelling setup and the current monster visual config.
- Word Bank returns learner-visible rows.
- Hero / Codex read-model returns a valid hero envelope.
- Monster rendering config is present, and published runtime asset references are present when the release history requires them.

The proof payload uses the canonical surface keys:

- `spellingSetup`
- `wordBank`
- `heroCodex`
- `monsterRendering`

When `--capture-proof` is used, `--out` is required so the Release History proof includes the evidence path.

## Spelling Audio Proof

The audio wrapper keeps the existing TTS smoke contract and adds a proof-ready evidence envelope:

```powershell
npm run smoke:production:spelling-audio-proof -- --require-word-hit --out reports/content-operations/spelling-audio-proof.json
```

It verifies:

- Word-only TTS cache lookups for sampled Word Bank words.
- Sentence audio cache fallback.
- Cross-account word audio invariants: per-learner prompt tokens differ, but shared word-only R2 keys and bytes remain stable.

The wrapper writes local evidence using the `wordBank` production proof surface shape. Pass that evidence to the Content Operations proof script with `--audio-proof` when Release History needs to link audio proof to the release.

## Release History Expectations

After proof capture, the Release History row should show:

- Proof status: `Recorded`.
- Linked surfaces matching the release requirement.
- No missing learner-facing surfaces for an activated release.

If a release includes hero exposure or monster image asset changes, the row should include `Hero / Codex` or `Monster rendering` respectively.

## Failure Handling

- Exit `1`: the server responded but the release/runtime contract is wrong. Treat this as a release blocker.
- Exit `2`: local usage or authentication is incomplete. Fix the invocation or smoke credentials.
- Exit `3`: network, timeout, or upstream service failure. Retry once after checking production health.

If proof capture fails after verification passes, do not re-publish the package. Re-run the capture with the same evidence path after confirming the admin session still has `content_operations.publish`.
