// Phase 3 U4 — Punctuation Summary scene.
// Phase 4 U5 — Visible child feedback rebuild (correct-count line, per-skill
//              chips for skills exercised this round with status badges,
//              next-review hint, monster-progress teaser) + telemetry emits
//              (`summary-reached`, `feedback-rendered`, `monster-progress-
//              changed`) fired once per mount via the useRef-gated render-
//              time pattern landed in U4's Setup-mount precedent.
//
// Replaces the monolith's `SummaryView` with a standalone component. Summary
// now reads as:
//
//   - Bellstorm summary hero (eyebrow "Summary" + celebratory headline via
//     `punctuationSummaryHeadline(summary)` — accuracy-bucketed child copy
//     replaces the clinical `summary.label` default).
//   - Correct-count copy line ("N out of M correct", U5) — skipped when
//     `summary.total === 0` so a zero-round never renders the nonsense
//     "0 out of 0 correct" string.
//   - Score chip row: Answered / Correct / Accuracy (3 chips).
//   - Per-skill chip row for skills exercised this round (U5). Each chip
//     carries a child-register label from `PUNCTUATION_CLIENT_SKILLS.name`
//     plus a status badge — "needs practice" when the skill appears in
//     `summary.focus`, "secure" otherwise. The row renders only when
//     `summary.skillsExercised` is a non-empty array.
//   - Next-review hint (U5): derived from `ui.stats.due` — encouraging copy
//     when more due work is ready today; otherwise a "Back tomorrow" nudge.
//   - Monster-progress teaser (U5): fires only when `summary.monsterProgress`
//     carries a stage delta AND the monsterId is on the active roster.
//     Reserved monsters (Colisk / Hyphang / Carillon) never render a teaser
//     even if an upstream payload smuggles one in — the filter mirrors U2's
//     home-companion `MONSTERS_BY_SUBJECT[subjectId]` membership pattern.
//   - Wobbly chips: `summary.focus` skillIds mapped through
//     `PUNCTUATION_CLIENT_SKILLS` to produce child labels like
//     "Speech punctuation needs another go" — NEVER raw skill ids. An empty
//     focus array renders a single positive chip ("Everything was secure
//     this round!") rather than dead whitespace.
//   - Active-only monster progress strip: iterate
//     `ACTIVE_PUNCTUATION_MONSTER_IDS` over `progressForPunctuationMonster`
//     against the flat `ui.rewardState` path (the same path MapScene reads,
//     and the path the Grammar surface already wires). Reserved monsters
//     (Colisk / Hyphang / Carillon) are never rendered.
//   - GPS summary (Phase 2 contract preserved): short review cards when
//     `summary.gps?.reviewItems` exists. `misconceptionTags` pipe through
//     `punctuationChildMisconceptionLabel`; null-mapped tags hide rather
//     than surfacing raw dotted ids.
//   - 4 next-action buttons (Practise wobbly / Open Map / Start again /
//     Back to dashboard).
//
// Mutation controls continue to thread `composeIsDisabled(ui)` — the 3
// mutation buttons disable as a single bundle whenever availability flips
// to degraded / unavailable, a command is in flight, or the runtime is
// read-only (plan R11). The "Back to dashboard" navigation button threads
// `composeIsNavigationDisabled(ui)` so a stalled command never traps the
// child on this scene (plan R7 / U6).
//
// SSR blind spots (learning #6): pointer-capture, focus, and scroll-into-view
// are NOT observable via node:test + SSR. Every feature that claims a
// behavioural guarantee comes with a paired state-level or DOM-match
// assertion (learning #7).

import React, { useRef } from 'react';

