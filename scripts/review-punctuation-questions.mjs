#!/usr/bin/env node

/**
 * Reviewer QA pack for punctuation questions (v3).
 *
 * Produces a comprehensive human-readable markdown report (stdout) and/or
 * a JSON file for programmatic consumption. Now includes choice options,
 * negative vector display, preservation contract, explanation lint, stable
 * cluster IDs, v2 decision schema, and new filter/summary flags.
 *
 * Usage:
 *   node scripts/review-punctuation-questions.mjs                        # markdown to stdout (192 items, production pool)
 *   node scripts/review-punctuation-questions.mjs --json                 # JSON to stdout (production pool)
 *   node scripts/review-punctuation-questions.mjs --out qa.json          # JSON to file (production pool)
 *   node scripts/review-punctuation-questions.mjs --depth 6              # depth-6 generated items only (150 items)
 *   node scripts/review-punctuation-questions.mjs --include-depth-6      # inclusive pool: fixed + depth-6 (242 items)
 *   node scripts/review-punctuation-questions.mjs --candidate-depth 6 --out review.json  # delta only (50 items beyond production)
 *   node scripts/review-punctuation-questions.mjs --summary              # decision state counts (fast, no per-item detail)
 *   node scripts/review-punctuation-questions.mjs --only-blocked         # show only items/clusters with blocking decisions
 *   node scripts/review-punctuation-questions.mjs --only-candidates      # show only depth-6 candidate items
 *   node scripts/review-punctuation-questions.mjs --only-unreviewed      # show only items without decisions
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  PUNCTUATION_CONTENT_MANIFEST,
  createPunctuationContentIndexes,
} from '../shared/punctuation/content.js';
import {
  createPunctuationGeneratedItems,
  GENERATED_TEMPLATE_BANK,
  PRODUCTION_DEPTH,
} from '../shared/punctuation/generators.js';
import { markPunctuationAnswer, derivePreserveTokens } from '../shared/punctuation/marking.js';
import { lintExplanation } from '../shared/punctuation/explanation-lint.js';
import {
  BLOCKING_DECISIONS,
  generateStableClusterId,
  loadReviewerDecisions as loadReviewerDecisionsV2,
} from '../shared/punctuation/reviewer-decisions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DECISIONS_PATH = join(__dirname, '..', 'tests', 'fixtures', 'punctuation-reviewer-decisions.json');
const NEGATIVE_VECTORS_PATH = join(__dirname, '..', 'tests', 'fixtures', 'punctuation-negative-vectors.json');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normaliseForVariety(value) {
  return String(value ?? '')
    .replace(/ /g, ' ')
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/[–—-]/g, ' ')   // Treat ALL dashes (en, em, hyphen) as word boundaries
    .replace(/[^a-z0-9\s]/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function validatorSummary(item) {
  if (!item.validator && !item.rubric) return '(none)';
  const parts = [];
  if (item.validator) {
    const type = item.validator.type || 'unknown';
    const facets = Array.isArray(item.validator.facets)
      ? item.validator.facets.map((f) => f.id || f.type || '?').join(', ')
      : '';
    parts.push(`validator: ${type}${facets ? ` [${facets}]` : ''}`);
  }
  if (item.rubric) {
    const type = item.rubric.type || 'unknown';
    parts.push(`rubric: ${type}`);
  }
  return parts.join('; ');
}

function markingResultSummary(result) {
  if (!result) return '(no result)';
  const parts = [`correct: ${result.correct}`];
  if (result.score != null) parts.push(`score: ${result.score}`);
  if (Array.isArray(result.facetResults) && result.facetResults.length) {
    const passed = result.facetResults.filter((f) => f.pass).length;
    parts.push(`facets: ${passed}/${result.facetResults.length} passed`);
  }
  if (Array.isArray(result.misconceptionTags) && result.misconceptionTags.length) {
    parts.push(`misconceptions: ${result.misconceptionTags.join(', ')}`);
  }
  return parts.join(' | ');
}

// ─── Reviewer decisions loader (v2 schema-aware) ────────────────────────────

function loadDecisionsFile() {
  try {
    const raw = readFileSync(DECISIONS_PATH, 'utf8');
    const parsed = JSON.parse(raw);

    // Build item decision map from v2 schema (itemDecisions array)
    const itemDecisionMap = new Map();
    if (Array.isArray(parsed.itemDecisions)) {
      for (const d of parsed.itemDecisions) {
        if (d && d.itemId) itemDecisionMap.set(d.itemId, d);
      }
    }

    // Build cluster decision map from v2 schema (clusterDecisions array)
    const clusterDecisionMap = new Map();
    if (Array.isArray(parsed.clusterDecisions)) {
      for (const d of parsed.clusterDecisions) {
        if (d && d.clusterId) clusterDecisionMap.set(d.clusterId, d);
      }
    }

    return { itemDecisionMap, clusterDecisionMap, raw: parsed };
  } catch {
    return { itemDecisionMap: new Map(), clusterDecisionMap: new Map(), raw: { itemDecisions: [], clusterDecisions: [] } };
  }
}

// ─── Negative vectors loader ────────────────────────────────────────────────

function loadNegativeVectors() {
  try {
    if (!existsSync(NEGATIVE_VECTORS_PATH)) return [];
    const raw = readFileSync(NEGATIVE_VECTORS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.vectors) ? parsed.vectors : (Array.isArray(parsed) ? parsed : []);
  } catch {
    return [];
  }
}

// ─── Template bank lookup (for negative examples) ────────────────────────────

function findTemplateTests(item) {
  if (item._source !== 'generated') return null;
  const familyId = item.generatorFamilyId;
  if (!familyId) return null;
  const templates = GENERATED_TEMPLATE_BANK[familyId];
  if (!Array.isArray(templates) || !templates.length) return null;

  // Match by templateId if possible, else by model answer
  for (const tmpl of templates) {
    if (tmpl.templateId && tmpl.templateId === item.templateId) return tmpl.tests || null;
    if (!tmpl.templateId && tmpl.model === item.model) return tmpl.tests || null;
  }
  // Fallback: match on model text
  for (const tmpl of templates) {
    if (tmpl.model === item.model) return tmpl.tests || null;
  }
  return null;
}

// ─── Build pool ──────────────────────────────────────────────────────────────

function buildProductionPool() {
  const indexes = createPunctuationContentIndexes(PUNCTUATION_CONTENT_MANIFEST);
  const fixedItems = indexes.items.map((item) => ({ ...item, _source: 'fixed' }));

  const generatedItems = createPunctuationGeneratedItems({
    manifest: PUNCTUATION_CONTENT_MANIFEST,
    seed: PUNCTUATION_CONTENT_MANIFEST.releaseId || 'punctuation',
    perFamily: PRODUCTION_DEPTH,
  }).map((item) => ({ ...item, _source: 'generated' }));

  return [...fixedItems, ...generatedItems];
}

/**
 * Build a pool based on CLI options.
 *
 * @param {object} options
 * @param {number|null} options.depth - Generate at this specific depth only (no fixed items)
 * @param {boolean} options.includeDepth6 - Fixed + generated at depth 6
 * @param {number|null} options.candidateDepth - Delta: generated at candidateDepth minus generated at PRODUCTION_DEPTH
 * @returns {{ pool: Array, productionIds: Set }}
 */
