---
type: learning
domain: audio, caching, r2, content-addressed-cache, spelling
created: 2026-04-26
plan: docs/plans/2026-04-26-001-feat-spelling-word-audio-cache-plan.md
prs: ["#252", "#286", "#297", "#299", "#302"]
status: established
---

<!--
  Convention note (FIRST entry in docs/solutions/, sets directory + frontmatter
  precedent for subsequent entries):

  - File naming: `learning-<topic>.md` (kebab-case topic, prefixed with
    `learning-` to make the intent obvious in directory listings).
  - Frontmatter (YAML) is mandatory and follows Compound Engineering shape:
      type:    `learning` (literal)
      domain:  comma-separated tags (lowercase, kebab where multi-word)
      created: ISO 8601 date `YYYY-MM-DD`
      plan:    repo-relative path to the originating plan, if any
      prs:     YAML array of PR shorthand strings (`"#NNN"`)
      status:  `established` | `superseded` | `withdrawn`
  - The frontmatter `---` markers MUST be the very first lines of the
    file (no preceding whitespace, no preceding HTML comment) so that
    standard markdown frontmatter parsers (Hugo, Jekyll, Pandoc, MDX)
    detect them. This convention note therefore lives BETWEEN the
    closing `---` and the first H1 heading.
  - Body is structured prose: numbered sections with H2 headings; fenced
    code blocks for hash inputs / key shapes; a final "What this learning
    DOES NOT cover" section to bound scope for future readers.
  - Subsequent entries should follow the same shape unless a stronger
    convention emerges (in which case update this comment in the next
    entry, not this one).
-->

# Spelling audio cache contract — content-addressed R2 + legacy fallback

Distilled lessons from the 2026-04-26 spelling Word Bank audio cache
work (PR #252 Worker contract + PRs #286, #297, #299, #302 generator,
smoke probe, and operational scaffolding). Pair with the operator
runbook at [`docs/spelling-word-audio.md`](../spelling-word-audio.md)
for the recipe; this entry captures *why* the contract is shaped the
way it is.

---

## 1. Cache key contract evolution

The R2 key for spelling audio has been re-shaped twice. Each
generation deliberately invalidated the previous one (orphaned R2
objects remain until explicitly cleaned).

| Generation | Key shape | Notes |
|------------|-----------|-------|
| pre-PR-71 | `spelling-audio/v1/{model}/{voice}/{speed}/{slug}.{mp3\|wav}` | 4 segments, no `contentKey`. ~8 612 sentence files exist under this shape and continue to serve via PR 252's `legacyBufferedAudioKey` fallback. |
| PR 71 | `spelling-audio/v1/{model}/{voice}/{speed}/{contentKey}/{slug}.{mp3\|wav}` | Adds content-addressed `contentKey = sha256('spelling-audio-sentence-v1' \| slug \| sentenceIndex \| word \| sentence)`. Sentence-only; word-only path did not yet exist. |
| PR 252 | `spelling-audio/v1/{model}/{voice}/word/{contentKey}/{slug}.{mp3\|wav}` | Adds **word-only** key shape with `contentKey = sha256('spelling-audio-word-v1' \| cleanText(slug).toLowerCase() \| cleanText(word))`. Deliberately omits accountId for cross-account R2 reuse. Legacy fallback in Worker continues to serve old sentence files until they are regenerated. |

The word-only key is **structurally distinct** from the sentence key:
the segment immediately after `{voice}` is the literal `word`, not a
`{speed}` value. This is what lets the Worker route a `kind: 'word'`
request straight to a separate cache slot without colliding with any
sentence object.

---

## 2. Why content-addressed?

Hashing the exact `(slug, word)` text into the R2 path gives us
**change-detection without manual versioning**:

- If the word text changes (typo fix, casing tweak), the new
  `contentKey` lands at a different R2 path. The Worker cache-misses
  cleanly and live-regen produces fresh audio. No manual cache bust
  required.
- The old (orphaned) object remains in R2 until cleaned. Cost is
  bounded (cents per orphan); the failure mode is invisible to
  learners.
- No `version: N` integer on every R2 path that has to be maintained
  by hand and risks getting stale.

Trade-off: orphans accumulate. Acceptable at the planned word-list
stability cadence (effectively static); a future janitorial sweep
can drop them.

---

## 3. Why a separate word-only key shape?

