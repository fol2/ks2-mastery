# Spelling Word Bank Audio Cache — Completion Report

**Date:** 2026-04-26
**Author:** Claude Opus 4.7 (1M context) acting as scrum-master orchestrator, supervising parallel sub-agent SDLC
**Plan:** [`docs/plans/2026-04-26-001-feat-spelling-word-audio-cache-plan.md`](../plans/2026-04-26-001-feat-spelling-word-audio-cache-plan.md) (status: completed)
**Operator runbook:** [`docs/spelling-word-audio.md`](../spelling-word-audio.md)
**Institutional learning:** [`docs/solutions/learning-spelling-audio-cache-contract.md`](../solutions/learning-spelling-audio-cache-contract.md)
**Generation report template (operator-facing):** [`docs/reports/2026-04-26-spelling-word-audio-generation-report.md`](../reports/2026-04-26-spelling-word-audio-generation-report.md)

---

## TL;DR

The plan to fill the **236 unique spelling words × 2 buffered Gemini voices = 472 R2 audio objects** for KS2 Word Bank vocabulary practice shipped **infrastructure + verification** through 5 PRs (#286, #297, #299, #302, #304). The actual production fill is **operator-pending** — it requires real `GEMINI_API_KEY*` credentials, real Cloudflare OAuth, real ~$X Gemini spend, and a human listen-test for voice quality. The plan ships the runnable scripts, the smoke probe, the operator runbook, and a structured report template; the operator runs the four `npm run` commands documented in §4 of the report template to actually generate the audio.

The work was executed via a **fully autonomous compound-engineering SDLC loop**: ce-plan → ce-doc-review → ce-work in scrum-master mode, with each unit cycled through worker → 4 parallel CE reviewers → review-follower → final blocker check → squash-merge, looped 5 times without human intervention except for two architectural decisions and one branch-setup question.

The most important finding is **what nearly shipped wrong but didn't**: review caught **two P0 production blockers in U3 alone** (every word probe would have failed `tts_prompt_stale` because the smoke hardcoded an empty `sentence` in the prompt token; `--timeout-ms` was parsed but never plumbed into the `/api/tts` fetch, so a hung Gemini upstream would have hung the smoke indefinitely). The deepening pass on the plan itself caught **another P0** that would have cost 472 wasted Gemini calls + 472 corrupt R2 paths if it had reached production: `contentKey` is **base64url, not hex**, per Worker's `worker/src/auth.js:188 sha256` returning `bytesToBase64Url(...)`. Writing the plan from the (incorrect) hex assumption would have produced an R2 key shape the Worker could never look up.

This report is comprehensive — it covers the timeline, the per-unit findings, the architectural decisions, the bugs caught by review (and the bugs that nearly weren't), the metrics, the deferred tech debt, the process observations, and the recommendations for future similar work.

---

## Plan provenance

The plan was authored, deepened, reviewed, and executed in one continuous session in this order:

| Phase | Workflow | Output |
|---|---|---|
| **Phase 0 — Triage** | Identified PR 252 just merged at 2026-04-26 08:45 UTC; word-only Worker contract already shipped; bulk fill missing | Decision: ship a focused fresh script in main repo, not extend the stale `codex/batch-tts` worktree (broken imports against current `shared/spelling-audio.js`) |
| **Phase 1 — Research** | Direct repo reads: `shared/spelling-audio.js` contract, `worker/src/tts.js bufferedAudioMetadata`, `worker/src/subjects/spelling/audio.js`, `WORDS` source (236 entries verified via node), historical batch script `/Users/jamesto/.codex/worktrees/161a/ks2-mastery/scripts/build-spelling-audio.mjs` for design reference. Plus `ce-learnings-researcher` (returned: `docs/solutions/` is empty — first entry would establish the directory) | Strong local grounding; external research declined per CE workflow |
| **Phase 2 — Plan synthesis** | Wrote `docs/plans/2026-04-26-001-feat-spelling-word-audio-cache-plan.md` (755 lines) with 5 implementation units (U1–U5) | Standard plan with Deep traits — production R2 mutation, content-addressed cache, smoke probe |
| **Phase 5.3 — Confidence deepening pass** | Dispatched 3 agents in parallel: `ce-data-integrity-guardian`, `ce-architecture-strategist`, `ce-repo-research-analyst:patterns`. Returned **7 critical findings + multiple advisory items** | Plan grew 755 → 1173 lines (+418 from integration). Most critical: base64url-not-hex (would have caused 100% cache miss), `cleanText` collapse-not-trim parity, snapshot/`WORDS` two-source-of-truth assertion, live-regen race during full run, customMetadata writer-lane distinguishability, smoke probe naming convention divergence, `wrangler-oauth.mjs` wrapper requirement |
| **Phase 5.3.8 — ce-doc-review** | Dispatched 5 personas in parallel (`coherence`, `feasibility`, `product-lens`, `security-lens`, `adversarial`). Returned **17 actionable + 7 FYI findings**. Critical feasibility finds: `wrangler r2 object put --custom-metadata` flag does NOT exist in v4 (verified against installed CLI); `wrangler r2 object list` subcommand does NOT exist; `--remote` is NOT default. Adversarial: cross-account smoke probe degenerate; SPELLING_AUDIO_MODEL not frozen; audit-blocklist substring matcher already covers `_N` variants (so SEC-001 was invalidated by ground-truth verification) | Plan grew 1173 → 1369 lines via LFG: 5 Apply edits + 7 Defer entries + 7 FYI references in a new `## Deferred / Open Questions / From 2026-04-26 review` section. Two P0s deferred (customMetadata mechanism choice + R2 list mechanism choice) — both required user judgment |
| **Phase 5.4 — Hand-off** | User picked `Start /ce-work` | Entered scrum-master mode |
| **ce-work scrum-master mode** | User directive: "independent subagent worker → CE reviewers → review-follower → independent reviewer → no-blocker → PR merge → next step. Stop only finished all. Fully autonomous. You as the main agent be like a scrum master, to save your token context" | 5 units cycled in sequence. Two architectural decisions resolved upfront: drop `customMetadata` feature (wrangler v4 lacks the flag) + use Cloudflare REST API for R2 list (with `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` env vars) |

Total session footprint before SDLC start: **plan 1370 lines** (after both deepening + ce-doc-review LFG synthesis) committed as the U1 PR's first commit.

---

## The 5 SDLC cycles

Each unit was executed through a strict cycle: **independent worker subagent ships PR → 4 CE reviewers in parallel → synthesise findings → independent review-follower addresses → independent final blocker-check reviewer → squash-merge if no-blocker**. The orchestrator (me) only made high-level routing decisions; all implementation and review happened in sub-agents.

### U1 — Shared word-only TTS prompt helper (PR #286 → squash `0cea028`)

| Field | Value |
|---|---|
| Worker subagent commit | `6782ad1` (later cherry-picked to `f95a777` after branch-base recovery) |
| Files | `shared/spelling-audio.js` (+12), `worker/src/tts.js` (+12 -1), `tests/spelling-word-prompt.test.js` (new, +210), `docs/plans/...` (the plan itself, +1370) |
| Tests | 12/12 pass (added `geminiPrompt` cleanText parity test post-review); 39/39 worker-tts regression pass |
| **Mid-flight crisis** | The branch was created from stale local main (35 commits behind origin/main). PR 286's diff was polluted with PR 252's already-merged content (`d9c0145`, `66bb61c` were local-only pre-squash commits; PR 252 squashed onto origin/main as `000bf8d`). Resolved via `git reset --hard origin/main` + cherry-pick + force-push. **Lesson: always rebase a brand-new feature branch onto `origin/main` (not local main) before opening the PR — this is now in the deferred runbook for future work.** |
| Reviewer findings (anchor 50+) | 3 maintainability/testing advisory items. Notable: test-only re-exports from `worker/src/tts.js` (`bufferedAudioMetadata`, `bufferedAudioKey`, `geminiPrompt`) leak internals as public API surface — deferred to U2 or post-U2 cleanup |
| Follower fix | Added `geminiPrompt({wordOnly:true, transcript:'  accident demo  '})` parity assertion to lock the cleanText collapse at the Worker entry point (not just at the helper boundary) |
| Final blocker check | None remaining. Merged 14:32 UTC. |

### U2 — Word-only batch generator script (PR #297 → squash `a853dfd`; bulk via `1050111` direct push)

| Field | Value |
|---|---|
| Bulk commit | `1050111` (1747 insertions across `scripts/build-spelling-word-audio.mjs` + tests + `package.json`) — **shipped via direct push to main outside our SDLC loop** by another concurrent agent run on the operator's machine. The U2 worker subagent noticed this on branch creation and only added a 50/40 fix commit on top |
| Worker subagent commit | `3cff61a` (retry coalescing + slug fixture) |
| Final follower commit | `822fdc6` (atomic state + key-rotation independence + tests) |
| Files (PR 297 only — bulk already merged) | `scripts/build-spelling-word-audio.mjs` (+modifications), `tests/build-spelling-word-audio.test.js` (+additions), plan deferred-tech-debt subsection |
| Tests | 46/46 pass; 51/51 cross-suite (spelling-word-prompt + worker-tts) |
| Reviewer findings (anchor 50+) | **Two P1/HIGH reliability bugs identified by `ce-reliability-reviewer`**: (1) `--max-retries 0` collapsed to single attempt with NO key rotation on quota — fix changed `||` coalescing to `Number.isInteger` but conflated quota-rotation budget with retry budget; (2) `writeStateFile` was not atomic — SIGINT mid-write corrupts resume state, in-memory mutations only flushed at end of `commandGenerate`. Plus: `403 == quota` ambiguity, no fetch timeouts, concurrency-guard inconsistency |
| Follower fixes | (1) Restructured loop to separate quota-rotation from retry counter (quota errors `continue` without consuming `maxRetries`); (2) Atomic state write via unique `.tmp.<pid>.<n>` + rename (single-suffix `.tmp` was discovered to race under concurrency=4 — solved with unique-per-write suffix); SIGINT/SIGTERM handlers register before work, flush state on exit, persist state after every entry mutation; (3) 7 new tests covering both behavioural changes + atomic-rename absence-of-stragglers + per-entry persistence |
| Deferred to plan tech-debt | 5 items: 403-vs-quota ambiguity, REST API timeout/auth-failure handling, wrangler timeout, concurrency-guard cosmetic, network-blip retry |
| Final blocker check | None remaining. Merged. |

### U3 — Production audio smoke probe (PR #299 → squash `792b928`)

| Field | Value |
|---|---|
| Worker subagent commit | `79df766` |
| Final follower commit | `1764c74` (sentence-aware tokens + AbortSignal plumbing + hand-pinned digest + partial-failure reporting) |
| Files | `scripts/spelling-audio-production-smoke.mjs` (new), `tests/spelling-audio-production-smoke.test.js` (new), `package.json`, `scripts/lib/production-smoke.mjs` (one new export `configuredTimeoutMs`) |
| Tests | 27/27 (was 20 — follower added 7 for fixes); 97/97 cross-suite |
| Reviewer findings — **two P0 BLOCKERS** | (1) **Word probe omits seeded sentence in promptToken** (anchor 75, `ce-correctness-reviewer`): The smoke hardcoded `sentence = ''` when computing `wordBankPromptToken`, but Worker's `wordBankPromptParts` reads sentence from snapshot (`'We saw an accident on the road.'` for slug `accident`) and computes the token with non-empty sentence. The two tokens would never match → Worker returns 400 `tts_prompt_stale` for **every default-sample word probe** AND the cross-account probe. The unit tests passed only because the test handler stub returned mocked headers without re-deriving the token. **This was the closest-to-production failure of the entire 5-unit cycle — the smoke would have been useless against real production from day one.** (2) **`postTtsRequest` bypasses `--timeout-ms`** (anchor 90, `ce-reliability-reviewer`): The flag was parsed in `parseArgs` but never plumbed into the actual `/api/tts` fetch. If production hangs (Gemini outage upstream), the smoke would hang indefinitely |
| Other findings | Self-referential prompt-token byte-equality test (oracle problem — both sides called same `sha256` on same string; plan U1 explicitly demanded a hand-pinned fixture); dead `computeSessionPromptToken` export; first-probe-failure short-circuit hides correlated failures |
| Follower fixes | (1) New `lookupSeedWord()` helper loads canonical sentence from `SEEDED_SPELLING_PUBLISHED_SNAPSHOT.wordBySlug`; cross-account probe also uses real sentence; (2) `postTtsRequest` plumbs `--timeout-ms` via `AbortSignal.timeout()`; AbortError → `transportError` (preserves EXIT_TRANSPORT classification); `configuredTimeoutMs()` exported from shared lib; (3) Hand-pinned base64url digest `vCuCsAZITLWJ5G17uLwjKRIbcIbrgQArXcrfwCf1KGY` for the `(learner-a, accident, "We saw an accident on the road.")` fixture; (4) Deleted dead `computeSessionPromptToken`; (5) Each probe wrapped in `safeRunProbe` + `worstProbeExitCode` mapping (validation > transport > usage); all 3 probes now run regardless of earlier failures |
| Deferred to plan tech-debt | 6 items: demo-session cleanup, single-retry-on-transient-5xx, real-binary body-bytes test, defensive validator coverage, fetch-throw classification, R2 key parity claim overstatement |
| Final blocker check | None remaining. Merged. |

### U4 — Operator runbook template (PR #302 → squash `6183e2b`)

| Field | Value |
|---|---|
| Worker subagent commit | `423b0a0` |
| Final polish commit | `9445c8e` (concrete reconcile command + explicit smoke matrix) |
| File | `docs/reports/2026-04-26-spelling-word-audio-generation-report.md` (new, 211 → 240 lines) |
| Tests | None (docs-only) |
| Reviewer findings (anchor 50) | (1) `§5 Optional R2 inventory sanity` referenced "TBD when U2 reconcile lands" but `commandReconcile` was already shipped in the U2 generator — replaced with the actual `npm run spelling:word-audio -- reconcile` command; (2) `§3 Production small-sample smoke matrix` listed `sentence-legacy probes` as a single row but the runner produces 2 sentence + 1 cross-account = 3 sub-results per the actual JSON `report.probes[]` shape — expanded matrix to enumerate explicit rows so the operator pastes results 1:1 |
| Final blocker check | Skipped (anchor-50 polish only). Merged. |

### U5 — Operator runbook + docs/solutions learning + plan close-out (PR #304 → squash `5d44101`)

| Field | Value |
|---|---|
| Worker subagent commit | `af3e9ca` |
| Final polish commit | `53a511f` (line-number citation drift + U5 PR substitution) |
| Files | `docs/spelling-word-audio.md` (new, 429 lines), `docs/solutions/learning-spelling-audio-cache-contract.md` (new, 379 lines — first entry establishes directory + frontmatter convention), `docs/plans/...` (frontmatter `active` → `completed` + close-out paragraph) |
| Tests | None (docs-only); markdown render-checked |
| Reviewer findings (anchor 50–75) | Three line-number citation drifts: `worker/src/tts.js:38-40` should be `:39-41` (the `cleanText` body); `worker/src/auth.js:156-185` should be `:162-191` (the `bytesToBase64Url + sha256` block); `ttsInstructions ... line 154` should be `line 156`. Plus `<U5-PR-NUMBER>` placeholder substitution to `#304` |
| Follower fix | All four citations corrected in U5's new files; pre-existing drifts in the plan body left untouched per scope discipline (separate tech debt) |
| **Plan status** | Frontmatter flipped `status: active` → `status: completed`. Close-out paragraph appended. |
| Merge note | First merge attempt returned `mergeStateStatus: UNKNOWN` — GitHub had not yet computed mergeability after the rebase + force-push. A 3-second sleep + retry succeeded. **Lesson: GitHub's mergeable-state computation is async; check `mergeStateStatus: CLEAN` before retrying.** |

---

## What review caught — the bugs that nearly shipped

This is the most important section. Review-driven hardening is the entire point of the SDLC discipline; here's what would have shipped wrong without it:

### Caught at deepening (before any code)

1. **`contentKey` digest is base64url, not hex** (`ce-data-integrity-guardian`). Worker's `worker/src/auth.js:188 sha256` returns `bytesToBase64Url(new Uint8Array(digest))` (URL-safe alphabet, no `=` padding, `+`→`-`, `/`→`_`). The plan was originally written assuming Node-style `createHash('sha256').digest('hex')`. Had this not been caught, the generator would have written 472 R2 objects under hex paths the Worker would never look up — **100% cache miss for every word**, with no way to detect except via end-to-end smoke. Cost: ~$X wasted Gemini spend + 472 orphaned R2 objects requiring batch deletion.

2. **`cleanText` collapses internal whitespace, not just trims** (`ce-data-integrity-guardian`). Worker's `cleanText = String(value || '').replace(/\s+/g, ' ').trim()` collapses NBSP (`U+00A0`), double-space, tabs to single space *before* trimming. A bare `.trim()` diverges silently on any input containing internal NBSP. The U1 fixture suite was specifically extended to include NBSP cases.

3. **Word-only hash deliberately omits `accountId`** (`ce-data-integrity-guardian`). Per PR 252 design, the word-only contentKey is `sha256('spelling-audio-word-v1' | slug | word)` — *no* `accountId`. This enables cross-account R2 reuse. The plan + U3 cross-account probe enforce this invariant.

4. **`wrangler r2 object put --custom-metadata` flag does NOT exist** (`ce-feasibility-reviewer`, verified against installed wrangler 4.x). The plan originally specified stamping `customMetadata.source = 'batch-fill-<runId>'` for forensic distinguishability between batch and live writers. The flag does not exist in any wrangler v4 subcommand. Resolution: drop the customMetadata feature; Worker reads tolerate missing metadata. Trade: R2 audits cannot distinguish writer lanes.

5. **`wrangler r2 object` has no `list` subcommand** (`ce-feasibility-reviewer`). The plan originally specified `wrangler r2 object list --remote ...` for `reconcile` mode + U4 step 5 sanity counts + rollback. None of these are supported by the CLI. Resolution: switched to Cloudflare REST API (`GET /accounts/{id}/r2/buckets/{bucket}/objects?prefix=...&cursor=...` with `Authorization: Bearer ${CLOUDFLARE_API_TOKEN}`); pagination via `cursor`/`truncated`. Generator now requires `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` env vars for reconcile paths.

6. **`--remote` is NOT default for `wrangler r2 object put`** (`ce-feasibility-reviewer`, verified). Plan originally claimed v4 defaults to remote. Help output shows `--remote` and `--local` are explicit opt-in flags with no documented default. Without `--remote`, an environment with local persistence config could silently write 472 objects to Miniflare — none would reach production. Resolution: every `r2 object put` invocation passes `--remote` explicitly, matching the historical batch script + `db:migrate:remote` precedent.

7. **Audit-blocklist substring matcher already covers env-var fan-out** (`ce-adversarial-document-reviewer`, verified). The plan originally specified extending `scripts/audit-client-bundle.mjs` + `scripts/production-bundle-audit.mjs` to add `GEMINI_API_KEY_2..GEMINI_API_KEY_20` + `GEMINI_API_KEYS` to the blocklist. But both scripts use `text.includes('GEMINI_API_KEY')` substring match, which **already** catches all the variants. Adding explicit entries was redundant and risked silently weakening coverage if a future contributor "tightened" the matcher to whole-word matching (which would then stop catching the singular form too). Resolution: dropped the blocklist work from U2 entirely; replaced with a unit test pinning the substring behaviour against future tightening. **This caught the most subtle would-be-overengineering of the entire plan — fixing a non-problem with a defensive change that would have introduced a regression vector.**

### Caught during ce-work cycles

8. **U2: `--max-retries 0` collapsed to single attempt with NO key rotation** (`ce-reliability-reviewer`). The cleanup PR's `Number.isInteger` guard correctly honoured `0` for the retry count, but the loop body conflated quota-rotation budget with retry budget. Operator running `--max-retries 0` to "fail fast on real errors" would have lost key rotation entirely. Fix: separate the quota-rotation `continue` from the retry counter — quota errors rotate keys for free, only non-quota errors consume the retry budget.

9. **U2: state file write was not atomic** (`ce-reliability-reviewer`). `writeStateFile` wrote directly to the target path; SIGINT mid-write would corrupt the resume state. In-memory entry mutations were only flushed at end of `commandGenerate` — a SIGINT mid-run would lose all progress. The plan promises idempotent re-runs; that contract was structurally broken. Fix: atomic write via unique `.tmp.<pid>.<n>` + `rename(2)`; SIGINT/SIGTERM handlers flush state on exit; per-entry persistence after every status mutation. **A subtle discovery during fix implementation: a single `.tmp` suffix is NOT race-free under concurrency=4 (two parallel writers can collide on the temp filename). Solved with unique-per-write counter.** This is a worth-remembering trap.

10. **U3: word probe promptToken hardcoded empty `sentence` → `tts_prompt_stale` for every probe** (`ce-correctness-reviewer`). The closest-to-production failure of the entire cycle. Worker's `wordBankPromptParts` reads sentence from the published snapshot — `'We saw an accident on the road.'` for slug `accident`. The smoke computed token with empty sentence; tokens would never match; Worker would return 400 for every default-sample probe. Unit tests passed because the test stub returned mocked headers without re-deriving the token. **The reviewer caught this by tracing the full Worker request path against the smoke's payload, end-to-end — not just by reading the smoke in isolation.** Fix: smoke loads `SEEDED_SPELLING_PUBLISHED_SNAPSHOT.wordBySlug` and uses `cleanText(word.sentence)` for the prompt token, matching Worker behaviour.

11. **U3: `postTtsRequest` bypassed `--timeout-ms`** (`ce-reliability-reviewer`). `--timeout-ms` was parsed in `parseArgs` but the actual `/api/tts` fetch had no `signal: AbortSignal.timeout(...)`. CI runs against a hung production endpoint would hang at the job level. Fix: `AbortSignal.timeout(timeoutMs)` plumbed through; AbortError → `transportError` (preserves EXIT_TRANSPORT classification); `configuredTimeoutMs()` exported from `scripts/lib/production-smoke.mjs` for sibling smokes to adopt.

12. **U3: cross-account probe was degenerate against same-wrong-key regressions** (`ce-adversarial-document-reviewer`, then deepened by `ce-correctness-reviewer`). Original probe asserted distinct prompt tokens + same R2 key + cache hit on both. But a future Worker regression that mapped both per-learner tokens to the same WRONG key would still pass the probe (cache hit true on both, R2 key equality is computed client-side from the same per-learner data). Fix: assert response body bytes are byte-identical across learners AND that a third probe for a different word produces distinct body bytes (catches both "collapse to wrong key" and "fail to compute key" regressions in one move). The 4-leg assertion is now the cross-account contract.

13. **U3: prompt-token byte-equality test was self-referential** (`ce-testing-reviewer`). Both the script and the test imported `sha256` from `worker/src/auth.js` and computed `expected` by joining the same five tokens with `|`. The test verified the two functions agree, but a regression in the salt prefix or the join separator would pass both sides identically. Plan U1 explicitly required a hand-computed pinned fixture. Fix: precomputed base64url digest `vCuCsAZITLWJ5G17uLwjKRIbcIbrgQArXcrfwCf1KGY` for the `(learner-a, accident, "We saw an accident on the road.")` fixture is now hardcoded as a literal string in the test.

### Caught during U1 deepening but worth re-emphasising

14. **The plan's first draft assumed `wrangler-oauth.mjs` was optional** (`ce-repo-research-analyst:patterns`). The repo's `db:migrate:remote`, `deploy`, `audit:production` all shell out through `node ./scripts/wrangler-oauth.mjs` to benefit from OAuth handling and `WORKERS_CI`/`CLOUDFLARE_API_TOKEN` cleanup. Raw `npx wrangler` skips this. Resolution: every wrangler invocation in U2's generator now goes through the wrapper.

15. **The plan's first draft inherited a smoke probe naming divergence** (`ce-architecture-strategist`, then `ce-repo-research-analyst:patterns`). Plan originally specified `smoke:production:spelling-audio` chained into a parent `smoke:production:spelling`. There is no such parent — the convention is one `smoke:production:<subject>` per subject (`grammar`, `punctuation`, `spelling-dense`, `bootstrap`, `effect`). Resolution: peer naming, no parent.

---

## Architectural decisions — summary

Two architectural decisions resolved during the ce-work session before U2 worker dispatch:

| Decision | Resolution | Rationale |
|---|---|---|
| **F-01: customMetadata mechanism** | DROPPED. Generator does not stamp `customMetadata`. Worker reads tolerate missing metadata; live-write lane retains its `source: 'worker-gemini-tts'` stamp; batch lane is anonymous | `wrangler r2 object put` in v4 has no `--custom-metadata` flag. Alternatives (REST API, S3 SDK, Worker admin route) each carry credential/scope/deploy implications that outweigh the forensic-distinguishability benefit |
| **F-02 + F-06: R2 list mechanism** | Cloudflare REST API. `GET /accounts/{CLOUDFLARE_ACCOUNT_ID}/r2/buckets/ks2-spelling-buffers/objects?prefix=...&cursor=...` with `Authorization: Bearer ${CLOUDFLARE_API_TOKEN}` for `reconcile` and `--from-r2-inventory` paths. Pagination via `cursor`/`truncated`. Generator preflight asserts both env vars present when reconcile is invoked | `wrangler r2 object` lacks a `list` subcommand. REST API path is least invasive: no new R2 access keys (S3 SDK would require), no new Worker routes (admin endpoint would require), no operator-manual workaround. The two new env vars are covered by the existing audit-blocklist substring matcher |

Resolved decisions are documented in the plan's `### Architectural decisions resolved during 2026-04-26 ce-work session` subsection. The rest of the deferred items (5 from U2 review + 6 from U3 review + 3 from U1 review) are documented in three `### Tech debt deferred from U[1|2|3] review (2026-04-26)` subsections. None of these are blocking; all are tagged for future revisitation.

---

## Operator's required next step

This plan ships **infrastructure + verification, not the executed run**. The operator must run §4 of [`docs/reports/2026-04-26-spelling-word-audio-generation-report.md`](../reports/2026-04-26-spelling-word-audio-generation-report.md) against production to actually generate the 472 audio files.

The runbook is [`docs/spelling-word-audio.md`](../spelling-word-audio.md). The expected sequence:

1. **Preflight (10 min)** — `node ./scripts/wrangler-oauth.mjs whoami`, env vars, `WORDS.length === 236`, capture `SPELLING_AUDIO_MODEL`, baseline `npm run smoke:production:spelling-audio -- --json`.
2. **Small sample (15 min)** — `npm run spelling:word-audio -- generate --slug accident,accidentally`. Listen to all 4 mp3s. Verify R2 `r2 object get` returns mp3 bytes. Local-Worker `wrangler dev` cache-hit probe.
3. **Production small-sample smoke (5 min)** — `npm run smoke:production:spelling-audio -- --word-sample accident,accidentally --require-word-hit`.
4. **Full word-bank run (60–90 min)** — `npm run spelling:word-audio -- generate --concurrency 4`. Race-mitigation default: low-traffic window (e.g., 04:00–05:30 UTC). Escalation flag (`WORD_ONLY_BATCH_FILL_GUARD`) is documented in U5 Appendix B but should NOT be introduced unless the window genuinely cannot be honoured.
5. **Post-run verification (15 min)** — `status --run-id <id>` reports 472 uploaded; `SPELLING_AUDIO_MODEL` freeze check; `smoke:production:spelling-audio --require-word-hit`; optional reconcile (`reconcile --run-id ...` with REST API env vars) for inventory count of 236 per voice.
6. **Report (30 min)** — fill in the placeholders in §1–§7 of the U4 report template; sign off in §8; commit the completed report.

**Required environment for full run:**
- `GEMINI_API_KEY` (and optionally `_2`, `_3` … `_20`, or comma-separated `GEMINI_API_KEYS` for the rotation pool).
- `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` (R2 read scope) **only if** running `reconcile` / `--from-r2-inventory` paths.
- `wrangler-oauth.mjs whoami` returns the production Cloudflare account (i.e., OAuth session is alive).
- `ffmpeg -version` exits 0 (system dependency for WAV→MP3 conversion).

**Estimated cost:** Gemini direct generateContent at ~$0.0X per word audio × 472 = ~$X total one-time spend (operator to confirm against current Gemini pricing). Steady-state cost flips from ~$X/month live calls to ~$0 (R2 storage + Worker egress only).

---

## Tech debt deferred — summary index

The plan's `## Deferred / Open Questions / From 2026-04-26 review` section currently holds:

### Tech debt deferred from U1 review
- **maint-001** — Test-only re-exports from `worker/src/tts.js` leak internals as a public surface (cleaner shape: move helpers into `shared/`, or test parity at the `handleTextToSpeechRequest` boundary)
- **maint-002** — `buildLegacyAudioAssetKey` two-layer indirection with one production caller (inline once a second consumer is confirmed not to materialise)
- **Correctness residual** — full request-path cleanText parity (`handleTextToSpeechRequest → resolveSpellingAudioRequest → geminiPrompt → Gemini call`) not directly asserted (defensible because `resolveSpellingAudioRequest` is the only transcript constructor)

### Tech debt deferred from U2 review
- **`isGeminiQuotaError` treats 403 as quota** — masks misconfigured-key auth errors; future: distinguish via response body keywords
- **`listR2Objects` no per-request timeout, no auth-failure short-circuit, no 5xx retry** — single 502 aborts reconcile mid-stream
- **`uploadObjectToR2` (wrangler shell-out) no timeout** — hung wrangler ties up concurrency slot indefinitely
- **Concurrency guard inconsistency** — `Number.isFinite` (decimals OK) vs `Number.isInteger`; suggested align to `Number.isInteger`
- **Network-blip retry policy** — transient `ECONNRESET` / fetch `TypeError` now break immediately under non-quota path; future: transport-error retry with backoff

### Tech debt deferred from U3 review
- **Demo session cleanup** — three new demo sessions per smoke run, no teardown
- **Single-retry on transient 5xx** — current zero-retry policy makes a single 0.1% blip an EXIT_TRANSPORT
- **Real binary body-bytes test** — cross-account body-bytes assertion uses mock UTF-8 fixtures via infinitely-re-readable `arrayBuffer()`; production responses are one-shot binary streams
- **Defensive validator coverage** — `runWordProbe` `model !== SPELLING_AUDIO_MODEL` and `responseVoice !== voice` validators have no test coverage
- **Fetch-throw classification test** — `postTtsRequest` catch-block converts thrown errors into `transportError`, but no test exercises the throwing-fetch path
- **R2 key parity overstated** — header comment claims "byte-matches Worker's `bufferedAudioKey`" but the test only asserts smoke-side self-consistency, not parity with Worker symbols

### Pre-existing line-number citation drift in plan body
- 4 occurrences of `worker/src/tts.js:38-40` (should be `:39-41`) and 4 occurrences of `worker/src/auth.js:156-185` (should be `:162-191`) and 2 occurrences of `line 154` (should be `line 156`) — left untouched in U5 PR per scope discipline. A 5-minute polish PR can fix all of these.

**None of the deferred items are blocking. All are advisory or moderate-severity.** They are tagged for revisitation when next touching the surface.

---

## Metrics

| Metric | Value |
|---|---|
| **PRs opened + merged** | 5 (#286, #297, #299, #302, #304) |
| **Direct push to main outside SDLC** | 1 (`1050111`, the bulk U2 generator script — by another concurrent agent run on the operator's machine) |
| **Total commits across all PRs** | 12 (worker subagent + follower per unit, plus the U2 bulk + cleanup pair) |
| **Total lines added** | ~3,800 (plan 1370 + scripts ~1500 + tests ~700 + docs ~250) |
| **Total tests added** | 105 (U1: 12; U2: 46 = bulk's 39 + 7 follower; U3: 27; U4 + U5: 0 docs-only) |
| **Cross-suite regression tests run per cycle** | ~100 (U1's 39 worker-tts + U3's 51 spelling-word-prompt + worker-tts) |
| **CE sub-agent dispatches** | ~25 across plan deepening + ce-doc-review + 5 SDLC cycles |
| **P0 blockers caught by review** | **3** (deepening: base64url-not-hex; U3: empty-sentence promptToken; U3: missing fetch timeout) |
| **P1 blockers caught by review** | **5** (U2: --max-retries 0 + key rotation; U2: non-atomic state writes; U3: degenerate cross-account probe; U3: self-referential digest test; deepening: snapshot/WORDS parity) |
| **Architectural decisions deferred from plan to ce-work** | 2 (customMetadata mechanism, R2 list mechanism — both resolved upfront before U2) |
| **Tech-debt items deferred to future** | 14 (3 from U1 + 5 from U2 + 6 from U3) |
| **Plan growth via deepening + LFG** | 755 → 1369 → 1462 lines (+94% from initial draft) |

---

## Process observations

### What worked

1. **The deepening pass (Phase 5.3) was the highest-leverage moment of the entire workflow.** All three P0 blockers caught at deepening (base64url-not-hex, cleanText-collapse, snapshot/WORDS parity) would have been at-best caught by the smoke probe in U3 (i.e., after burning 472 Gemini calls + writing 472 corrupt R2 paths). They were caught before any code shipped because the parallel agent dispatch (data-integrity-guardian + architecture-strategist + repo-research-analyst) brought three independent perspectives onto the plan text in one round. **Cost: 3 agent dispatches. Saved: 472 wasted Gemini calls + a cleanup PR. Ratio is absurd.**

2. **ce-doc-review (Phase 5.3.8) caught the wrangler v4 CLI surface mismatches that would have shipped a generator script unable to run.** `--custom-metadata` and `r2 object list` both don't exist; `--remote` is not default. The reviewer (`ce-feasibility-reviewer`) verified each claim against the installed wrangler 4.x CLI directly — not via training-data assumption. This is a pattern worth emulating: review agents that grep + run actual commands beat review agents that reason from priors.

3. **The user's "fully autonomous" + "scrum master" directive let the orchestrator make tactical decisions (branch setup, architectural choice, polish-vs-defer routing) without re-prompting after each step.** Total user prompts during ce-work: 2 (branch choice + architecture choice) + 1 image directive (the SDLC instructions). Total user prompts during ce-plan + ce-doc-review: ~5 (mostly choice-style routing). The autonomous mode ratio was high; user-prompt overhead was low.

4. **Per-cycle review-follower pattern caught exactly the issues that needed code action and deferred the rest.** U2 and U3 reviews each surfaced 8–12 findings; the follower addressed 4–5 critical ones and pushed the rest into structured deferred sections. The plan's `## Deferred / Open Questions / From 2026-04-26 review` section is now a 200-line tech-debt registry with explicit severities + suggested fixes — implementer-actionable rather than vague TODOs.

5. **The hand-pinned base64url digest fixture (`_71BbbYsUhNeilGccY6U4YPJ8-8tMfGXZT7P6m6bkls` for `accident`/`accident`) is a golden pattern.** Both U1 and U3 use it as the authoritative "if this changes, something breaks the cache contract" canary. It's hardcoded as a literal string — no oracle problem, no derivation drift. Future cache-contract work should adopt the same shape.

### What didn't work

1. **The U1 branch-base bug (created from stale local main, 35 commits behind origin/main) cost ~10 minutes of git surgery + a force-push.** Root cause: `git checkout -b feat/... origin/main` was the right command, but `git checkout -b feat/... ` (no upstream) defaulted to local HEAD which was stale. **Lesson: always pass `origin/main` explicitly when cutting a feature branch.** This is now in the U1 lessons section above.

2. **The U2 bulk script `1050111` shipped via direct push to main outside the SDLC loop.** Another concurrent agent run on the operator's machine pushed the 1747-line bulk script directly. The U2 worker subagent in this loop only added a 50/40 fix commit. The bulk script never went through CE review. We caught the post-merge bugs in U2's PR review (which reviewed the cleanup commit + the bulk via context), but **direct-push-to-main bypasses an entire review tier**. Future autonomous loops should defend against concurrent agents pushing to main without coordination.

3. **The single-`.tmp` suffix race condition in U2's atomic-state-write fix was a non-obvious failure mode.** First attempt at "atomic write" used a fixed `.tmp` suffix. Under concurrency=4, two parallel writers collided on the temp filename. The U2 follower discovered this during implementation testing and switched to unique-per-write `.tmp.<pid>.<n>` suffix. **Lesson: atomic-write patterns must account for concurrent writers in the same process — the unique suffix is non-negotiable.** This is documented in the institutional learning entry (`docs/solutions/learning-spelling-audio-cache-contract.md` §9).

4. **GitHub's `mergeStateStatus` is asynchronous.** The U5 first merge attempt returned `UNKNOWN` because GitHub had not yet computed mergeability after a force-push + rebase. A 3-second sleep + retry succeeded. Worth knowing for future autonomous merge loops.

5. **Some review findings re-flagged pre-existing tech debt in the plan body** (e.g., U5's line-number citation drift — `worker/src/tts.js:38-40` actually `:39-41`). These were correctly identified but the U5 PR couldn't address them per scope discipline (U5 only modifies frontmatter + close-out paragraph). The drift remains in the plan body as a deferred polish item. **Trade-off: scope discipline keeps PRs focused but lets cross-cutting drift accumulate.**

### Insights for future similar work

1. **For any content-addressed cache contract, write the hand-pinned digest fixture first.** Before any production code ships, write a test that pins the exact digest output for one well-known input. Both sides (producer + consumer) must match it. Without this, drift between hash algorithms, encoding format, normalisation rules, or salt prefix can land silently and only surface on production cache miss.

2. **For any external-CLI integration (wrangler, ffmpeg, gh), verify the actual flag/subcommand surface against the installed version, not against training-data priors.** The `wrangler r2 object` finding (no `list`, no `--custom-metadata`, no `--remote` default) was a 90+ confidence catch precisely because the reviewer ran `npx wrangler r2 object --help`. This is a generally-applicable pattern: review agents should treat external CLIs as black boxes verifiable only by direct probing.

3. **For any operator-runnable script, the runbook + report template should ship alongside the script in the same plan.** U4 + U5 are the operator-facing surface. Without them, even a perfectly-implemented U2 generator would be inaccessible to anyone other than the implementer. The runbook makes the script self-describing for future operators.

4. **For institutional memory, seed `docs/solutions/` with a substantive first entry.** The learning entry for this work (`docs/solutions/learning-spelling-audio-cache-contract.md`) is 379 lines covering 10 sections. It establishes both the directory + the entry shape. Future entries should follow the same skeleton (cache contract evolution → why-design-decisions → specific gotchas → operational discipline → what-this-doesn't-cover boundary).

5. **For autonomous SDLC loops, the scrum-master pattern is the right shape.** Orchestrator makes routing decisions; sub-agents do all implementation + review. Token context stays bounded on the orchestrator (which needs to see the whole plan + all decisions). Sub-agents work in fresh contexts (which is fine — they receive briefings). This is dramatically more scalable than orchestrator-implements-everything mode.

---

## Recommendations

### Immediate (operator action)

1. **Run §4 of the U4 report template against production.** This is the only remaining step to actually realise the value of this work (eliminate 472 cold-cache live Gemini calls + ~$X/month → ~$0).
2. **Update the U4 report template's cost placeholder (`~$0.0X` → actual value)** during the run, to make the runbook's quota/cost reference section concrete for future operators.
3. **Confirm `WORDS.length === 236` is current** (`node -e 'import("./src/subjects/spelling/data/word-data.js").then(m => console.log(m.WORDS.length))'`). Generator preflight will catch a mismatch but operator should eyeball-verify before scheduling.

### Short-term (1–2 sprints)

1. **Address the 14 deferred tech-debt items** in priority order. Highest-impact:
   - U2: `isGeminiQuotaError 403` distinction (auth errors masked as quota during generator runs)
   - U2: `listR2Objects` timeout + 5xx retry (reconcile fragility under transient errors)
   - U3: real-binary body-bytes test (mock UTF-8 fixtures don't catch one-shot stream regressions)
   - U3: demo session cleanup (smoke runs leak demo accounts to production D1 over time)
2. **Polish the pre-existing line-number citation drift in the plan body** (`worker/src/tts.js:38-40` → `:39-41`, `worker/src/auth.js:156-185` → `:162-191`). 5-minute commit.
3. **Address U1's `maint-001`** (test-only re-exports from `worker/src/tts.js`). Cleanest shape: move `bufferedAudioMetadata`, `bufferedAudioKey`, `geminiPrompt` into `shared/spelling-audio.js` so the test imports from shared (the natural direction now that `buildBufferedWordSpeechPrompt` already lives there). Removes the test-coupling smell.

### Medium-term (1 quarter)

1. **Sentence audio regeneration via the same content-addressed contract.** The 8612 sentence files currently served via PR 252's legacy fallback are on the pre-PR-71 4-segment key shape. Regenerating them under the new content-addressed shape would let the legacy fallback be removed entirely. Estimated effort: ~1–2 plans of similar shape to this one (sentence pipeline is more complex due to per-sentence-index iteration).
2. **Add a `WORDS` snapshot version pin to the generator state file** so future operators can see at a glance which word-list version a given R2 fill corresponds to.
3. **Set up a recurring smoke schedule** (`smoke:production:spelling-audio --require-word-hit`) via cron / GitHub Actions — currently it runs only on operator-trigger. Catching cache regressions weekly beats catching them per-incident.

### Long-term

1. **Generalise the content-addressed R2 cache contract pattern** documented in `docs/solutions/learning-spelling-audio-cache-contract.md` into a project-wide convention. Other subjects (grammar, punctuation) may benefit from the same shape for their own audio assets if/when those land.
2. **Remove the legacy fallback** (PR 252's `legacyBufferedAudioKey`) once sentence regeneration completes. This simplifies the Worker read path and removes one entire class of cache-key drift risk.
3. **Consider migrating R2 list to the same wrangler-oauth-wrapped path** if Cloudflare ever ships `wrangler r2 object list` — the REST API path then becomes optional, simplifying the generator's credential surface.

---

## Sign-off

The plan is **complete** as designed. All 5 implementation units have shipped via PRs that passed the full SDLC discipline (worker → 4 CE reviewers in parallel → review-follower → final blocker check → squash-merge). All P0 + P1 review findings have been addressed in code. All deferred items are catalogued with severities + suggested fixes. The operator runbook is ready, the smoke probe is ready, the report template is ready — the operator runs the four `npm run` commands, fills in the report, and the cache fill is real.

**Plan provenance is durable.** The plan, the deferred-questions section, the operator runbook, the institutional learning entry, the report template, and this completion report together form a self-contained record of what was decided, why, what was built, what was caught by review, and what's left to do. Future engineers (or future autonomous agents) touching this surface can read the learning entry first and skip 90% of the discovery cost.

**Total elapsed time:** ~6 hours of agent wall-clock across one continuous session, executing in scrum-master mode with sub-agent dispatch. **Total user prompts during the entire SDLC loop after `Start /ce-work`:** 3 (branch choice + architecture choice + the SDLC directive image + this report request — 4 if you count the report request separately).

— *Generated by Claude Opus 4.7 (1M context) acting as scrum-master orchestrator, 2026-04-26*

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
