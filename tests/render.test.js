import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import { installMemoryStorage } from './helpers/memory-storage.js';
import { SUBJECTS } from '../src/platform/core/subject-registry.js';
import { MONSTERS } from '../src/platform/game/monsters.js';
import { createAppHarness } from './helpers/app-harness.js';

test('spelling setup shows only caught-meadow or empty state', () => {
  const spellingHarness = createAppHarness({ storage: installMemoryStorage() });
  spellingHarness.dispatch('open-subject', { subjectId: 'spelling' });
  const spellingHtml = spellingHarness.render();
  /* The Codex Journal redesign dropped the in-setup full codex grid in favour
     of a compact caught-only meadow. A learner with no caught monsters sees
     the empty-state hint; the setup view never exposes uncaught placeholders
     or "Not caught" chips. */
  assert.doesNotMatch(spellingHtml, /monster-placeholder/);
  assert.doesNotMatch(spellingHtml, /Not caught/);
  assert.match(spellingHtml, /Catch your first monster to populate this meadow\./);
});

test('spelling setup renders pool choices without the legacy All label', () => {
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });
  harness.dispatch('open-subject', { subjectId: 'spelling' });
  const html = harness.render();

  assert.match(html, /aria-label="Spelling pool"/);
  assert.match(html, /data-pref="yearFilter" value="core"/);
  assert.match(html, /data-pref="yearFilter" value="extra"/);
  assert.match(html, />Core<\/span>/);
  assert.match(html, />Extra<\/span>/);
  assert.doesNotMatch(html, />All<\/span>/);
  assert.doesNotMatch(html, /Year group/);
});

test('home meadow shows an egg only once a species has been caught and hides uncaught species entirely', async () => {
  const { buildMeadowMonsters } = await import('../src/surfaces/home/data.js');
  const summary = [
    { monster: { id: 'inklet', name: 'Inklet' }, progress: { caught: true, stage: 0, branch: 'b1' } },
    { monster: { id: 'glimmerbug', name: 'Glimmerbug' }, progress: { caught: true, stage: 1, branch: 'b1' } },
    { monster: { id: 'phaeton', name: 'Phaeton' }, progress: { caught: false, stage: 0, branch: 'b1' } },
    { monster: { id: 'vellhorn', name: 'Vellhorn' }, progress: { caught: false, stage: 0, branch: 'b1' } },
  ];
  const meadow = buildMeadowMonsters(summary);

  const inklet = meadow.find((entry) => entry.species === 'inklet');
  const glimmerbug = meadow.find((entry) => entry.species === 'glimmerbug');
  const phaeton = meadow.find((entry) => entry.species === 'phaeton');
  const vellhorn = meadow.find((entry) => entry.species === 'vellhorn');

  assert.equal(inklet.stage, 0);
  assert.equal(inklet.path, 'none');
  assert.equal(glimmerbug.stage, 1);
  assert.notEqual(glimmerbug.path, 'none');
  assert.equal(phaeton, undefined);
  assert.equal(vellhorn, undefined);
});

test('home meadow shows all eggs once every species has been caught but stays in stage zero', async () => {
  const { buildMeadowMonsters } = await import('../src/surfaces/home/data.js');
  const summary = [
    { monster: { id: 'inklet', name: 'Inklet' }, progress: { caught: true, stage: 0, branch: 'b1' } },
    { monster: { id: 'glimmerbug', name: 'Glimmerbug' }, progress: { caught: true, stage: 0, branch: 'b1' } },
    { monster: { id: 'phaeton', name: 'Phaeton' }, progress: { caught: true, stage: 0, branch: 'b1' } },
    { monster: { id: 'vellhorn', name: 'Vellhorn' }, progress: { caught: true, stage: 0, branch: 'b1' } },
  ];
  const meadow = buildMeadowMonsters(summary);

  assert.equal(meadow.length, 4);
  for (const entry of meadow) {
    assert.equal(entry.stage, 0);
    assert.equal(entry.path, 'none');
  }
});

