import { ARITHMETIC_SKILLS } from '../../../shared/arithmetic/metadata.js';
import {
  deriveGrammarConfidence,
  grammarConceptStatus,
} from '../../../shared/grammar/confidence.js';
import { GRAMMAR_AGGREGATE_CONCEPTS } from '../../../shared/grammar/grammar-concept-roster.js';
import { READING_SKILLS } from '../../../shared/reading/metadata.js';
import { REASONING_SKILLS } from '../../../shared/reasoning/metadata.js';
import { PUNCTUATION_CLIENT_SKILLS } from '../../../src/subjects/punctuation/punctuation-manifest.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const PUNCTUATION_FACET_LIMIT = 128;
const PUNCTUATION_RECENT_ATTEMPT_LIMIT = 1_000;
const READING_EVENT_LIMIT = 1_200;
const ARITHMETIC_RECENT_ATTEMPT_LIMIT = 500;
const RETRY_QUEUE_LIMIT = 128;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function objectValue(value) {
  return isPlainObject(value) ? value : {};
}

function arrayTail(value, limit) {
  return Array.isArray(value) ? value.slice(-limit) : [];
}

function nonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function requestTime(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : Date.now();
}

function baseHeroUi(rawUi) {
  const ui = objectValue(rawUi);
  return {
    phase: typeof ui.phase === 'string' ? ui.phase : 'setup',
    session: ui.phase === 'summary' ? null : (isPlainObject(ui.session) ? ui.session : null),
  };
}

function genericMasteryStatus(node, now, { reasoning = false } = {}) {
  const value = objectValue(node);
  const attempts = nonNegative(value.attempts);
  if (!attempts) return 'new';
  const correct = nonNegative(value.correct);
  const wrong = nonNegative(value.wrong);
  const strength = Number.isFinite(Number(value.strength)) ? Number(value.strength) : 0.25;
  if (wrong > correct + 1 || ((!reasoning || attempts >= 2) && strength < 0.42)) return 'weak';
  if (nonNegative(value.dueAt) <= now) return 'due';
  if (strength >= 0.82 && nonNegative(value.intervalDays) >= 7 && nonNegative(value.correctStreak) >= 3) {
    return 'secured';
  }
  return 'learning';
}

function masteryRows(metadata, nodes, now, options = {}) {
  const values = objectValue(nodes);
  return Object.entries(metadata).map(([id, descriptor]) => {
    const node = objectValue(values[id]);
    return {
      id,
      skillId: id,
      name: descriptor?.name || id,
      domain: descriptor?.domain || descriptor?.strand || '',
      attempts: nonNegative(node.attempts),
      correct: nonNegative(node.correct),
      wrong: nonNegative(node.wrong),
      strength: nonNegative(node.strength),
      dueAt: nonNegative(node.dueAt),
      status: genericMasteryStatus(node, now, options),
    };
  });
}

function retryDueCount(retryQueue, now) {
  return arrayTail(retryQueue, RETRY_QUEUE_LIMIT)
    .filter((entry) => nonNegative(entry?.dueAt) <= now)
    .length;
}

function overviewForRows(rows, {
  totalQuestions = 0,
  correct = 0,
  retryQueue = [],
  now,
  securedRewardUnits = 0,
} = {}) {
  const total = nonNegative(totalQuestions);
  return {
    totalQuestions: total,
    accuracy: total ? Math.round((nonNegative(correct) / total) * 100) : 0,
    due: rows.filter((row) => row.status === 'due').length + retryDueCount(retryQueue, now),
    weak: rows.filter((row) => row.status === 'weak').length,
    securedSkills: rows.filter((row) => row.status === 'secured').length,
    securedRewardUnits: nonNegative(securedRewardUnits),
  };
}