import { useSubmitLock } from '../../../platform/react/use-submit-lock.js';
import {
  ACTIVE_PUNCTUATION_MONSTER_IDS,
  bellstormSceneForPhase,
  composeIsDisabled,
  composeIsNavigationDisabled,
  extractPunctuationMonsterProgress,
  mergeMonotonicDisplay,
  punctuationChildMisconceptionLabel,
  punctuationChildNextReviewCopy,
  punctuationChildRegisterOverrideString,
  punctuationChildSkillBadgeLabel,
  punctuationChildTeaserSubLine,
  punctuationMonsterDisplayName,
  punctuationStageLabel,
  punctuationSummaryHeadline,
} from './punctuation-view-model.js';
import { PUNCTUATION_CLIENT_SKILLS } from '../read-model.js';
import { emitPunctuationEvent } from '../telemetry.js';

// --- Local helpers ---------------------------------------------------------

// Lookup skill name for a summary focus id. Scanning the frozen
// `PUNCTUATION_CLIENT_SKILLS` manifest keeps the Map and Summary scenes
// reading the same canonical names. Unknown ids return `null` so the chip
// is skipped rather than surfacing the raw dotted id (plan R15 / U10 sweep).
const CLIENT_SKILL_NAMES_BY_ID = new Map(
  PUNCTUATION_CLIENT_SKILLS.map((skill) => [skill.id, skill.name]),
);

function summaryFocusSkillLabel(skillId) {
  if (typeof skillId !== 'string' || !skillId) return null;
  const name = CLIENT_SKILL_NAMES_BY_ID.get(skillId);
  return typeof name === 'string' && name ? name : null;
}

function newlineTextStyle(value) {
  return String(value || '').includes('\n') ? { whiteSpace: 'pre-wrap' } : undefined;
}

// U4 follower (HIGH 1 — monster strip dead path): reward state lives at the
// flat `ui.rewardState` path, the same path `PunctuationMapScene` reads and
// that `GrammarPracticeSurface` resolves before passing to the summary scene
// as a prop. The pre-fix shape (`ui.rewards.monsters.punctuation`) was only
// ever set by fixtures — no production write path populated it, so every
// real learner saw "Stage 0 of 4" across all four monsters regardless of
// their actual progress. The surface now accepts a resolved `rewardState`
// prop (Grammar precedent); this helper falls back to `ui.rewardState` and
// finally to an empty object so `progressForPunctuationMonster` can still
// return a safe stage 0 shape for fresh learners.
function rewardStateForPunctuation(ui, propRewardState) {
  if (propRewardState && typeof propRewardState === 'object' && !Array.isArray(propRewardState)) {
    return propRewardState;
  }
  const fromUi = ui && typeof ui === 'object' && !Array.isArray(ui) ? ui.rewardState : null;
  if (fromUi && typeof fromUi === 'object' && !Array.isArray(fromUi)) return fromUi;
  return {};
}

// U5 review follow-on (FINDING F): the scene-local `ACTIVE_MONSTER_ID_SET`
// and `extractMonsterProgress` helper moved to `punctuation-view-model.js`.
// Single source of truth for the active roster filter so U9 Worker-side or
// any non-React consumer can share the same gate.

// --- Correct-count copy line (U5) ------------------------------------------

// A visible child-facing "N out of M correct" line alongside the accuracy
// chip. The correct count duplicates the stat chip's number on purpose — the
// chip row is a dashboard glance, this line is the sentence a child would
// read aloud to a parent. A zero-total round renders nothing so the child
// never sees the nonsense "0 out of 0 correct" string (e.g. an immediately
// ended GPS test with zero answered items).
function CorrectCountLine({ summary }) {
  const total = Number(summary?.total) || 0;
  if (total <= 0) return null;
  const correct = Math.max(0, Math.min(total, Number(summary?.correct) || 0));
  return (
    <p
      className="punctuation-summary-correct-count"
      data-punctuation-summary-correct-count
      style={{ marginTop: 12 }}
    >
      {`${correct} out of ${total} correct`}
    </p>
  );
}

// --- Per-skill chip row (U5) -----------------------------------------------