Word-only audio is **single-pace by pedagogic intent**. There is no
`speed` axis (no slow / normal variants), because the Word Bank UX
plays the word once at a natural read-aloud pace; slow-pace lives
on the dictation drill lane, which uses the sentence cache.

Encoding this distinction in the key shape (literal `word` segment
instead of a `{speed}` segment) makes the contract self-documenting:
no caller can accidentally request a slow word-only variant, because
no key shape exists for it. If pedagogy later requests a slow
variant, the contract evolves first (likely a fourth generation in
§1).

---

## 4. Why batch generator + Worker share helpers?

The generator (`scripts/build-spelling-word-audio.mjs`) and the
Worker (`worker/src/tts.js`) write to the same R2 bucket under the
same key shape. Any divergence in either the prompt template or the
hash algorithm produces silent correctness bugs:

- A prompt drift means batch-uploaded audio sounds different from
  Worker-regenerated audio for the same word.
- A hash drift means batch-uploaded audio lives at a path the Worker
  never reads (100 % cache miss).

The mitigations:

- **Shared prompt builder.** `buildBufferedWordSpeechPrompt({ wordText })`
  in `shared/spelling-audio.js` (introduced by U1) is imported by
  both Worker `geminiPrompt` and the batch generator. One source of
  truth.
- **Shared key builder.** `buildWordAudioAssetKey({ model, voice, contentKey, slug })`
  in `shared/spelling-audio.js` is imported by both sides.
- **Hash algorithm: 4-line shim, not import.** The generator
  duplicates the SHA-256 + base64url logic from
  `worker/src/auth.js:156-185` as a 4-line shim
  (`crypto.subtle.digest('SHA-256', ...)` +
  URL-safe alphabet rewrite). Direct import was avoided because the
  Worker module pulls Worker-runtime dependencies that may not
  resolve cleanly from `scripts/`. The drift defence is **not** the
  import path — it is the fixture-pinned test in
  `tests/spelling-word-prompt.test.js` that asserts the digest
  `_71BbbYsUhNeilGccY6U4YPJ8-8tMfGXZT7P6m6bkls` for
  `(slug:'accident', word:'accident')`. Any future change to either
  the Worker `bytesToBase64Url` encoding or the generator shim trips
  this test before reaching production R2.

### Specific gotchas

- **`bytesToBase64Url`, not hex.** Worker's `sha256()` returns
  base64url (`+`→`-`, `/`→`_`, no `=` padding). Generator using
  Node's `createHash('sha256').digest('hex')` would write to a hex
  path the Worker would never read.
- **`cleanText` normalisation, not bare `.trim()`.** Worker hashes
  `cleanText(value) = String(value || '').replace(/\s+/g, ' ').trim()`
  (`worker/src/tts.js:38-40`). This collapses NBSP (`U+00A0`),
  double-space, and tabs to a single space *before* trimming. Bare
  `.trim()` diverges silently on any input containing internal NBSP
  or double-space — and the U1 fixture suite includes those cases
  precisely because that is the regression most likely to slip past
  unit-of-work review.
- **Hash input shape.** The exact join is
  `['spelling-audio-word-v1', cleanText(slug).toLowerCase(), cleanText(word)].join('|')`.
  All three components matter; an extra trailing `|`, a different
  salt prefix, or any case difference in `slug` produces a
  different digest.

---

## 5. Two-source-of-truth assertion pattern

The generator reads `WORDS[i].word` from
`src/subjects/spelling/data/word-data.js` (the bundle source). The
Worker reads `snapshot.wordBySlug[slug].word` from the published
spelling snapshot (`SEEDED_SPELLING_PUBLISHED_SNAPSHOT.wordBySlug`
in `src/subjects/spelling/data/content-data.js`) when validating
prompt tokens (`worker/src/subjects/spelling/audio.js:96-103`).

Today both come from the same seed pipeline, but **no contract
guarantees they remain equal**. If they ever diverge for a slug,
the Worker's prompt token validation rejects requests for that slug
and / or the Worker's contentKey hash differs from the batch's hash
for the same slug — silent cache miss at best, silent correctness
bug at worst.

The mitigation: U2 generator preflight asserts
`cleanText(WORDS[i].word) === cleanText(wordBySlug[WORDS[i].slug].word)`
for **all** 236 slugs before any per-entry work. Mismatch hard-stops
the run with a clear error naming the divergent slug. No Gemini
spend until parity is restored.

