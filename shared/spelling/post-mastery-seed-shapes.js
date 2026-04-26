// P2 U3: Pure seed-shape builders for the QA seed harness.
//
// Each shape is a pure function `(wordBySlug, today) => data` that returns a
// `data`-level subject-state blob (progress + guardian + postMega + optional
// lastBossSession). Callers (CLI, Worker `seed-post-mega` command, Admin hub
// panel, tests) all consume the same shapes so the 8 canonical learner states
// stay byte-identical across every code path.
//
// **The shapes are deterministic**: no `Math.random`, no `Date.now`. Tests
// inject a fixed `today` (in day-epoch units) and a `wordBySlug` map from
// the runtime content snapshot so the resulting `data` is reproducible.
//
// The 8 shapes:
//   - fresh-graduate: all core Mega, guardian empty, no postMega sticky.
//   - guardian-first-patrol: all core Mega, guardian map seeded with 8
//     entries at reviewLevel 0, nextDueDay = today + 3.
//   - guardian-wobbling: as above but one entry is wobbling + due today.
//   - guardian-rested: all guardian entries reviewLevel 5, nextDueDay far.
//   - guardian-optional-patrol: some Mega core words still unguarded,
//     no entry is due today.
//   - boss-ready: fresh-graduate state + some guardian coverage.
//   - boss-mixed-summary: populates `data.lastBossSession` so the summary
//     scene can render without running a round.
//   - content-added-after-graduation: postMega stamped with stale release id
//     'spelling-p1.5-legacy'; published core count > unlockedPublishedCoreCount.
//
// H9 CSRF: the Worker handler that writes these shapes routes through the
// Admin Ops P1 mutation-receipt path with `scopeType='platform'`. See
// `worker/src/repository.js::seedPostMegaLearnerState` for the CSRF-safe
// wrapper. These pure shapes never touch the network.

// Synthetic placeholder release id for the `content-added-after-graduation`
// shape. Deliberately different from the real U2 `SPELLING_CONTENT_RELEASE_ID`
// so the shape models a learner who graduated under a prior release and is
// now looking at a newer content bundle. Kept as an explicit string (never
// undefined) so the test can assert the exact value.
export const POST_MEGA_LEGACY_PLACEHOLDER_RELEASE_ID = 'spelling-p1.5-legacy';

// Canonical shape names. The order here is the order the Admin hub dropdown
// renders them in.
export const POST_MEGA_SEED_SHAPES = Object.freeze([
  'fresh-graduate',
  'guardian-first-patrol',
  'guardian-wobbling',
  'guardian-rested',
  'guardian-optional-patrol',
  'boss-ready',
  'boss-mixed-summary',
  'content-added-after-graduation',
]);

const DAY_MS = 24 * 60 * 60 * 1000;

function coreSlugsFrom(wordBySlug) {
  if (!wordBySlug || typeof wordBySlug !== 'object') return [];
  return Object.keys(wordBySlug)
    .filter((slug) => {
      const word = wordBySlug[slug];
      if (!word || typeof word !== 'object') return false;
      return (word.spellingPool === 'extra' ? 'extra' : 'core') === 'core';
    })
    .sort();
}

function buildCoreMegaProgress(coreSlugs, today) {
  return Object.fromEntries(coreSlugs.map((slug, index) => [slug, {
    stage: 4,
    attempts: 6 + (index % 4),
    correct: 5 + (index % 4),
    wrong: 1,
    dueDay: today + 60,
    lastDay: today - 7,
    lastResult: 'correct',
  }]));
}

// Builds a `postMega` sticky record for the current content release. The
// release id is intentionally a parameter so `content-added-after-graduation`
// can stamp `spelling-p1.5-legacy` while the other shapes stamp the current
// baseline.
function buildPostMega({ today, publishedCoreCount, releaseId, unlockedBy = 'all-core-stage-4' }) {
  return {
    unlockedAt: today * DAY_MS,
    unlockedContentReleaseId: releaseId,
    unlockedPublishedCoreCount: publishedCoreCount,
    unlockedBy,
  };
}

function shapeFreshGraduate(wordBySlug, today) {
  const coreSlugs = coreSlugsFrom(wordBySlug);
  return {
    progress: buildCoreMegaProgress(coreSlugs, today),
    guardian: {},
    // No `postMega` — the fresh-graduate shape sits at the moment just before
    // the very first submit writes the sticky-bit. `getSpellingPostMasteryState`
    // still mints an in-memory sticky via the pre-v3 backfill path, so the
    // dashboard lights up. Choosing not to pre-write postMega lets the shape
    // exercise the "graduation moment" timing story.
  };
}