function buildPool({ depth = null, includeDepth6 = false, candidateDepth = null } = {}) {
  const indexes = createPunctuationContentIndexes(PUNCTUATION_CONTENT_MANIFEST);
  const fixedItems = indexes.items.map((item) => ({ ...item, _source: 'fixed' }));
  const seed = PUNCTUATION_CONTENT_MANIFEST.releaseId || 'punctuation';

  // Production generated items (for productionIds tracking)
  const productionGenerated = createPunctuationGeneratedItems({
    manifest: PUNCTUATION_CONTENT_MANIFEST,
    seed,
    perFamily: PRODUCTION_DEPTH,
  }).map((item) => ({ ...item, _source: 'generated' }));

  const productionIds = new Set([
    ...fixedItems.map((i) => i.id),
    ...productionGenerated.map((i) => i.id),
  ]);

  // --depth N: generated at depth N only (no fixed items)
  if (depth != null) {
    const generatedAtDepth = createPunctuationGeneratedItems({
      manifest: PUNCTUATION_CONTENT_MANIFEST,
      seed,
      perFamily: depth,
    }).map((item) => ({ ...item, _source: 'generated' }));
    return { pool: generatedAtDepth, productionIds };
  }

  // --candidate-depth N: delta items (at depth N but NOT in production)
  if (candidateDepth != null) {
    const generatedAtCandidate = createPunctuationGeneratedItems({
      manifest: PUNCTUATION_CONTENT_MANIFEST,
      seed,
      perFamily: candidateDepth,
    }).map((item) => ({ ...item, _source: 'generated' }));
    const delta = generatedAtCandidate.filter((item) => !productionIds.has(item.id));
    return { pool: delta, productionIds };
  }

  // --include-depth-6: fixed + generated at depth 6
  if (includeDepth6) {
    const generatedAtSix = createPunctuationGeneratedItems({
      manifest: PUNCTUATION_CONTENT_MANIFEST,
      seed,
      perFamily: 6,
    }).map((item) => ({ ...item, _source: 'generated' }));
    return { pool: [...fixedItems, ...generatedAtSix], productionIds };
  }

  // Default: production pool
  return { pool: [...fixedItems, ...productionGenerated], productionIds };
}

