import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderHeroTaskBannerFixture } from './helpers/react-render.js';
import {
  HERO_FORBIDDEN_VOCABULARY,
  HERO_PROGRESS_COPY,
} from '../shared/hero/hero-copy.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MATCHING_LAUNCH = {
  questId: 'quest-2026-04-27',
  questFingerprint: 'fp-abc',
  taskId: 'task-1',
  subjectId: 'spelling',
  intent: 'weak-repair',
  launcher: 'smart-practice',
  launchedAt: '2026-04-27T10:00:00Z',
};

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

// ---------------------------------------------------------------------------
// P3: Banner shows completion text when taskCompleted=true
// ---------------------------------------------------------------------------

describe('HeroTaskBanner P3 — taskCompleted state', () => {
  it('shows completion banner text when taskCompleted is true', async () => {
    const html = await renderHeroTaskBannerFixture({
      lastLaunch: MATCHING_LAUNCH,
      subjectName: 'Spelling',
      taskCompleted: true,
    });
    assert.ok(html.includes('data-hero-task-banner'), 'banner element present');
    assert.ok(
      html.includes(HERO_PROGRESS_COPY.bannerComplete),
      'banner complete text shown',
    );
    assert.ok(
      html.includes('hero-task-banner--complete'),
      'complete modifier class present',
    );
  });

  it('shows completion banner even when lastLaunch is null', async () => {
    const html = await renderHeroTaskBannerFixture({
      lastLaunch: null,
      subjectName: 'Spelling',
      taskCompleted: true,
    });
    assert.ok(html.includes('data-hero-task-banner'), 'banner renders');
    assert.ok(
      html.includes(HERO_PROGRESS_COPY.bannerComplete),
      'complete text shown without lastLaunch',
    );
  });

  it('completion banner has aria-live="polite"', async () => {
    const html = await renderHeroTaskBannerFixture({
      lastLaunch: MATCHING_LAUNCH,
      subjectName: 'Spelling',
      taskCompleted: true,
    });
    assert.ok(html.includes('aria-live="polite"'), 'aria-live polite present');
  });

  it('completion banner does not show in-progress text', async () => {
    const html = await renderHeroTaskBannerFixture({
      lastLaunch: MATCHING_LAUNCH,
      subjectName: 'Spelling',
      taskCompleted: true,
    });
    assert.ok(
      !html.includes('This round is part of today'),
      'in-progress text NOT shown when completed',
    );
  });
});

// ---------------------------------------------------------------------------
// P2 preserved: Banner shows in-progress text when lastLaunch present
// ---------------------------------------------------------------------------

describe('HeroTaskBanner P3 — in-progress state (P2 preserved)', () => {
  it('shows P2 in-progress text when lastLaunch present and not completed', async () => {
    const html = await renderHeroTaskBannerFixture({
      lastLaunch: MATCHING_LAUNCH,
      subjectName: 'Spelling',
      taskCompleted: false,
    });
    assert.ok(
      html.includes('This round is part of today'),
      'in-progress detail present',
    );
    assert.ok(
      html.includes('Hero Quest task: Spelling'),
      'label with subject name present',
    );
  });
});

// ---------------------------------------------------------------------------
// Banner returns null when neither lastLaunch nor taskCompleted
// ---------------------------------------------------------------------------

describe('HeroTaskBanner P3 — returns null when inactive', () => {
  it('returns empty when lastLaunch is null and taskCompleted is false', async () => {
    const html = await renderHeroTaskBannerFixture({
      lastLaunch: null,
      subjectName: 'Spelling',
      taskCompleted: false,
    });
    assert.equal(html.trim(), '', 'empty output when neither active');
  });
});

// ---------------------------------------------------------------------------
// No economy vocabulary in banner output (P3 states)
// ---------------------------------------------------------------------------

describe('HeroTaskBanner P3 — no economy vocabulary', () => {
  it('completion state has zero forbidden vocabulary', async () => {
    const html = await renderHeroTaskBannerFixture({
      lastLaunch: MATCHING_LAUNCH,
      subjectName: 'Spelling',
      taskCompleted: true,
    });
    assertNoEconomyVocab(html, 'HeroTaskBanner(completed)');
  });

  it('in-progress state has zero forbidden vocabulary', async () => {
    const html = await renderHeroTaskBannerFixture({
      lastLaunch: MATCHING_LAUNCH,
      subjectName: 'Spelling',
      taskCompleted: false,
    });
    assertNoEconomyVocab(html, 'HeroTaskBanner(in-progress)');
  });
});

// ---------------------------------------------------------------------------
// Boundary: HERO_PROGRESS_COPY.bannerComplete is economy-free
// ---------------------------------------------------------------------------

describe('HeroTaskBanner P3 — copy constants are economy-free', () => {
  it('HERO_PROGRESS_COPY has no forbidden vocabulary', () => {
    const allCopy = Object.values(HERO_PROGRESS_COPY).join(' ').toLowerCase();
    for (const forbidden of HERO_FORBIDDEN_VOCABULARY) {
      assert.ok(
        !allCopy.includes(forbidden.toLowerCase()),
        `HERO_PROGRESS_COPY contains forbidden term: "${forbidden}"`,
      );
    }
  });
});
