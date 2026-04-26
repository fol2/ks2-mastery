// Shared post-mastery seed helpers for tests.
//
// Extracted from `tests/spelling-mega-invariant.test.js`,
// `tests/spelling-guardian.test.js`, and `tests/spelling-boss.test.js` as part
// of P2 U3 (plan
// docs/plans/2026-04-26-006-feat-post-mega-spelling-p2-visibility-pattern-foundation-plan.md)
// so the three duplicated copies of `seedFullCoreMega` / `seedAllCoreMega`
// collapse into a single canonical implementation.
//
// Two kinds of helper live here:
//   1. `seedFullCoreMega` — the "all core words at stage 4" baseline used by
//      the mega-invariant composite suite and the service-level unit tests.
//      Optional `guardian` + `postMega` overrides so callers can tailor the
//      starting shape.
//   2. `applyPostMegaSeedShape` — writes one of the 8 canonical named shapes
//      (`fresh-graduate`, `guardian-first-patrol`, etc.) for the QA seed
//      harness tests. Delegates to the pure shape builders in
//      `shared/spelling/post-mastery-seed-shapes.js`.
//
// Both helpers write through the repository (`repositories.subjectStates.writeData`)
// so the persisted bundle mirrors how the production service writes subject
// state. Neither fabricates a storage key or bypasses the write-through
// proxy — the point of the extraction is to keep the seed contract
// identical across every test.

import { WORDS } from '../../src/subjects/spelling/data/word-data.js';
import {
  POST_MEGA_SEED_SHAPES,
  resolvePostMegaSeedShape,
} from '../../shared/spelling/post-mastery-seed-shapes.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// Canonical list of core slugs (filtered to pool !== 'extra'). Exported so
// test files can reference the same list when asserting counts.
export const CORE_SLUGS = Object.freeze(
  WORDS.filter((word) => word.spellingPool !== 'extra').map((word) => word.slug),
);

// Canonical `SEED_POST_MEGA` sticky-graduation record used by the
// mega-invariant composite suite. Frozen so the seed cannot be mutated
// through aliasing. The U2 sticky contract expects `unlockedAt` in ms.
// `TODAY_MS` is exposed separately so callers can derive their own day
// epoch.
export const TODAY_MS = Date.UTC(2026, 0, 10);
export const TODAY_DAY = Math.floor(TODAY_MS / DAY_MS);
export const SEED_POST_MEGA = Object.freeze({
  unlockedAt: TODAY_MS - 3 * DAY_MS,
  unlockedContentReleaseId: 'spelling-p2-baseline-2026-04-26',
  unlockedPublishedCoreCount: CORE_SLUGS.length,
  unlockedBy: 'all-core-stage-4',
});

/**
 * Seed every core slug to stage 4 (Mega) with uniform expectations so a
 * composite invariant assertion can use a single "expected unchanged"
 * value per slug.
 *
 * Callers may supply:
 *   - `today` (day-epoch int). Defaults to `TODAY_DAY` so the mega-invariant
 *     suite's `SEED_DUE_DAY = today + 60` math continues to line up.
 *   - `guardian` (map). Defaults to `{}` (empty; first-patrol state).
 *   - `postMega` (object|null). Defaults to a frozen spread of
 *     `SEED_POST_MEGA`; pass `null` to seed a pre-sticky learner (the
 *     `fresh-graduate` shape).
 *   - `progressOverrides` (function). Optional per-slug transformer applied
 *     after the uniform seed; used by the guardian / boss regression tests
 *     that want `attempts = 6 + (index % 4)` variation.
 *
 * Returns the persisted `progress` map so callers can deep-compare it in
 * assertions (the mega-invariant composite suite relies on this).
 */
export function seedFullCoreMega(repositories, learnerId, options = {}) {
  const today = Number.isFinite(Number(options.today)) ? Number(options.today) : TODAY_DAY;
  const guardian = options.guardian && typeof options.guardian === 'object' ? options.guardian : {};
  const hasPostMegaOverride = Object.prototype.hasOwnProperty.call(options, 'postMega');
  const postMega = hasPostMegaOverride ? options.postMega : { ...SEED_POST_MEGA };
  const includeVariation = options.variation !== false;

  const progress = Object.fromEntries(CORE_SLUGS.map((slug, index) => [slug, {
    stage: 4,
    attempts: includeVariation ? 6 + (index % 4) : 6,
    correct: includeVariation ? 5 + (index % 4) : 5,
    wrong: 1,
    dueDay: today + 60,
    lastDay: today - 7,
    lastResult: 'correct',
  }]));

  if (typeof options.progressOverrides === 'function') {
    for (const [slug, record] of Object.entries(progress)) {
      const next = options.progressOverrides(slug, record);
      if (next && typeof next === 'object') progress[slug] = next;
    }
  }

  const data = { progress, guardian };
  if (postMega !== null && postMega !== undefined) data.postMega = postMega;
  repositories.subjectStates.writeData(learnerId, 'spelling', data);
  return progress;
}

/**
 * Apply one of the 8 canonical named post-mega seed shapes via
 * `repositories.subjectStates.writeData`.
 *
 * The `wordBySlug` argument is required so the shape builder can compute the
 * core-pool slug list from the same runtime snapshot the production code
 * sees. For tests that do not have a runtime snapshot handy, prefer
 * `seedFullCoreMega` (which uses the bundled `WORDS` list).
 *
 * Returns the `data` blob that was written so callers can assert against it.
 */
export function applyPostMegaSeedShape({
  repositories,
  learnerId,
  shapeName,
  wordBySlug,
  today = TODAY_DAY,
  currentReleaseId,
}) {
  const data = resolvePostMegaSeedShape(shapeName, wordBySlug, today, {
    currentReleaseId,
  });
  repositories.subjectStates.writeData(learnerId, 'spelling', data);
  return data;
}

// Re-export the canonical shape name list so tests can introspect it.
export { POST_MEGA_SEED_SHAPES };
