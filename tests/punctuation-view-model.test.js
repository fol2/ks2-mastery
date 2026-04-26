// Phase 3 U1 — Punctuation view-model pure-function assertions.
//
// These tests are the load-bearing assertion surface for the view-model half
// of U1. Every export from
// `src/subjects/punctuation/components/punctuation-view-model.js` is
// exercised here with a happy path, an edge case, and (where relevant) an
// error-path assertion. No SSR render. No React. Every fixture is a plain
// object so the file runs fast on `node --test` alone.
//
// Integration: subsequent Phase 3 JSX units (U2–U6) inherit the copy,
// filter-id, status-label, misconception-mapping, and forbidden-term
// contracts from this file rather than restating the rules inline.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ACTIVE_PUNCTUATION_MONSTER_DISPLAY_NAMES,
  ACTIVE_PUNCTUATION_MONSTER_IDS,
  PUNCTUATION_CHILD_FORBIDDEN_TERMS,
  PUNCTUATION_CLIENT_CLUSTER_TO_MONSTER,
  PUNCTUATION_DASHBOARD_HERO,
  PUNCTUATION_MAP_MONSTER_FILTER_IDS,
  PUNCTUATION_MAP_STATUS_FILTER_IDS,
  PUNCTUATION_PRIMARY_MODE_CARDS,
  PUNCTUATION_PRIMARY_MODE_IDS,
  PUNCTUATION_SKILL_MODAL_CONTENT,
  PUNCTUATION_SKILL_MODAL_PREFERRED_EXAMPLE,
  bellstormSceneForPhase,
  buildPunctuationDashboardModel,
  buildPunctuationMapModel,
  composeIsDisabled,
  currentItemInstruction,
  isPunctuationChildCopy,
  punctuationChildMisconceptionLabel,
  punctuationChildStatusLabel,
  punctuationFeedbackChips,
  punctuationMonsterAsset,
  punctuationMonsterDisplayName,
  punctuationPhaseLabel,
  punctuationPrimaryModeFromPrefs,
  punctuationSkillHasMultiSkillItems,
  punctuationSkillModalContent,
  punctuationSkillModalPreferredExample,
} from '../src/subjects/punctuation/components/punctuation-view-model.js';
import { MONSTERS_BY_SUBJECT } from '../src/platform/game/monsters.js';
import { PUNCTUATION_CLUSTERS, PUNCTUATION_ITEMS, PUNCTUATION_SKILLS } from '../shared/punctuation/content.js';

// ---------------------------------------------------------------------------
// composeIsDisabled (R11) — moved from PunctuationPracticeSurface.jsx in U1.
// ---------------------------------------------------------------------------

test('U1 view-model: composeIsDisabled returns false when availability ready', () => {
  assert.equal(composeIsDisabled({ availability: { status: 'ready' } }), false);
});

test('U1 view-model: composeIsDisabled returns true when availability degraded', () => {
  assert.equal(composeIsDisabled({ availability: { status: 'degraded' } }), true);
});

test('U1 view-model: composeIsDisabled returns true when availability unavailable', () => {
  assert.equal(composeIsDisabled({ availability: { status: 'unavailable' } }), true);
});

test('U1 view-model: composeIsDisabled returns true when pendingCommand set', () => {
  assert.equal(composeIsDisabled({ pendingCommand: true }), true);
});

test('U1 view-model: composeIsDisabled returns true when runtime.readOnly set', () => {
  assert.equal(composeIsDisabled({ runtime: { readOnly: true } }), true);
});

test('U1 view-model: composeIsDisabled defaults availability status to ready when missing', () => {
  // Null / empty UI — no availability key — must read as ready so the Setup
  // scene renders enabled controls on first boot.
  assert.equal(composeIsDisabled({}), false);
  assert.equal(composeIsDisabled(null), false);
  assert.equal(composeIsDisabled(undefined), false);
});

// ---------------------------------------------------------------------------
// PUNCTUATION_PRIMARY_MODE_CARDS + PUNCTUATION_PRIMARY_MODE_IDS
// ---------------------------------------------------------------------------

test('U1 view-model: PUNCTUATION_PRIMARY_MODE_IDS frozen at [smart, weak, gps]', () => {
  assert.deepEqual([...PUNCTUATION_PRIMARY_MODE_IDS], ['smart', 'weak', 'gps']);
  assert.equal(Object.isFrozen(PUNCTUATION_PRIMARY_MODE_IDS), true);
});

test('U1 view-model: PUNCTUATION_PRIMARY_MODE_CARDS has exactly three cards', () => {
  assert.equal(PUNCTUATION_PRIMARY_MODE_CARDS.length, 3);
  assert.deepEqual(
    PUNCTUATION_PRIMARY_MODE_CARDS.map((card) => card.id),
    ['smart', 'weak', 'gps'],
  );
});

test('U1 view-model: PUNCTUATION_PRIMARY_MODE_CARDS is deeply frozen', () => {
  assert.equal(Object.isFrozen(PUNCTUATION_PRIMARY_MODE_CARDS), true);
  for (const card of PUNCTUATION_PRIMARY_MODE_CARDS) {
    assert.equal(Object.isFrozen(card), true);
  }
});

test('U1 view-model: PUNCTUATION_PRIMARY_MODE_CARDS Smart Review carries Recommended badge', () => {
  const byId = Object.fromEntries(PUNCTUATION_PRIMARY_MODE_CARDS.map((card) => [card.id, card]));
  assert.equal(byId.smart.label, 'Smart Review');
  assert.equal(byId.smart.badge, 'Recommended');
  assert.equal(byId.weak.label, 'Wobbly Spots');
  assert.equal(byId.gps.label, 'GPS Check');
});

test('U1 view-model: PUNCTUATION_PRIMARY_MODE_CARDS labels + descriptions use only child copy', () => {
  for (const card of PUNCTUATION_PRIMARY_MODE_CARDS) {
    assert.equal(isPunctuationChildCopy(card.label), true, `label "${card.label}" leaks`);
    assert.equal(isPunctuationChildCopy(card.description), true, `description "${card.description}" leaks`);
  }
});