// ─── Per-item QA entry ────────────────────────────────────────────────────────

function buildItemEntry(item, { productionIds = null, clusterMap = null, itemDecisionMap = null, negativeVectorMap = null } = {}) {
  const answer = item.mode === 'choose'
    ? { choiceIndex: item.correctIndex }
    : { typed: item.model || '' };

  let markingResult = null;
  try {
    markingResult = markPunctuationAnswer({ item, answer });
  } catch {
    markingResult = { correct: false, error: 'marking threw' };
  }

  // Mark every accepted alternative
  const acceptedAlternatives = (item.accepted || []).filter((a) => a !== item.model);
  const alternativeMarkingResults = acceptedAlternatives.map((alt) => {
    const altAnswer = item.mode === 'choose' ? { choiceIndex: item.correctIndex } : { typed: alt };
    try {
      return { answer: alt, result: markPunctuationAnswer({ item, answer: altAnswer }) };
    } catch {
      return { answer: alt, result: { correct: false, error: 'marking threw' } };
    }
  });

  // Negative examples from DSL template tests.reject
  const templateTests = findTemplateTests(item);
  const negativeExamples = [];
  if (templateTests && Array.isArray(templateTests.reject)) {
    for (const neg of templateTests.reject) {
      const negAnswer = item.mode === 'choose' ? { choiceIndex: -1 } : { typed: neg };
      let negResult;
      try {
        negResult = markPunctuationAnswer({ item, answer: negAnswer });
      } catch {
        negResult = { correct: false, error: 'marking threw' };
      }
      negativeExamples.push({ answer: neg, result: negResult });
    }
  }

  // Fixed negative vectors from fixture file
  const fixedNegativeVectors = [];
  if (negativeVectorMap && negativeVectorMap.has(item.id)) {
    const vectors = negativeVectorMap.get(item.id);
    for (const vec of vectors) {
      const vecAnswer = item.mode === 'choose' ? { choiceIndex: -1 } : { typed: vec.answer };
      let vecResult;
      try {
        vecResult = markPunctuationAnswer({ item, answer: vecAnswer });
      } catch {
        vecResult = { correct: false, error: 'marking threw' };
      }
      fixedNegativeVectors.push({ input: vec.answer, expectedCorrect: vec.expectedCorrect ?? false, result: vecResult });
    }
  }

  // Production status
  const productionStatus = productionIds && !productionIds.has(item.id)
    ? 'candidate-only'
    : 'production';

  // Cluster IDs (now stable content-hashed)
  const clusterIds = clusterMap ? (clusterMap.get(item.id) || []) : [];

  // Reviewer decision from v2 schema (itemDecisions)
  const reviewerDecision = itemDecisionMap ? (itemDecisionMap.get(item.id) || null) : null;

  // Choice options display
  const choiceOptions = item.mode === 'choose' && Array.isArray(item.options)
    ? { options: item.options, correctIndex: item.correctIndex }
    : null;

  // Preservation contract: derive tokens for closed items with stems
  const closedModes = ['insert', 'fix', 'combine', 'transfer'];
  let preservationTokens = null;
  if (closedModes.includes(item.mode)) {
    if (Array.isArray(item.preserveTokens) && item.preserveTokens.length > 0) {
      preservationTokens = item.preserveTokens;
    } else if (item.stem) {
      const derived = derivePreserveTokens(item.stem);
      preservationTokens = derived.length > 0 ? derived : null;
    }
  }

  // Explanation lint result
  const explanationLint = lintExplanation(
    item.explanation || '',
    item.explanationRuleId || '',
    { id: item.id, familyId: item.generatorFamilyId },
  );

  return {
    id: item.id,
    source: item._source,
    skillIds: item.skillIds || [],
    rewardUnitId: item.rewardUnitId || '',
    mode: item.mode || '',
    prompt: item.prompt || '',
    stem: item.stem || '',
    model: item.model || '',
    accepted: item.accepted || [],
    explanation: item.explanation || '',
    validatorSummary: validatorSummary(item),
    misconceptionTags: item.misconceptionTags || [],
    readiness: item.readiness || [],
    markingResult,
    markingResultSummary: markingResultSummary(markingResult),
    alternativeMarkingResults,
    negativeExamples,
    fixedNegativeVectors,
    productionStatus,
    clusterIds,
    reviewerDecision,
    choiceOptions,
    preservationTokens,
    explanationLint,
    templateId: item.templateId || '',
    variantSignature: item.variantSignature || '',
    generatorFamilyId: item.generatorFamilyId || '',
  };
}