This is a generalisable pattern: whenever two materialisations of
"the same data" exist for legitimate reasons (one for the bundle,
one for the runtime snapshot), an explicit cross-check at any
process boundary that depends on their equality is cheap insurance
against silent drift.

---

## 6. Legacy-fallback escape hatch

PR 252 introduced `legacyBufferedAudioKey({ kind, ... })`:

- For `kind: 'word'` it returns `null` (no pre-existing word cache
  to fall back to; word-only path is brand new).
- For `kind: 'sentence'` it returns the pre-PR-71 4-segment key
  path (`spelling-audio/v1/{model}/{voice}/{speed}/{slug}.{mp3|wav}`).

The Worker's `readBufferedGeminiAudio` tries the new
content-addressed path first; on miss it falls back to the legacy
key (when `legacyBufferedAudioKey` returns non-null). A successful
legacy hit returns `200` with header
`x-ks2-tts-cache-source: legacy` (vs `primary` for new-path hits) —
the U3 production smoke probe asserts both code paths against real
R2 inventory.

The fallback is removable when all 8 612 sentence files have been
regenerated under the new key shape. That work is **not in scope**
of this plan; until then, the fallback is the only thing keeping
the existing sentence cache serving traffic.

---

## 7. Smoke contract

The U3 production smoke
(`scripts/spelling-audio-production-smoke.mjs`) is the verification
primitive for any future audio cache change. It asserts the
following response headers per request shape:

| Header | Allowed values |
|--------|----------------|
| `x-ks2-tts-cache` | `hit` \| `miss` \| `stored` \| `store_failed` \| `unavailable` |
| `x-ks2-tts-cache-source` | `primary` \| `legacy` |
| `x-ks2-tts-model` | the deployed `SPELLING_AUDIO_MODEL` value (currently `gemini-3.1-flash-tts-preview`) |
| `x-ks2-tts-voice` | the requested voice (`Iapetus` or `Sulafat`) |

### Cross-account invariant probe

For the same fixture word, two distinct learner ids produce two
distinct `wordBankPromptToken` values (per-learner salt) but
**must** resolve to the same R2 key path (Worker hash deliberately
omits `accountId` for cross-account cache reuse, per PR 252
design). The smoke asserts:

1. `token_A !== token_B` (per-learner tokens differ).
2. Both probes cache-hit.
3. `await response_A.arrayBuffer() === await response_B.arrayBuffer()`
   byte-identical (catches a regression that breaks per-learner
   token but accidentally maps both to the same WRONG R2 key).
4. A third probe for a **different** word produces distinct body
   bytes (rules out collapse-to-wrong-key regression).

This four-step assertion is the only practical way to detect a key
collapse that still passes the per-learner-token-distinct check.
Re-use the pattern for any future cross-account cache work.

---

## 8. Live-regen race mitigation pattern

R2 PUT is last-writer-wins; Worker's `storeBufferedGeminiAudio`
calls `bucket.put(key, bytes, ...)` with no `onlyIf` precondition.
Concurrent learner traffic during a batch fill can overwrite a
just-uploaded batch object with a slightly different live take —
silently.

The default mitigation is **operational**: schedule the full run in
a low-traffic UTC window. This is statistical, not structural —
KS2 is publicly accessible globally — but sufficient for the
99 % case and avoids Worker-side complexity.

The escalation pattern, when the operational window is unavailable,
is `onlyIf: { etagDoesNotMatch: '*' }` as a generic write-side
guard for batch-fill operations against R2:

- Wrap Worker `storeBufferedGeminiAudio`'s `bucket.put(...)` in
  `onlyIf: { etagDoesNotMatch: '*' }` when the
  `WORD_ONLY_BATCH_FILL_GUARD` env-flag is set (one-line Worker
  change behind a feature flag).
- Worker live regen no longer overwrites existing R2 objects for the
  duration of the batch fill.
- Toggle off + redeploy after fill completes.
- Open a follow-up TODO PR to remove the flag entirely once
  steady-state stability is confirmed.

This is documented as **escalation-only** in the runbook
(Appendix B of the U4 report template); the default is the
operational window. The pattern itself — `etagDoesNotMatch: '*'` as
a write-side guard against last-writer-wins R2 overwrites — is
re-usable for any future batch-fill-vs-live-regen race.

---

## 9. Operational discipline

These are the cross-cutting habits that this work proved valuable.
Apply them to any future batch-fill or stateful generator work.