// ---------------------------------------------------------------------------
// PUNCTUATION_MAP_STATUS_FILTER_IDS + PUNCTUATION_MAP_MONSTER_FILTER_IDS
// ---------------------------------------------------------------------------

test('U1 view-model: PUNCTUATION_MAP_STATUS_FILTER_IDS ordered list matches plan', () => {
  assert.deepEqual(
    [...PUNCTUATION_MAP_STATUS_FILTER_IDS],
    ['all', 'new', 'learning', 'due', 'weak', 'secure'],
  );
  assert.equal(Object.isFrozen(PUNCTUATION_MAP_STATUS_FILTER_IDS), true);
});

test('U1 view-model: PUNCTUATION_MAP_MONSTER_FILTER_IDS contains only active roster', () => {
  assert.deepEqual(
    [...PUNCTUATION_MAP_MONSTER_FILTER_IDS],
    ['all', 'pealark', 'claspin', 'curlune', 'quoral'],
  );
  for (const reserved of ['colisk', 'hyphang', 'carillon']) {
    assert.equal(PUNCTUATION_MAP_MONSTER_FILTER_IDS.includes(reserved), false, `reserved ${reserved} leaked into filter`);
  }
});

// ---------------------------------------------------------------------------
// ACTIVE_PUNCTUATION_MONSTER_IDS — must match `MONSTERS_BY_SUBJECT.punctuation`
// order exactly (R10, learning #5).
// ---------------------------------------------------------------------------

test('U1 view-model: ACTIVE_PUNCTUATION_MONSTER_IDS matches MONSTERS_BY_SUBJECT.punctuation order', () => {
  assert.deepEqual(
    [...ACTIVE_PUNCTUATION_MONSTER_IDS],
    [...MONSTERS_BY_SUBJECT.punctuation],
  );
  assert.equal(ACTIVE_PUNCTUATION_MONSTER_IDS.length, 4);
});

test('U1 view-model: ACTIVE_PUNCTUATION_MONSTER_IDS never includes reserved trio', () => {
  for (const reserved of ['colisk', 'hyphang', 'carillon']) {
    assert.equal(ACTIVE_PUNCTUATION_MONSTER_IDS.includes(reserved), false, `reserved ${reserved} leaked`);
  }
});

test('U1 view-model: ACTIVE_PUNCTUATION_MONSTER_DISPLAY_NAMES covers every active id', () => {
  for (const id of ACTIVE_PUNCTUATION_MONSTER_IDS) {
    assert.equal(typeof ACTIVE_PUNCTUATION_MONSTER_DISPLAY_NAMES[id], 'string');
    assert.ok(ACTIVE_PUNCTUATION_MONSTER_DISPLAY_NAMES[id].length > 0, `missing display name for ${id}`);
  }
});

test('U1 view-model: punctuationMonsterDisplayName falls back to titlecase for unknown ids', () => {
  assert.equal(punctuationMonsterDisplayName('pealark'), 'Pealark');
  // Safe fallback: unknown monster ids still render as child-friendly text
  // rather than surface the raw kebab-case id.
  assert.equal(punctuationMonsterDisplayName('new_monster_id'), 'New Monster Id');
  assert.equal(punctuationMonsterDisplayName(''), '');
  assert.equal(punctuationMonsterDisplayName(null), '');
});

// ---------------------------------------------------------------------------
// PUNCTUATION_DASHBOARD_HERO
// ---------------------------------------------------------------------------

test('U1 view-model: PUNCTUATION_DASHBOARD_HERO has child-friendly copy', () => {
  assert.equal(PUNCTUATION_DASHBOARD_HERO.eyebrow, 'Bellstorm Coast');
  assert.equal(PUNCTUATION_DASHBOARD_HERO.headline, 'Punctuation practice');
  assert.equal(typeof PUNCTUATION_DASHBOARD_HERO.subtitle, 'string');
  assert.ok(PUNCTUATION_DASHBOARD_HERO.subtitle.length > 0);
  assert.equal(isPunctuationChildCopy(PUNCTUATION_DASHBOARD_HERO.eyebrow), true);
  assert.equal(isPunctuationChildCopy(PUNCTUATION_DASHBOARD_HERO.headline), true);
  assert.equal(isPunctuationChildCopy(PUNCTUATION_DASHBOARD_HERO.subtitle), true);
});

// ---------------------------------------------------------------------------
// PUNCTUATION_CHILD_FORBIDDEN_TERMS + isPunctuationChildCopy (R15)
// ---------------------------------------------------------------------------

test('U1 view-model: PUNCTUATION_CHILD_FORBIDDEN_TERMS contains the plan-specified adult terms', () => {
  for (const term of [
    'Worker',
    'Worker-held',
    'Worker-marked',
    'accepted',
    'correctIndex',
    'rubric',
    'validator',
    'generator',
    'rawGenerator',
    'mastery key',
    'facet weight',
    'publishedTotal',
    'denominator',
    'projection',
    'reward route',
    'read model',
    'supportLevel',
    'contextPack',
    'Context pack',
    'weakFocus',
    'hasEvidence',
    'subjectUi',
  ]) {
    assert.ok(
      PUNCTUATION_CHILD_FORBIDDEN_TERMS.includes(term),
      `expected PUNCTUATION_CHILD_FORBIDDEN_TERMS to include "${term}"`,
    );
  }
});

test('U1 view-model: PUNCTUATION_CHILD_FORBIDDEN_TERMS includes all 6 dotted-tag prefixes', () => {
  for (const prefix of ['speech.', 'comma.', 'boundary.', 'apostrophe.', 'structure.', 'endmarks.']) {
    assert.ok(
      PUNCTUATION_CHILD_FORBIDDEN_TERMS.includes(prefix),
      `expected dotted-tag prefix "${prefix}" in forbidden terms`,
    );
  }
});

test('U1 view-model: PUNCTUATION_CHILD_FORBIDDEN_TERMS contains the /\\bWorker\\b/i regex', () => {
  const hasWorkerRegex = PUNCTUATION_CHILD_FORBIDDEN_TERMS.some((term) => (
    term instanceof RegExp && /worker/i.test('Worker') && term.test('Worker')
  ));
  assert.equal(hasWorkerRegex, true, 'expected a /\\bWorker\\b/i regex entry');
});

