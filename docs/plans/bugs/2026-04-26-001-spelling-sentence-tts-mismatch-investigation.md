---
title: "Spelling dictation: pre-cached sentence audio does not match displayed sentence"
type: fix
status: investigation
date: 2026-04-26
reporter: James
investigator: Claude Opus 4.7 (1M context)
phase: root-cause-investigation
iron-law: "No fix proposed until primary hypothesis is verified by production headers."
---

# Spelling dictation: pre-cached sentence audio does not match displayed sentence

## Overview

In rare cases a learner sees one cloze sentence on screen while the pre-cached
TTS audio for the same card plays a different sentence for the same word. Word
audio (the `wordOnly: true` lane) is unaffected — the mismatch is isolated to
the sentence dictation lane.

This document is a **Phase 1 root-cause investigation**, not a fix. Per the
`superpowers:systematic-debugging` Iron Law, no code change is proposed until
the primary hypothesis is confirmed by a single observable signal (one HTTP
response header). The intent of shipping this document ahead of any fix is to
capture the trace before context rots, and to make the next engineer's
verification step a one-minute browser DevTools check instead of a re-trace.

---

## Symptom

Reported by James on 2026-04-26 while dictating Word of the Day:

| Channel | Observed content |
|---|---|
| UI cloze (display) | `___ voted on the change.` |
| Pre-cached TTS audio | `Parliament debated the new law.` |
| Word-only audio | `Parliament` — correct |
| Word | `parliament` |
| Frequency | Rare / intermittent |

The user's bug report wrote `voted for the change` in the display column;
verification against `src/subjects/spelling/data/word-data.js` and
`content/spelling.seed.json` shows the canonical copy is `Parliament voted on
the change.` The `for`/`on` token is a transcription artefact in the report,
not a second discrepancy.

The user's bug report also wrote the word as `Parliment`; the authoritative
slug is `parliament`. This too is a transcription artefact.

---

## Data facts (verified, not assumed)

All three independent sources agree on the `parliament` sentence array, and
the array order has been **stable since the first commit** (`2b31288`,
2026-04-20):

| Index | Sentence |
|---|---|
| **0** | `Parliament debated the new law.` |
| 1 | `We learned how parliament makes laws.` |
| 2 | `A question was raised in parliament.` |
| 3 | `Members of parliament spoke clearly.` |
| 4 | `The guide pointed to the parliament building.` |
| **5** | `Parliament voted on the change.` |
| 6 | `A speech in parliament can affect the whole country.` |
| 7 | `The news showed parliament in session.` |
| 8 | `We learned how parliament works.` |
| 9 | `Parliament discussed school funding.` |

Sources cross-checked:

1. `src/subjects/spelling/data/word-data.js:8374-8385` (current)
2. `src/subjects/spelling/data/content-data.js` (`sentenceEntryIds` =
   `parliament__01` … `parliament__10`, canonical order 01→10 mapped to
   index 0→9)
3. `content/spelling.seed.json:38881-38884` (variant-6 = `parliament__06` =
   `Parliament voted on the change.`)
4. `legacy/vendor/sentence-bank-05.js:422-433` (same order, same text)

Whitespace audit: every entry's `raw.length === .replace(/\s+/g, ' ').trim().length`
— no stray NBSP, double-space, trailing whitespace, or smart-quote drift that
could defeat strict equality.

Git history audit: `git log -G'debated the new law'` and `git log -S'voted on
the change'` surface zero commits that reordered or edited the sentence array.

**Conclusion:** the display's `index = 5` and the audio's content `= index 0`
text are not the result of in-tree content drift. Whatever is wrong is
happening **at the cache boundary**, not in the source data.

---

