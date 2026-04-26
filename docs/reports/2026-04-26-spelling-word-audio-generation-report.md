# Spelling Word Bank Audio Generation Report

**Plan:** [docs/plans/2026-04-26-001-feat-spelling-word-audio-cache-plan.md](../plans/2026-04-26-001-feat-spelling-word-audio-cache-plan.md) — U4
**Status:** TEMPLATE — ready for operator run
**Operator:** <OPERATOR NAME>
**Run window (chosen low-traffic window):** <YYYY-MM-DD HH:MM UTC>–<HH:MM UTC>
**Race-mitigation policy:** Default (low-traffic window). [If escalation to `WORD_ONLY_BATCH_FILL_GUARD` env-flag was needed, document under "Deviations" below.]

---

## 1. Preflight (target ~10 min)

| Check | Expected | Actual | OK |
|---|---|---:|---:|
| `node ./scripts/wrangler-oauth.mjs whoami` | production Cloudflare account shown | <OUTPUT> | <Y/N> |
| `.env` contains `GEMINI_API_KEY` (and `_2`, `_3` if used) | at least one present | <KEY COUNT> | <Y/N> |
| `WORDS.length === 236` (sanity from `src/subjects/spelling/data/word-data.js`) | 236 | <COUNT> | <Y/N> |
| `SPELLING_AUDIO_MODEL` captured into run state file | `gemini-3.1-flash-tts-preview` (or current export) | <VALUE> | <Y/N> |
| `npm run smoke:production:spelling-audio -- --json` baseline | sentence-legacy probes pass; word probes WARN miss (pre-fill) | <PASTE JSON OR FAIL DESCRIPTION> | <Y/N> |

**Sentence-legacy probe verdict:** <PASS / FAIL — if FAIL, STOP and investigate before proceeding>
**Baseline word-probe miss count:** <N out of 8 default samples>

---

## 2. Small sample run (target ~15 min)

Command:

```
npm run spelling:word-audio -- generate --slug accident,beginning
```

Wait — `beginning` may not exist in WORDS (use `accidentally` instead per U2 fixture findings). Adjust to:

```
npm run spelling:word-audio -- generate --slug accident,accidentally
```

| Item | Result |
|---|---|
| Run ID | <RUNID> |
| Entries planned | 4 (2 words × 2 voices) |
| Entries uploaded | <COUNT> / 4 |
| MP3 files on disk | <PATHS under `.spelling-audio/word-runs/<RUNID>/`> |
| Voice quality (operator listen-test, both voices, both words) | <ACCEPTABLE / ESCALATE — if ESCALATE, do NOT proceed> |
| R2 inventory verification (`wrangler-oauth.mjs r2 object get` on one key) | <returned mp3 bytes / failed: REASON> |
| Local-Worker cache hit (in `wrangler dev` session, cacheLookupOnly probe for `accident` + `Iapetus`) | <hit primary / miss / skipped> |

---

## 3. Production small-sample smoke (target ~5 min)

Command:

```
npm run smoke:production:spelling-audio -- --word-sample accident,accidentally --require-word-hit
```

| Probe | Expected | Actual |
|---|---|---|
| word-only `accident` × `Iapetus` | hit + primary | <RESULT> |
| word-only `accident` × `Sulafat` | hit + primary | <RESULT> |
| word-only `accidentally` × `Iapetus` | hit + primary | <RESULT> |
| word-only `accidentally` × `Sulafat` | hit + primary | <RESULT> |
| sentence-legacy probes | hit + legacy | <RESULT> |
| cross-account invariant | distinct tokens / same key / identical bytes | <RESULT> |

Exit code: <0 / N>
JSON report: <PASTE FULL JSON OR LINK TO ARTEFACT>

---

## 4. Full word-bank run (target ~60–90 min)

**Pre-run checks:**

- Race-mitigation window confirmed in effect: <YES — window OR ESCALATED — flag enabled>
- If `WORD_ONLY_BATCH_FILL_GUARD` env-flag is in effect, note the deploy commit SHA: <SHA OR N/A>

Command:

```
npm run spelling:word-audio -- generate --concurrency 4
```

(No `--slug` filter → all 236 words; auto-skips the 4 already uploaded from §2.)

| Metric | Target | Actual |
|---|---|---|
| Total entries | 472 (236 × 2) | <COUNT> |
| Uploaded | 472 | <COUNT> |
| Failed | 0 | <COUNT> |
| Total wall time | 60–90 min | <DURATION> |
| Total Gemini API calls (incl. retries) | ~472 + retry budget | <COUNT> |
| 429 retries (quota rotations) | <N> | <COUNT> |
| 5xx retries (R2 502/503) | <N> | <COUNT> |
| Total R2 bytes uploaded | ~? MB | <BYTES> |
| Cost: Gemini direct generateContent | <$X> | <$VALUE> |

