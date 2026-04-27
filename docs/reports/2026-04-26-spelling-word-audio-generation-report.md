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
| `WORDS.length` sanity from `src/subjects/spelling/data/word-data.js` | current published count (246 at 2026-04-27 SC/CH expansion) | <COUNT> | <Y/N> |
| `SPELLING_AUDIO_MODEL` captured into run state file | `gemini-3.1-flash-tts-preview` (or current export) | <VALUE> | <Y/N> |
| `npm run smoke:production:spelling-audio -- --json` baseline | sentence-legacy probes pass; word probes WARN miss (pre-fill) | <PASTE JSON OR FAIL DESCRIPTION> | <Y/N> |

**Sentence-legacy probe verdict:** <PASS / FAIL — if FAIL, STOP and investigate before proceeding>
**Baseline word-probe miss count:** <N out of 8 default samples>

---

## 2. Small sample run (target ~15 min)

Word-only command:

```
npm run spelling:word-audio -- generate --slug accident,beginning
```

Wait — `beginning` may not exist in WORDS (use `accidentally` instead per U2 fixture findings). Adjust to:

```
npm run spelling:word-audio -- generate --slug accident,accidentally
```

All-in-one word + sentence command for new content:

```
npm run spelling:audio-cache -- generate --lane all --slug <slug-list>
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

(Note: `--word-sample` overrides only the word probes; the sentence sample stays at the runner default `accident,knowledge` per `scripts/spelling-audio-production-smoke.mjs` parseArgs. Rows below match the JSON `report.probes[]` shape 1:1.)

| Probe | Expected | Actual |
|---|---|---|
| word-only `accident` × `Iapetus` | hit + primary | <RESULT> |
| word-only `accident` × `Sulafat` | hit + primary | <RESULT> |
| word-only `accidentally` × `Iapetus` | hit + primary | <RESULT> |
| word-only `accidentally` × `Sulafat` | hit + primary | <RESULT> |
| sentence `accident` | hit + legacy | <RESULT> |
| sentence `knowledge` | hit + legacy | <RESULT> |
| cross-account `accident` across two demo learners | distinct tokens / same key / identical body bytes; third-word divergence | <RESULT> |

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

(No `--slug` filter → all current words; auto-skips entries already uploaded in the same run state.)

| Metric | Target | Actual |
|---|---|---|
| Total entries | current planned count | <COUNT> |
| Uploaded | planned count | <COUNT> |
| Failed | 0 | <COUNT> |
| Total wall time | 60–90 min | <DURATION> |
| Total Gemini API calls (incl. retries) | planned count + retry budget | <COUNT> |
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

Expected: all planned entries uploaded / 0 failed. Actual: <RESULT>

```
# SPELLING_AUDIO_MODEL freeze check
```

Expected: run-state model matches `shared/spelling-audio.js` export AND matches Worker's deployed `x-ks2-tts-model` header on a probe. Actual: <RESULT>

```
npm run smoke:production:spelling-audio -- --require-word-hit
```

Expected: EXIT_OK; all sample word probes hit; sentence-legacy probes still pass; cross-account invariant holds. Actual exit: <CODE>. JSON report: <PASTE>

**Optional R2 inventory sanity (uses the U2 reconcile command exported by `scripts/build-spelling-word-audio.mjs`):**

```
# Requires CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN env vars (R2 read scope on the production bucket).
npm run spelling:word-audio -- reconcile --run-id <verify-RUNID>
```

Expected: `summary.uploaded === planned count` AND `inventorySize === planned count`, with one object per current word under each word voice prefix. Actual: <SUMMARY.UPLOADED> / <INVENTORYSIZE> / <PER-VOICE COUNTS>

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

- [ ] All planned word-only audio files generated and uploaded.
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