test('home meadow uses seeded random foot positions for eggs', async () => {
  const { buildMeadowMonsters } = await import('../src/surfaces/home/data.js');
  const summary = [
    { monster: { id: 'inklet', name: 'Inklet' }, progress: { caught: true, stage: 0, branch: 'b1' } },
    { monster: { id: 'glimmerbug', name: 'Glimmerbug' }, progress: { caught: true, stage: 0, branch: 'b1' } },
    { monster: { id: 'phaeton', name: 'Phaeton' }, progress: { caught: true, stage: 0, branch: 'b1' } },
    { monster: { id: 'vellhorn', name: 'Vellhorn' }, progress: { caught: true, stage: 0, branch: 'b1' } },
  ];
  const meadow = buildMeadowMonsters(summary, { seed: 'eggs-a' });
  const repeated = buildMeadowMonsters(summary, { seed: 'eggs-a' });
  const alternate = buildMeadowMonsters(summary, { seed: 'eggs-b' });

  assert.deepEqual(meadow.map((entry) => [entry.species, entry.x, entry.footY]), repeated.map((entry) => [entry.species, entry.x, entry.footY]));
  assert.notDeepEqual(meadow.map((entry) => entry.x), alternate.map((entry) => entry.x));
  assert.ok(meadow.every((entry) => entry.leftPct >= 25 && entry.leftPct <= 82));
  assert.ok(meadow.every((entry) => entry.footPct >= 60 && entry.footPct <= 82));
  assertMeadowSpacing(meadow);
});

test('home meadow scales mature monsters while preserving path-specific lanes', async () => {
  const { buildMeadowMonsters } = await import('../src/surfaces/home/data.js');
  const stageSamples = [0, 1, 2, 3, 4].map((stage) => buildMeadowMonsters([
    { monster: { id: 'inklet', name: 'Inklet' }, progress: { caught: true, stage, branch: 'b1' } },
  ], { seed: `codex-stage-${stage}` })[0]);
  const lowStage = buildMeadowMonsters([
    { monster: { id: 'inklet', name: 'Inklet' }, progress: { caught: true, stage: 1, branch: 'b1' } },
    { monster: { id: 'glimmerbug', name: 'Glimmerbug' }, progress: { caught: true, stage: 1, branch: 'b1' } },
    { monster: { id: 'phaeton', name: 'Phaeton' }, progress: { caught: true, stage: 1, branch: 'b1' } },
    { monster: { id: 'vellhorn', name: 'Vellhorn' }, progress: { caught: true, stage: 1, branch: 'b1' } },
  ]);
  const highStage = buildMeadowMonsters([
    { monster: { id: 'inklet', name: 'Inklet' }, progress: { caught: true, stage: 4, branch: 'b1' } },
    { monster: { id: 'glimmerbug', name: 'Glimmerbug' }, progress: { caught: true, stage: 4, branch: 'b1' } },
    { monster: { id: 'phaeton', name: 'Phaeton' }, progress: { caught: true, stage: 4, branch: 'b1' } },
    { monster: { id: 'vellhorn', name: 'Vellhorn' }, progress: { caught: true, stage: 4, branch: 'b1' } },
  ]);

  assert.deepEqual(stageSamples.map((entry) => entry.codexSize), [252, 364, 476, 588, 700]);
  assert.deepEqual(stageSamples.map((entry) => entry.stageScale), [0.36, 0.52, 0.68, 0.84, 1]);
  for (const species of ['inklet', 'glimmerbug', 'phaeton', 'vellhorn']) {
    assert.ok(highStage.find((entry) => entry.species === species).size > lowStage.find((entry) => entry.species === species).size);
  }
  const inklet = highStage.find((entry) => entry.species === 'inklet');
  const glimmerbug = highStage.find((entry) => entry.species === 'glimmerbug');
  const phaeton = highStage.find((entry) => entry.species === 'phaeton');
  const vellhorn = highStage.find((entry) => entry.species === 'vellhorn');

  assert.equal(inklet.lane, 'ground');
  assert.equal(glimmerbug.lane, 'air');
  assert.equal(phaeton.lane, 'air');
  assert.equal(vellhorn.lane, 'ground');
  assert.ok(inklet.size > phaeton.size);
  assert.ok(phaeton.size > 0);
  assert.ok(glimmerbug.size > 0);
  assert.ok(vellhorn.size > 0);
  assertMeadowSpacing(highStage);
});

test('home meadow hides every species for a fresh learner with nothing caught yet', async () => {
  const { buildMeadowMonsters } = await import('../src/surfaces/home/data.js');
  const summary = [
    { monster: { id: 'inklet', name: 'Inklet' }, progress: { caught: false, stage: 0, branch: 'b1' } },
    { monster: { id: 'glimmerbug', name: 'Glimmerbug' }, progress: { caught: false, stage: 0, branch: 'b1' } },
    { monster: { id: 'phaeton', name: 'Phaeton' }, progress: { caught: false, stage: 0, branch: 'b1' } },
    { monster: { id: 'vellhorn', name: 'Vellhorn' }, progress: { caught: false, stage: 0, branch: 'b1' } },
  ];
  assert.equal(buildMeadowMonsters(summary).length, 0);
});

