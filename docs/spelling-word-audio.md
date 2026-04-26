# Spelling Word Bank audio cache — operator runbook

## Overview

This runbook covers the end-to-end procedure for (re)generating the
236-word × 2-voice = 472-object Word Bank audio cache that backs
`tts.speak({ wordOnly: true })` on production R2 (bucket
`ks2-spelling-buffers`).

It is the operator-facing companion to plan
[`docs/plans/2026-04-26-001-feat-spelling-word-audio-cache-plan.md`](./plans/2026-04-26-001-feat-spelling-word-audio-cache-plan.md)
and the per-run completion-report template
[`docs/reports/2026-04-26-spelling-word-audio-generation-report.md`](./reports/2026-04-26-spelling-word-audio-generation-report.md).
The institutional learning that documents the cache contract itself
lives at
[`docs/solutions/learning-spelling-audio-cache-contract.md`](./solutions/learning-spelling-audio-cache-contract.md).

Use this runbook when any of the triggers in **§1 When to regenerate**
fire. Maintained by whoever currently owns the spelling subject; see
the institutional learning entry for the contract-level details.

---

## 1. When to regenerate

Trigger a regeneration whenever any of the following changes:

1. **Word list change** — any edit to `WORDS` in
   `src/subjects/spelling/data/word-data.js` (additions, removals, or
   text changes to existing entries). The `contentKey` is content-addressed,
   so a different `word` text produces a different R2 path; the old object
   becomes orphaned and the new path is empty until regenerated.
2. **Cache key contract version bump** — any change to
   `SPELLING_AUDIO_VERSION` (`shared/spelling-audio.js:4`),
   `SPELLING_AUDIO_ROOT_PREFIX` (`shared/spelling-audio.js:6`),
   `SPELLING_AUDIO_MODEL`, or the contentKey hash input shape
   (`'spelling-audio-word-v1' | slug | word`). Any of these invalidates
   every existing object under the new key shape.
3. **R2 bucket migration** — any change to the binding
   `SPELLING_AUDIO_BUCKET` or the physical bucket
   (`ks2-spelling-buffers`) in `wrangler.jsonc` `r2_buckets[0]`. New
   bucket starts empty; existing objects must be re-uploaded.
4. **Published spelling snapshot version bump** — any change to
   `SEEDED_SPELLING_PUBLISHED_SNAPSHOT.wordBySlug` in
   `src/subjects/spelling/data/content-data.js` that affects
   `(slug, word, sentence)` for any of the 236 words. The Worker
   validates Word Bank prompt tokens against the snapshot's
   `wordBySlug[slug].word`, which is the exact text used to compute
   `contentKey`; if `WORDS[i].word` and snapshot diverge, the
   generator's preflight assertion will hard-stop the run before any
   Gemini spend.

> **Sentence audio (the 8 612 pre-PR-71 files) is out of scope.** Those
> files are served via PR 252's `legacyBufferedAudioKey` fallback; this
> runbook does not cover their regeneration.

---

## 2. Preflight checklist

Run these checks before starting any generation pass.

### 2.1 Environment variables

In `.env` (or shell environment):

- **Gemini key rotation pool.** At least one of:
  - `GEMINI_API_KEY` (primary)
  - `GEMINI_API_KEY_2`, `GEMINI_API_KEY_3`, ..., `GEMINI_API_KEY_N`
    (rotation pool — generator fans these out automatically)
  - `GEMINI_API_KEYS` (comma-separated list as a single env var)

  All three name shapes are accepted; the generator merges them into a
  single rotation pool and round-robins per request.
- **Cloudflare reconcile credentials** (only required for
  `reconcile` / `--from-r2-inventory` paths; not needed for plain
  `generate` runs):
  - `CLOUDFLARE_ACCOUNT_ID`
  - `CLOUDFLARE_API_TOKEN` (R2 read scope)

### 2.2 Tooling

```bash
# Wrangler OAuth alive
node ./scripts/wrangler-oauth.mjs whoami

# ffmpeg installed
ffmpeg -version
```

Both commands must exit `0`. The generator runs the same checks as a
preflight gate, so a missing tool aborts before any Gemini spend.

### 2.3 Contract sanity

```bash
# Eyeball-confirm word count
node -e "import('./src/subjects/spelling/data/word-data.js').then(m => console.log(m.WORDS.length))"
# Expected: 236
```