function projectGrammar(data, rawUi, now) {
  const mastery = objectValue(data.mastery);
  const conceptNodes = objectValue(mastery.concepts);
  const concepts = GRAMMAR_AGGREGATE_CONCEPTS.map((id) => {
    const node = objectValue(conceptNodes[id]);
    const status = grammarConceptStatus(node, now);
    const attempts = nonNegative(node.attempts);
    const strength = Number.isFinite(Number(node.strength)) ? Number(node.strength) : 0.25;
    const correctStreak = nonNegative(node.correctStreak);
    const intervalDays = nonNegative(node.intervalDays);
    return {
      id,
      status,
      attempts,
      strength,
      dueAt: nonNegative(node.dueAt),
      correctStreak,
      intervalDays,
      confidence: {
        label: deriveGrammarConfidence({
          status,
          attempts,
          strength,
          correctStreak,
          intervalDays,
          recentMisses: 0,
        }),
      },
    };
  });
  const counts = { total: concepts.length, new: 0, learning: 0, weak: 0, due: 0, secured: 0 };
  for (const concept of concepts) counts[concept.status] += 1;
  return {
    ...baseHeroUi(rawUi),
    stats: { concepts: counts },
    analytics: { concepts },
  };
}

function punctuationSnapshot(value, now) {
  const state = objectValue(value);
  const attempts = nonNegative(state.attempts);
  const correct = nonNegative(state.correct);
  const streak = nonNegative(state.streak);
  const lapses = nonNegative(state.lapses);
  const accuracy = attempts ? correct / attempts : 0;
  const firstCorrectAt = nonNegative(state.firstCorrectAt);
  const lastCorrectAt = nonNegative(state.lastCorrectAt);
  const correctSpanDays = firstCorrectAt > 0 && lastCorrectAt >= firstCorrectAt
    ? Math.floor((lastCorrectAt - firstCorrectAt) / DAY_MS)
    : 0;
  let bucket = 'new';
  if (attempts > 0 && (accuracy < 0.65 || lapses >= 2 && streak === 0)) bucket = 'weak';
  else if (attempts > 0 && streak >= 3 && accuracy >= 0.8 && correctSpanDays >= 7) bucket = 'secure';
  else if (attempts > 0 && nonNegative(state.dueAt) > 0 && nonNegative(state.dueAt) <= now) bucket = 'due';
  else if (attempts > 0) bucket = 'learning';
  return { attempts, correct, bucket };
}

function projectPunctuation(data, rawUi, now) {
  const progress = objectValue(data.progress);
  const skillRows = PUNCTUATION_CLIENT_SKILLS.map((skill) => ({
    skillId: skill.id,
    name: skill.name,
    clusterId: skill.clusterId,
    attempts: 0,
    correct: 0,
    secure: 0,
    due: 0,
    weak: 0,
  }));
  const skillRowsById = new Map(skillRows.map((row) => [row.skillId, row]));
  const snapshots = [];
  for (const [key, value] of Object.entries(objectValue(progress.facets)).slice(0, PUNCTUATION_FACET_LIMIT)) {
    const [skillId] = key.split('::');
    const row = skillRowsById.get(skillId);
    if (!row) continue;
    const snapshot = punctuationSnapshot(value, now);
    snapshots.push(snapshot);
    row.attempts += snapshot.attempts;
    row.correct += snapshot.correct;
    if (Object.prototype.hasOwnProperty.call(row, snapshot.bucket)) row[snapshot.bucket] += 1;
  }
  for (const row of skillRows) {
    row.accuracy = row.attempts ? Math.round((row.correct / row.attempts) * 100) : 0;
  }
  const recentAttempts = arrayTail(progress.attempts, PUNCTUATION_RECENT_ATTEMPT_LIMIT);
  const correct = recentAttempts.filter((attempt) => attempt?.correct === true).length;
  return {
    ...baseHeroUi(rawUi),
    availability: { status: 'ready' },
    stats: {
      total: PUNCTUATION_CLIENT_SKILLS.length,
      secure: snapshots.filter((entry) => entry.bucket === 'secure').length,
      due: snapshots.filter((entry) => entry.bucket === 'due').length,
      fresh: snapshots.filter((entry) => entry.bucket === 'new').length,
      weak: snapshots.filter((entry) => entry.bucket === 'weak').length,
      attempts: recentAttempts.length,
      correct,
      accuracy: recentAttempts.length ? Math.round((correct / recentAttempts.length) * 100) : 0,
      sessionsCompleted: nonNegative(progress.sessionsCompleted),
    },
    analytics: { skillRows },
  };
}