function assertMeadowSpacing(entries) {
  for (let leftIndex = 0; leftIndex < entries.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < entries.length; rightIndex += 1) {
      const left = entries[leftIndex];
      const right = entries[rightIndex];
      const dx = left.leftPct - right.leftPct;
      const dy = (left.footPct - right.footPct) * 1.45;
      const hasMonster = left.path !== 'none' || right.path !== 'none';
      const minimum = hasMonster ? 30 : 17;
      assert.ok(Math.hypot(dx, dy) >= minimum);
    }
  }
}

test('hero background rotation includes the new Scribe Downs landscapes', async () => {
  const { REGION_BACKGROUND_URLS } = await import('../src/surfaces/home/data.js');

  for (const prefix of ['c', 'd']) {
    for (const index of [1, 2, 3]) {
      const expectedUrl = `/assets/regions/the-scribe-downs/the-scribe-downs-${prefix}${index}.1280.webp`;
      assert.ok(REGION_BACKGROUND_URLS.includes(expectedUrl));
    }
  }
  for (const url of REGION_BACKGROUND_URLS) {
    assert.doesNotMatch(url, /the-scribe-downs-bg-/);
  }
});

test('hero background rotation only references existing image assets', async () => {
  const { REGION_BACKGROUND_URLS } = await import('../src/surfaces/home/data.js');

  for (const url of REGION_BACKGROUND_URLS) {
    assert.ok(
      existsSync(new URL(`../${url.replace(/^\//, '')}`, import.meta.url)),
      `${url} should exist`,
    );
  }
});

test('spelling setup and session hero backgrounds use mode-specific Scribe Downs assets', async () => {
  const {
    MODE_CARDS,
    SPELLING_HERO_BACKGROUNDS,
    heroBgForMode,
    heroContrastProfileForBg,
    heroBgPreloadUrls,
    heroBgForSession,
    spellingHeroTone,
    spellingHeroToneForSessionProgress,
  } = await import('../src/subjects/spelling/components/spelling-view-model.js');

  const learnerId = 'learner-1';
  const tone = spellingHeroTone(learnerId);
  assert.ok(SPELLING_HERO_BACKGROUNDS.smart.includes(heroBgForMode('smart', learnerId)));
  assert.match(heroBgForMode('smart', learnerId), new RegExp(`/the-scribe-downs-[abc]${tone}\\.1280\\.webp$`));
  assert.equal(heroBgForMode('trouble', learnerId), `/assets/regions/the-scribe-downs/the-scribe-downs-d${tone}.1280.webp`);
  assert.equal(heroBgForMode('test', learnerId), `/assets/regions/the-scribe-downs/the-scribe-downs-e${tone}.1280.webp`);
  assert.equal(heroBgForSession(learnerId, { mode: 'trouble' }), '/assets/regions/the-scribe-downs/the-scribe-downs-d1.1280.webp');
  assert.equal(heroBgForSession('learner-1', { mode: 'test' }), '/assets/regions/the-scribe-downs/the-scribe-downs-e1.1280.webp');
  assert.equal(heroBgForSession('learner-1', { mode: 'test', progress: { done: 6, total: 20 } }), '/assets/regions/the-scribe-downs/the-scribe-downs-e2.1280.webp');
  assert.equal(heroBgForSession('learner-1', { mode: 'test', progress: { done: 13, total: 20 } }), '/assets/regions/the-scribe-downs/the-scribe-downs-e3.1280.webp');
  assert.equal(heroBgForSession('learner-1', { mode: 'test', progress: { done: 20, total: 20 } }, { complete: true }), '/assets/regions/the-scribe-downs/the-scribe-downs-e3.1280.webp');
  assert.equal(spellingHeroToneForSessionProgress({ progress: { done: 5, total: 20 } }), '1');
  assert.equal(spellingHeroToneForSessionProgress({ progress: { done: 6, total: 20 } }), '2');
  assert.equal(spellingHeroToneForSessionProgress({ progress: { done: 13, total: 20 } }), '3');
  assert.equal(spellingHeroTone('learner-0'), '2');
  assert.match(heroBgForMode('smart', 'learner-0'), /the-scribe-downs-[abc]2\.1280\.webp$/);
  assert.match(heroBgForSession('learner-0', { mode: 'smart' }), /the-scribe-downs-[abc]1\.1280\.webp$/);
  const learnerOnePreloads = [
    heroBgForMode('smart', 'learner-1'),
    heroBgForMode('trouble', 'learner-1'),
    heroBgForMode('test', 'learner-1'),
    heroBgForMode('test', 'learner-1', { tone: '2' }),
    heroBgForMode('test', 'learner-1', { tone: '3' }),
  ];
  assert.deepEqual(heroBgPreloadUrls('learner-1', { mode: 'test' }), learnerOnePreloads);
  assert.deepEqual(heroBgPreloadUrls('learner-0', { mode: 'test' }), [
    heroBgForMode('smart', 'learner-0'),
    heroBgForMode('trouble', 'learner-0'),
    heroBgForMode('test', 'learner-0'),
    heroBgForSession('learner-0', { mode: 'test' }),
    heroBgForMode('test', 'learner-0', { tone: '3' }),
  ]);
  assert.deepEqual(heroContrastProfileForBg('/assets/regions/the-scribe-downs/the-scribe-downs-a1.1280.webp', 'smart'), {
    tone: '1',
    shell: 'dark',
    controls: 'dark',
    cards: ['dark', 'dark', 'dark'],
  });
  assert.deepEqual(heroContrastProfileForBg('/assets/regions/the-scribe-downs/the-scribe-downs-c2.1280.webp', 'smart'), {
    tone: '2',
    shell: 'light',
    controls: 'light',
    cards: ['light', 'light', 'light'],
  });
  assert.deepEqual(heroContrastProfileForBg('/assets/regions/the-scribe-downs/the-scribe-downs-d3.1280.webp', 'trouble'), {
    tone: '3',
    shell: 'light',
    controls: 'light',
    cards: ['light', 'light', 'light'],
  });
  assert.equal(heroContrastProfileForBg('/assets/regions/the-scribe-downs/the-scribe-downs-bg-a1.1280.webp', 'smart'), null);

  for (const urls of Object.values(SPELLING_HERO_BACKGROUNDS)) {
    for (const url of urls) {
      assert.doesNotMatch(url, /the-scribe-downs-bg-/);
      assert.ok(
        existsSync(new URL(`../${url.replace(/^\//, '')}`, import.meta.url)),
        `${url} should exist`,
      );
    }
  }

  for (const card of MODE_CARDS) {
    assert.ok(
      existsSync(new URL(`../${card.iconSrc.replace(/^\//, '')}`, import.meta.url)),
      `${card.iconSrc} should exist`,
    );
  }
});