The generator's preflight asserts this plus per-slug `cleanText`
parity between `WORDS[i].word` and
`SEEDED_SPELLING_PUBLISHED_SNAPSHOT.wordBySlug[slug].word` for all
236 entries.

---

## 3. Standard run recipe

Follow this sequence for any production fill. Do **not** skip the
small-sample step. The cost of a wrong-prompt full run (472 wasted
Gemini calls + 472 corrupt R2 objects requiring batch deletion +
regen) far exceeds the 30-minute small-sample loop.

Detailed Appendix A command reference lives in the run report
template:
[`docs/reports/2026-04-26-spelling-word-audio-generation-report.md`](./reports/2026-04-26-spelling-word-audio-generation-report.md)
(§Appendix A — Command reference).

### 3.1 Baseline smoke (5 min)

```bash
npm run smoke:production:spelling-audio -- --json > .spelling-audio/baseline-smoke.json
```

Pre-fill expectations: word probes report `WARN miss`;
sentence-legacy probes pass. If sentence-legacy probes fail, **stop**
and investigate before proceeding — that is a higher-priority
incident than this fill.

### 3.2 Small sample (15 min)

```bash
npm run spelling:word-audio -- generate --slug accident,accidentally
```

Listen to all 4 mp3s under `.spelling-audio/word-runs/<runId>/`. If
voice quality is unacceptable for classroom use, escalate before the
full run.

### 3.3 Small-sample smoke (5 min)

```bash
npm run smoke:production:spelling-audio \
  -- --word-sample accident,accidentally --require-word-hit \
  --json > .spelling-audio/sample-smoke.json
```

All 4 word probes must hit; sentence-legacy probes must still pass;
cross-account invariant probe must pass.

### 3.4 Full run (60–90 min)

Confirm chosen race-mitigation policy from §6 is in effect.

```bash
npm run spelling:word-audio -- generate --concurrency 4
```

No `--slug` filter → all 236 words; auto-skips the 4 already-uploaded
from §3.2. Operator monitors logs; on transient 429/502, the script
auto-retries.

### 3.5 Post-run smoke (15 min)

```bash
npm run spelling:word-audio -- status --run-id <RUNID>
# Expected: 472 uploaded / 0 failed

npm run smoke:production:spelling-audio \
  -- --require-word-hit \
  --json > .spelling-audio/post-fill-smoke.json
```

Exit `EXIT_OK`. All sample word probes hit; sentence-legacy probes
still pass; cross-account invariant holds.

### 3.6 Run report (30 min)

Copy the template at
`docs/reports/2026-04-26-spelling-word-audio-generation-report.md`,
fill in run-id, timestamps, race window chosen, totals, smoke JSON
snapshots, and any deviations.

---

## 4. Resume on failure

The generator state file lives at
`.spelling-audio/word-runs/<runId>/state.json` and is the source of
truth for resumability. Each entry records
`status: 'pending' | 'generated' | 'uploaded' | 'failed'` plus
`attempts` and `lastError`. Writes are atomic (`.tmp.<pid>.<n>` +
rename) and per-entry, not just end-of-run, so a crash never loses
more than one in-flight entry. The generator installs `SIGINT` and
`SIGTERM` handlers that flush state before exiting.

### 4.1 Re-run with the same `--run-id`

```bash
npm run spelling:word-audio -- generate --run-id <RUNID>
```

Skips entries with `status: uploaded`. Retries `failed` and `pending`
entries.

### 4.2 Inspect state

```bash
npm run spelling:word-audio -- status --run-id <RUNID>
```

Prints planned / succeeded / failed / uploaded counts and any
`lastError` per entry.

### 4.3 State-file loss → mandatory reconcile

If the state file is lost (accidental `rm -rf .spelling-audio/`, OS
sync failure, machine reset), do **not** simply re-run `generate` —
that would re-call Gemini for every word and burn quota. Instead:

```bash
npm run spelling:word-audio -- reconcile --run-id <NEW-RUNID>
```

`reconcile` lists existing objects under
`spelling-audio/v1/{model}/{voice}/word/` via the Cloudflare REST API
(requires `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN`) and seeds
the new state file with `status: uploaded` for every present key.
After reconcile, run `generate` against the same `--run-id` to fill
any remaining gaps.