**Failed entries (if any):** <list slugs + voices + lastError; rerun with `--run-id <id>` after fix>

---

## 5. Post-run verification (target ~15 min)

Commands + expected results:

```
npm run spelling:word-audio -- status --run-id <RUNID>
```

Expected: `472 uploaded / 0 failed`. Actual: <RESULT>

```
# SPELLING_AUDIO_MODEL freeze check
```

Expected: run-state model matches `shared/spelling-audio.js` export AND matches Worker's deployed `x-ks2-tts-model` header on a probe. Actual: <RESULT>

```
npm run smoke:production:spelling-audio -- --require-word-hit
```

Expected: EXIT_OK; all sample word probes hit; sentence-legacy probes still pass; cross-account invariant holds. Actual exit: <CODE>. JSON report: <PASTE>

**Optional R2 inventory sanity (depends on REST API mechanism U2 ships per F-02):**

```
# (REST API list per voice prefix; operator script TBD when U2 reconcile lands)
```

Expected: 236 objects under `spelling-audio/v1/gemini-3.1-flash-tts-preview/Iapetus/word/` and 236 under `Sulafat/word/`. Actual: <COUNTS>

**Race-mitigation cleanup:**

- If `WORD_ONLY_BATCH_FILL_GUARD` env-flag was used, toggle off + redeploy + confirm Worker live-regen path resumes normal store behaviour. Status: <DONE / N/A>

---

## 6. Voice quality + content notes

**Voice consistency across word-bank words (operator subjective):**

- `Iapetus` (UK male): <NOTES>
- `Sulafat` (UK female): <NOTES>

**Words with notable mispronunciation or pacing concerns (if any):** <LIST>

**Words flagged for re-generation (if any):** <LIST + REASON>

---

## 7. Deviations from plan

<List any deviation from the plan U4 sequence, including reasons. Examples: "Used WORD_ONLY_BATCH_FILL_GUARD escalation because the chosen window had unexpected EU traffic", "Reduced --concurrency from 4 to 2 due to Gemini 429 cluster", "Sentence-legacy probe initially failed — investigated and found stale R2 key for slug X; required re-fill of those 2 sentence files via separate flow.">

---

## 8. Sign-off

**Operator confirmation:**

- [ ] All 472 word-only audio files generated and uploaded.
- [ ] Production smoke (`smoke:production:spelling-audio --require-word-hit`) returns EXIT_OK.
- [ ] Cross-account invariant probe passes.
- [ ] Sentence-legacy probe still passes (PR 252 fallback healthy).
- [ ] Race-mitigation policy resolved (window respected OR flag toggled off).
- [ ] No follow-up actions required (or all listed under §7 Deviations).

**Operator signature:** <NAME, DATE>
**Plan status to flip:** `docs/plans/2026-04-26-001-feat-spelling-word-audio-cache-plan.md` frontmatter `status: active` → `status: completed` (lands in U5 PR).

---

## Appendix A: Command reference

(Copy-paste-ready commands for each step. Operator can run sequentially.)

```
# Preflight
node ./scripts/wrangler-oauth.mjs whoami
npm run smoke:production:spelling-audio -- --json > .spelling-audio/baseline-smoke.json

# Small sample
npm run spelling:word-audio -- generate --slug accident,accidentally

# Production smoke (small sample)
npm run smoke:production:spelling-audio -- --word-sample accident,accidentally --require-word-hit --json > .spelling-audio/sample-smoke.json

# Full run
npm run spelling:word-audio -- generate --concurrency 4

# Post-run smoke
npm run smoke:production:spelling-audio -- --require-word-hit --json > .spelling-audio/post-fill-smoke.json

# Status
npm run spelling:word-audio -- status --run-id <RUNID>
```

---

## Appendix B: WORD_ONLY_BATCH_FILL_GUARD escalation procedure

**Use only if §1 race-mitigation default (low-traffic window) cannot be honoured.**

1. Open small follow-up PR adding `WORD_ONLY_BATCH_FILL_GUARD` env-flag to Worker `storeBufferedGeminiAudio` that wraps `bucket.put(key, bytes, ...)` in `onlyIf: { etagDoesNotMatch: '*' }` when the env var is set.
2. Deploy via `npm run deploy`. Note commit SHA + deploy time.
3. Run §4 full word-bank generation under the flag.
4. After §5 post-run verification passes, toggle off + redeploy.
5. Open follow-up TODO PR to remove the flag entirely once a future audit confirms steady-state stability.