test('U1 view-model: PUNCTUATION_CHILD_FORBIDDEN_TERMS is frozen', () => {
  assert.equal(Object.isFrozen(PUNCTUATION_CHILD_FORBIDDEN_TERMS), true);
});

test('U1 view-model: isPunctuationChildCopy rejects forbidden child terms case-insensitively', () => {
  assert.equal(isPunctuationChildCopy('Worker-held read model'), false);
  assert.equal(isPunctuationChildCopy('WORKER-HELD READ MODEL'), false);
  assert.equal(isPunctuationChildCopy('Context pack preview'), false);
  assert.equal(isPunctuationChildCopy('speech.quote_missing'), false, 'dotted prefix must be caught');
  assert.equal(isPunctuationChildCopy('comma.clarity_missing'), false);
});

test('U1 view-model: isPunctuationChildCopy accepts genuine child copy', () => {
  assert.equal(isPunctuationChildCopy('Keep the comma after the opener.'), true);
  assert.equal(isPunctuationChildCopy('Practise this skill next.'), true);
  assert.equal(isPunctuationChildCopy(''), true);
  assert.equal(isPunctuationChildCopy(null), true);
  assert.equal(isPunctuationChildCopy(undefined), true);
});

// ---------------------------------------------------------------------------
// punctuationChildStatusLabel (R2 copy)
// ---------------------------------------------------------------------------

test('U1 view-model: punctuationChildStatusLabel maps every known status', () => {
  assert.equal(punctuationChildStatusLabel('new'), 'New');
  assert.equal(punctuationChildStatusLabel('learning'), 'Learning');
  assert.equal(punctuationChildStatusLabel('due'), 'Due today');
  assert.equal(punctuationChildStatusLabel('weak'), 'Wobbly');
  assert.equal(punctuationChildStatusLabel('secure'), 'Secure');
});

test('U1 view-model: punctuationChildStatusLabel unknown status falls back to New', () => {
  assert.equal(punctuationChildStatusLabel('mystery-bucket'), 'New');
  assert.equal(punctuationChildStatusLabel(''), 'New');
  assert.equal(punctuationChildStatusLabel(null), 'New');
});

// ---------------------------------------------------------------------------
// punctuationChildMisconceptionLabel (R15) — the dotted-tag translator.
// ---------------------------------------------------------------------------

test('U1 view-model: punctuationChildMisconceptionLabel maps plan-specified tags', () => {
  // Happy-path mappings explicitly called out in the plan's Key Technical
  // Decisions section.
  assert.equal(punctuationChildMisconceptionLabel('speech.quote_missing'), 'Speech punctuation');
  assert.equal(punctuationChildMisconceptionLabel('speech.punctuation_outside_quote'), 'Speech punctuation');
  assert.equal(punctuationChildMisconceptionLabel('comma.clarity_missing'), 'Comma placement');
  assert.equal(punctuationChildMisconceptionLabel('comma.list_missing'), 'List commas');
  assert.equal(punctuationChildMisconceptionLabel('boundary.semicolon_missing'), 'Boundary punctuation');
  assert.equal(punctuationChildMisconceptionLabel('apostrophe.contraction_missing'), 'Apostrophes');
  assert.equal(punctuationChildMisconceptionLabel('apostrophe.possession_missing'), 'Apostrophes');
  assert.equal(punctuationChildMisconceptionLabel('endmarks.missing'), 'End punctuation');
  assert.equal(punctuationChildMisconceptionLabel('structure.fronted_missing'), 'Sentence structure');
});

test('U1 view-model: punctuationChildMisconceptionLabel returns null for unmapped tags', () => {
  // Caller hides the chip rather than rendering the raw dotted ID. U10's
  // forbidden-term sweep backstops any regression where the scene renders
  // the raw tag instead of the label.
  assert.equal(punctuationChildMisconceptionLabel('unknown.tag'), null);
  assert.equal(punctuationChildMisconceptionLabel(''), null);
  assert.equal(punctuationChildMisconceptionLabel(null), null);
});

test('U1 view-model: punctuationChildMisconceptionLabel output is child-safe', () => {
  // Every mapped label must itself pass the forbidden-term sweep, so a
  // future table edit cannot accidentally smuggle an adult term back in.
  const mappedTags = [
    'speech.quote_missing',
    'speech.punctuation_outside_quote',
    'speech.reporting_comma_missing',
    'comma.clarity_missing',
    'comma.list_missing',
    'comma.fronted_adverbial_missing',
    'boundary.semicolon_missing',
    'boundary.dash_missing',
    'boundary.hyphen_missing',
    'apostrophe.contraction_missing',
    'apostrophe.possession_missing',
    'apostrophe.required_forms_missing',
    'endmarks.missing',
    'endmarks.question_mark_missing',
    'structure.fronted_missing',
    'structure.parenthesis_missing',
    'structure.colon_missing',
    'structure.semicolon_list_missing',
    'structure.bullet_colon_missing',
  ];
  for (const tag of mappedTags) {
    const label = punctuationChildMisconceptionLabel(tag);
    assert.ok(label, `expected label for ${tag}`);
    assert.equal(isPunctuationChildCopy(label), true, `label "${label}" for tag "${tag}" leaks`);
  }
});

// ---------------------------------------------------------------------------
// punctuationFeedbackChips — uses existing friendly facet.label field.
// ---------------------------------------------------------------------------

test('U1 view-model: punctuationFeedbackChips empty input returns empty array', () => {
  assert.deepEqual(punctuationFeedbackChips([]), []);
  assert.deepEqual(punctuationFeedbackChips(null), []);
  assert.deepEqual(punctuationFeedbackChips(undefined), []);
  assert.deepEqual(punctuationFeedbackChips('not an array'), []);
});