### 9.1 Idempotent state file with atomic write

State file under `.spelling-audio/word-runs/<runId>/state.json`
recording per-entry status. Writes use `.tmp.<pid>.<n>` + rename for
atomicity, so a crash during write never produces a partially
overwritten state file. Persistence is **per-entry**, not just
end-of-run, so a crash mid-run never loses more than one in-flight
entry.

`SIGINT` and `SIGTERM` handlers flush state before exiting.

### 9.2 Quota / rotation budget independent of retry budget

`--max-retries 0` should fail fast on real errors but **still**
rotate keys on quota errors (HTTP 429 or 403 with
`RESOURCE_EXHAUSTED`-style payload). A key-pool exhaustion is not a
retry candidate, it is a different operator decision; conflating
the two budgets makes both misbehave.

### 9.3 Audit blocklist coverage via substring matcher

The audit blocklists (`scripts/audit-client-bundle.mjs:145`,
`scripts/production-bundle-audit.mjs:135`) use
`text.includes(token)` substring matching. The existing
`'GEMINI_API_KEY'` token already catches `GEMINI_API_KEY_2`,
`GEMINI_API_KEY_20`, `GEMINI_API_KEYS`, etc. — no per-name
additions are required when a new env-var variant is introduced.

U2 added a unit test pinning the substring behaviour as a defence
against future matcher tightening (e.g., a switch to exact-match)
that would silently drop coverage.

### 9.4 Generator preflight hard-stops, not warnings

Every preflight check (env-var presence, ffmpeg, wrangler OAuth,
WORDS / snapshot parity, contract version) **aborts** the run
rather than warns. The cost of a wrong-prompt full run vastly
exceeds the cost of an over-strict preflight that occasionally
needs an operator to widen the gate.

---

## 10. What this learning DOES NOT cover

So future readers know the boundary of this entry:

- **Sentence audio regeneration** (the 8 612 files served via PR
  252's legacy fallback). Out of scope for this plan; would be a
  separate plan that decommissions the legacy fallback.
- **Worker-side performance tuning** of the cache lookup path
  (e.g., stale-while-revalidate, edge caching layered above R2).
- **Migration of existing R2 buckets to new physical names.** The
  current bucket (`ks2-spelling-buffers`) is assumed stable; a
  bucket rename would require its own plan with cut-over
  procedure.
- **OpenAI provider audio.** This work strictly fills the buffered
  Gemini cache lane. The OpenAI path
  (`requestOpenAiSpeech` in `worker/src/tts.js`, `ttsInstructions`
  wordOnly variant on line 154) is unaffected.
- **Browser TTS fallback** (`speakWithBrowser`). Untouched.
- **Word-bank prompt token shape** (`wordBankPromptToken` salt
  prefix `'spelling-word-bank-prompt-v1'`). Untouched.
- **Multi-account observability dashboard** for cross-account
  cache hits. PR 252's correctness invariant is covered by U3
  smoke; a metrics dashboard for actual cross-account hit rates is
  a separate observability plan.

---

## Sources

- Plan: [`docs/plans/2026-04-26-001-feat-spelling-word-audio-cache-plan.md`](../plans/2026-04-26-001-feat-spelling-word-audio-cache-plan.md)
- PR #252 — Worker word-only cache contract (merged 2026-04-26)
- PR #286 — U1 shared word-only TTS prompt helper
- PR #297 — U2 generator script + retry/concurrency hardening
- PR #299 — U3 production audio smoke probe
- PR #302 — U4 generation report template
- Cache contract: `shared/spelling-audio.js`,
  `worker/src/tts.js:282-448`,
  `worker/src/subjects/spelling/audio.js`
- Hash digest helper: `worker/src/auth.js:156-185`
- Word source: `src/subjects/spelling/data/word-data.js` (236
  entries)
- Snapshot lookup: `src/subjects/spelling/data/content-data.js`
  (`SEEDED_SPELLING_PUBLISHED_SNAPSHOT.wordBySlug`)
- Fixture-pinned hash test:
  `tests/spelling-word-prompt.test.js`
- Operator runbook: [`docs/spelling-word-audio.md`](../spelling-word-audio.md)
- Run report template:
  [`docs/reports/2026-04-26-spelling-word-audio-generation-report.md`](../reports/2026-04-26-spelling-word-audio-generation-report.md)
