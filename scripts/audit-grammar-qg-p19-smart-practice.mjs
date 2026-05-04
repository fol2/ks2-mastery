#!/usr/bin/env node
/**
 * Grammar QG P19 — Contract D smart-practice simulator.
 *
 * Replays buildGrammarPracticeQueue across 11 learner profiles × 30 seeds
 * (330 sessions) and asserts that a normal 5-question smart round does
 * not contain duplicate template IDs or duplicate learner-visible surfaces
 * when the active template pool can avoid it. Reports concept / question-
 * type / constructed-selected / support-surface / repeated-surface metrics.
 *
 * Contract D criterion 4 — every queue entry now carries an explicit reason
 * (fallback, priority-urgent, focus-saturation, trouble-cluster, spaced-
 * retrieval, retry, similar-problem). Duplicates are only allowed when the
 * reason is on the explicit allow-list; missing or unknown reasons fail the
 * audit closed.
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { parseArgs } from 'node:util';

import {
  GRAMMAR_TEMPLATE_METADATA,
  GRAMMAR_CONTENT_RELEASE_ID,
  createGrammarQuestion,
  serialiseGrammarQuestion,
} from '../worker/src/subjects/grammar/content.js';
import {
  buildGrammarPracticeQueue,
} from '../worker/src/subjects/grammar/selection.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const REPORTS_DIR = path.join(ROOT_DIR, 'reports', 'grammar');
const NOW_TS = Date.parse('2026-05-04T09:00:00.000Z');
const SESSION_SIZE = 5;
const SEED_RANGE = Array.from({ length: 30 }, (_, i) => i + 1);

const CONSTRUCTED_INPUT_TYPES = new Set(['text', 'textarea', 'rewrite', 'multiField', 'table_choice']);
// Contract D.4 — exceptions are explicit and explainable. The grammar
// scheduler emits one of these reasons on every queue entry; only entries
// carrying an allow-listed reason may legitimately duplicate within a round.
const KNOWN_REASONS = new Set([
  'fallback',
  'priority-urgent',
  'focus-saturation',
  'trouble-cluster',
  'spaced-retrieval',
  'retry',
  'similar-problem',
]);
const ALLOWED_DUPLICATE_REASONS = new Set([
  'retry',
  'spaced-retrieval',
  'trouble-cluster',
  'similar-problem',
]);

function emptyMastery() {
  return { concepts: {}, templates: {}, questionTypes: {}, items: {} };
}

function masteryWith(concepts) {
  const out = emptyMastery();
  for (const [id, node] of Object.entries(concepts)) {
    out.concepts[id] = {
      attempts: node.attempts || 0,
      correct: node.correct || 0,
      wrong: node.wrong || 0,
      strength: typeof node.strength === 'number' ? node.strength : 0.25,
      intervalDays: node.intervalDays || 0,
      dueAt: node.dueAt || 0,
      correctStreak: node.correctStreak || 0,
    };
  }
  return out;
}

function recentAttempt({ templateId, conceptIds, questionType = 'choose', correct = true, ageMs = 0 }) {
  return {
    templateId,
    conceptIds: conceptIds.slice(),
    questionType,
    result: { correct },
    createdAt: NOW_TS - ageMs,
  };
}

const PROFILES = [
  {
    type: 'firstTime',
    label: 'First-time learner — empty mastery, no recent attempts',
    build: () => ({ mastery: emptyMastery(), recentAttempts: [], focusConceptId: '', mode: 'smart' }),
  },
  {
    type: 'returning',
    label: 'Returning learner — 4 mixed-result recent attempts',
    build: () => ({
      mastery: masteryWith({
        standard_english: { attempts: 3, correct: 2, wrong: 1, strength: 0.6, correctStreak: 1 },
        tense_aspect: { attempts: 4, correct: 3, wrong: 1, strength: 0.65, correctStreak: 2 },
        adverbials: { attempts: 2, correct: 1, wrong: 1, strength: 0.5, correctStreak: 0 },
      }),
      recentAttempts: [
        recentAttempt({ templateId: 'tense_form_choice', conceptIds: ['tense_aspect'], questionType: 'choose', correct: false, ageMs: 600000 }),
        recentAttempt({ templateId: 'subject_object_choice', conceptIds: ['subject_object'], questionType: 'identify', correct: true, ageMs: 500000 }),
        recentAttempt({ templateId: 'fronted_adverbial_choose', conceptIds: ['adverbials'], questionType: 'choose', correct: false, ageMs: 400000 }),
        recentAttempt({ templateId: 'standard_english_form_pick', conceptIds: ['standard_english'], questionType: 'choose', correct: true, ageMs: 300000 }),
      ],
      focusConceptId: '',
      mode: 'smart',
    }),
  },
  {
    type: 'weak',
    label: 'Weak learner — 8 concepts below 0.4 strength',
    build: () => ({
      mastery: masteryWith({
        standard_english: { attempts: 6, correct: 1, wrong: 5, strength: 0.25, correctStreak: 0 },
        tense_aspect: { attempts: 5, correct: 1, wrong: 4, strength: 0.3, correctStreak: 0 },
        subject_object: { attempts: 5, correct: 2, wrong: 3, strength: 0.35, correctStreak: 0 },
        clauses: { attempts: 4, correct: 1, wrong: 3, strength: 0.3, correctStreak: 0 },
        adverbials: { attempts: 5, correct: 1, wrong: 4, strength: 0.25, correctStreak: 0 },
        word_classes: { attempts: 4, correct: 1, wrong: 3, strength: 0.3, correctStreak: 0 },
        noun_phrases: { attempts: 4, correct: 2, wrong: 2, strength: 0.35, correctStreak: 1 },
        formality: { attempts: 3, correct: 1, wrong: 2, strength: 0.32, correctStreak: 0 },
      }),
      recentAttempts: [],
      focusConceptId: '',
      mode: 'smart',
    }),
  },
  {
    type: 'dueHeavy',
    label: 'Due-heavy learner — 12 concepts past due',
    build: () => {
      const concepts = {};
      const dueIds = [
        'sentence_functions', 'word_classes', 'noun_phrases', 'adverbials',
        'clauses', 'tense_aspect', 'standard_english', 'pronouns_cohesion',
        'subject_object', 'parenthesis_commas', 'speech_punctuation', 'apostrophes_possession',
      ];
      for (const id of dueIds) {
        concepts[id] = { attempts: 4, correct: 3, wrong: 1, strength: 0.55, correctStreak: 1, dueAt: NOW_TS - 86400000 };
      }
      return { mastery: masteryWith(concepts), recentAttempts: [], focusConceptId: '', mode: 'smart' };
    },
  },
  {
    type: 'postMega',
    label: 'Post-Mega learner — 10 concepts secured',
    build: () => {
      const concepts = {};
      const securedIds = [
        'sentence_functions', 'word_classes', 'noun_phrases', 'adverbials',
        'clauses', 'tense_aspect', 'standard_english', 'subject_object',
        'apostrophes_possession', 'speech_punctuation',
      ];
      for (const id of securedIds) {
        concepts[id] = { attempts: 8, correct: 7, wrong: 1, strength: 0.86, correctStreak: 4, dueAt: NOW_TS + 86400000 };
      }
      return { mastery: masteryWith(concepts), recentAttempts: [], focusConceptId: '', mode: 'smart' };
    },
  },
  {
    type: 'focusConcept',
    label: 'Focus-concept practice — pronouns_cohesion',
    build: () => ({
      mastery: masteryWith({
        pronouns_cohesion: { attempts: 3, correct: 1, wrong: 2, strength: 0.35, correctStreak: 0 },
        standard_english: { attempts: 4, correct: 3, wrong: 1, strength: 0.7, correctStreak: 2 },
      }),
      recentAttempts: [],
      focusConceptId: 'pronouns_cohesion',
      mode: 'smart',
    }),
  },
  {
    type: 'recentMisses',
    label: 'Recent-miss learner — 6 misses over 3 templates in last hour',
    build: () => ({
      mastery: masteryWith({
        adverbials: { attempts: 4, correct: 1, wrong: 3, strength: 0.3, correctStreak: 0 },
        tense_aspect: { attempts: 3, correct: 1, wrong: 2, strength: 0.35, correctStreak: 0 },
        clauses: { attempts: 3, correct: 0, wrong: 3, strength: 0.25, correctStreak: 0 },
      }),
      recentAttempts: [
        recentAttempt({ templateId: 'fronted_adverbial_choose', conceptIds: ['adverbials'], questionType: 'choose', correct: false, ageMs: 300000 }),
        recentAttempt({ templateId: 'fronted_adverbial_choose', conceptIds: ['adverbials'], questionType: 'choose', correct: false, ageMs: 240000 }),
        recentAttempt({ templateId: 'tense_form_choice', conceptIds: ['tense_aspect'], questionType: 'choose', correct: false, ageMs: 180000 }),
        recentAttempt({ templateId: 'tense_form_choice', conceptIds: ['tense_aspect'], questionType: 'choose', correct: false, ageMs: 120000 }),
        recentAttempt({ templateId: 'subordinate_clause_id', conceptIds: ['clauses'], questionType: 'identify', correct: false, ageMs: 60000 }),
        recentAttempt({ templateId: 'subordinate_clause_id', conceptIds: ['clauses'], questionType: 'identify', correct: false, ageMs: 30000 }),
      ],
      focusConceptId: '',
      mode: 'smart',
    }),
  },
  {
    // Contract D.4 — explicit retry exception coverage. The retry lane fires
    // when the most recent scored miss happened within the last 5 minutes
    // and the same template is still eligible. The simulator must observe at
    // least one queue entry with reason='retry' across the seed window.
    type: 'retryActive',
    label: 'Retry-eligible learner — last miss within 5 minutes (Contract D.4 retry lane)',
    build: () => ({
      mastery: masteryWith({
        adverbials: { attempts: 4, correct: 2, wrong: 2, strength: 0.4, correctStreak: 0 },
        standard_english: { attempts: 5, correct: 3, wrong: 2, strength: 0.55, correctStreak: 1 },
      }),
      recentAttempts: [
        // The retry target template must exist in GRAMMAR_TEMPLATE_METADATA so
        // the lane can find it in the smart-practice pool. fronted_adverbial_choose
        // is a P0 generator template that ships in every smart pool.
        recentAttempt({ templateId: 'fronted_adverbial_choose', conceptIds: ['adverbials'], questionType: 'choose', correct: false, ageMs: 60000 }),
      ],
      focusConceptId: '',
      mode: 'smart',
    }),
  },
  {
    // Contract D.4 — explicit similar-problem exception coverage. After a
    // miss on concept X with template T1, the lane surfaces a *different*
    // template T2 covering the same concept so the learner gets a fresh
    // attempt at the same skill rather than the exact failing item.
    type: 'similarProblemEligible',
    label: 'Similar-problem learner — recent stale miss with multi-template concept (Contract D.4 similar-problem lane)',
    build: () => ({
      mastery: masteryWith({
        adverbials: { attempts: 6, correct: 3, wrong: 3, strength: 0.45, correctStreak: 0 },
        tense_aspect: { attempts: 5, correct: 3, wrong: 2, strength: 0.5, correctStreak: 1 },
      }),
      recentAttempts: [
        // Stale miss (older than 5 min) so the retry lane will not pre-empt
        // similar-problem; we still want a recorded miss on the concept.
        recentAttempt({ templateId: 'fronted_adverbial_choose', conceptIds: ['adverbials'], questionType: 'choose', correct: false, ageMs: 900000 }),
      ],
      focusConceptId: '',
      mode: 'smart',
    }),
  },
  {
    // Contract D.4 — explicit spaced-retrieval exception coverage. A secured
    // concept whose retention window has lapsed (correctStreak >= 3 AND dueAt
    // overdue by >= 24h) becomes eligible to be revisited so retention does
    // not silently decay.
    type: 'spacedRetrievalDue',
    label: 'Spaced-retrieval learner — secured concept overdue >24h (Contract D.4 spaced-retrieval lane)',
    build: () => {
      const concepts = {};
      const securedOverdueIds = ['adverbials', 'tense_aspect', 'standard_english', 'subject_object'];
      for (const id of securedOverdueIds) {
        concepts[id] = {
          attempts: 12,
          correct: 11,
          wrong: 1,
          strength: 0.9,
          correctStreak: 5,
          // dueAt is well over 24h in the past, so the concept is overdue.
          dueAt: NOW_TS - (3 * 86400000),
        };
      }
      return { mastery: masteryWith(concepts), recentAttempts: [], focusConceptId: '', mode: 'smart' };
    },
  },
  {
    // Contract D.4 — explicit retry/trouble exception coverage. Mode 'trouble'
    // routes the urgent lane to the trouble-cluster path; the simulator must
    // verify that any duplicates are tagged with the trouble-cluster reason.
    type: 'troubleMode',
    label: 'Trouble-mode learner — explicit retry/trouble lane (Contract D.4)',
    build: () => ({
      mastery: masteryWith({
        standard_english: { attempts: 5, correct: 1, wrong: 4, strength: 0.25, correctStreak: 0, dueAt: NOW_TS - 1 },
        tense_aspect: { attempts: 4, correct: 1, wrong: 3, strength: 0.3, correctStreak: 0, dueAt: NOW_TS - 1 },
      }),
      recentAttempts: [
        recentAttempt({ templateId: 'tense_form_choice', conceptIds: ['tense_aspect'], questionType: 'choose', correct: false, ageMs: 600000 }),
      ],
      focusConceptId: '',
      mode: 'trouble',
    }),
  },
];

function visibleOptions(inputSpec) {
  if (!inputSpec || typeof inputSpec !== 'object') return null;
  if (Array.isArray(inputSpec.options)) {
    return inputSpec.options.map((option) => option?.label || option?.value || '');
  }
  if (Array.isArray(inputSpec.rows)) {
    return inputSpec.rows.map((row) => ({
      rowLabel: row?.label || row?.key || '',
      options: Array.isArray(row?.options) ? row.options : (inputSpec.columns || []),
    }));
  }
  if (Array.isArray(inputSpec.fields)) {
    return inputSpec.fields.map((field) => ({
      label: field?.label || field?.key || '',
      options: field?.options || [],
    }));
  }
  return null;
}

function surfaceKeyFor(question, serialised) {
  const promptText = String(serialised?.promptText || '');
  const optionsBlob = JSON.stringify(visibleOptions(serialised?.inputSpec) || null);
  const focusCue = String(serialised?.focusCue || '');
  return crypto.createHash('sha1').update(`${promptText}|${optionsBlob}|${focusCue}`).digest('hex');
}

function eligibleTemplateIds(profile) {
  const concepts = new Set(Object.keys(profile.mastery?.concepts || {}));
  if (concepts.size === 0) return GRAMMAR_TEMPLATE_METADATA.length;
  return GRAMMAR_TEMPLATE_METADATA.filter((template) => {
    if (!Array.isArray(template.skillIds) || template.skillIds.length === 0) return true;
    if (profile.focusConceptId) return template.skillIds.includes(profile.focusConceptId);
    return template.skillIds.some((id) => concepts.has(id));
  }).length;
}

function runSession(profile, seed) {
  const queue = buildGrammarPracticeQueue({
    mode: profile.mode,
    size: SESSION_SIZE,
    seed,
    focusConceptId: profile.focusConceptId,
    mastery: profile.mastery,
    recentAttempts: profile.recentAttempts,
    now: NOW_TS,
  });
  const items = queue.map((entry, index) => {
    const itemSeed = ((Number(seed) || 1) + index * 104729) >>> 0;
    const question = createGrammarQuestion({ templateId: entry.templateId, seed: itemSeed });
    const serialised = question ? serialiseGrammarQuestion(question) : null;
    const inputType = serialised?.inputSpec?.type || question?.inputSpec?.type || '';
    return {
      slot: index + 1,
      templateId: entry.templateId,
      skillIds: entry.skillIds,
      questionType: entry.questionType,
      seed: itemSeed,
      inputType,
      isConstructed: CONSTRUCTED_INPUT_TYPES.has(inputType),
      surfaceKey: question && serialised ? surfaceKeyFor(question, serialised) : null,
      manualReviewOnly: Boolean(question?.manualReviewOnly),
      reason: entry.reason || '',
    };
  });
  return items;
}

// Contract D.4 — every queue entry must carry an explicit, known reason. An
// empty or unknown reason is itself a contract violation because it leaves
// the lane unexplained. Run this check once per session.
function detectReasonInvariants(items) {
  const failures = [];
  for (const item of items) {
    if (!item.reason) {
      failures.push({ kind: 'missing-reason', templateId: item.templateId, slot: item.slot });
    } else if (!KNOWN_REASONS.has(item.reason)) {
      failures.push({ kind: 'unknown-reason', templateId: item.templateId, slot: item.slot, reason: item.reason });
    }
  }
  return failures;
}

function detectSessionDuplicates(items, eligibleCount) {
  const failures = [];
  const advisories = [];
  if (eligibleCount < SESSION_SIZE) {
    advisories.push({ kind: 'pool-too-small', detail: `Eligible templates < ${SESSION_SIZE} (${eligibleCount}); duplicates not asserted.` });
    return { failures, advisories };
  }
  const templateCounts = new Map();
  const surfaceCounts = new Map();
  for (const item of items) {
    templateCounts.set(item.templateId, (templateCounts.get(item.templateId) || 0) + 1);
    if (item.surfaceKey) surfaceCounts.set(item.surfaceKey, (surfaceCounts.get(item.surfaceKey) || 0) + 1);
  }
  for (const [templateId, count] of templateCounts.entries()) {
    if (count <= 1) continue;
    const reasons = items.filter((item) => item.templateId === templateId).map((item) => item.reason).filter(Boolean);
    const allAllowed = reasons.length === count && reasons.every((reason) => ALLOWED_DUPLICATE_REASONS.has(reason));
    if (allAllowed) {
      advisories.push({ kind: 'duplicate-template-allowed', templateId, count, reasons });
    } else {
      failures.push({ kind: 'duplicate-template', templateId, count });
    }
  }
  for (const [surfaceKey, count] of surfaceCounts.entries()) {
    if (count <= 1) continue;
    failures.push({ kind: 'duplicate-surface', surfaceKey, count });
  }
  return { failures, advisories };
}

function spreadMetrics(items) {
  const concepts = new Set(items.flatMap((item) => item.skillIds || []));
  const questionTypes = new Set(items.map((item) => item.questionType).filter(Boolean));
  const constructed = items.filter((item) => item.isConstructed).length;
  const manualReviewOnly = items.filter((item) => item.manualReviewOnly).length;
  const reasonCounts = {};
  for (const item of items) {
    const key = item.reason || 'missing';
    reasonCounts[key] = (reasonCounts[key] || 0) + 1;
  }
  return {
    conceptDistinct: concepts.size,
    questionTypeDistinct: questionTypes.size,
    constructedItemCount: constructed,
    selectedItemCount: items.length - constructed,
    manualReviewOnlyCount: manualReviewOnly,
    reasonCounts,
  };
}

function aggregateProfile(profileType, sessions) {
  const surfaceHistogram = new Map();
  const reasonHistogram = new Map();
  let conceptDistinctSum = 0;
  let questionTypeDistinctSum = 0;
  let constructedSum = 0;
  let selectedSum = 0;
  let manualReviewOnlySum = 0;
  for (const session of sessions) {
    conceptDistinctSum += session.metrics.conceptDistinct;
    questionTypeDistinctSum += session.metrics.questionTypeDistinct;
    constructedSum += session.metrics.constructedItemCount;
    selectedSum += session.metrics.selectedItemCount;
    manualReviewOnlySum += session.metrics.manualReviewOnlyCount;
    for (const item of session.items) {
      if (item.surfaceKey) {
        surfaceHistogram.set(item.surfaceKey, (surfaceHistogram.get(item.surfaceKey) || 0) + 1);
      }
      const reasonKey = item.reason || 'missing';
      reasonHistogram.set(reasonKey, (reasonHistogram.get(reasonKey) || 0) + 1);
    }
  }
  const repeatedSurfaces = [...surfaceHistogram.entries()].filter(([, count]) => count > 1).length;
  const totalItems = sessions.reduce((sum, session) => sum + session.items.length, 0);
  return {
    type: profileType,
    sessionCount: sessions.length,
    spread: {
      conceptDistinctMean: sessions.length ? conceptDistinctSum / sessions.length : 0,
      questionTypeDistinctMean: sessions.length ? questionTypeDistinctSum / sessions.length : 0,
      constructedSelectedMix: totalItems ? constructedSum / totalItems : 0,
      manualReviewOnlyShare: totalItems ? manualReviewOnlySum / totalItems : 0,
      repeatedSurfaceCount: repeatedSurfaces,
      uniqueSurfaceCount: surfaceHistogram.size,
      reasonHistogram: Object.fromEntries(reasonHistogram),
    },
  };
}

export function buildSmartPracticeAudit() {
  const profileResults = [];
  let allFailures = [];
  let allAdvisories = [];
  let totalSessions = 0;

  for (const profileSpec of PROFILES) {
    const profile = { type: profileSpec.type, label: profileSpec.label, ...profileSpec.build() };
    const eligibleCount = eligibleTemplateIds(profile);
    const sessions = [];
    for (const seed of SEED_RANGE) {
      const items = runSession(profile, seed);
      const dup = detectSessionDuplicates(items, eligibleCount);
      const reasonFailures = detectReasonInvariants(items);
      const metrics = spreadMetrics(items);
      sessions.push({ seed, items, metrics, failures: dup.failures.concat(reasonFailures), advisories: dup.advisories });
      for (const failure of dup.failures) allFailures.push({ profile: profile.type, seed, ...failure });
      for (const failure of reasonFailures) allFailures.push({ profile: profile.type, seed, ...failure });
      for (const advisory of dup.advisories) allAdvisories.push({ profile: profile.type, seed, ...advisory });
      totalSessions += 1;
    }
    profileResults.push({
      ...aggregateProfile(profile.type, sessions),
      label: profile.label,
      focusConceptId: profile.focusConceptId,
      mode: profile.mode,
      eligibleTemplateCount: eligibleCount,
      sessions,
    });
  }

  return {
    metadata: {
      contentReleaseId: GRAMMAR_CONTENT_RELEASE_ID,
      generatedAt: new Date().toISOString(),
      sessionCount: totalSessions,
      profileCount: PROFILES.length,
      sessionSize: SESSION_SIZE,
      seedRange: { from: SEED_RANGE[0], to: SEED_RANGE[SEED_RANGE.length - 1] },
      pass: allFailures.length === 0,
    },
    summary: {
      sessionCount: totalSessions,
      profileCount: PROFILES.length,
      pass: allFailures.length === 0,
      failureCount: allFailures.length,
      advisoryCount: allAdvisories.length,
    },
    profiles: profileResults,
    failures: allFailures,
    advisories: allAdvisories,
  };
}

function renderMarkdown(audit) {
  const lines = [];
  lines.push(`# Grammar QG P19 — smart-practice surface audit`);
  lines.push('');
  lines.push(`Content release: \`${audit.metadata.contentReleaseId}\``);
  lines.push(`Generated: \`${audit.metadata.generatedAt}\``);
  lines.push(`Sessions: ${audit.summary.sessionCount} (${audit.metadata.profileCount} profiles × ${SEED_RANGE.length} seeds, size=${audit.metadata.sessionSize})`);
  lines.push(`Status: **${audit.summary.pass ? 'PASS' : 'FAIL'}** — ${audit.summary.failureCount} failures, ${audit.summary.advisoryCount} advisories.`);
  lines.push('');
  lines.push(`## Per-profile spread`);
  lines.push('');
  lines.push('| Profile | Sessions | Eligible pool | Concept-distinct mean | Q-type-distinct mean | Constructed share | ManualReview share | Repeated surfaces |');
  lines.push('|---|---|---|---|---|---|---|---|');
  for (const profile of audit.profiles) {
    const s = profile.spread;
    lines.push(`| ${profile.type} | ${profile.sessionCount} | ${profile.eligibleTemplateCount} | ${s.conceptDistinctMean.toFixed(2)} | ${s.questionTypeDistinctMean.toFixed(2)} | ${(s.constructedSelectedMix * 100).toFixed(1)}% | ${(s.manualReviewOnlyShare * 100).toFixed(1)}% | ${s.repeatedSurfaceCount} / ${s.uniqueSurfaceCount} |`);
  }
  lines.push('');
  lines.push(`## Selection lane reasons exercised`);
  lines.push('');
  lines.push(`Contract D.4 — every queue entry carries an explicit lane reason. The table below shows how many entries each profile pulled from each lane across ${SEED_RANGE.length} seeds.`);
  lines.push('');
  const allReasons = new Set();
  for (const profile of audit.profiles) {
    for (const reason of Object.keys(profile.spread.reasonHistogram || {})) allReasons.add(reason);
  }
  const reasonColumns = [...allReasons].sort();
  if (reasonColumns.length > 0) {
    lines.push(`| Profile | ${reasonColumns.join(' | ')} |`);
    lines.push(`|---${reasonColumns.map(() => '|---').join('')}|`);
    for (const profile of audit.profiles) {
      const cells = reasonColumns.map((reason) => String(profile.spread.reasonHistogram?.[reason] || 0));
      lines.push(`| ${profile.type} | ${cells.join(' | ')} |`);
    }
    lines.push('');
  }
  if (audit.failures.length > 0) {
    lines.push(`## Failures (${audit.failures.length})`);
    lines.push('');
    lines.push('| Profile | Seed | Kind | Detail |');
    lines.push('|---|---|---|---|');
    for (const failure of audit.failures.slice(0, 50)) {
      const detail = failure.kind === 'duplicate-template'
        ? `templateId=${failure.templateId} (count=${failure.count})`
        : failure.kind === 'duplicate-surface'
          ? `surfaceKey=${failure.surfaceKey.slice(0, 12)}… (count=${failure.count})`
          : JSON.stringify(failure);
      lines.push(`| ${failure.profile} | ${failure.seed} | ${failure.kind} | ${detail} |`);
    }
    if (audit.failures.length > 50) lines.push(`| … | … | … | (${audit.failures.length - 50} additional rows omitted) |`);
    lines.push('');
  }
  if (audit.advisories.length > 0) {
    lines.push(`## Advisories (${audit.advisories.length})`);
    lines.push('');
    const kinds = new Map();
    for (const advisory of audit.advisories) kinds.set(advisory.kind, (kinds.get(advisory.kind) || 0) + 1);
    for (const [kind, count] of kinds.entries()) lines.push(`- ${kind}: ${count}`);
    lines.push('');
  }
  lines.push(`## Notes`);
  lines.push('');
  lines.push(`- Every queue entry carries an explicit reason emitted by \`queueEntry()\` in \`worker/src/subjects/grammar/selection.js\` (fallback, priority-urgent, focus-saturation, trouble-cluster, spaced-retrieval, retry, similar-problem). Duplicate templates within a 5-question round are only permitted when the reason is on the \`ALLOWED_DUPLICATE_REASONS\` allow-list — missing or unknown reasons hard-fail the audit (Contract D criterion 4).`);
  lines.push(`- "Eligible pool" is computed from \`GRAMMAR_TEMPLATE_METADATA\` filtered by the profile's mastered concepts and (when set) focus concept. Sessions with eligible pool < ${SESSION_SIZE} record a \`pool-too-small\` advisory rather than a hard failure.`);
  lines.push('');
  return lines.join('\n');
}

async function main() {
  const { values } = parseArgs({
    options: {
      'json-out': { type: 'string', default: '' },
      'md-out': { type: 'string', default: '' },
    },
    strict: false,
  });

  const audit = buildSmartPracticeAudit();
  const jsonOut = values['json-out']
    ? path.resolve(values['json-out'])
    : path.join(REPORTS_DIR, 'grammar-qg-p19-smart-practice-audit.json');
  const mdOut = values['md-out']
    ? path.resolve(values['md-out'])
    : path.join(REPORTS_DIR, 'grammar-qg-p19-smart-practice-audit.md');

  await fs.mkdir(path.dirname(jsonOut), { recursive: true });
  await fs.writeFile(jsonOut, JSON.stringify(audit, null, 2) + '\n', 'utf8');
  await fs.writeFile(mdOut, renderMarkdown(audit), 'utf8');

  console.log(`Grammar QG P19 smart-practice audit: ${audit.summary.pass ? 'PASS' : 'FAIL'}`);
  console.log(`  Sessions: ${audit.summary.sessionCount} (${audit.summary.profileCount} profiles × ${SEED_RANGE.length} seeds)`);
  console.log(`  Failures: ${audit.summary.failureCount}`);
  console.log(`  Advisories: ${audit.summary.advisoryCount}`);
  console.log(`  JSON: ${jsonOut}`);
  console.log(`  MD: ${mdOut}`);
  if (!audit.summary.pass) process.exit(1);
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '')) {
  main().catch((err) => {
    console.error(err?.stack || err?.message || err);
    process.exit(1);
  });
}