test('U1 view-model: punctuationFeedbackChips caps at 2 child-friendly chips', () => {
  const chips = punctuationFeedbackChips([
    { id: 'quote_variant', ok: true, label: 'Matched inverted commas' },
    { id: 'speech_punctuation', ok: false, label: 'Speech punctuation inside the closing inverted comma' },
    { id: 'capitalisation', ok: true, label: 'Capital letters' },
  ]);
  assert.equal(chips.length, 2);
  assert.equal(chips[0].label, 'Matched inverted commas');
  assert.equal(chips[1].label, 'Speech punctuation inside the closing inverted comma');
  assert.equal(chips[0].ok, true);
  assert.equal(chips[1].ok, false);
});

test('U1 view-model: punctuationFeedbackChips skips facets missing a label', () => {
  // Facets with no friendly label are hidden, never rendered as the dotted
  // id. This pairs with U4's misconception-tag path (handled via
  // punctuationChildMisconceptionLabel).
  const chips = punctuationFeedbackChips([
    { id: 'quote_variant', ok: true, label: '' },
    { id: 'speech_punctuation', ok: false, label: 'Speech punctuation' },
  ]);
  assert.equal(chips.length, 1);
  assert.equal(chips[0].label, 'Speech punctuation');
});

// ---------------------------------------------------------------------------
// punctuationPrimaryModeFromPrefs (stale-prefs display normaliser)
// ---------------------------------------------------------------------------

test('U1 view-model: punctuationPrimaryModeFromPrefs collapses cluster modes to smart', () => {
  for (const legacy of ['endmarks', 'apostrophe', 'speech', 'comma_flow', 'boundary', 'structure', 'guided']) {
    assert.equal(
      punctuationPrimaryModeFromPrefs({ mode: legacy }),
      'smart',
      `legacy ${legacy} should collapse to smart`,
    );
  }
});

test('U1 view-model: punctuationPrimaryModeFromPrefs preserves primary modes', () => {
  assert.equal(punctuationPrimaryModeFromPrefs({ mode: 'smart' }), 'smart');
  assert.equal(punctuationPrimaryModeFromPrefs({ mode: 'weak' }), 'weak');
  assert.equal(punctuationPrimaryModeFromPrefs({ mode: 'gps' }), 'gps');
});

test('U1 view-model: punctuationPrimaryModeFromPrefs defaults to smart on missing/invalid', () => {
  assert.equal(punctuationPrimaryModeFromPrefs(null), 'smart');
  assert.equal(punctuationPrimaryModeFromPrefs(undefined), 'smart');
  assert.equal(punctuationPrimaryModeFromPrefs({}), 'smart');
  assert.equal(punctuationPrimaryModeFromPrefs({ mode: '' }), 'smart');
  assert.equal(punctuationPrimaryModeFromPrefs({ mode: 'not-a-mode' }), 'smart');
});

// ---------------------------------------------------------------------------
// PUNCTUATION_SKILL_MODAL_PREFERRED_EXAMPLE + helper
// ---------------------------------------------------------------------------

test('U1 view-model: PUNCTUATION_SKILL_MODAL_PREFERRED_EXAMPLE is frozen', () => {
  assert.equal(Object.isFrozen(PUNCTUATION_SKILL_MODAL_PREFERRED_EXAMPLE), true);
});

test('U1 view-model: punctuationSkillModalPreferredExample defaults to workedGood', () => {
  assert.equal(punctuationSkillModalPreferredExample('speech'), 'workedGood');
  assert.equal(punctuationSkillModalPreferredExample('sentence_endings'), 'workedGood');
  assert.equal(punctuationSkillModalPreferredExample(''), 'workedGood');
  assert.equal(punctuationSkillModalPreferredExample(null), 'workedGood');
});

test('U1 view-model: PUNCTUATION_SKILL_MODAL_PREFERRED_EXAMPLE explicitly overrides comma_clarity', () => {
  // Plan: `comma_clarity.contrastGood` is byte-for-byte identical to
  // `cc_insert_time_travellers.accepted[0]` — so default `workedGood` is
  // the safer choice and stays as the explicit override value.
  assert.equal(PUNCTUATION_SKILL_MODAL_PREFERRED_EXAMPLE.comma_clarity, 'workedGood');
  assert.equal(punctuationSkillModalPreferredExample('comma_clarity'), 'workedGood');
});

// ---------------------------------------------------------------------------
// bellstormSceneForPhase — extended to accept 'map'.
// ---------------------------------------------------------------------------

test('U1 view-model: bellstormSceneForPhase(map) returns a daily A-C scene', () => {
  const scene = bellstormSceneForPhase('map');
  assert.match(scene.name, /^bellstorm-coast-(cover|a1|b1|c1)$/, `map should return a daily scene, got ${scene.name}`);
  assert.match(scene.src, /\.webp$/);
  assert.match(scene.srcSet, /640w, .+ 1280w/);
});

test('U1 view-model: bellstormSceneForPhase preserves existing phase behaviour', () => {
  // Regression guard — existing react-punctuation-scene.test.js relies on
  // these names staying stable. Do not change without bumping that test.
  assert.equal(bellstormSceneForPhase('setup').name, 'bellstorm-coast-cover');
  assert.equal(bellstormSceneForPhase('active-item').name, 'bellstorm-coast-b1');
  assert.equal(bellstormSceneForPhase('feedback').name, 'bellstorm-coast-d2');
  assert.equal(bellstormSceneForPhase('summary').name, 'bellstorm-coast-e2');
  // Unknown phase falls back to setup cover.
  assert.equal(bellstormSceneForPhase('unknown').name, 'bellstorm-coast-cover');
  // Default (no argument) falls back to setup cover.
  assert.equal(bellstormSceneForPhase().name, 'bellstorm-coast-cover');
});

// ---------------------------------------------------------------------------
// punctuationPhaseLabel — extended for 'map'.
// ---------------------------------------------------------------------------

test('U1 view-model: punctuationPhaseLabel handles every phase including map', () => {
  assert.equal(punctuationPhaseLabel('active-item'), 'Practice');
  assert.equal(punctuationPhaseLabel('feedback'), 'Feedback');
  assert.equal(punctuationPhaseLabel('summary'), 'Summary');
  assert.equal(punctuationPhaseLabel('unavailable'), 'Unavailable');
  assert.equal(punctuationPhaseLabel('map'), 'Punctuation Map');
  assert.equal(punctuationPhaseLabel('setup'), 'Setup');
  assert.equal(punctuationPhaseLabel(), 'Setup');
});