test('home subject cards use the region cover banners', async () => {
  const { buildSubjectCards } = await import('../src/surfaces/home/data.js');
  const cardsById = Object.fromEntries(buildSubjectCards(SUBJECTS).map((card) => [card.id, card]));

  assert.deepEqual(
    Object.fromEntries(Object.entries(cardsById).map(([id, card]) => [id, {
      eyebrow: card.eyebrow,
      regionBase: card.regionBase,
    }])),
    {
      spelling: {
        eyebrow: 'The Scribe Downs',
        regionBase: '/assets/regions/the-scribe-downs/the-scribe-downs-cover',
      },
      arithmetic: {
        eyebrow: 'The Prism Steps',
        regionBase: '/assets/regions/prism-steps/prism-steps-cover',
      },
      reasoning: {
        eyebrow: 'Paradox Spires',
        regionBase: '/assets/regions/paradox-spires/paradox-spires-cover',
      },
      grammar: {
        eyebrow: 'The Clause Conservatory',
        regionBase: '/assets/regions/the-clause-conservatory/the-clause-conservatory-cover',
      },
      punctuation: {
        eyebrow: 'Bellstorm Coast',
        regionBase: '/assets/regions/bellstorm-coast/bellstorm-coast-cover',
      },
      reading: {
        eyebrow: 'The Moonleaf Archive',
        regionBase: '/assets/regions/the-moonleaf-archive/the-moonleaf-archive-cover',
      },
    },
  );
});