// `summary.skillsExercised` is an array of skill ids covering every skill
// the learner touched in the round (not just wobbly ones). Each chip reads
// a child-register label from `PUNCTUATION_CLIENT_SKILLS.name`; the
// status badge reads "needs practice" when the id is also in
// `summary.focus`, "secure" otherwise. Legacy rounds that don't carry
// `skillsExercised` render nothing — the existing Wobbly chip row still
// surfaces their focus ids below.
function SkillsExercisedRow({ summary }) {
  const exercised = Array.isArray(summary?.skillsExercised)
    ? summary.skillsExercised.filter((id) => typeof id === 'string' && id)
    : [];
  if (!exercised.length) return null;
  const focus = Array.isArray(summary?.focus)
    ? new Set(summary.focus.filter((id) => typeof id === 'string' && id))
    : new Set();
  const chips = [];
  const seen = new Set();
  for (const skillId of exercised) {
    if (seen.has(skillId)) continue;
    seen.add(skillId);
    const name = summaryFocusSkillLabel(skillId);
    if (!name) continue;
    const status = focus.has(skillId) ? 'needs-practice' : 'secure';
    chips.push({ id: skillId, name, status });
  }
  if (!chips.length) return null;
  return (
    <div
      className="chip-row punctuation-summary-skills"
      role="group"
      aria-label="Skills you practised this round"
      data-punctuation-summary-skill-row
      style={{ marginTop: 14 }}
    >
      {chips.map((chip) => {
        // U7 copy register pass: badge strings routed through
        // `punctuationChildSkillBadgeLabel` so the sweep has a single
        // governance layer for every status → label mapping.
        const badgeText = punctuationChildSkillBadgeLabel(chip.status);
        return (
          <span
            className={`chip ${chip.status === 'needs-practice' ? 'warn' : 'good'}`}
            key={`skill-chip-${chip.id}`}
            data-skill-chip-id={chip.id}
            data-skill-status={chip.status}
          >
            {chip.name}
            {badgeText ? (
              <span className="punctuation-summary-skill-badge small muted" style={{ marginLeft: 6 }}>
                {` — ${badgeText}`}
              </span>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}

// --- Next-review hint (U5) -------------------------------------------------

// A short KS2-friendly line that tells the child when the next round is
// ready. `ui.stats.due` is the canonical signal: > 0 means the scheduler has
// more work waiting right now; 0 means every published unit has been
// secured / not yet due, so the next round opens tomorrow. The helper
// renders nothing when `stats` is absent so degraded-analytics states don't
// fabricate a hint.
function NextReviewHint({ ui }) {
  const stats = ui && typeof ui === 'object' && !Array.isArray(ui) && ui.stats
    && typeof ui.stats === 'object' && !Array.isArray(ui.stats)
    ? ui.stats
    : null;
  if (!stats) return null;
  // U7 copy register pass: routed through
  // `punctuationChildNextReviewCopy` so the wording ships as child copy
  // ("More goes ready — let's do another round." / "Brilliant — come
  // back tomorrow for more.") and future register changes land in one
  // seam rather than JSX literals. `null` return short-circuits the
  // render so a malformed `stats.due` never fabricates a hint.
  const copy = punctuationChildNextReviewCopy(stats);
  if (!copy) return null;
  return (
    <p
      className="punctuation-summary-review-hint muted"
      data-punctuation-summary-review-hint
      style={{ marginTop: 12 }}
    >
      {copy}
    </p>
  );
}

// --- Monster-progress teaser (U5) ------------------------------------------

// Celebrates a stage advance on an active monster. Receives the already-
// filtered `{monsterId, stageFrom, stageTo}` triple (null when there's no
// advance to show, or when the monsterId points at a reserved roster).
// The teaser intentionally names the monster in child register ("Pealark
// levelled up!") — the stage delta is encoded as data-* attributes so
// telemetry consumers and tests can read the exact from/to without parsing
// the headline.
function MonsterProgressTeaser({ progress }) {
  if (!progress) return null;
  const monsterName = punctuationMonsterDisplayName(progress.monsterId);
  // U7 copy register pass: sub-line routed through
  // `punctuationChildTeaserSubLine(monsterName)` so the Bellstorm frame
  // stays intact for the KS2 reader (the prior "Keep going to unlock
  // the next stage." read as generic SaaS gamification).
  const subLine = punctuationChildTeaserSubLine(monsterName);
  return (
    <div
      className="punctuation-summary-monster-teaser"
      data-punctuation-summary-monster-teaser
      data-teaser-monster-id={progress.monsterId}
      data-teaser-stage-from={progress.stageFrom}
      data-teaser-stage-to={progress.stageTo}
      role="status"
      style={{ marginTop: 16 }}
    >
      <strong>{`${monsterName} levelled up!`}</strong>
      <p className="small muted" style={{ marginTop: 4 }}>
        {subLine}
      </p>
    </div>
  );
}

// --- Score chips -----------------------------------------------------------

function ScoreChipRow({ summary }) {
  const total = Number(summary?.total) || 0;
  const correct = Number(summary?.correct) || 0;
  const accuracy = Number(summary?.accuracy) || 0;
  return (
    <div className="stat-grid punctuation-summary-score" style={{ marginTop: 16 }}>
      <div className="stat">
        <div className="stat-label">Answered</div>
        <div className="stat-value">{total}</div>
        <div className="stat-sub">This session</div>
      </div>
      <div className="stat">
        <div className="stat-label">Correct</div>
        <div className="stat-value">{correct}</div>
        <div className="stat-sub">Clean attempts</div>
      </div>
      <div className="stat">
        <div className="stat-label">Accuracy</div>
        <div className="stat-value">{accuracy}%</div>
        <div className="stat-sub">Session score</div>
      </div>
    </div>
  );
}

// --- Wobbly chips ----------------------------------------------------------

// `summary.focus` is an array of skill ids from `sessionFocus` in
// `shared/punctuation/service.js`. The scene maps each id to its child name
// via `PUNCTUATION_CLIENT_SKILLS`, then wraps the name in the "needs another
// go" nudge copy. Unknown ids are silently dropped (the safe default per
// learning #9 — better an empty chip row than a leaked raw id).
//
// U4 follower (design-lens MEDIUM 4): when there are no wobbly skills
// (either because `summary.focus` is empty, or every id mapped to null),
// render a positive "Everything was secure this round!" chip so the slot
// still communicates round outcome rather than rendering as empty space.
function WobblyChipRow({ focus }) {
  const ids = Array.isArray(focus) ? focus.filter((id) => typeof id === 'string' && id) : [];
  const chips = [];
  for (const skillId of ids) {
    const name = summaryFocusSkillLabel(skillId);
    if (!name) continue;
    chips.push({ id: skillId, label: `${name} needs another go` });
  }
  if (!chips.length) {
    return (
      <div
        className="chip-row punctuation-summary-wobbly punctuation-summary-wobbly--empty"
        role="group"
        aria-label="Round outcome"
        style={{ marginTop: 14 }}
      >
        <span className="chip good" data-punctuation-summary-wobbly-empty>
          Everything was secure this round!
        </span>
      </div>
    );
  }
  return (
    <div
      className="chip-row punctuation-summary-wobbly"
      role="group"
      aria-label="Skills that need another go"
      style={{ marginTop: 14 }}
    >
      {chips.map((chip) => (
        <span className="chip warn" key={`wobbly-${chip.id}`} data-skill-id={chip.id}>
          {chip.label}
        </span>
      ))}
    </div>
  );
}

// --- Active monster progress strip -----------------------------------------

// Phase 5 U8: replaces the dots + "Stage X of 4" with star meters matching
// the Setup scene's `MonsterStarMeter` pattern. Each monster renders its
// creature name + "X / 100 Stars" + a stage label via `punctuationStageLabel`.
// Star counts are sourced from `ui.starView.perMonster[monsterId].total`
// when available (the read-model populates this on every Worker round-trip);
// falls back to 0 for fresh learners. Reserved monsters never render.
// The grand monster (quoral) reads from `ui.starView.grand.grandStars`.
function MonsterProgressStrip({ ui, rewardState: propRewardState }) {
  const rewardState = rewardStateForPunctuation(ui, propRewardState);
  const starView = ui && typeof ui === 'object' && !Array.isArray(ui) && ui.starView
    && typeof ui.starView === 'object' && !Array.isArray(ui.starView)
    ? ui.starView
    : null;
  const perMonster = starView && typeof starView.perMonster === 'object'
    && !Array.isArray(starView.perMonster)
    ? starView.perMonster
    : {};
  const grand = starView && typeof starView.grand === 'object'
    && !Array.isArray(starView.grand)
    ? starView.grand
    : null;
  return (
    <div
      className="punctuation-summary-monsters"
      role="group"
      aria-label="Punctuation monster progress"
      style={{ marginTop: 16 }}
    >
      {ACTIVE_PUNCTUATION_MONSTER_IDS.map((monsterId) => {
        const name = punctuationMonsterDisplayName(monsterId);
        const isGrand = monsterId === 'quoral';
        const starEntry = isGrand ? grand : perMonster[monsterId];
        const totalStars = starEntry
          ? Math.max(0, Math.floor(Number(isGrand ? starEntry.grandStars : starEntry.total) || 0))
          : 0;
        const starDerivedStage = starEntry
          ? Math.max(0, Math.floor(Number(starEntry.starDerivedStage) || 0))
          : 0;
        // U3 review follow-up (MEDIUM ADV-395-2/3): use shared monotonic
        // merge helper so sanitisation is consistent across all scenes.
        // Finding 3: rewardState is already resolved at the function top
        // via rewardStateForPunctuation — no redundant re-validation needed.
        const codexEntry = rewardState?.[monsterId];
        const { displayStars, displayStage, displayState } = mergeMonotonicDisplay(totalStars, starDerivedStage, codexEntry);
        const cap = 100;
        const starsLabel = isGrand ? 'Grand Stars' : 'Stars';
        const stageText = punctuationStageLabel(displayStage, displayStars);
        const pct = Math.min(100, Math.max(0, Math.round((displayStars / cap) * 100)));
        return (
          <div
            className="punctuation-summary-monster punctuation-monster-meter"
            data-monster-id={monsterId}
            data-display-state={displayState}
            key={`monster-${monsterId}`}
          >
            <div className="punctuation-monster-meter-name">{name}</div>
            <div className="punctuation-monster-meter-stage">{stageText}</div>
            <div className="punctuation-monster-meter-bar" aria-hidden="true">
              <div
                className="punctuation-monster-meter-fill"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div
              className="punctuation-monster-meter-count"
              aria-label={`${name} ${displayStars} of ${cap} ${starsLabel}`}
            >
              {`${displayStars} / ${cap} ${starsLabel}`}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// --- GPS review cards (Phase 2 contract preserved) -------------------------

// Renders the `summary.gps.reviewItems` cards when present. The recommended
// next action uses `summary.gps.recommendedLabel` (child copy) — NEVER the
// raw `recommendedMode` id. `misconceptionTags` pipe through
// `punctuationChildMisconceptionLabel`; tags with no mapped child label are
// silently dropped so the chip row stays empty rather than leaking dotted
// ids (plan R15).
function GpsReviewBlock({ gps }) {
  const reviewItems = Array.isArray(gps?.reviewItems) ? gps.reviewItems : [];
  if (!reviewItems.length) return null;
  const recommendedLabel = typeof gps?.recommendedLabel === 'string' && gps.recommendedLabel
    ? gps.recommendedLabel
    : 'Smart review';
  return (
    <div className="callout punctuation-gps-review" style={{ marginTop: 16 }}>
      <strong>GPS review</strong>
      <div className="small muted" style={{ marginTop: 6 }}>
        Next up: {recommendedLabel}
      </div>
      <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
        {reviewItems.map((entry) => {
          const tags = Array.isArray(entry.misconceptionTags) ? entry.misconceptionTags : [];
          // Map raw dotted tags to child labels and dedupe — a single GPS
          // item that trips two sub-tags within the same facet should read
          // as one chip, not two identical labels.
          const tagLabels = [];
          const seenLabels = new Set();
          for (const tag of tags) {
            const label = punctuationChildMisconceptionLabel(tag);
            if (!label || seenLabels.has(label)) continue;
            seenLabels.add(label);
            tagLabels.push({ id: tag, label });
          }
          return (
            <div
              key={`${entry.index}-${entry.itemId}`}
              className={`feedback ${entry.correct ? 'good' : 'warn'}`}
            >
              <strong>{entry.index}. {entry.correct ? 'Correct' : 'Review'}</strong>
              <div style={{ marginTop: 6 }}>
                {/*
                  U7 child-register override: every Worker-sourced GPS
                  review string passes through the display-time helper so
                  adult grammar phrases from the engine are rewritten
                  before reaching the learner.
                */}
                {punctuationChildRegisterOverrideString(entry.prompt)}
              </div>
              {entry.attemptedAnswer ? (
                <div className="small" style={{ marginTop: 6 }}>
                  Answer: {entry.attemptedAnswer}
                </div>
              ) : null}
              {entry.displayCorrection ? (
                <div
                  className="small"
                  style={{ marginTop: 6, ...newlineTextStyle(entry.displayCorrection) }}
                >
                  Model: {punctuationChildRegisterOverrideString(entry.displayCorrection)}
                </div>
              ) : null}
              {tagLabels.length ? (
                <div className="chip-row" style={{ marginTop: 8 }}>
                  {tagLabels.map((tag) => (
                    <span
                      className="chip warn"
                      key={`${entry.itemId}-${tag.id}`}
                    >
                      {tag.label}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Next-action buttons ---------------------------------------------------

function NextActionRow({ ui, actions }) {
  // Phase 4 U6: mutation controls keep `composeIsDisabled` — they pause while
  // a command is in flight or the runtime is degraded / unavailable / read-
  // only. Navigation ("Back to dashboard") threads the sibling
  // `composeIsNavigationDisabled` so a stalled `pendingCommand` or a
  // degraded runtime never traps the child on the Summary scene (plan R7 /
  // AE7). The ghost-button divergence is the canonical example the Map
  // top-bar and Skill Detail close mirror.
  //
  // SH2-U1 (from main): JSX-layer guard for all four non-destructive next-
  // action buttons. Sharing one lock means a double-tap across the row (an
  // unlikely but possible "thumb drift" pattern on narrow mobile viewports)
  // early-returns the second dispatch — which is the right UX outcome
  // since any of these actions unmounts the summary. The lock OR's into
  // the mutation `isDisabled` only — navigation deliberately stays
  // escape-hatch-live (a stuck lock must not trap the child on Summary).
  const submitLock = useSubmitLock();
  const isDisabled = composeIsDisabled(ui) || submitLock.locked;
  const isNavigationDisabled = composeIsNavigationDisabled(ui);
  return (
    <div className="actions punctuation-summary-actions" style={{ marginTop: 16 }}>
      <button
        className="btn primary"
        type="button"
        disabled={isDisabled}
        data-action="punctuation-start"
        data-value="weak"
        onClick={() => submitLock.run(async () => actions.dispatch('punctuation-start', { mode: 'weak' }))}
      >
        Practise wobbly spots
      </button>
      <button
        className="btn secondary"
        type="button"
        disabled={isDisabled}
        data-action="punctuation-open-map"
        onClick={() => submitLock.run(async () => actions.dispatch('punctuation-open-map'))}
      >
        Open Punctuation Map
      </button>
      <button
        className="btn secondary"
        type="button"
        disabled={isDisabled}
        data-action="punctuation-start-again"
        data-punctuation-start-again
        onClick={() => submitLock.run(async () => actions.dispatch('punctuation-start-again'))}
      >
        Start again
      </button>
      <button
        className="btn ghost"
        type="button"
        disabled={isNavigationDisabled}
        aria-disabled={isNavigationDisabled ? 'true' : 'false'}
        data-action="punctuation-back"
        onClick={() => submitLock.run(async () => actions.dispatch('punctuation-back'))}
      >
        Back to dashboard
      </button>
    </div>
  );
}

// --- Scene -----------------------------------------------------------------

// U4 follower (adversarial MEDIUM 1): the Grown-up view placeholder button
// was dispatching a `punctuation-open-adult-view` action with no handler —
// a child tap produced a silent no-op. The plan allowed a placeholder, but
// the reviewer-consensus rule is "don't ship dead UX". Parent Hub will add
// this surface when the adult view ships (PR body notes the deferral); the
// Summary scene renders no Grown-up affordance today.

export function PunctuationSummaryScene({
  ui = {},
  actions = { dispatch() {} },
  rewardState = null,
}) {
  const summary = ui && typeof ui === 'object' && !Array.isArray(ui) ? (ui.summary || {}) : {};
  const scene = bellstormSceneForPhase('summary');
  // Accuracy-bucketed celebration copy (design-lens HIGH 2). The helper
  // returns null when `summary.accuracy` is missing / malformed; the label
  // fallback keeps the hero filled even for degenerate payloads.
  const tonalHeadline = punctuationSummaryHeadline(summary);
  const headline = typeof tonalHeadline === 'string' && tonalHeadline
    ? tonalHeadline
    : (typeof summary.label === 'string' && summary.label
      ? summary.label
      : 'Punctuation session summary');
  const subtitle = typeof summary.message === 'string' && summary.message
    ? summary.message
    : 'Session complete.';

  // U5: extract the monsterProgress triple once — drives both the
  // teaser render AND the `monster-progress-changed` telemetry emit so
  // the two call sites can never drift (teaser visible but no event
  // fired, or event fired but no teaser rendered).
  const monsterProgress = extractPunctuationMonsterProgress(summary);

  // Phase 4 U5 — telemetry emission. Fire `summary-reached` + `feedback-
  // rendered` exactly once per mount; fire `monster-progress-changed` on
  // every genuine stage-delta transition.
  //
  // U5 review follow-on (FINDING E — medium correctness): three separate
  // refs per event kind, NOT a single `telemetryRef`. A shared ref-guard
  // drops a legitimate `monster-progress-changed` emit whenever
  // `monsterProgress` arrives on a later render after first mount (e.g. a
  // reward subscriber flush lands after the initial SSR pass). The signature-
  // based monster-progress gate additionally protects against a
  // stage 2→3→2→3 back-and-forth edge case: a genuine re-entry into a
  // higher stage DOES fire a fresh event even if the same-signature event
  // fired earlier, only because the signature comparison distinguishes the
  // two transitions. `summary-reached` and `feedback-rendered` retain
  // once-per-mount semantics (mounting is the event boundary for those).
  //
  // Pattern follows U4's Setup-mount precedent at
  // `PunctuationSetupScene.jsx:292-299` — emit is fire-and-forget through
  // `emitPunctuationEvent`; any downstream failure short-circuits inside
  // `createPunctuationOnCommandError` so the learner never sees an error
  // banner from a telemetry dispatch.
  const summaryReachedRef = useRef(false);
  const feedbackRenderedRef = useRef(false);
  const monsterProgressSignatureRef = useRef(null);
  const sessionId = typeof summary.sessionId === 'string' ? summary.sessionId : null;
  const total = Number.isFinite(Number(summary.total)) ? Number(summary.total) : 0;
  const correct = Number.isFinite(Number(summary.correct)) ? Number(summary.correct) : 0;
  const accuracy = Number.isFinite(Number(summary.accuracy)) ? Number(summary.accuracy) : 0;
  if (!summaryReachedRef.current) {
    summaryReachedRef.current = true;
    emitPunctuationEvent('summary-reached', {
      sessionId,
      total,
      correct,
      accuracy,
    }, { actions });
  }
  if (!feedbackRenderedRef.current) {
    feedbackRenderedRef.current = true;
    // `feedback-rendered` uses itemId as a round-scoped marker — the Summary
    // render is the terminal feedback surface for the whole round, so we
    // emit with sessionId + a synthetic `summary` itemId so the event is
    // distinguishable from per-item feedback renders a future Session-
    // scene call site will emit. `correct` mirrors the round-level signal
    // (non-zero correct → true) so a post-round dashboard can count rounds
    // that produced any correct answer.
    emitPunctuationEvent('feedback-rendered', {
      sessionId,
      itemId: 'summary',
      correct: correct > 0,
    }, { actions });
  }
  if (monsterProgress) {
    const signature = `${monsterProgress.monsterId}:${monsterProgress.stageFrom}->${monsterProgress.stageTo}`;
    if (monsterProgressSignatureRef.current !== signature) {
      monsterProgressSignatureRef.current = signature;
      emitPunctuationEvent('monster-progress-changed', {
        monsterId: monsterProgress.monsterId,
        stageFrom: monsterProgress.stageFrom,
        stageTo: monsterProgress.stageTo,
      }, { actions });
    }
  }

  return (
    <section
      className="card border-top punctuation-surface"
      data-punctuation-summary
      // U4 follower (design-lens MEDIUM 5): borderTopColor now matches the
      // canonical Punctuation accent `#B8873F` (Bellstorm gold) rather than
      // the stray `#2E8479` teal. Aligns with `PunctuationPracticeSurface`
      // and the module's `accent` field.
      style={{ borderTopColor: '#B8873F' }}
    >
      <div className="punctuation-strip">
        <img
          src={scene.src}
          srcSet={scene.srcSet}
          sizes="(max-width: 980px) 100vw, 960px"
          alt=""
          aria-hidden="true"
        />
        <div>
          <div className="eyebrow">Summary</div>
          <h2 className="section-title">{headline}</h2>
          <p className="subtitle">{subtitle}</p>
        </div>
      </div>
      <CorrectCountLine summary={summary} />
      <ScoreChipRow summary={summary} />
      <SkillsExercisedRow summary={summary} />
      {/*
        U5 review follow-on (FINDING B — design-lens HIGH): when the per-skill
        SkillsExercisedRow renders (i.e. `summary.skillsExercised` is non-
        empty), it already surfaces each wobbly skill with a "· needs
        practice" badge. The legacy WobblyChipRow below would then re-render
        the same skills with "needs another go" labels — duplicated chips in
        the same class ("warn") for a KS2 reader. Suppress WobblyChipRow in
        that case. SkillsExercisedRow is the new authoritative display (one
        chip per exercised skill, status encoded). WobblyChipRow stays as a
        fallback ONLY when `skillsExercised` is empty — covers pre-U9
        production rounds that haven't yet flowed through the producer
        (defensive) and the degraded-payload branch where `skillsExercised`
        is absent. The "Everything was secure this round!" empty-chip fallback
        in WobblyChipRow still fires via this branch when a round had no
        wobbly skills AND no `skillsExercised` (legacy rounds).
      */}
      {(Array.isArray(summary.skillsExercised) && summary.skillsExercised.length > 0)
        ? null
        : <WobblyChipRow focus={summary.focus} />}
      <MonsterProgressTeaser progress={monsterProgress} />
      <NextReviewHint ui={ui} />
      <MonsterProgressStrip ui={ui} rewardState={rewardState} />
      <GpsReviewBlock gps={summary.gps} />
      <NextActionRow ui={ui} actions={actions} />
    </section>
  );
}