// ---------------------------------------------------------------------------
// currentItemInstruction — regression guard on preserved behaviour.
// ---------------------------------------------------------------------------

test('U1 view-model: currentItemInstruction branches on inputKind/mode (regression guard)', () => {
  assert.equal(currentItemInstruction({ inputKind: 'choice' }), 'Choose the best sentence.');
  assert.equal(currentItemInstruction({ mode: 'transfer' }), 'Write one accurate sentence.');
  assert.equal(currentItemInstruction({ mode: 'combine' }), 'Combine the parts into one punctuated sentence.');
  assert.equal(currentItemInstruction({ mode: 'paragraph' }), 'Repair the whole passage.');
  assert.equal(currentItemInstruction({ mode: 'fix' }), 'Correct the sentence.');
  assert.equal(currentItemInstruction({}), 'Type the sentence with punctuation.');
});

// ---------------------------------------------------------------------------
// punctuationMonsterAsset — sanity on resolver passthrough.
// ---------------------------------------------------------------------------

test('U1 view-model: punctuationMonsterAsset returns a safe payload shape', () => {
  const asset = punctuationMonsterAsset('pealark', 0);
  assert.equal(asset.id, 'pealark');
  assert.equal(asset.stage, 0);
  assert.equal(typeof asset.src, 'string');
});

test('U1 view-model: punctuationMonsterAsset clamps stage to [0, 4]', () => {
  assert.equal(punctuationMonsterAsset('pealark', -5).stage, 0);
  assert.equal(punctuationMonsterAsset('pealark', 99).stage, 4);
  // NaN falls back to stage 0.
  assert.equal(punctuationMonsterAsset('pealark', 'abc').stage, 0);
});

// ---------------------------------------------------------------------------
// buildPunctuationDashboardModel
// ---------------------------------------------------------------------------

test('U1 view-model: buildPunctuationDashboardModel returns safe empty shape on null inputs', () => {
  const model = buildPunctuationDashboardModel(null, null, null);
  assert.equal(Array.isArray(model.todayCards), true);
  assert.equal(model.todayCards.length, 4);
  assert.equal(model.isEmpty, true);
  assert.equal(Array.isArray(model.activeMonsters), true);
  assert.equal(model.activeMonsters.length, 4);
  assert.equal(model.primaryMode, 'smart');
});

test('U1 view-model: buildPunctuationDashboardModel surfaces non-zero stats', () => {
  const stats = { due: 3, weak: 2, securedRewardUnits: 5, accuracy: 72 };
  const learner = { prefs: { mode: 'smart' } };
  const model = buildPunctuationDashboardModel(stats, learner, {});
  const byId = Object.fromEntries(model.todayCards.map((card) => [card.id, card]));
  assert.equal(byId.due.value, 3);
  assert.equal(byId.weak.value, 2);
  assert.equal(byId.secure.value, 5);
  assert.equal(byId.accuracy.value, 72);
  // Any non-zero today count flips isEmpty to false.
  assert.equal(model.isEmpty, false);
  assert.equal(model.primaryMode, 'smart');
});

test('U1 view-model: buildPunctuationDashboardModel activeMonsters iterate only the 4 active ids', () => {
  const rewardState = {
    pealark: { mastered: ['m1', 'm2'] },
    quoral: { mastered: ['m1'] },
    // Reserved monster smuggled into reward state — must NOT surface.
    colisk: { mastered: ['x1', 'x2', 'x3'] },
  };
  const model = buildPunctuationDashboardModel({}, null, rewardState);
  const ids = model.activeMonsters.map((entry) => entry.id);
  assert.deepEqual(ids, [...ACTIVE_PUNCTUATION_MONSTER_IDS]);
  for (const reserved of ['colisk', 'hyphang', 'carillon']) {
    assert.equal(ids.includes(reserved), false, `reserved ${reserved} leaked into activeMonsters`);
  }
  const byId = Object.fromEntries(model.activeMonsters.map((m) => [m.id, m]));
  assert.equal(byId.pealark.mastered, 2);
  assert.equal(byId.quoral.mastered, 1);
});

test('U1 view-model: buildPunctuationDashboardModel normalises stale cluster-mode prefs', () => {
  // Returning learners with a legacy cluster mode see the Smart Review card
  // as the pressed option; U2's scene migrates the stored value.
  const model = buildPunctuationDashboardModel(
    {},
    { prefs: { mode: 'endmarks' } },
    {},
  );
  assert.equal(model.primaryMode, 'smart');
});

// ---------------------------------------------------------------------------
// buildPunctuationMapModel (R2, R10)
// ---------------------------------------------------------------------------