`--from-r2-inventory` is the same operation rolled into a `generate`
preflight.

---

## 5. Quota / cost reference

> **Placeholder until the first operator run.** Fill in from the
> completion report after first operator run; estimate ~$0.0X per
> word audio × 472 = ~$X total one-time spend. Once the steady-state
> cache is filled, per-month cost goes from ~$X (live calls on every
> warmup) to ~$0 (R2 storage + Worker egress only).

Quota / rotation budget is **independent** of the retry budget:
`--max-retries 0` fails fast on real errors but still rotates keys on
quota errors (HTTP 429 or 403 with `RESOURCE_EXHAUSTED`-style
payload). This is intentional — a key-pool exhaustion is not a retry
candidate, it is a different operator decision.

---

## 6. Live-regen race mitigation lifecycle

R2 PUT is last-writer-wins; Worker `storeBufferedGeminiAudio`
(`worker/src/tts.js:486`) calls `bucket.put(key, bytes, ...)` with no
`onlyIf` precondition. If a learner triggers
`tts.speak({ wordOnly: true })` (non-`cacheLookupOnly`) during the
60–90 min full run, the Worker's live regen could overwrite a
just-uploaded batch object with a slightly different live take —
silently.

### 6.1 Default policy: low-traffic UTC window

Schedule §3.4 in an agreed low-traffic window (typically
04:00–05:30 UTC — UK-night, mid-day in Asia-Pacific). KS2 is
publicly accessible globally; a window is statistical, not
structural — but it is sufficient for the 99 % case and avoids
Worker-side complexity.

Document the chosen window in the run report.

### 6.2 Escalation: `WORD_ONLY_BATCH_FILL_GUARD` env-flag

Use only if §6.1 cannot be honoured. Full procedure in
[`docs/reports/2026-04-26-spelling-word-audio-generation-report.md`
§Appendix B](./reports/2026-04-26-spelling-word-audio-generation-report.md).
Summary:

1. Open small follow-up PR adding the env-flag to Worker
   `storeBufferedGeminiAudio` so its `bucket.put(...)` call wraps in
   `onlyIf: { etagDoesNotMatch: '*' }` when the env var is set.
2. Deploy via `npm run deploy`. Note commit SHA + deploy time.
3. Run §3.4 full word-bank generation under the flag.
4. After §3.5 post-run verification passes, **toggle off** + redeploy
   + confirm Worker live-regen path resumes normal store behaviour.
5. Open a follow-up TODO PR to remove the flag entirely once a
   future audit confirms steady-state stability (no further need for
   batch fills).

The flag is **escalation only**. Do not introduce it as a default;
each instance is a small explicit Worker change with an explicit
removal TODO.

---

## 7. Where the audio plays

The pre-cached word audio is consumed by the Word Bank UI lane via
`tts.speak({ wordOnly: true })`:

- `'spelling-word-bank-word-replay'` action handler at
  `src/subjects/spelling/remote-actions.js:79` (registered in the
  remote-actions allowlist) and
  `src/subjects/spelling/module.js:499-509` (where the actual
  `tts.speak({ word, wordOnly: true })` call is made).

The Worker resolves the request via
`resolveSpellingAudioRequest({ wordOnly: true, ... })` and looks up
the cache slot keyed by `(model, voice, contentKey, slug)`.

Other UI surfaces that touch `tts.speak` (e.g., dictation drill
replay, drill replay-slow) consume the **sentence** cache lane and
are out of scope for this runbook.

---

## 8. Where the contract lives

The cache contract is split between the shared package and the
Worker. Treat all four locations as a single unit when reasoning
about contentKey or R2 key shape:

- **Shared key + prompt builders** —
  `shared/spelling-audio.js`:
  - `SPELLING_AUDIO_VERSION` (line 4),
    `SPELLING_AUDIO_ROOT_PREFIX` (line 6),
    `SPELLING_AUDIO_MODEL`.
  - `buildWordAudioAssetKey({ model, voice, contentKey, slug })` —
    canonical R2 key builder.
  - `buildBufferedWordSpeechPrompt({ wordText })` — canonical Gemini
    prompt template (used by both Worker live regen and batch
    generator; introduced by U1).
