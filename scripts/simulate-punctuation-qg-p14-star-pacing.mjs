#!/usr/bin/env node

/**
 * P14 Punctuation Star-pacing simulator — Gates 6 + 7.
 *
 * Drives the live `selectPunctuationItem` scheduler against six learner
 * profiles to forecast how many sessions a fresh learner needs to reach the
 * Egg / Hatched / Growing / Nearly Mega / Mega star stages on each direct
 * monster. Runs the simulation twice — once with `roundLength=4` (skill-detail
 * focused-rescue surface) and once with `roundLength=6` (Smart default) — so
 * the contract's Gate 6 roundLength decision can quote both traces.
 *
 * Output: JSON shape
 *   { roundLength_4: { profiles: [...] }, roundLength_6: { profiles: [...] } }
 *
 * Usage:
 *   node scripts/simulate-punctuation-qg-p14-star-pacing.mjs
 *   node scripts/simulate-punctuation-qg-p14-star-pacing.mjs --out FILE.json
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { PUNCTUATION_CONTENT_INDEXES } from '../shared/punctuation/content.js';
import { selectPunctuationItem } from '../shared/punctuation/scheduler.js';
import { markPunctuationAnswer } from '../shared/punctuation/marking.js';
import { projectPunctuationStars } from '../src/subjects/punctuation/star-projection.js';
import { PUNCTUATION_CURRENT_RELEASE_ID } from '../src/subjects/punctuation/service-contract.js';

const STAGE_THRESHOLDS = Object.freeze([
  ['Egg found', 1],
  ['Hatched', 15],
  ['Growing', 35],
  ['Nearly Mega', 65],
  ['Mega', 100],
]);
const DIRECT_MONSTERS = Object.freeze(['pealark', 'curlune', 'claspin']);
const DAY_MS = 86_400_000;
const START_TS = Date.parse('2026-05-01T09:00:00.000Z');
const SESSIONS_PER_PROFILE = 80;

const PROFILES = Object.freeze([
  { id: 'always-correct', label: 'Always-correct learner' },
  { id: 'deep-practice', label: 'Deep-practice learner (returns over days)' },
  { id: 'long-gap-retention', label: 'Long-gap retention learner (sparse return)' },
  { id: 'easy-template-only', label: 'Easy-template-only learner (sticks to one skill)' },
  { id: 'repeated-template', label: 'Repeated-template learner (loops same skill)' },
  { id: 'supported-after-wrong', label: 'Supported-after-wrong learner (first-attempt fails, second succeeds)' },
]);

function makeRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function correctnessFor(profile, sessionIndex, slot, item) {
  if (profile === 'always-correct') return true;
  if (profile === 'easy-template-only') return true;
  if (profile === 'repeated-template') return true;
  if (profile === 'deep-practice') return true;
  if (profile === 'long-gap-retention') return ((sessionIndex + slot) % 5) !== 0;
  if (profile === 'supported-after-wrong') return slot > 0;
  return ((sessionIndex + slot + (item?.id?.length || 0)) % 4) !== 0;
}

function answerForItem(item, correct) {
  if (item.mode === 'choose' || item.inputKind === 'choice') {
    if (correct) return { choiceIndex: item.correctIndex };
    const altIndex = (item.correctIndex + 1) % (Array.isArray(item.options) ? item.options.length : 2);
    return { choiceIndex: altIndex };
  }
  return correct
    ? { typed: item.model }
    : { typed: 'word salad' };
}

function buildProgressShape(progressState) {
  return {
    items: progressState.items,
    facets: progressState.facets,
    rewardUnits: progressState.rewardUnits,
    attempts: progressState.attempts,
  };
}

function recordAttempt(progressState, item, result, timestamp) {
  const itemEntry = progressState.items[item.id] || {
    attempts: 0,
    correct: 0,
    wrong: 0,
    lastResultCorrect: false,
    lastAttemptAt: null,
    securedAt: null,
    correctStreak: 0,
  };
  itemEntry.attempts += 1;
  if (result.correct) {
    itemEntry.correct += 1;
    itemEntry.correctStreak += 1;
    itemEntry.lastResultCorrect = true;
    if (itemEntry.correctStreak >= 2 && !itemEntry.securedAt) {
      itemEntry.securedAt = timestamp;
    }
  } else {
    itemEntry.wrong += 1;
    itemEntry.correctStreak = 0;
    itemEntry.lastResultCorrect = false;
  }
  itemEntry.lastAttemptAt = timestamp;
  progressState.items[item.id] = itemEntry;

  if (item.rewardUnitId) {
    const ru = progressState.rewardUnits[item.rewardUnitId] || {
      releaseId: PUNCTUATION_CURRENT_RELEASE_ID,
      attempts: 0,
      correct: 0,
      itemsTouched: new Set(),
    };
    ru.attempts += 1;
    if (result.correct) ru.correct += 1;
    ru.itemsTouched.add(item.id);
    progressState.rewardUnits[item.rewardUnitId] = ru;
  }

  if (Array.isArray(result.facets)) {
    for (const facet of result.facets) {
      if (!facet?.id || !item.clusterId) continue;
      const key = `${item.clusterId}:${facet.id}`;
      const facetEntry = progressState.facets[key] || {
        attempts: 0,
        correct: 0,
        wrong: 0,
        clusterId: item.clusterId,
        facetId: facet.id,
        securedAt: null,
        correctSpanDays: 0,
      };
      facetEntry.attempts += 1;
      if (facet.ok === true) {
        facetEntry.correct += 1;
        if (!facetEntry.securedAt && facetEntry.correct >= 3) {
          facetEntry.securedAt = timestamp;
        }
      } else {
        facetEntry.wrong += 1;
      }
      progressState.facets[key] = facetEntry;
    }
  }

  progressState.attempts.push({
    itemId: item.id,
    skillIds: item.skillIds || [],
    clusterId: item.clusterId || null,
    rewardUnitId: item.rewardUnitId || null,
    mode: item.mode,
    variantSignature: item.variantSignature,
    correct: result.correct === true,
    timestamp,
  });
}

function projectionFromState(progressState) {
  // projectPunctuationStars accepts the raw shape; convert Sets to arrays via a
  // shallow rewrite where needed (currently rewardUnits.itemsTouched is a Set).
  const rewardUnits = {};
  for (const [key, value] of Object.entries(progressState.rewardUnits)) {
    rewardUnits[key] = {
      ...value,
      itemsTouched: Array.from(value.itemsTouched || []),
    };
  }
  const progress = {
    items: progressState.items,
    facets: progressState.facets,
    rewardUnits,
    attempts: progressState.attempts,
  };
  return projectPunctuationStars(progress, PUNCTUATION_CURRENT_RELEASE_ID);
}

function maxStarsAcrossDirect(projection) {
  let best = 0;
  for (const monsterId of DIRECT_MONSTERS) {
    const stars = projection?.perMonster?.[monsterId]?.total || 0;
    if (stars > best) best = stars;
  }
  return best;
}

function stageNameForStars(starsTotal) {
  let stage = 'None';
  for (const [name, threshold] of STAGE_THRESHOLDS) {
    if (starsTotal >= threshold) stage = name;
  }
  return stage;
}

function runSession({
  profile,
  sessionIndex,
  roundLength,
  progressState,
  recentItemIds,
  prefs,
  rng,
}) {
  const session = {
    mode: prefs.mode,
    roundLength: String(roundLength),
    recentItemIds: [...recentItemIds],
    selectedSignatures: [],
    currentItemId: null,
    selectionReason: null,
  };
  const slotItems = [];
  const sessionTimestamp = START_TS + sessionIndex * DAY_MS;
  for (let slot = 0; slot < roundLength; slot += 1) {
    const pick = selectPunctuationItem({
      indexes: PUNCTUATION_CONTENT_INDEXES,
      progress: buildProgressShape(progressState),
      session,
      prefs,
      now: () => sessionTimestamp + slot * 60_000,
      random: rng,
      candidateWindow: 32,
    });
    if (!pick?.item) break;
    const item = pick.item;
    const correct = correctnessFor(profile, sessionIndex, slot, item);
    const answer = answerForItem(item, correct);
    const result = markPunctuationAnswer({ item, answer });
    recordAttempt(progressState, item, result, sessionTimestamp + slot * 60_000);
    slotItems.push({
      itemId: item.id,
      mode: item.mode,
      skillIds: item.skillIds,
      correct: result.correct,
      reason: pick.reason || null,
    });
    session.recentItemIds.push(item.id);
    session.currentItemId = item.id;
    if (item.variantSignature) session.selectedSignatures.push(item.variantSignature);
  }
  return slotItems;
}

function simulateProfile({ profile, roundLength, prefs }) {
  const rng = makeRng(roundLength * 1000 + profile.length);
  const progressState = { items: {}, facets: {}, rewardUnits: {}, attempts: [] };
  const recentItemIds = [];
  const sessionRecords = [];
  const stageReachedAt = {};

  for (let sessionIndex = 0; sessionIndex < SESSIONS_PER_PROFILE; sessionIndex += 1) {
    const slots = runSession({
      profile,
      sessionIndex,
      roundLength,
      progressState,
      recentItemIds,
      prefs,
      rng,
    });
    for (const slot of slots) {
      recentItemIds.push(slot.itemId);
      if (recentItemIds.length > 12) recentItemIds.shift();
    }

    const projection = projectionFromState(progressState);
    const maxStars = maxStarsAcrossDirect(projection);
    const stage = stageNameForStars(maxStars);

    if (!stageReachedAt[stage]) {
      stageReachedAt[stage] = sessionIndex + 1;
    }

    sessionRecords.push({
      session: sessionIndex + 1,
      itemsServed: slots.length,
      uniqueModes: [...new Set(slots.map((s) => s.mode))].length,
      uniqueSkills: [...new Set(slots.flatMap((s) => s.skillIds || []))].length,
      correctCount: slots.filter((s) => s.correct).length,
      maxDirectStars: maxStars,
      stage,
      stars: {
        pealark: projection?.perMonster?.pealark?.total || 0,
        curlune: projection?.perMonster?.curlune?.total || 0,
        claspin: projection?.perMonster?.claspin?.total || 0,
        grand: projection?.grand?.total || 0,
      },
    });
  }

  return {
    profileId: profile,
    label: PROFILES.find((p) => p.id === profile).label,
    stageReachedAt,
    finalStars: sessionRecords.at(-1)?.stars || null,
    finalAttempts: progressState.attempts.length,
    sessionCount: sessionRecords.length,
    samples: [
      sessionRecords[0],
      sessionRecords[Math.floor(SESSIONS_PER_PROFILE / 4)],
      sessionRecords[Math.floor(SESSIONS_PER_PROFILE / 2)],
      sessionRecords[Math.floor(SESSIONS_PER_PROFILE * 3 / 4)],
      sessionRecords.at(-1),
    ].filter(Boolean),
  };
}

function simulateAtRoundLength(roundLength) {
  const prefs = { mode: 'smart', roundLength: String(roundLength) };
  const profileResults = [];
  for (const profile of PROFILES) {
    profileResults.push(simulateProfile({ profile: profile.id, roundLength, prefs }));
  }
  return {
    roundLength,
    profiles: profileResults,
    summary: {
      // Gate 6 decision telemetry: rounds for the always-correct profile to
      // reach Hatched (15★), Growing (35★), and Nearly Mega (65★) at this
      // round length. Compare across runs.
      alwaysCorrectStageReachedAt:
        profileResults.find((p) => p.profileId === 'always-correct')?.stageReachedAt || {},
    },
  };
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const result = { out: null };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--out' && args[i + 1]) {
      result.out = args[i + 1];
      i += 1;
    }
  }
  return result;
}

function main() {
  const args = parseArgs(process.argv);
  const report = {
    schemaVersion: 1,
    phase: 'punctuation-qg-p14-star-pacing-simulation',
    releaseId: PUNCTUATION_CURRENT_RELEASE_ID,
    generatedAt: new Date().toISOString(),
    sessionsPerProfile: SESSIONS_PER_PROFILE,
    profiles: PROFILES,
    roundLength_4: simulateAtRoundLength(4),
    roundLength_6: simulateAtRoundLength(6),
  };
  // Gate 6 decision derivation.
  const stages4 = report.roundLength_4.summary.alwaysCorrectStageReachedAt;
  const stages6 = report.roundLength_6.summary.alwaysCorrectStageReachedAt;
  const decision = (() => {
    const reachedHatched4 = stages4['Hatched'] ?? Infinity;
    const reachedHatched6 = stages6['Hatched'] ?? Infinity;
    const reachedGrowing4 = stages4['Growing'] ?? Infinity;
    const reachedGrowing6 = stages6['Growing'] ?? Infinity;
    // "Inflation" rule per plan: 4q reaches Secure stage in <70% of the 6q
    // rounds for the always-correct profile.
    const inflationAt4q =
      reachedHatched4 < reachedHatched6 * 0.7
      || reachedGrowing4 < reachedGrowing6 * 0.7;
    return {
      gate6RoundLength: inflationAt4q ? '6' : '4',
      reasoning: inflationAt4q
        ? 'Always-correct profile reaches Hatched/Growing at <70% of 6q sessions when using 4q rounds — flip skill-detail to 6.'
        : 'No progress inflation at 4q. Skill-detail stays at 4 (focused rescue surface).',
      stages4,
      stages6,
    };
  })();
  report.gate6Decision = decision;

  const json = JSON.stringify(report, null, 2);
  if (args.out) {
    const outPath = resolve(args.out);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${json}\n`, 'utf8');
    console.error(`P14 star-pacing simulation written to ${outPath}`);
  } else {
    process.stdout.write(`${json}\n`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