const FOURTEEN_SKILL_ROWS = Object.freeze([
  { skillId: 'sentence_endings', name: 'Capital letters and sentence endings', clusterId: 'endmarks', status: 'secure', attempts: 12, accuracy: 92, mastery: 88, dueAt: 0 },
  { skillId: 'list_commas', name: 'Commas in lists', clusterId: 'comma_flow', status: 'learning', attempts: 4, accuracy: 75, mastery: 40, dueAt: 0 },
  { skillId: 'apostrophe_contractions', name: 'Apostrophes for contraction', clusterId: 'apostrophe', status: 'new', attempts: 0, accuracy: null, mastery: 0, dueAt: 0 },
  { skillId: 'apostrophe_possession', name: 'Apostrophes for possession', clusterId: 'apostrophe', status: 'weak', attempts: 6, accuracy: 45, mastery: 22, dueAt: 0 },
  { skillId: 'speech', name: 'Inverted commas and speech punctuation', clusterId: 'speech', status: 'learning', attempts: 3, accuracy: 66, mastery: 30, dueAt: 0 },
  { skillId: 'fronted_adverbial', name: 'Commas after fronted adverbials', clusterId: 'comma_flow', status: 'secure', attempts: 10, accuracy: 90, mastery: 80, dueAt: 0 },
  { skillId: 'parenthesis', name: 'Parenthesis with commas, brackets or dashes', clusterId: 'structure', status: 'due', attempts: 5, accuracy: 60, mastery: 35, dueAt: 1 },
  { skillId: 'comma_clarity', name: 'Commas for clarity', clusterId: 'comma_flow', status: 'new', attempts: 0, accuracy: null, mastery: 0, dueAt: 0 },
  { skillId: 'colon_list', name: 'Colon before a list', clusterId: 'structure', status: 'new', attempts: 0, accuracy: null, mastery: 0, dueAt: 0 },
  { skillId: 'semicolon', name: 'Semi-colons between related clauses', clusterId: 'boundary', status: 'new', attempts: 0, accuracy: null, mastery: 0, dueAt: 0 },
  { skillId: 'dash_clause', name: 'Dashes between related clauses', clusterId: 'boundary', status: 'new', attempts: 0, accuracy: null, mastery: 0, dueAt: 0 },
  { skillId: 'semicolon_list', name: 'Semi-colons within lists', clusterId: 'structure', status: 'new', attempts: 0, accuracy: null, mastery: 0, dueAt: 0 },
  { skillId: 'bullet_points', name: 'Punctuation of bullet points', clusterId: 'structure', status: 'new', attempts: 0, accuracy: null, mastery: 0, dueAt: 0 },
  { skillId: 'hyphen', name: 'Hyphens to avoid ambiguity', clusterId: 'boundary', status: 'new', attempts: 0, accuracy: null, mastery: 0, dueAt: 0 },
]);

// Plan-level mapping (matches `shared/punctuation/content.js` comment):
//   Pealark  : endmarks, speech, boundary
//   Claspin  : apostrophe
//   Curlune  : comma_flow, structure
//   Quoral   : grand aggregate
const CLUSTER_TO_MONSTER = Object.freeze({
  endmarks: 'pealark',
  speech: 'pealark',
  boundary: 'pealark',
  apostrophe: 'claspin',
  comma_flow: 'curlune',
  structure: 'curlune',
});

test('U1 view-model: buildPunctuationMapModel distributes 14 skills across 4 monsters', () => {
  const model = buildPunctuationMapModel(FOURTEEN_SKILL_ROWS, {}, CLUSTER_TO_MONSTER);
  const ids = model.monsters.map((m) => m.monsterId);
  assert.deepEqual(ids, [...ACTIVE_PUNCTUATION_MONSTER_IDS]);
  const totalSkills = model.monsters.reduce((sum, monster) => sum + monster.skills.length, 0);
  assert.equal(totalSkills, 14, `expected 14 skills total, got ${totalSkills}`);
});

test('U1 view-model: buildPunctuationMapModel filters reserved monsters out of output', () => {
  // Reserved monster entries smuggled into monsterState must NOT surface as a
  // group, even if the caller passes them.
  const poisonedState = {
    pealark: { mastered: ['a'] },
    colisk: { mastered: ['x', 'y'] },
    hyphang: { mastered: ['z'] },
  };
  const model = buildPunctuationMapModel(FOURTEEN_SKILL_ROWS, poisonedState, CLUSTER_TO_MONSTER);
  for (const reserved of ['colisk', 'hyphang', 'carillon']) {
    assert.equal(
      model.monsters.some((m) => m.monsterId === reserved),
      false,
      `reserved ${reserved} leaked into map model`,
    );
  }
});

test('U1 view-model: buildPunctuationMapModel maps status to child label on each skill', () => {
  const model = buildPunctuationMapModel(FOURTEEN_SKILL_ROWS, {}, CLUSTER_TO_MONSTER);
  for (const monster of model.monsters) {
    for (const skill of monster.skills) {
      // statusLabel should be the child-copy mapping of status.
      assert.equal(skill.statusLabel, punctuationChildStatusLabel(skill.status));
      // And must not expose any forbidden adult terms.
      assert.equal(isPunctuationChildCopy(skill.statusLabel), true, `skill ${skill.skillId} label "${skill.statusLabel}" leaks`);
    }
  }
});

test('U1 view-model: buildPunctuationMapModel handles skill with unknown cluster by routing to grand monster', () => {
  // A rogue row whose cluster maps to a reserved or unknown monster must not
  // disappear — it lands on the grand monster (quoral) so the 14-skill total
  // stays stable.
  const rows = [
    { skillId: 'phantom_skill', name: 'Phantom Skill', clusterId: 'unknown_cluster', status: 'new', attempts: 0 },
  ];
  const model = buildPunctuationMapModel(rows, {}, {});
  const quoralEntry = model.monsters.find((m) => m.monsterId === 'quoral');
  const placed = quoralEntry?.skills.some((skill) => skill.skillId === 'phantom_skill');
  assert.equal(placed, true, 'rogue skill must land on quoral (grand monster)');
});

test('U1 view-model: buildPunctuationMapModel output shape is frozen end-to-end', () => {
  const model = buildPunctuationMapModel(FOURTEEN_SKILL_ROWS, {}, CLUSTER_TO_MONSTER);
  assert.equal(Object.isFrozen(model), true);
  assert.equal(Object.isFrozen(model.monsters), true);
  for (const monster of model.monsters) {
    assert.equal(Object.isFrozen(monster), true);
    assert.equal(Object.isFrozen(monster.skills), true);
    for (const skill of monster.skills) {
      assert.equal(Object.isFrozen(skill), true);
    }
  }
});

// ---------------------------------------------------------------------------
// PUNCTUATION_CLIENT_CLUSTER_TO_MONSTER — drift guard against the Worker's
// canonical `PUNCTUATION_CLUSTERS.monsterId` table in
// `shared/punctuation/content.js`. The client mirror is forbidden from
// importing the shared content in the browser bundle (bundle-audit rule);
// tests allow the import so the mapping stays locked in step.
// ---------------------------------------------------------------------------

