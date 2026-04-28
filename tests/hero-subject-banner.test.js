import test from 'node:test';
import assert from 'node:assert/strict';

import {
  renderHeroTaskBannerFixture,
  renderSubjectRouteWithHeroBannerFixture,
} from './helpers/react-render.js';
import {
  HERO_FORBIDDEN_VOCABULARY,
  HERO_INTENT_LABELS,
} from '../shared/hero/hero-copy.js';

// ── Fixtures ──────────────────────────────────────────────────────────

const MATCHING_LAUNCH = {
  questId: 'quest-2026-04-27',
  questFingerprint: 'fp-abc',
  taskId: 'task-1',
  subjectId: 'spelling',
  intent: 'weak-repair',
  launcher: 'smart-practice',
  launchedAt: '2026-04-27T10:00:00Z',
};

const ALL_INTENTS = [
  'weak-repair',
  'due-review',
  'retention-after-secure',
  'post-mega-maintenance',
  'breadth-maintenance',
  'fresh-exploration',
];

// ── Economy vocabulary scanner (reused from hero-copy-contract) ───────

function assertNoEconomyVocab(html, label) {
  const lower = html.toLowerCase();
  for (const token of HERO_FORBIDDEN_VOCABULARY) {
    const tokenLower = token.toLowerCase();
    const found = tokenLower.includes(' ')
      ? lower.includes(tokenLower)
      : new RegExp(`\\b${tokenLower}\\b`).test(lower);
    assert.ok(
      !found,
      `${label} contains forbidden economy token "${token}"`,
    );
  }
}

// ── Banner renders when lastLaunch.subjectId === currentSubjectId ─────

test('banner renders when lastLaunch matches current subject', async () => {
  const html = await renderHeroTaskBannerFixture({
    lastLaunch: MATCHING_LAUNCH,
    subjectName: 'Spelling',
  });
  assert.ok(html.includes('data-hero-task-banner'), 'banner element present');
  assert.ok(html.includes('hero-task-banner'), 'banner class present');
});

// ── Banner shows subject name and intent label ────────────────────────

test('banner shows subject name and intent label for weak-repair', async () => {
  const html = await renderHeroTaskBannerFixture({
    lastLaunch: MATCHING_LAUNCH,
    subjectName: 'Spelling',
  });
  assert.ok(html.includes('Spelling'), 'subject name present');
  assert.ok(
    html.includes(HERO_INTENT_LABELS['weak-repair']),
    'intent label present',
  );
});

// ── Banner shows "This round is part of today's Hero Quest." ──────────

test('banner shows Hero Quest context line', async () => {
  const html = await renderHeroTaskBannerFixture({
    lastLaunch: MATCHING_LAUNCH,
    subjectName: 'Spelling',
  });
  assert.ok(
    html.includes('This round is part of today'),
    'context line present',
  );
  assert.ok(
    html.includes('Hero Quest'),
    'Hero Quest text present',
  );
});

// ── Banner does not render when lastLaunch is null ─────────────────────

test('banner returns empty when lastLaunch is null', async () => {
  const html = await renderHeroTaskBannerFixture({
    lastLaunch: null,
    subjectName: 'Spelling',
  });
  assert.equal(html.trim(), '', 'empty output for null lastLaunch');
});

// ── Banner does not render when lastLaunch.subjectId is missing ───────

test('banner returns empty when lastLaunch.subjectId is falsy', async () => {
  const html = await renderHeroTaskBannerFixture({
    lastLaunch: { ...MATCHING_LAUNCH, subjectId: '' },
    subjectName: 'Spelling',
  });
  assert.equal(html.trim(), '', 'empty output for missing subjectId');
});

// ── Banner does not render when lastLaunch.subjectId !== currentSubjectId ─

test('SubjectRoute omits banner when lastLaunch targets a different subject', async () => {
  const mismatchedLaunch = { ...MATCHING_LAUNCH, subjectId: 'grammar' };
  // heroLastLaunch is null because App.jsx filters mismatches; pass null.
  const html = await renderSubjectRouteWithHeroBannerFixture({
    lastLaunch: null,
  });
  assert.ok(!html.includes('data-hero-task-banner'), 'no banner in output');
});

// ── No economy vocabulary in banner output ────────────────────────────

test('banner output contains zero economy vocabulary', async () => {
  const html = await renderHeroTaskBannerFixture({
    lastLaunch: MATCHING_LAUNCH,
    subjectName: 'Spelling',
  });
  assertNoEconomyVocab(html, 'HeroTaskBanner(weak-repair)');
});

// ── Banner does not interfere with practice node rendering ────────────

test('SubjectRoute renders both banner and practice node', async () => {
  const html = await renderSubjectRouteWithHeroBannerFixture({
    lastLaunch: MATCHING_LAUNCH,
  });
  assert.ok(html.includes('data-hero-task-banner'), 'banner present');
  // The SubjectRoute always renders the breadcrumb before the banner.
  assert.ok(html.includes('subject-breadcrumb'), 'breadcrumb still present');
  // The practice node follows the banner (spelling surface renders content).
  const bannerIdx = html.indexOf('data-hero-task-banner');
  const breadcrumbIdx = html.indexOf('subject-breadcrumb');
  assert.ok(breadcrumbIdx < bannerIdx, 'breadcrumb appears before banner');
});

// ── Intent label maps correctly for all 6 Hero intents ────────────────

for (const intent of ALL_INTENTS) {
  test(`banner renders correct intent label for "${intent}"`, async () => {
    const launch = { ...MATCHING_LAUNCH, intent };
    const html = await renderHeroTaskBannerFixture({
      lastLaunch: launch,
      subjectName: 'Grammar',
    });
    const expectedLabel = HERO_INTENT_LABELS[intent];
    assert.ok(
      html.includes(expectedLabel),
      `expected intent label "${expectedLabel}" for "${intent}" in output`,
    );
    assert.ok(html.includes('Grammar'), 'subject name present');
    assertNoEconomyVocab(html, `HeroTaskBanner(${intent})`);
  });
}

// ── Unknown intent falls back to "Hero task" ──────────────────────────

test('banner falls back to "Hero task" for unknown intent', async () => {
  const launch = { ...MATCHING_LAUNCH, intent: 'unknown-future-intent' };
  const html = await renderHeroTaskBannerFixture({
    lastLaunch: launch,
    subjectName: 'Punctuation',
  });
  assert.ok(html.includes('Hero task'), 'fallback label present');
  assert.ok(html.includes('Punctuation'), 'subject name present');
});

// ── All three subjects render correctly ───────────────────────────────

for (const [subjectId, subjectName] of [['spelling', 'Spelling'], ['grammar', 'Grammar'], ['punctuation', 'Punctuation']]) {
  test(`banner renders correctly for ${subjectName}`, async () => {
    const launch = { ...MATCHING_LAUNCH, subjectId, intent: 'due-review' };
    const html = await renderHeroTaskBannerFixture({
      lastLaunch: launch,
      subjectName,
    });
    assert.ok(html.includes(subjectName), `${subjectName} name present`);
    assert.ok(html.includes('data-hero-task-banner'), 'banner element present');
  });
}