// ─── Perceived-variety analysis ───────────────────────────────────────────────

function buildVarietyClusters(pool) {
  const stemGroups = new Map();
  const modelGroups = new Map();
  const explanationGroups = new Map();
  // Per-skill character frequency: key = 'skillId::characterName'
  const characterPerSkill = new Map();
  // Per-skill correction pattern: key = 'skillId::normalisedModel'
  const correctionPerSkill = new Map();

  // Extract character names (capitalised proper nouns, min 3 chars, not common starters)
  const COMMON_STARTERS = new Set(['The', 'This', 'That', 'They', 'There', 'Their', 'These', 'Those', 'When', 'Where', 'What', 'Which', 'While', 'After', 'Before', 'During', 'Without', 'Although', 'Because', 'Since', 'Until', 'Unless', 'However', 'Therefore', 'Furthermore', 'Moreover', 'Nevertheless', 'Please', 'Most', 'Everyone', 'Our', 'Your', 'Some', 'Many', 'Few', 'All', 'Each', 'Every', 'Both', 'Neither', 'Either', 'Any', 'Take', 'Keep', 'Put', 'Bring', 'Pack', 'Check', 'Let', 'Don', 'Did', 'Does', 'Can', 'Could', 'Would', 'Should', 'Will', 'May', 'Might', 'Must', 'Shall', 'How', 'Why', 'Are', 'Were', 'Was', 'Has', 'Have', 'Had', 'Its', 'She', 'You', 'Well', 'Year', 'For', 'Im', 'Ive', 'Youre', 'Youll', 'Theyre', 'Weve', 'Wed']);
  function extractCharacterNames(text) {
    const matches = (text || '').match(/\b[A-Z][a-z]{2,}\b/g) || [];
    return matches.filter((m) => !COMMON_STARTERS.has(m));
  }

  for (const item of pool) {
    const normStem = normaliseForVariety(item.stem);
    const normModel = normaliseForVariety(item.model);
    const normExplanation = normaliseForVariety(item.explanation);

    if (normStem) {
      if (!stemGroups.has(normStem)) stemGroups.set(normStem, []);
      stemGroups.get(normStem).push(item);
    }
    if (normModel) {
      if (!modelGroups.has(normModel)) modelGroups.set(normModel, []);
      modelGroups.get(normModel).push(item);
    }
    if (normExplanation) {
      if (!explanationGroups.has(normExplanation)) explanationGroups.set(normExplanation, []);
      explanationGroups.get(normExplanation).push(item);
    }

    // Character name tracking per skill
    const text = (item.stem || '') + ' ' + (item.model || '');
    const names = extractCharacterNames(text);
    for (const skill of (item.skillIds || [])) {
      for (const name of names) {
        const key = skill + ':' + ':' + name;
        if (!characterPerSkill.has(key)) characterPerSkill.set(key, []);
        characterPerSkill.get(key).push(item);
      }

      // Correction pattern per skill (normalised model groups within a skill)
      if (normModel) {
        const cpKey = skill + ':' + ':' + normModel;
        if (!correctionPerSkill.has(cpKey)) correctionPerSkill.set(cpKey, []);
        correctionPerSkill.get(cpKey).push(item);
      }
    }
  }

  const clusters = [];

  for (const [normText, items] of stemGroups) {
    if (items.length < 2) continue;
    const modes = [...new Set(items.map((i) => i.mode))].sort();
    const isSameMode = modes.length === 1 && items.length > 1;
    clusters.push({
      type: 'stem',
      normalisedText: normText,
      modes,
      itemIds: items.map((i) => i.id).sort(),
      count: items.length,
      classification: isSameMode ? 'SAME-MODE-DUPLICATE' : 'CROSS-MODE-OVERLAP',
      sampleStem: items[0].stem || '',
    });
  }

  for (const [normText, items] of modelGroups) {
    if (items.length < 2) continue;
    const modes = [...new Set(items.map((i) => i.mode))].sort();
    const isSameMode = modes.length === 1 && items.length > 1;
    clusters.push({
      type: 'model',
      normalisedText: normText,
      modes,
      itemIds: items.map((i) => i.id).sort(),
      count: items.length,
      classification: isSameMode ? 'SAME-MODE-DUPLICATE' : 'CROSS-MODE-OVERLAP',
      sampleModel: items[0].model || '',
    });
  }

  // Repeated explanation clusters (items with identical normalised explanation)
  for (const [normText, items] of explanationGroups) {
    if (items.length < 2) continue;
    const modes = [...new Set(items.map((i) => i.mode))].sort();
    clusters.push({
      type: 'explanation',
      normalisedText: normText,
      modes,
      itemIds: items.map((i) => i.id).sort(),
      count: items.length,
      classification: 'REPEATED-EXPLANATION',
      sampleExplanation: items[0].explanation || '',
    });
  }

  // Character repetition clusters (same character > 3 times within a skill)
  for (const [key, items] of characterPerSkill) {
    if (items.length <= 3) continue;
    const parts = key.split('::');
    const skill = parts[0];
    const character = parts[1];
    const modes = [...new Set(items.map((i) => i.mode))].sort();
    clusters.push({
      type: 'character',
      normalisedText: character.toLowerCase(),
      modes,
      itemIds: items.map((i) => i.id).sort(),
      count: items.length,
      classification: 'CHARACTER-OVERUSE',
      skill,
      character,
    });
  }

  // Correction pattern clusters (same normalised model within a skill, > 1 item)
  for (const [key, items] of correctionPerSkill) {
    if (items.length < 2) continue;
    const parts = key.split('::');
    const skill = parts[0];
    const modes = [...new Set(items.map((i) => i.mode))].sort();
    const isSameMode = modes.length === 1;
    clusters.push({
      type: 'correction-pattern',
      normalisedText: key,
      modes,
      itemIds: items.map((i) => i.id).sort(),
      count: items.length,
      classification: isSameMode ? 'SAME-CORRECTION-PATTERN' : 'CROSS-MODE-CORRECTION',
      skill,
      sampleModel: items[0].model || '',
    });
  }

  clusters.sort((a, b) => b.count - a.count || a.normalisedText.localeCompare(b.normalisedText));
  return clusters;
}