function shapeGuardianFirstPatrol(wordBySlug, today, { releaseId }) {
  const coreSlugs = coreSlugsFrom(wordBySlug);
  const progress = buildCoreMegaProgress(coreSlugs, today);
  // First-patrol shape: 8 entries at reviewLevel 0 with nextDueDay = today + 3.
  const firstEight = coreSlugs.slice(0, Math.min(8, coreSlugs.length));
  const guardian = Object.fromEntries(firstEight.map((slug) => [slug, {
    reviewLevel: 0,
    lastReviewedDay: today,
    nextDueDay: today + 3,
    correctStreak: 0,
    lapses: 0,
    renewals: 0,
    wobbling: false,
  }]));
  return {
    progress,
    guardian,
    postMega: buildPostMega({
      today,
      publishedCoreCount: coreSlugs.length,
      releaseId,
    }),
  };
}

function shapeGuardianWobbling(wordBySlug, today, { releaseId }) {
  const coreSlugs = coreSlugsFrom(wordBySlug);
  const progress = buildCoreMegaProgress(coreSlugs, today);
  // Eight guardian entries; the first is wobbling and due today.
  const firstEight = coreSlugs.slice(0, Math.min(8, coreSlugs.length));
  const guardian = Object.fromEntries(firstEight.map((slug, index) => [slug, {
    reviewLevel: index === 0 ? 0 : 2,
    lastReviewedDay: today - (index === 0 ? 1 : 2),
    nextDueDay: index === 0 ? today : today + 14,
    correctStreak: index === 0 ? 0 : 2,
    lapses: index === 0 ? 1 : 0,
    renewals: 0,
    wobbling: index === 0,
  }]));
  return {
    progress,
    guardian,
    postMega: buildPostMega({
      today,
      publishedCoreCount: coreSlugs.length,
      releaseId,
    }),
  };
}

function shapeGuardianRested(wordBySlug, today, { releaseId }) {
  const coreSlugs = coreSlugsFrom(wordBySlug);
  const progress = buildCoreMegaProgress(coreSlugs, today);
  // Fully rested: every tracked entry at the top review level with a far
  // future nextDueDay.
  const firstEight = coreSlugs.slice(0, Math.min(8, coreSlugs.length));
  const guardian = Object.fromEntries(firstEight.map((slug) => [slug, {
    reviewLevel: 5,
    lastReviewedDay: today - 7,
    nextDueDay: today + 90,
    correctStreak: 5,
    lapses: 0,
    renewals: 1,
    wobbling: false,
  }]));
  return {
    progress,
    guardian,
    postMega: buildPostMega({
      today,
      publishedCoreCount: coreSlugs.length,
      releaseId,
    }),
  };
}

function shapeGuardianOptionalPatrol(wordBySlug, today, { releaseId }) {
  const coreSlugs = coreSlugsFrom(wordBySlug);
  const progress = buildCoreMegaProgress(coreSlugs, today);
  // Cover only the first TWO core slugs; the rest are Mega but unguarded.
  // Neither guardian entry is due today, so the mission state is
  // `optional-patrol` (the unguardedMegaCount pushes availability > 0).
  const covered = coreSlugs.slice(0, Math.min(2, coreSlugs.length));
  const guardian = Object.fromEntries(covered.map((slug) => [slug, {
    reviewLevel: 3,
    lastReviewedDay: today - 1,
    nextDueDay: today + 30,
    correctStreak: 3,
    lapses: 0,
    renewals: 0,
    wobbling: false,
  }]));
  return {
    progress,
    guardian,
    postMega: buildPostMega({
      today,
      publishedCoreCount: coreSlugs.length,
      releaseId,
    }),
  };
}

function shapeBossReady(wordBySlug, today, { releaseId }) {
  const coreSlugs = coreSlugsFrom(wordBySlug);
  const progress = buildCoreMegaProgress(coreSlugs, today);
  // Boss-ready: all core Mega, guardian has light coverage. No lastBossSession.
  const firstFour = coreSlugs.slice(0, Math.min(4, coreSlugs.length));
  const guardian = Object.fromEntries(firstFour.map((slug) => [slug, {
    reviewLevel: 1,
    lastReviewedDay: today - 2,
    nextDueDay: today + 7,
    correctStreak: 1,
    lapses: 0,
    renewals: 0,
    wobbling: false,
  }]));
  return {
    progress,
    guardian,
    postMega: buildPostMega({
      today,
      publishedCoreCount: coreSlugs.length,
      releaseId,
    }),
  };
}