## Architecture trace (what happens on a replay click)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 1. Client: SpellingSessionScene renders card.prompt.cloze                │
│    (built on server via buildCloze(sentence, word) —                     │
│     shared/spelling/legacy-engine.js:96-100)                             │
│                                                                          │
│ 2. Client: user clicks replay → tts.speak({ promptToken, ... })          │
│    (src/subjects/spelling/tts.js — `speak()` function;                   │
│     line numbers move with SH2-U4)                                       │
│    Request body carries ONLY promptToken (sha256),                       │
│    NEVER the sentence text.                                              │
│                                                                          │
│ 3. Worker: handleTextToSpeechRequest                                     │
│    (worker/src/tts.js:750-871) → resolveSpellingAudioRequest             │
│    (worker/src/subjects/spelling/audio.js:109-205)                       │
│                                                                          │
│ 4. Worker re-derives prompt parts from SERVER state:                     │
│    currentPromptParts(state) reads                                       │
│      state.session.currentCard.prompt.sentence                           │
│    then computes                                                         │
│      sentenceIndex = resolveSentenceIndex(word, sentence)                │
│    (shared/spelling-audio.js:75-81)                                      │
│                                                                          │
│ 5. Worker builds R2 cache key via bufferedAudioMetadata                  │
│    (worker/src/tts.js:284-326):                                          │
│      Primary (content-hashed):                                           │
│        contentKey = sha256('spelling-audio-content-v2' | slug |          │
│                             sentenceIndex | word | sentence)             │
│        key        = {prefix}/{model}/{voice}/{speed}/{contentKey}        │
│                     /{slug}/{sentenceIndex}.{ext}                        │
│      Legacy (fallback, no contentKey):                                   │
│        key        = {prefix}/{model}/{voice}/{speed}                     │
│                     /{slug}/{sentenceIndex}.{ext}                        │
│                                                                          │
│ 6. readBufferedGeminiAudio (worker/src/tts.js:386-450):                  │
│    try primary key → R2.get()                                            │
│      on miss, try LEGACY key → R2.get()                                  │
│        on hit, return with response metadata flagged source='legacy'.    │
│    Every response carries headers:                                       │
│      x-ks2-tts-cache        (hit | miss | stored | unavailable | ...)   │
│      x-ks2-tts-cache-source (primary | legacy)                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Key property (holds by design)

The client **cannot** cause the mismatch by sending bad input: `body.sentence`
is not consulted. The Worker uses only `body.promptToken` (to gate freshness)
and `body.slug` (only on the word-bank lane, not on the session lane). The
authoritative `word`+`sentence`+`sentenceIndex` always come from server state
or server-loaded content — never from the request body.

Therefore the mismatch is between **two server-side reads**: one that served
the UI (`card.prompt.cloze` derived from `sentence` at session time) and one
that served the audio (`sentence` → `sentenceIndex` → cache key at replay
time).

---

## Primary hypothesis (strongest, unverified)

**The replay was served by the legacy R2 fallback, whose bake-time transcript
no longer matches the current `sentences[sentenceIndex]` string.**

Specifically:

- `worker/src/tts.js:341-347` defines `legacyBufferedAudioKey` with shape
  `{prefix}/{model}/{voice}/{speed}/{slug}/{sentenceIndex}.{ext}` — no
  content hash.
- `readBufferedGeminiAudio` (worker/src/tts.js:401-413) falls back to this
  key when the primary content-hashed key misses.
- The planning doc
  `docs/plans/2026-04-26-001-feat-spelling-word-audio-cache-plan.md:86-88`
  states that **8 612 sentence audio files already exist in R2 under the
  pre-PR-71 key shape**, and the current plan **explicitly defers their
  regeneration** (relying on `legacyBufferedAudioKey` to serve them).
- The legacy batch script (`scripts/build-spelling-audio.mjs` as of
  `d4f05e6`, lines 481-490) iterated
  `sentences.forEach((sentence, sentenceIndex) => ...)` — so
  `parliament/5.mp3` was baked with whatever string sat at
  `WORDS.parliament.sentences[5]` *at bake time*.
- Git history in this repo shows `sentences[5] === "Parliament voted on the
  change."` since day one. **But** the
  pre-PR-71 R2 files may have been generated from an older fork that had a
  **different sentence order** before the repo was productionised — the plan
  doc's phrase *"the existing 8 612 sentence audio files generated under the
  pre-PR-71 R2 key shape"* (line 30) does not pin the content snapshot they
  used.

If true, this is a classic **cache key without content fingerprint → bake-time
content drift goes undetected** failure mode. The symptom (display index 5,
audio index 0 text) is exactly what we would observe if the legacy `5.mp3`
for `parliament` was baked when index 5 held "debated the new law".

### One-signal confirmation

Check the `/api/tts` response header on a reproducing request:

- `x-ks2-tts-cache-source: legacy` → hypothesis confirmed.
- `x-ks2-tts-cache-source: primary` → hypothesis refuted; move to secondary.

---

## Secondary hypothesis (weaker but possible)

**`resolveSentenceIndex` silently returns `0` on a lookup miss, snapping the
cache key to `parliament/0.mp3` which holds "debated the new law".**

```js
// shared/spelling-audio.js:75-81
export function resolveSentenceIndex(word, sentence) {
  const sentences = listWordSentences(word);
  if (!sentences.length) return -1;
  const target = String(sentence || '');
  const matchIndex = sentences.findIndex((item) => item === target);
  return matchIndex >= 0 ? matchIndex : 0;   // ← silent fallback
}
```

The fallback is triggered whenever the session's stored
`currentCard.prompt.sentence` is **not strictly equal** to any entry in the
word's current `sentences` array. Candidate causes of such a strict-equality
miss:

1. A session persisted under an older content release whose `sentences`
   array differed from today's.
2. A normalisation seam elsewhere (`cleanText` is applied on the Worker
   `audio.js:15` but not on `sentences[i]` inside `resolveSentenceIndex`).
3. A content migration path (`resolveRuntimeSnapshot` in
   `src/subjects/spelling/content/model.js`, used by Worker
   `audio.js:93-95`) that drops or re-orders entries silently.

The striking detail: the user observed *exactly* the index-0 text as the
audio, which is what a silent `|| 0` fallback would produce. This is
suspicious enough to warrant serious consideration even if hypothesis 1
turns out to be the root cause — the fallback is a **latent failure mode**
regardless.

### One-signal confirmation

Same request, same DevTools inspection. If `x-ks2-tts-cache-source: primary`
(i.e. the primary content-hashed lookup *hit*), then the `contentKey` was
derived from sentence-0 text even though the display showed sentence-5 —
which means `resolveSentenceIndex` returned 0, confirming this hypothesis.

---

## Refuted hypotheses (with evidence)

These were investigated and ruled out during Phase 1:

1. **PR #286 (U1 shared word-only TTS prompt helper)** changed nothing on
   the sentence lane — the diff is isolated to
   `buildBufferedWordSpeechPrompt` and the Worker `geminiPrompt()`
   `wordOnly` branch. The sentence path is untouched.
2. **Client-side sentence randomisation divergence.** The client does not
   re-randomise on replay; it sends only `promptToken`. The Worker re-derives
   everything from server state.
3. **Sentence array reordering.** `git log -G` / `git log -S` over the
   suspect strings surface zero reordering commits.
4. **Whitespace / smart-quote / NBSP drift in the source data.** Audited
   all ten Parliament sentences; `raw === cleanText(raw)` for every entry.
5. **Token replay of a stale session.** The Worker validates
   `promptToken` against current session state
   (worker/src/subjects/spelling/audio.js:157-185); a stale token produces
   a `tts_prompt_stale` error, not silent wrong-audio.
6. **Word-only lane contamination.** User reports word audio is correct and
   only the sentence is wrong — rules out any word-only code path.

---

## Verification plan (next engineer's checklist)

### Step 1 — One-signal check (1 minute)

Reproduce the mismatch in a real browser session, open DevTools → Network →
locate the `/api/tts` POST that preceded the bad audio → copy these two
response headers:

```
x-ks2-tts-cache:        _______________
x-ks2-tts-cache-source: _______________
```

Decision table:

| `cache-source` | `cache` | Implication |
|---|---|---|
| `legacy` | `hit` | Primary hypothesis confirmed. Legacy R2 file is stale; content drifted between bake-time and now. |
| `primary` | `hit` | Secondary hypothesis likely. `resolveSentenceIndex` returned `0` on a miss; the primary cache entry is itself keyed on index-0 content while the session shows index-5. |
| `primary` | `stored` | The Worker just regenerated and stored new audio. If the audio is still wrong, the Worker's `payload.sentence` / `payload.sentenceIndex` diverged before `bufferedAudioMetadata` was called. Instrument `currentPromptParts` output. |
| `unavailable` / `miss` | n/a | Neither cache lane returned audio; the played audio came from elsewhere. Likely an unrelated issue. |

### Step 2 — If primary is confirmed (legacy fallback drift)