// ─── Cluster map builder (stable content-hashed IDs) ────────────────────────

function buildClusterMap(clusters) {
  const map = new Map();
  for (const cluster of clusters) {
    const clusterId = generateStableClusterId(cluster.itemIds, cluster.type);
    cluster.stableId = clusterId;
    for (const itemId of cluster.itemIds) {
      if (!map.has(itemId)) map.set(itemId, []);
      map.get(itemId).push(clusterId);
    }
  }
  return map;
}

// ─── Negative vector map builder ────────────────────────────────────────────

function buildNegativeVectorMap(vectors) {
  const map = new Map();
  for (const vec of vectors) {
    const itemId = vec.itemId;
    if (!itemId) continue;
    if (!map.has(itemId)) map.set(itemId, []);
    map.get(itemId).push(vec);
  }
  return map;
}

// ─── Summary output (fast, no per-item rendering) ───────────────────────────

function buildSummaryOutput(pool, { productionIds, itemDecisionMap, clusterDecisionMap, clusters }) {
  const states = { approved: 0, pending: 0, blocked: 0, unreviewed: 0 };
  const productionStates = { approved: 0, pending: 0, blocked: 0, unreviewed: 0 };
  const candidateStates = { approved: 0, pending: 0, blocked: 0, unreviewed: 0 };

  for (const item of pool) {
    const decision = itemDecisionMap.get(item.id);
    const isProduction = productionIds.has(item.id);
    const target = isProduction ? productionStates : candidateStates;

    if (!decision) {
      states.unreviewed++;
      target.unreviewed++;
    } else if (BLOCKING_DECISIONS.includes(decision.decision)) {
      states.blocked++;
      target.blocked++;
    } else if (decision.decision === 'pending') {
      states.pending++;
      target.pending++;
    } else {
      states.approved++;
      target.approved++;
    }
  }

  const clusterStates = { approved: 0, blocked: 0, unreviewed: 0 };
  for (const cluster of clusters) {
    const decision = clusterDecisionMap.get(cluster.stableId);
    if (!decision) {
      clusterStates.unreviewed++;
    } else if (BLOCKING_DECISIONS.includes(decision.decision)) {
      clusterStates.blocked++;
    } else {
      clusterStates.approved++;
    }
  }

  return {
    totalItems: pool.length,
    productionCount: pool.filter((i) => productionIds.has(i.id)).length,
    candidateCount: pool.filter((i) => !productionIds.has(i.id)).length,
    itemStates: states,
    productionStates,
    candidateStates,
    totalClusters: clusters.length,
    clusterStates,
  };
}

// ─── Markdown formatting ──────────────────────────────────────────────────────