test('U5 drift: PUNCTUATION_CLIENT_CLUSTER_TO_MONSTER matches shared PUNCTUATION_CLUSTERS', () => {
  for (const cluster of PUNCTUATION_CLUSTERS) {
    const clientMapped = PUNCTUATION_CLIENT_CLUSTER_TO_MONSTER[cluster.id];
    assert.equal(
      clientMapped,
      cluster.monsterId,
      `client mirror drifted for cluster "${cluster.id}": expected "${cluster.monsterId}", got "${clientMapped}"`,
    );
  }
  // Also guard against the client mirror carrying any cluster id not present
  // in the shared canonical list.
  const canonicalIds = new Set(PUNCTUATION_CLUSTERS.map((cluster) => cluster.id));
  for (const clientId of Object.keys(PUNCTUATION_CLIENT_CLUSTER_TO_MONSTER)) {
    assert.ok(
      canonicalIds.has(clientId),
      `client mirror carries unknown cluster id "${clientId}"`,
    );
  }
});

// ---------------------------------------------------------------------------
// Pure-module safety: no React imports in the view-model file.
// ---------------------------------------------------------------------------

test('U1 safety: punctuation-view-model.js does not import react', async () => {
  const fs = await import('node:fs');
  const url = await import('node:url');
  const path = url.fileURLToPath(
    new URL('../src/subjects/punctuation/components/punctuation-view-model.js', import.meta.url),
  );
  const source = fs.readFileSync(path, 'utf8');
  assert.equal(/from ['"]react['"]/i.test(source), false);
  assert.equal(/require\(['"]react['"]\)/i.test(source), false);
});

// ---------------------------------------------------------------------------
// Round-2 maintainability LOW — drift guard between the skill-id list in
// `service-contract.js` (used by the normaliser + module handler) and the
// full skill metadata in `read-model.js` (used by the Map scene + selectors).
// A silent divergence would mean a Map entry exists without a validation
// counterpart, or vice versa — a class of bug the frozen lists were meant
// to prevent. One symmetric assertion keeps both files in lock-step.
// ---------------------------------------------------------------------------

test('U5 drift: PUNCTUATION_CLIENT_SKILL_IDS stays in lock-step with PUNCTUATION_CLIENT_SKILLS', async () => {
  const { PUNCTUATION_CLIENT_SKILL_IDS } = await import(
    '../src/subjects/punctuation/service-contract.js'
  );
  const { PUNCTUATION_CLIENT_SKILLS } = await import(
    '../src/subjects/punctuation/read-model.js'
  );
  assert.equal(
    PUNCTUATION_CLIENT_SKILL_IDS.length,
    PUNCTUATION_CLIENT_SKILLS.length,
    'skill-id list length diverged from skill metadata list',
  );
  const clientIds = new Set(PUNCTUATION_CLIENT_SKILLS.map((skill) => skill.id));
  for (const id of PUNCTUATION_CLIENT_SKILL_IDS) {
    assert.ok(
      clientIds.has(id),
      `${id} is in PUNCTUATION_CLIENT_SKILL_IDS but not in PUNCTUATION_CLIENT_SKILLS`,
    );
  }
  // Symmetric direction: every skill id in the read-model must also appear
  // in the validation list — otherwise a Map entry would render with no way
  // to ever be dispatched by a guarded handler.
  const contractIds = new Set(PUNCTUATION_CLIENT_SKILL_IDS);
  for (const skill of PUNCTUATION_CLIENT_SKILLS) {
    assert.ok(
      contractIds.has(skill.id),
      `${skill.id} is in PUNCTUATION_CLIENT_SKILLS but not in PUNCTUATION_CLIENT_SKILL_IDS`,
    );
  }
});

// ---------------------------------------------------------------------------
// U6 — PUNCTUATION_SKILL_MODAL_CONTENT drift against shared/punctuation/content.js
// ---------------------------------------------------------------------------
//
// Review-follower HIGH 1 relaxation. The client mirror intentionally diverges
// from the shared source on TWO axes:
//
//   1. `workedGood` + `contrastGood` — 6 skills had shared values that were
//      byte-for-byte identical to a `PUNCTUATION_ITEMS.accepted[*]` string
//      for that skill (plus `hyphen.contrastGood`). The Modal would leak
//      accepted answers before a Practise round. The mirror authors fresh
//      KS2-friendly examples that are disjoint from the item bank.
//   2. `rule` — 4 skills (semicolon, colon_list, dash_clause,
//      fronted_adverbial) had shared rules phrased in adult register
//      ("main clauses", "opening clause", "fronted adverbial"). The
//      mirror rewrites these in Year 3-5 child register.
//
// `contrastBad` stays canonical (the Learn tab's "Common mix-up" shows the
// specific pattern the marking engine also penalises — it must match the
// marking-side source exactly). The red-team disjoint test below replaces
// the blanket drift test for the two example fields + rule.

test('U6 drift: PUNCTUATION_SKILL_MODAL_CONTENT.contrastBad mirrors PUNCTUATION_SKILLS byte-for-byte', () => {
  // `contrastBad` stays canonical — the Learn tab's "Common mix-up" must
  // match the shared source (which the marking engine also consumes).
  for (const skill of PUNCTUATION_SKILLS) {
    const mirror = PUNCTUATION_SKILL_MODAL_CONTENT[skill.id];
    assert.ok(mirror, `client mirror missing entry for ${skill.id}`);
    assert.strictEqual(
      mirror.contrastBad,
      skill.contrastBad,
      `PUNCTUATION_SKILL_MODAL_CONTENT.${skill.id}.contrastBad drifted from shared/punctuation/content.js`,
    );
  }
});

test('U6 drift: PUNCTUATION_SKILL_MODAL_CONTENT.rule is non-empty, child-safe, and within reasonable length for every skill', () => {
  // The mirror's rule field may diverge from the shared source (child
  // register rewrite). But every rule must be non-empty, a plain string,
  // within a sensible length budget, and pass the forbidden-term filter so
  // no adult jargon leaks via this axis.
  for (const skill of PUNCTUATION_SKILLS) {
    const mirror = PUNCTUATION_SKILL_MODAL_CONTENT[skill.id];
    assert.ok(mirror, `client mirror missing entry for ${skill.id}`);
    assert.equal(typeof mirror.rule, 'string');
    assert.ok(mirror.rule.length > 0, `${skill.id}.rule must be non-empty`);
    assert.ok(mirror.rule.length <= 240, `${skill.id}.rule must fit KS2 reading budget`);
    assert.ok(
      isPunctuationChildCopy(mirror.rule),
      `${skill.id}.rule contains a forbidden term: ${JSON.stringify(mirror.rule)}`,
    );
  }
});

test('U6 red-team: PUNCTUATION_SKILL_MODAL_CONTENT example fields are disjoint from PUNCTUATION_ITEMS.accepted[*] for the owning skill', () => {
  // Review-follower HIGH 1 — the modal example fields (workedGood +
  // contrastGood) AND the common mix-up (contrastBad) must NOT be
  // byte-for-byte identical to any `accepted[*]` string from a
  // PUNCTUATION_ITEMS entry that includes this skill. Otherwise the Learn
  // tab leaks an accepted answer before the learner has attempted a
  // Practise round on it.
  for (const [skillId, mirror] of Object.entries(PUNCTUATION_SKILL_MODAL_CONTENT)) {
    const acceptedSet = new Set();
    for (const item of PUNCTUATION_ITEMS) {
      if (!Array.isArray(item.skillIds) || !item.skillIds.includes(skillId)) continue;
      if (!Array.isArray(item.accepted)) continue;
      for (const entry of item.accepted) acceptedSet.add(entry);
    }
    for (const field of ['workedGood', 'contrastGood', 'contrastBad']) {
      const value = mirror[field];
      assert.equal(typeof value, 'string');
      assert.ok(value.length > 0, `${skillId}.${field} must be non-empty`);
      assert.ok(
        !acceptedSet.has(value),
        `${skillId}.${field} ("${value}") leaks a PUNCTUATION_ITEMS.accepted[*] string — the Modal would render an accepted answer. Author a fresh KS2-friendly example.`,
      );
    }
  }
});

test('U6 drift: PUNCTUATION_SKILL_MODAL_CONTENT covers every published skill', () => {
  // Symmetric direction: no stale client entry whose source was removed.
  const sharedIds = new Set(PUNCTUATION_SKILLS.map((skill) => skill.id));
  for (const id of Object.keys(PUNCTUATION_SKILL_MODAL_CONTENT)) {
    assert.ok(
      sharedIds.has(id),
      `${id} is in PUNCTUATION_SKILL_MODAL_CONTENT but not in shared PUNCTUATION_SKILLS`,
    );
  }
  assert.equal(
    Object.keys(PUNCTUATION_SKILL_MODAL_CONTENT).length,
    PUNCTUATION_SKILLS.length,
    'client mirror count diverged from shared source',
  );
});

test('U6 drift: PUNCTUATION_SKILL_MODAL_CONTENT entries expose only 4 pedagogy keys', () => {
  // No other field (workedBad, phase, prereq, published, clusterId, name, id)
  // leaks into the modal mirror. Keeps the modal payload structurally
  // incapable of rendering an adult-surface key.
  const allowedKeys = new Set(['rule', 'workedGood', 'contrastGood', 'contrastBad']);
  for (const [id, entry] of Object.entries(PUNCTUATION_SKILL_MODAL_CONTENT)) {
    for (const key of Object.keys(entry)) {
      assert.ok(
        allowedKeys.has(key),
        `${id} exposes disallowed key "${key}" — modal must ship only rule + workedGood + contrastGood + contrastBad`,
      );
    }
  }
});

test('U6: punctuationSkillModalContent returns null for unknown ids', () => {
  assert.strictEqual(punctuationSkillModalContent(''), null);
  assert.strictEqual(punctuationSkillModalContent(null), null);
  assert.strictEqual(punctuationSkillModalContent('not_a_skill'), null);
});

test('U6: punctuationSkillModalContent returns the 4-field entry for a published skill', () => {
  const entry = punctuationSkillModalContent('speech');
  assert.ok(entry);
  assert.equal(typeof entry.rule, 'string');
  assert.equal(typeof entry.workedGood, 'string');
  assert.equal(typeof entry.contrastGood, 'string');
  assert.equal(typeof entry.contrastBad, 'string');
});

// ---------------------------------------------------------------------------
// U6 — punctuationSkillHasMultiSkillItems drift against PUNCTUATION_ITEMS.
// ---------------------------------------------------------------------------

test('U6 drift: punctuationSkillHasMultiSkillItems matches every multi-skill PUNCTUATION_ITEMS entry', () => {
  // Derive the expected set from the live shared source — every skill that
  // appears in an item with `skillIds.length > 1`. The helper must report
  // true for exactly that set and false for every other published skill.
  const expected = new Set();
  for (const item of PUNCTUATION_ITEMS) {
    if (Array.isArray(item.skillIds) && item.skillIds.length > 1) {
      for (const id of item.skillIds) expected.add(id);
    }
  }
  // Every skill in the expected set must return true.
  for (const id of expected) {
    assert.strictEqual(
      punctuationSkillHasMultiSkillItems(id),
      true,
      `${id} appears in a multi-skill PUNCTUATION_ITEMS entry but helper returned false`,
    );
  }
  // Every published skill NOT in the expected set must return false.
  for (const skill of PUNCTUATION_SKILLS) {
    if (expected.has(skill.id)) continue;
    assert.strictEqual(
      punctuationSkillHasMultiSkillItems(skill.id),
      false,
      `${skill.id} has no multi-skill PUNCTUATION_ITEMS entry but helper returned true`,
    );
  }
});

test('U6: punctuationSkillHasMultiSkillItems returns false for non-string / empty / unknown input', () => {
  assert.strictEqual(punctuationSkillHasMultiSkillItems(''), false);
  assert.strictEqual(punctuationSkillHasMultiSkillItems(null), false);
  assert.strictEqual(punctuationSkillHasMultiSkillItems(undefined), false);
  assert.strictEqual(punctuationSkillHasMultiSkillItems('not_a_skill'), false);
});