function projectReading(data, rawUi, now) {
  const rows = masteryRows(READING_SKILLS, data.skills, now);
  const events = arrayTail(data.events, READING_EVENT_LIMIT);
  const overview = overviewForRows(rows, {
    totalQuestions: events.length,
    correct: events.filter((event) => event?.correct === true).length,
    retryQueue: data.retryQueue,
    now,
  });
  return {
    ...baseHeroUi(rawUi),
    stats: { overview, skills: rows },
    analytics: { skills: rows },
    content: {},
  };
}

function projectArithmetic(data, rawUi, now) {
  const rows = masteryRows(ARITHMETIC_SKILLS, data.skills, now);
  const attempts = arrayTail(data.recentAttempts, ARITHMETIC_RECENT_ATTEMPT_LIMIT);
  const rewardUnits = Object.values(objectValue(data.rewardUnits)).slice(0, 128);
  const overview = overviewForRows(rows, {
    totalQuestions: attempts.length,
    correct: attempts.filter((attempt) => attempt?.correct === true).length,
    retryQueue: data.retryQueue,
    now,
    securedRewardUnits: rewardUnits.filter((entry) => entry?.secured === true).length,
  });
  return {
    ...baseHeroUi(rawUi),
    stats: { overview, skills: rows },
    analytics: { skills: rows },
    content: { rewardUnitCount: 90 },
  };
}

function projectReasoning(data, rawUi, now) {
  const rows = masteryRows(REASONING_SKILLS, data.skills, now, { reasoning: true });
  const totals = objectValue(data.totals);
  const events = arrayTail(data.events, 1_200);
  const totalQuestions = Number.isFinite(Number(totals.questions))
    ? nonNegative(totals.questions)
    : events.length;
  const correct = Number.isFinite(Number(totals.correct))
    ? nonNegative(totals.correct)
    : events.filter((event) => event?.correct === true).length;
  const overview = overviewForRows(rows, {
    totalQuestions,
    correct,
    retryQueue: data.retryQueue,
    now,
  });
  return {
    ...baseHeroUi(rawUi),
    stats: { overview, skills: rows },
    analytics: { skills: rows },
    content: {},
  };
}

export function projectHeroSubjectRecord({
  subjectId,
  data: rawData,
  ui: rawUi,
  spellingStats = null,
  now = Date.now(),
} = {}) {
  const data = objectValue(rawData);
  const nowValue = requestTime(now);
  let ui;
  if (subjectId === 'spelling') {
    ui = {
      ...baseHeroUi(rawUi),
      stats: isPlainObject(spellingStats) ? spellingStats : objectValue(rawUi).stats || null,
      postMega: isPlainObject(data.postMega) ? data.postMega : null,
    };
  } else if (subjectId === 'grammar') {
    ui = projectGrammar(data, rawUi, nowValue);
  } else if (subjectId === 'punctuation') {
    ui = projectPunctuation(data, rawUi, nowValue);
  } else if (subjectId === 'reading') {
    ui = projectReading(data, rawUi, nowValue);
  } else if (subjectId === 'arithmetic') {
    ui = projectArithmetic(data, rawUi, nowValue);
  } else if (subjectId === 'reasoning') {
    ui = projectReasoning(data, rawUi, nowValue);
  } else {
    ui = baseHeroUi(rawUi);
  }
  return { data, ui };
}
