import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  renderHeroQuestCardFixture,
  renderHomeSurfaceWithHeroFixture,
} from './helpers/react-render.js';
import { HERO_FORBIDDEN_VOCABULARY } from '../shared/hero/hero-copy.js';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function launchableTask(taskId = 'task-001', subjectId = 'spelling') {
  return {
    taskId,
    subjectId,
    intent: 'weak-repair',
    launcher: 'standard-practice',
    launchStatus: 'launchable',
    childLabel: 'Spelling: Practise something tricky',
    childReason: 'This will help you get better at something you find tricky.',
  };
}

function activeSession(subjectId = 'spelling') {
  return {
    subjectId,
    questId: 'quest-001',
    questFingerprint: 'hero-qf-abc123def456',
    taskId: 'task-001',
    intent: 'weak-repair',
    launcher: 'standard-practice',
    status: 'in-progress',
  };
}

function heroModel(overrides = {}) {
  return {
    status: 'ready',
    enabled: true,
    nextTask: launchableTask(),
    activeHeroSession: null,
    canStart: true,
    canContinue: false,
    error: '',
    effortPlanned: 18,
    eligibleSubjects: ['spelling', 'grammar'],
    lockedSubjects: [],
    lastLaunch: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// HeroQuestCard — canStart state
// ---------------------------------------------------------------------------

describe('HeroQuestCard — renders when hero.enabled && hero.canStart', () => {
  it('renders the card with "Start Hero Quest" CTA', async () => {
    const html = await renderHeroQuestCardFixture({ hero: heroModel() });
    assert.ok(html.includes('data-hero-card'), 'card renders with data-hero-card marker');
    assert.ok(html.includes('Start Hero Quest'), 'primary CTA text is present');
    // Apostrophe is HTML-encoded as &#x27; in SSR output
    assert.ok(html.includes('Hero Quest'), 'title text is present');
    assert.ok(html.includes('hero-quest-card__title'), 'title class is present');
  });

  it('shows effort planned', async () => {
    const html = await renderHeroQuestCardFixture({ hero: heroModel({ effortPlanned: 18 }) });
    assert.ok(html.includes('18 effort planned'), 'effort planned is shown');
  });

  it('shows next task subject label and child reason', async () => {
    const html = await renderHeroQuestCardFixture({ hero: heroModel() });
    assert.ok(html.includes('Spelling'), 'subject label is present');
    assert.ok(
      html.includes('Practise something tricky'),
      'child label is present',
    );
    assert.ok(
      html.includes('you find tricky'),
      'child reason is present',
    );
  });

  it('shows subtitle about ready subjects', async () => {
    const html = await renderHeroQuestCardFixture({ hero: heroModel() });
    assert.ok(
      html.includes('A few strong rounds picked from your ready subjects'),
      'subtitle is present',
    );
  });

  it('shows eligible subjects list', async () => {
    const html = await renderHeroQuestCardFixture({
      hero: heroModel({ eligibleSubjects: ['spelling', 'grammar', 'punctuation'] }),
    });
    assert.ok(html.includes('Spelling'), 'Spelling in eligible list');
    assert.ok(html.includes('Grammar'), 'Grammar in eligible list');
    assert.ok(html.includes('Punctuation'), 'Punctuation in eligible list');
  });

  it('shows locked subjects as "coming later" when non-empty', async () => {
    const html = await renderHeroQuestCardFixture({
      hero: heroModel({ lockedSubjects: ['punctuation'] }),
    });
    assert.ok(html.includes('Punctuation'), 'locked subject name present');
    assert.ok(html.includes('coming later'), 'coming later label present');
  });

  it('does not show locked subjects section when empty', async () => {
    const html = await renderHeroQuestCardFixture({
      hero: heroModel({ lockedSubjects: [] }),
    });
    assert.ok(!html.includes('coming later'), 'no coming later when empty');
  });
});

// ---------------------------------------------------------------------------
// HeroQuestCard — canContinue state (active session)
// ---------------------------------------------------------------------------

describe('HeroQuestCard — active session shows "Continue Hero task" CTA', () => {
  it('renders the Continue CTA for an active session', async () => {
    const html = await renderHeroQuestCardFixture({
      hero: heroModel({
        canStart: false,
        canContinue: true,
        nextTask: null,
        activeHeroSession: activeSession('grammar'),
      }),
    });
    assert.ok(html.includes('Continue Hero task'), 'continue CTA text is present');
    assert.ok(html.includes('Grammar'), 'subject name shown for active session');
    assert.ok(!html.includes('Start Hero Quest'), '"Start" CTA not shown');
  });
});

// ---------------------------------------------------------------------------
// HeroQuestCard — not rendered when disabled
// ---------------------------------------------------------------------------

describe('HeroQuestCard — not rendered when hero.enabled === false', () => {
  it('returns empty string (null render) when disabled', async () => {
    const html = await renderHeroQuestCardFixture({
      hero: heroModel({ enabled: false }),
    });
    assert.equal(html.trim(), '', 'card not rendered when disabled');
  });
});

// ---------------------------------------------------------------------------
// HeroQuestCard — not rendered when loading
// ---------------------------------------------------------------------------

describe('HeroQuestCard — not rendered when hero.status === "loading"', () => {
  it('returns empty string (null render) when loading', async () => {
    const html = await renderHeroQuestCardFixture({
      hero: heroModel({ status: 'loading' }),
    });
    assert.equal(html.trim(), '', 'card not rendered when loading');
  });
});

// ---------------------------------------------------------------------------
// HeroQuestCard — no launchable tasks message
// ---------------------------------------------------------------------------

describe('HeroQuestCard — "No Hero task is ready yet" when !canStart && !canContinue', () => {
  it('shows the gentle message', async () => {
    const html = await renderHeroQuestCardFixture({
      hero: heroModel({
        canStart: false,
        canContinue: false,
        nextTask: null,
        activeHeroSession: null,
      }),
    });
    assert.ok(
      html.includes('No Hero task is ready yet'),
      'gentle no-task message present',
    );
    assert.ok(
      html.includes('your subjects are still available below'),
      'subjects-below hint present',
    );
  });
});

// ---------------------------------------------------------------------------
// HeroQuestCard — launching state (CTA disabled, aria-busy)
// ---------------------------------------------------------------------------

describe('HeroQuestCard — CTA disabled when hero.status === "launching"', () => {
  it('disables the CTA and shows aria-busy', async () => {
    const html = await renderHeroQuestCardFixture({
      hero: heroModel({ status: 'launching' }),
    });
    assert.ok(html.includes('disabled'), 'button is disabled');
    assert.ok(html.includes('aria-busy="true"'), 'aria-busy is set');
    assert.ok(html.includes('Starting'), 'Starting... text shown');
  });
});

// ---------------------------------------------------------------------------
// HeroQuestCard — stale quest / error state
// ---------------------------------------------------------------------------

describe('HeroQuestCard — stale quest error message with aria-live', () => {
  it('shows refreshed message and aria-live="polite" for stale quest error', async () => {
    const html = await renderHeroQuestCardFixture({
      hero: heroModel({
        error: 'hero_quest_refreshed',
        canStart: false,
        canContinue: false,
        nextTask: null,
      }),
    });
    assert.ok(
      html.includes('Your Hero Quest refreshed'),
      'stale quest message present',
    );
    assert.ok(
      html.includes('aria-live="polite"'),
      'aria-live polite is set on error region',
    );
  });

  it('shows conflict message for active session conflict error', async () => {
    const html = await renderHeroQuestCardFixture({
      hero: heroModel({
        error: 'hero_active_session_conflict',
        canStart: false,
        canContinue: false,
        nextTask: null,
      }),
    });
    assert.ok(
      html.includes('Quest updated'),
      'conflict message present',
    );
  });

  it('shows "Try the next task now" refresh CTA for error state', async () => {
    const html = await renderHeroQuestCardFixture({
      hero: heroModel({
        error: 'hero_quest_refreshed',
        canStart: false,
        canContinue: false,
        nextTask: null,
      }),
    });
    assert.ok(
      html.includes('Try the next task now'),
      'refresh CTA text present',
    );
  });

  it('shows inline error with aria-live when canStart is still true', async () => {
    const html = await renderHeroQuestCardFixture({
      hero: heroModel({ error: 'hero_quest_refreshed' }),
    });
    assert.ok(
      html.includes('aria-live="polite"'),
      'aria-live polite on inline error',
    );
    assert.ok(
      html.includes('Start Hero Quest'),
      'start CTA still available alongside error',
    );
  });
});

// ---------------------------------------------------------------------------
// No economy vocabulary in rendered output
// ---------------------------------------------------------------------------

describe('HeroQuestCard — no economy vocabulary in any rendered output', () => {
  const states = [
    { label: 'canStart', hero: heroModel() },
    { label: 'canContinue', hero: heroModel({ canStart: false, canContinue: true, nextTask: null, activeHeroSession: activeSession() }) },
    { label: 'no launchable', hero: heroModel({ canStart: false, canContinue: false, nextTask: null }) },
    { label: 'error', hero: heroModel({ error: 'hero_quest_refreshed', canStart: false, canContinue: false, nextTask: null }) },
    { label: 'launching', hero: heroModel({ status: 'launching' }) },
  ];

  for (const { label, hero } of states) {
    it(`state "${label}" — zero forbidden vocabulary`, async () => {
      const html = await renderHeroQuestCardFixture({ hero });
      const lower = html.toLowerCase();
      for (const token of HERO_FORBIDDEN_VOCABULARY) {
        assert.ok(
          !lower.includes(token.toLowerCase()),
          `forbidden token "${token}" found in ${label} state`,
        );
      }
    });
  }
});

// ---------------------------------------------------------------------------
// HomeSurface integration — subject grid always renders
// ---------------------------------------------------------------------------

describe('HomeSurface integration — subject grid renders regardless of Hero state', () => {
  it('subject grid present when Hero is enabled and canStart', async () => {
    const html = await renderHomeSurfaceWithHeroFixture({ hero: heroModel() });
    assert.ok(html.includes('subject-grid'), 'subject-grid class present');
    assert.ok(html.includes('Spelling'), 'Spelling subject card present');
    assert.ok(html.includes('Grammar'), 'Grammar subject card present');
    assert.ok(html.includes('Punctuation'), 'Punctuation subject card present');
  });

  it('subject grid present when Hero is disabled', async () => {
    const html = await renderHomeSurfaceWithHeroFixture({
      hero: heroModel({ enabled: false }),
    });
    assert.ok(html.includes('subject-grid'), 'subject-grid class present');
    assert.ok(html.includes('Spelling'), 'Spelling subject card present');
  });

  it('subject grid present when Hero is null', async () => {
    const html = await renderHomeSurfaceWithHeroFixture({ hero: null });
    assert.ok(html.includes('subject-grid'), 'subject-grid class present');
  });
});

// ---------------------------------------------------------------------------
// HomeSurface integration — Hero card replaces "Today's best round"
// ---------------------------------------------------------------------------

describe('HomeSurface integration — Hero card and "Today\'s best round" mutual exclusion', () => {
  it('Hero card renders, "Today\'s best round" does not when hero is active', async () => {
    const html = await renderHomeSurfaceWithHeroFixture({ hero: heroModel() });
    assert.ok(html.includes('data-hero-card'), 'Hero card rendered');
    assert.ok(!html.includes('hero-best-round'), '"Today\'s best round" not rendered');
    assert.ok(!html.includes('hero-cta-row'), 'fallback CTA row not rendered');
  });

  it('fallback recommendation renders when Hero is disabled', async () => {
    const html = await renderHomeSurfaceWithHeroFixture({
      hero: heroModel({ enabled: false }),
    });
    assert.ok(!html.includes('data-hero-card'), 'Hero card not rendered');
    // Fallback CTA or mission text should be present
    assert.ok(
      html.includes('hero-cta-row') || html.includes('mission'),
      'fallback content is rendered when hero disabled',
    );
  });
});