test('codex entries show fresh creatures as unknown and caught stage-zero creatures as eggs', async () => {
  const { buildCodexEntries } = await import('../src/surfaces/home/data.js');
  const [fresh, egg] = buildCodexEntries([
    { monster: MONSTERS.inklet, progress: { caught: false, mastered: 0, stage: 0, level: 0, branch: 'b1' } },
    { monster: MONSTERS.glimmerbug, progress: { caught: true, mastered: 1, stage: 0, level: 0, branch: 'b2' } },
  ]);

  assert.equal(fresh.displayState, 'fresh');
  assert.equal(fresh.placeholder, '?');
  assert.equal(fresh.img, null);
  assert.equal(fresh.name, 'Unknown creature');

  assert.equal(egg.displayState, 'egg');
  assert.equal(egg.stageLabel, 'Egg');
  assert.equal(egg.secureLabel, '1 secure word');
  assert.equal(egg.nextGoal, 'Keep securing words for the next change');
  assert.match(egg.img, /glimmerbug-b2-0\.640\.webp/);
});

test('codex progress copy omits total and remaining counts', async () => {
  const { buildCodexEntries } = await import('../src/surfaces/home/data.js');
  const [fresh, egg, extra] = buildCodexEntries([
    { monster: MONSTERS.inklet, progress: { caught: false, mastered: 0, stage: 0, level: 0, branch: 'b1' } },
    { monster: MONSTERS.phaeton, progress: { caught: true, mastered: 3, stage: 0, level: 0, branch: 'b1' } },
    { monster: MONSTERS.vellhorn, progress: { caught: true, mastered: 1, stage: 0, level: 0, branch: 'b2' } },
  ]);

  assert.equal(fresh.secureLabel, 'No secure words yet');
  assert.equal(fresh.nextGoal, 'Secure words to catch this creature');
  assert.equal(egg.name, 'Phaeton');
  assert.equal(egg.stageLabel, 'Egg');
  assert.equal(egg.secureLabel, '3 secure words');
  assert.equal(egg.nextGoal, 'Keep securing words for the next change');
  assert.doesNotMatch(egg.secureLabel, /\//);
  assert.doesNotMatch(egg.nextGoal, /^\d/);
  assert.equal(extra.wordBand, 'Extra spellings');
  assert.match(extra.img, /vellhorn-b2-0\.640\.webp/);
  assert.match(extra.srcSet, /vellhorn-b2-0\.1280\.webp 1280w/);
});

test('egg breath styles are stable while offsetting different creatures', async () => {
  const { eggBreatheStyle } = await import('../src/surfaces/home/data.js');
  const inklet = { id: 'inklet', branch: 'b1', stage: 0 };
  const glimmerbug = { id: 'glimmerbug', branch: 'b2', stage: 0 };

  assert.deepEqual(eggBreatheStyle(inklet), eggBreatheStyle(inklet));
  assert.notDeepEqual(eggBreatheStyle(inklet), eggBreatheStyle(glimmerbug));
  assert.match(eggBreatheStyle(inklet)['--egg-breathe-duration'], /^\d+\.\d{2}s$/);
  assert.match(eggBreatheStyle(inklet)['--egg-breathe-delay'], /^-\d+\.\d{2}s$/);
});

test('monster motion styles slow down as codex stages mature', async () => {
  const { monsterMotionStyle } = await import('../src/surfaces/home/data.js');
  const kid = { id: 'inklet', branch: 'b1', stage: 1 };
  const mega = { id: 'phaeton', branch: 'b1', stage: 4 };

  assert.deepEqual(monsterMotionStyle(kid), monsterMotionStyle(kid));
  assert.ok(parseFloat(monsterMotionStyle(kid)['--monster-float-duration']) < 4.2);
  assert.ok(parseFloat(monsterMotionStyle(mega)['--monster-float-duration']) >= 7.6);
  assert.ok(parseFloat(monsterMotionStyle(mega)['--monster-float-scale-a']) > 1.02);
  assert.notEqual(monsterMotionStyle(kid)['--monster-float-pan-a'], monsterMotionStyle(mega)['--monster-float-pan-a']);
});

test('codex hero favours the most powerful caught creature and uses species priority at equal level', async () => {
  const { buildCodexEntries, pickFeaturedCodexEntry } = await import('../src/surfaces/home/data.js');
  const entries = buildCodexEntries([
    { monster: MONSTERS.inklet, progress: { caught: true, mastered: 4, stage: 0, level: 0, branch: 'b1' } },
    { monster: MONSTERS.glimmerbug, progress: { caught: true, mastered: 4, stage: 0, level: 0, branch: 'b1' } },
    { monster: MONSTERS.phaeton, progress: { caught: true, mastered: 4, stage: 0, level: 0, branch: 'b1' } },
    { monster: MONSTERS.vellhorn, progress: { caught: true, mastered: 4, stage: 0, level: 0, branch: 'b1' } },
  ]);

  assert.equal(pickFeaturedCodexEntry(entries).id, 'vellhorn');
});

test('codex hero uses the highest-priority unknown creature for a fresh profile', async () => {
  const { buildCodexEntries, pickFeaturedCodexEntry } = await import('../src/surfaces/home/data.js');
  const entries = buildCodexEntries([
    { monster: MONSTERS.inklet, progress: { caught: false, mastered: 0, stage: 0, level: 0, branch: 'b1' } },
    { monster: MONSTERS.glimmerbug, progress: { caught: false, mastered: 0, stage: 0, level: 0, branch: 'b1' } },
    { monster: MONSTERS.phaeton, progress: { caught: false, mastered: 0, stage: 0, level: 0, branch: 'b1' } },
    { monster: MONSTERS.vellhorn, progress: { caught: false, mastered: 0, stage: 0, level: 0, branch: 'b1' } },
  ]);
  const featured = pickFeaturedCodexEntry(entries);

  // Synthesised punctuation/grammar entries also land in the roster, but
  // pickFeaturedCodexEntry tie-breaks by subject priority for uncaught learners
  // so spelling stays the on-ramp; vellhorn wins as highest spelling rank.
  assert.equal(featured.id, 'vellhorn');
  assert.equal(featured.displayState, 'fresh');
  assert.equal(featured.placeholder, '?');
});

test('codex synthesises uncaught entries for every registered subject monster', async () => {
  const { buildCodexEntries } = await import('../src/surfaces/home/data.js');
  const entries = buildCodexEntries([
    { monster: MONSTERS.inklet, progress: { caught: true, mastered: 4, stage: 0, level: 0, branch: 'b1' } },
  ]);

  const ids = entries.map((entry) => entry.id);
  assert.equal(entries.length, 18, 'expected full 4 spelling + 7 punctuation + 7 grammar roster');
  assert.ok(ids.includes('bracehart'), 'grammar lead synthesised');
  assert.ok(ids.includes('concordium'), 'grammar legendary synthesised');
  assert.ok(ids.includes('pealark'), 'punctuation lead synthesised');

  const grammarEgg = entries.find((entry) => entry.id === 'bracehart');
  assert.equal(grammarEgg.caught, false);
  assert.equal(grammarEgg.displayState, 'fresh');
  assert.equal(grammarEgg.subjectId, 'grammar');
  assert.equal(grammarEgg.secureLabel, 'No secure units yet');
  assert.equal(grammarEgg.wordBand, 'Sentence and clause');
  assert.equal(grammarEgg.nextGoal, 'Secure grammar units to catch this creature');
});

test('codex subject groups arrive in spelling → punctuation → grammar order with totals', async () => {
  const { buildCodexEntries, buildCodexSubjectGroups } = await import('../src/surfaces/home/data.js');
  const entries = buildCodexEntries([
    { monster: MONSTERS.inklet, progress: { caught: true, mastered: 4, stage: 1, level: 1, branch: 'b1' } },
    { monster: MONSTERS.glimmerbug, progress: { caught: true, mastered: 1, stage: 0, level: 0, branch: 'b2' } },
  ]);
  const groups = buildCodexSubjectGroups(entries);

  assert.deepEqual(
    groups.map((group) => group.subjectId),
    ['spelling', 'punctuation', 'grammar'],
  );

  const spelling = groups.find((group) => group.subjectId === 'spelling');
  assert.equal(spelling.subjectName, 'Spelling');
  assert.equal(spelling.entries.length, 4);
  assert.equal(spelling.totals.caught, 2);
  assert.equal(spelling.totals.total, 4);
  assert.equal(spelling.status, 'in-progress');

  const grammar = groups.find((group) => group.subjectId === 'grammar');
  assert.equal(grammar.entries.length, 7);
  assert.equal(grammar.totals.caught, 0);
  assert.equal(grammar.status, 'unstarted');
});

test('formatSubjectList honours Oxford comma for three or more items', async () => {
  const { formatSubjectList } = await import('../src/surfaces/home/data.js');

  assert.equal(formatSubjectList([]), '');
  assert.equal(formatSubjectList(['Spelling']), 'Spelling');
  assert.equal(formatSubjectList(['Spelling', 'Punctuation']), 'Spelling and Punctuation');
  assert.equal(
    formatSubjectList(['Spelling', 'Punctuation', 'Grammar']),
    'Spelling, Punctuation, and Grammar',
  );
});