- **Worker TTS internals** — `worker/src/tts.js`:
  - `bufferedAudioMetadata` (line 284) — computes `contentKey`,
    routes wordOnly vs sentence.
  - `geminiPrompt` (line 556) — wraps
    `buildBufferedWordSpeechPrompt` for the wordOnly branch.
  - `storeBufferedGeminiAudio` (line 486) and
    `readBufferedGeminiAudio` (line 386) — write/read paths against
    R2.
- **Worker spelling resolver** —
  `worker/src/subjects/spelling/audio.js`:
  - `wordBankPromptToken` (line 38) — per-learner prompt token
    (deliberately omits accountId for cross-account R2 reuse).
  - `resolveSpellingAudioRequest` (line 109) — the only resolver
    path; do not modify.
- **Canonical SHA-256 helper** — `worker/src/auth.js:162-191`:
  - `bytesToBase64Url` (line 162) — URL-safe base64 encoding (no `=`
    padding, `+`→`-`, `/`→`_`).
  - `sha256(value)` (line 188) — returns base64url, **not hex**.

Any future change to any of these locations triggers a regeneration;
see §1 *When to regenerate*.

---

## 9. Why we use `wrangler-oauth.mjs` not raw `npx wrangler`

All wrangler invocations against production go through
`node ./scripts/wrangler-oauth.mjs <subcommand>`. The wrapper:

1. Reads `WORKERS_CI` / `CLOUDFLARE_API_TOKEN` from the environment.
2. **Cleans up `CLOUDFLARE_API_TOKEN`** when not in a Workers CI
   context (`WORKERS_CI !== '1'`) — otherwise the local OAuth
   credentials wrangler maintains in `~/.wrangler/` are bypassed in
   favour of an inferior token-only auth.
3. Spawns `npx wrangler` with the cleaned env, inheriting stdio.
4. On Windows, uses `npx.cmd` + `shell: true` per Node 20+ EINVAL
   hardening.

Raw `npx wrangler` is acceptable only for `--local` /
read-only operations against Miniflare. Production R2 / D1 work must
go through the wrapper to preserve OAuth handling and the
CI-token cleanup. The same pattern is used by `db:migrate:remote`
(`package.json:29`) and `deploy` (`package.json:36`); the spelling
generator follows the same convention.

The `--remote` flag MUST be passed explicitly to every
`r2 object put` invocation. `wrangler` 4.x has no documented default
for `r2 object put`; omitting both `--remote` and `--local` may
silently target Miniflare local persistence. The generator and any
hand-typed commands in this runbook always pass `--remote`.

---

## 10. `contentKey` digest format note

The `contentKey` is **base64url** (no `=` padding,
`+`→`-`, `/`→`_`), produced by `worker/src/auth.js`
`bytesToBase64Url`. It is **not hex**.

Anyone hand-constructing or grepping R2 keys must NOT expect hex
digests. Example shapes:

- Correct (base64url): `_71BbbYsUhNeilGccY6U4YPJ8-8tMfGXZT7P6m6bkls`
  (the `(slug:'accident', word:'accident')` fixture digest pinned in
  `tests/spelling-word-prompt.test.js`).
- Wrong (hex): `563d4793b7...` — the Worker would never read this
  path.

The digest matches the regex `/^[A-Za-z0-9_-]+$/` (no `=` padding,
no `+`, no `/`).

---

## 11. `cleanText` normalisation rule

The Worker normalises every hashable text input via:

```js
const cleanText = (value) => String(value || '').replace(/\s+/g, ' ').trim();
```

Source: `worker/src/tts.js:39-41` (and the duplicate in
`worker/src/subjects/spelling/audio.js:7-9`). Both definitions are
byte-equal; the helper is **not** bare `.trim()` — it collapses
internal whitespace (NBSP `U+00A0`, double-space, tabs) to a single
space **before** trimming, so `'accident word'` and
`'accident  word'` both normalise to `'accident word'`.

Generator MUST apply the same normalisation to both `slug` (lowercased
+ cleaned) and `word` (cleaned) before hashing. Bare `.trim()` would
diverge silently on any NBSP-bearing or double-space-bearing input —
the U1 + U2 fixture suites include explicit NBSP cases as a
regression backstop. See
`tests/spelling-word-prompt.test.js` for the pinned fixtures.