function formatMarkdown(entries, clusters, meta) {
  const lines = [];

  lines.push('# Punctuation Reviewer QA Pack');
  lines.push('');
  lines.push(`Generated: ${meta.date}`);
  lines.push(`Mode: ${meta.mode}`);
  lines.push(`Depth: ${meta.depth} (production: ${meta.productionDepth})`);
  lines.push(`Total items: ${meta.totalItems} (fixed: ${meta.fixedCount}, generated: ${meta.generatedCount})`);
  lines.push(`Production: ${meta.productionCount} | Candidate-only: ${meta.candidateCount}`);
  lines.push('');

  // ─── Per-item catalogue ─────────────────────────────────────────────────────
  lines.push('## Item Catalogue');
  lines.push('');

  for (const entry of entries) {
    lines.push(`### ${entry.id}`);
    lines.push('');
    lines.push(`- **Source:** ${entry.source}`);
    lines.push(`- **Status:** ${entry.productionStatus}`);
    lines.push(`- **Mode:** ${entry.mode}`);
    lines.push(`- **Skills:** ${entry.skillIds.join(', ')}`);
    lines.push(`- **Reward unit:** ${entry.rewardUnitId}`);
    lines.push(`- **Prompt:** ${entry.prompt}`);
    if (entry.stem) lines.push(`- **Stem:** ${entry.stem}`);
    lines.push(`- **Model answer:** ${entry.model}`);

    // Choice options display
    if (entry.choiceOptions) {
      lines.push(`- **Choice options:**`);
      for (let i = 0; i < entry.choiceOptions.options.length; i++) {
        const marker = i === entry.choiceOptions.correctIndex ? ' [CORRECT]' : '';
        lines.push(`  - [${i}] ${entry.choiceOptions.options[i]}${marker}`);
      }
    }

    if (entry.accepted.length > 1) {
      lines.push(`- **Accepted alternatives:** ${entry.accepted.filter((a) => a !== entry.model).join(' | ')}`);
    }
    lines.push(`- **Explanation:** ${entry.explanation}`);

    // Explanation lint result
    lines.push(`- **Explanation lint:** ${entry.explanationLint.pass ? 'PASS' : 'FAIL'}`);
    if (!entry.explanationLint.pass && entry.explanationLint.violations.length) {
      for (const v of entry.explanationLint.violations) {
        lines.push(`  - ${v}`);
      }
    }

    lines.push(`- **Validator/rubric:** ${entry.validatorSummary}`);
    if (entry.misconceptionTags.length) {
      lines.push(`- **Misconception tags:** ${entry.misconceptionTags.join(', ')}`);
    }
    if (entry.readiness.length) {
      lines.push(`- **Readiness tags:** ${entry.readiness.join(', ')}`);
    }

    // Preservation contract
    if (entry.preservationTokens) {
      lines.push(`- **Preservation tokens:** ${entry.preservationTokens.join(' | ')}`);
    }

    lines.push(`- **Marking result:** ${entry.markingResultSummary}`);
    if (entry.alternativeMarkingResults.length) {
      lines.push(`- **Alternative marking:**`);
      for (const alt of entry.alternativeMarkingResults) {
        lines.push(`  - "${alt.answer}": ${markingResultSummary(alt.result)}`);
      }
    }
    if (entry.negativeExamples.length) {
      lines.push(`- **Negative examples (should fail):**`);
      for (const neg of entry.negativeExamples) {
        lines.push(`  - "${neg.answer}": ${markingResultSummary(neg.result)}`);
      }
    }
    if (entry.fixedNegativeVectors.length) {
      lines.push(`- **Fixed negative vectors:**`);
      for (const vec of entry.fixedNegativeVectors) {
        const status = vec.result.correct === vec.expectedCorrect ? 'OK' : 'MISMATCH';
        lines.push(`  - [${status}] "${vec.input}": ${markingResultSummary(vec.result)} (expected correct=${vec.expectedCorrect})`);
      }
    }
    if (entry.templateId) {
      lines.push(`- **Template ID:** ${entry.templateId}`);
      lines.push(`- **Variant signature:** ${entry.variantSignature}`);
      lines.push(`- **Generator family:** ${entry.generatorFamilyId}`);
    }
    if (entry.clusterIds.length) {
      lines.push(`- **Cluster IDs:** ${entry.clusterIds.join(', ')}`);
    }

    // Review status display
    if (entry.reviewerDecision) {
      const d = entry.reviewerDecision;
      lines.push(`- **Review status:** ${d.decision || 'unknown'}`);
      if (d.reviewer) lines.push(`  - Reviewer: ${d.reviewer}`);
      if (d.reviewedAt) lines.push(`  - Reviewed at: ${d.reviewedAt}`);
      if (d.rationale) lines.push(`  - Rationale: ${d.rationale}`);
    } else {
      lines.push(`- **Review status:** unreviewed`);
    }

    lines.push('');
  }

  // ─── Perceived-variety report ───────────────────────────────────────────────
  lines.push('## Perceived-Variety Report');
  lines.push('');

  const sameModeClusters = clusters.filter((c) => c.classification === 'SAME-MODE-DUPLICATE');
  const crossModeClusters = clusters.filter((c) => c.classification === 'CROSS-MODE-OVERLAP');

  lines.push(`Same-mode duplicate clusters: ${sameModeClusters.length}`);
  lines.push(`Cross-mode overlap clusters: ${crossModeClusters.length}`);
  lines.push('');

  if (sameModeClusters.length) {
    lines.push('### Same-Mode Duplicates (potential bugs)');
    lines.push('');
    for (const cluster of sameModeClusters) {
      const sample = cluster.sampleStem || cluster.sampleModel || cluster.normalisedText;
      lines.push(`- **[${cluster.type}]** "${sample}" (mode=${cluster.modes[0]}, ${cluster.count} items) ID: ${cluster.stableId}`);
      lines.push(`  Items: ${cluster.itemIds.join(', ')}`);
    }
    lines.push('');
  }

  if (crossModeClusters.length) {
    lines.push('### Cross-Mode Overlaps (reviewer decision)');
    lines.push('');
    for (const cluster of crossModeClusters) {
      const sample = cluster.sampleStem || cluster.sampleModel || cluster.normalisedText;
      lines.push(`- **[${cluster.type}]** "${sample}" (modes=${cluster.modes.join(',')}, ${cluster.count} items) ID: ${cluster.stableId}`);
      lines.push(`  Items: ${cluster.itemIds.join(', ')}`);
    }
    lines.push('');
  }

  if (!sameModeClusters.length && !crossModeClusters.length) {
    lines.push('No variety clusters detected — all items have unique stems and models.');
    lines.push('');
  }

  return lines.join('\n');
}