Enumerate the R2 bucket (`ks2-spelling-buffers`) under the legacy prefix for
`parliament`, download each object's `customMetadata.contentKey` (which the
Worker *does* store when it writes — see
`worker/src/tts.js:509-515`), and compare against the
Worker-computed `contentKey` for the current `sentences[i]`. Any mismatch
file is a stale legacy object. Expected outcome: several legacy objects will
have no `customMetadata.contentKey` at all (they were baked before that
metadata was added), or will carry a hash that does not match today's
content.

Read-only diagnostic one-liner (pseudo-code — real script to be written):

```
for each object under spelling-audio/v1/{model}/{voice}/{speed}/parliament/:
  read customMetadata.contentKey
  recompute expected contentKey for sentences[filename_index]
  if mismatch or absent: flag as stale-legacy
```

This is diagnosis only; no R2 writes. The eventual fix choice (purge vs.
regenerate vs. fingerprint the legacy fallback) is a design decision for a
separate plan — this document deliberately does not prescribe one.

### Step 3 — If secondary is confirmed (silent `|| 0` fallback)

Trace the actual value of
`state.session.currentCard.prompt.sentence` in the repro session (server
log or a one-shot debug endpoint), and compare character-by-character
against `word.sentences[5]`. The divergence point pins which normalisation
seam is responsible.

The long-term structural change worth considering (but out of scope for a
single-issue fix): make `resolveSentenceIndex` throw on miss instead of
returning `0`. Silent fallbacks mask exactly this class of bug. The repo
memory (`project_punctuation_p3.md`) notes multiple prior incidents where
"loud failure > silent fallback" shortened the next debug cycle. This
change would be a cross-cutting refactor, so it is flagged here but not
proposed here.

---

## Scope boundaries for the eventual fix

- **In scope for a follow-up PR:** resolving whichever hypothesis the
  verification step confirms, with a failing test that reproduces the
  mismatch against a fixture bucket, plus the fix.
- **Explicitly deferred:** widening the investigation to other words or
  learners. The Parliament report is the only data point; a single-word
  reproducer is sufficient to drive the fix, and surveying the full R2
  bucket is a separate observability task.
- **Explicitly deferred:** the `resolveSentenceIndex` "throw on miss"
  refactor. This is a correctness upgrade with its own test surface and
  belongs to a separate learning-loudness sweep.
- **Explicitly deferred:** regenerating the legacy 8 612 sentence audio
  files under the content-hashed key. That is the topic of
  `docs/plans/2026-04-26-001-feat-spelling-word-audio-cache-plan.md`'s
  deferred follow-up.

---

## Artefacts and references

- `shared/spelling-audio.js:75-81` — `resolveSentenceIndex` with the
  silent `|| 0` fallback.
- `shared/spelling-audio.js:123-153` — `buildAudioAssetKey` (primary,
  content-hashed).
- `shared/spelling-audio.js:155-181` — `buildLegacyAudioAssetKey`
  (fallback, no content hash).
- `worker/src/tts.js:284-326` — `bufferedAudioMetadata` (composes
  `contentKey` from `slug|sentenceIndex|word|sentence`).
- `worker/src/tts.js:386-450` — `readBufferedGeminiAudio` (primary→legacy
  fallback loop).
- `worker/src/tts.js:509-515` — `customMetadata.contentKey` persisted on
  write (usable for audit).
- `worker/src/subjects/spelling/audio.js:11-25` — `currentPromptParts`
  (server-authoritative prompt derivation).
- `worker/src/subjects/spelling/audio.js:109-205` —
  `resolveSpellingAudioRequest` (full request → prompt resolution).
- `docs/plans/2026-04-26-001-feat-spelling-word-audio-cache-plan.md:30,
  86-88` — confirms 8 612 legacy sentence audio files exist and
  regeneration is deferred.

---

## Status

- Phase 1 (Root Cause Investigation): **complete for reasoning, pending one
  observable signal.**
- Phase 2 (Pattern Analysis): not started.
- Phase 3 (Hypothesis Testing): requires production header read.
- Phase 4 (Implementation): blocked on Phase 3.

No code has been modified as part of this investigation. The Iron Law of
`superpowers:systematic-debugging` is preserved: *no fix without confirmed
root cause*.