function shapeBossMixedSummary(wordBySlug, today, { releaseId }) {
  const coreSlugs = coreSlugsFrom(wordBySlug);
  const progress = buildCoreMegaProgress(coreSlugs, today);
  // Pre-populate `lastBossSession` so the summary scene can render without
  // running a round. Attempts / correct / wrong reflect a mixed result;
  // slugs is a short deterministic slice of the first four core slugs.
  const slugs = coreSlugs.slice(0, Math.min(4, coreSlugs.length));
  return {
    progress,
    guardian: {},
    postMega: buildPostMega({
      today,
      publishedCoreCount: coreSlugs.length,
      releaseId,
    }),
    lastBossSession: {
      attempts: slugs.length,
      correct: Math.max(0, slugs.length - 1),
      wrong: slugs.length > 0 ? 1 : 0,
      slugs,
      completedAt: today * DAY_MS,
    },
  };
}

function shapeContentAddedAfterGraduation(wordBySlug, today) {
  const coreSlugs = coreSlugsFrom(wordBySlug);
  const progress = buildCoreMegaProgress(coreSlugs, today);
  // Stale release id: the learner graduated under the synthetic pre-P2
  // placeholder, but the runtime content bundle now publishes MORE core
  // words than were locked in. This drives `newCoreWordsSinceGraduation > 0`.
  //
  // We simulate "content added after graduation" by stamping the sticky
  // record with `unlockedPublishedCoreCount` strictly less than the current
  // published core count. When the read-model's selector runs, it computes
  // `newCoreWordsSinceGraduation = max(0, publishedCoreCount - unlockedPublishedCoreCount)`
  // so a stamp of `coreSlugs.length - 1` produces exactly 1 new word.
  const pretendPreviousCoreCount = Math.max(0, coreSlugs.length - 1);
  return {
    progress,
    guardian: {},
    postMega: {
      unlockedAt: (today - 7) * DAY_MS,
      unlockedContentReleaseId: POST_MEGA_LEGACY_PLACEHOLDER_RELEASE_ID,
      unlockedPublishedCoreCount: pretendPreviousCoreCount,
      unlockedBy: 'all-core-stage-4',
    },
  };
}

/**
 * Resolve a named shape to its `data`-level blob.
 *
 * @param {string} shapeName
 *   One of {@link POST_MEGA_SEED_SHAPES}.
 * @param {object} wordBySlug
 *   Runtime `wordBySlug` map. The shape extracts core-pool slugs from this.
 * @param {number} today
 *   Day-epoch integer (`Math.floor(Date.UTC(...) / DAY_MS)`).
 * @param {object} [options]
 * @param {string} [options.currentReleaseId]
 *   Release id stamped into `postMega.unlockedContentReleaseId` for the
 *   shapes that pre-populate it. Defaults to the U2 baseline. The
 *   `content-added-after-graduation` shape IGNORES this and always stamps
 *   `spelling-p1.5-legacy`.
 * @returns {object} `data` blob ready to pass to
 *   `repositories.subjectStates.writeData(learnerId, 'spelling', data)`.
 */
export function resolvePostMegaSeedShape(shapeName, wordBySlug, today, options = {}) {
  if (!POST_MEGA_SEED_SHAPES.includes(shapeName)) {
    const error = new Error(`Unknown post-mega seed shape: ${shapeName}`);
    error.code = 'unknown_shape';
    error.allowed = [...POST_MEGA_SEED_SHAPES];
    throw error;
  }
  const releaseId = typeof options.currentReleaseId === 'string' && options.currentReleaseId
    ? options.currentReleaseId
    : 'spelling-p2-baseline-2026-04-26';
  switch (shapeName) {
    case 'fresh-graduate':
      return shapeFreshGraduate(wordBySlug, today);
    case 'guardian-first-patrol':
      return shapeGuardianFirstPatrol(wordBySlug, today, { releaseId });
    case 'guardian-wobbling':
      return shapeGuardianWobbling(wordBySlug, today, { releaseId });
    case 'guardian-rested':
      return shapeGuardianRested(wordBySlug, today, { releaseId });
    case 'guardian-optional-patrol':
      return shapeGuardianOptionalPatrol(wordBySlug, today, { releaseId });
    case 'boss-ready':
      return shapeBossReady(wordBySlug, today, { releaseId });
    case 'boss-mixed-summary':
      return shapeBossMixedSummary(wordBySlug, today, { releaseId });
    case 'content-added-after-graduation':
      return shapeContentAddedAfterGraduation(wordBySlug, today);
    default: {
      // Unreachable — POST_MEGA_SEED_SHAPES is the source of truth, and the
      // guard above rejects anything outside it. Kept defensively so a
      // future refactor cannot silently fall through.
      const error = new Error(`Unhandled seed shape: ${shapeName}`);
      error.code = 'unknown_shape';
      error.allowed = [...POST_MEGA_SEED_SHAPES];
      throw error;
    }
  }
}