// ─── JSON output ──────────────────────────────────────────────────────────────

function buildJsonOutput(entries, clusters, meta) {
  return {
    _meta: meta,
    items: entries,
    perceivedVariety: {
      totalClusters: clusters.length,
      sameModeCount: clusters.filter((c) => c.classification === 'SAME-MODE-DUPLICATE').length,
      crossModeCount: clusters.filter((c) => c.classification === 'CROSS-MODE-OVERLAP').length,
      clusters,
    },
  };
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = new Set(argv);
  const outIndex = argv.indexOf('--out');
  const outPath = outIndex >= 0 && outIndex + 1 < argv.length ? argv[outIndex + 1] : null;

  const depthIndex = argv.indexOf('--depth');
  const depth = depthIndex >= 0 && depthIndex + 1 < argv.length
    ? Number(argv[depthIndex + 1])
    : null;

  const candidateDepthIndex = argv.indexOf('--candidate-depth');
  const candidateDepth = candidateDepthIndex >= 0 && candidateDepthIndex + 1 < argv.length
    ? Number(argv[candidateDepthIndex + 1])
    : null;

  return {
    json: args.has('--json'),
    outPath,
    depth: depth != null && Number.isFinite(depth) ? depth : null,
    includeDepth6: args.has('--include-depth-6'),
    candidateDepth: candidateDepth != null && Number.isFinite(candidateDepth) ? candidateDepth : null,
    summary: args.has('--summary'),
    onlyBlocked: args.has('--only-blocked'),
    onlyCandidates: args.has('--only-candidates'),
    onlyUnreviewed: args.has('--only-unreviewed'),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  const { pool, productionIds } = buildPool({
    depth: args.depth,
    includeDepth6: args.includeDepth6,
    candidateDepth: args.candidateDepth,
  });

  const clusters = buildVarietyClusters(pool);
  const clusterMap = buildClusterMap(clusters);
  const { itemDecisionMap, clusterDecisionMap } = loadDecisionsFile();
  const negativeVectors = loadNegativeVectors();
  const negativeVectorMap = buildNegativeVectorMap(negativeVectors);

  // ─── Summary mode (fast, no per-item rendering) ─────────────────────────────
  if (args.summary) {
    const summary = buildSummaryOutput(pool, { productionIds, itemDecisionMap, clusterDecisionMap, clusters });
    const effectiveDepth = args.depth ?? args.candidateDepth ?? (args.includeDepth6 ? 6 : PRODUCTION_DEPTH);
    const mode = args.depth != null
      ? `depth-${args.depth}-only`
      : args.candidateDepth != null
        ? `candidate-delta-${args.candidateDepth}`
        : args.includeDepth6
          ? 'inclusive-depth-6'
          : 'production';
    const output = {
      mode,
      depth: effectiveDepth,
      productionDepth: PRODUCTION_DEPTH,
      ...summary,
    };
    if (args.json || args.outPath) {
      const json = JSON.stringify(output, null, 2);
      if (args.outPath) {
        writeFileSync(args.outPath, json + '\n', 'utf8');
        process.stderr.write(`Summary written to ${args.outPath}\n`);
      } else {
        process.stdout.write(json + '\n');
      }
    } else {
      // Human-readable summary
      const lines = [
        '# Punctuation Reviewer Pack — Summary',
        '',
        `Mode: ${mode}`,
        `Production depth: ${PRODUCTION_DEPTH}`,
        '',
        `## Item counts`,
        `Total: ${summary.totalItems}`,
        `Production: ${summary.productionCount} | Candidates: ${summary.candidateCount}`,
        '',
        `## Decision states (all items)`,
        `Approved: ${summary.itemStates.approved}`,
        `Blocked: ${summary.itemStates.blocked}`,
        `Pending: ${summary.itemStates.pending}`,
        `Unreviewed: ${summary.itemStates.unreviewed}`,
        '',
        `## Production items`,
        `Approved: ${summary.productionStates.approved}`,
        `Blocked: ${summary.productionStates.blocked}`,
        `Pending: ${summary.productionStates.pending}`,
        `Unreviewed: ${summary.productionStates.unreviewed}`,
        '',
        `## Candidate items`,
        `Approved: ${summary.candidateStates.approved}`,
        `Blocked: ${summary.candidateStates.blocked}`,
        `Pending: ${summary.candidateStates.pending}`,
        `Unreviewed: ${summary.candidateStates.unreviewed}`,
        '',
        `## Cluster states`,
        `Total: ${summary.totalClusters}`,
        `Approved: ${summary.clusterStates.approved}`,
        `Blocked: ${summary.clusterStates.blocked}`,
        `Unreviewed: ${summary.clusterStates.unreviewed}`,
        '',
      ];
      process.stdout.write(lines.join('\n'));
    }
    return;
  }

  // ─── Full mode: build entries ─────────────────────────────────────────────────
  let entries = pool.map((item) => buildItemEntry(item, {
    productionIds,
    clusterMap,
    itemDecisionMap,
    negativeVectorMap,
  }));

  // ─── Apply filters ──────────────────────────────────────────────────────────
  if (args.onlyBlocked) {
    entries = entries.filter((e) =>
      e.reviewerDecision && BLOCKING_DECISIONS.includes(e.reviewerDecision.decision),
    );
  }

  if (args.onlyCandidates) {
    entries = entries.filter((e) => e.productionStatus === 'candidate-only');
  }

  if (args.onlyUnreviewed) {
    entries = entries.filter((e) => !e.reviewerDecision);
  }

  const effectiveDepth = args.depth ?? args.candidateDepth ?? (args.includeDepth6 ? 6 : PRODUCTION_DEPTH);
  const mode = args.depth != null
    ? `depth-${args.depth}-only`
    : args.candidateDepth != null
      ? `candidate-delta-${args.candidateDepth}`
      : args.includeDepth6
        ? 'inclusive-depth-6'
        : 'production';

  const meta = {
    generated: new Date().toISOString().slice(0, 10),
    date: new Date().toISOString().slice(0, 10),
    depth: effectiveDepth,
    productionDepth: PRODUCTION_DEPTH,
    mode,
    totalItems: pool.length,
    fixedCount: pool.filter((i) => i._source === 'fixed').length,
    generatedCount: pool.filter((i) => i._source === 'generated').length,
    productionCount: entries.filter((e) => e.productionStatus === 'production').length,
    candidateCount: entries.filter((e) => e.productionStatus === 'candidate-only').length,
    items_reviewed: pool.length,
    filteredCount: entries.length,
  };

  if (args.json || args.outPath) {
    const json = JSON.stringify(buildJsonOutput(entries, clusters, meta), null, 2);
    if (args.outPath) {
      writeFileSync(args.outPath, json + '\n', 'utf8');
      process.stderr.write(`QA pack written to ${args.outPath}\n`);
    } else {
      process.stdout.write(json + '\n');
    }
  } else {
    process.stdout.write(formatMarkdown(entries, clusters, meta));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

export { buildProductionPool, buildPool, buildItemEntry, buildVarietyClusters, buildClusterMap, buildNegativeVectorMap, buildSummaryOutput, normaliseForVariety };
