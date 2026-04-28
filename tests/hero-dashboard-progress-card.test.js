import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderHeroQuestCardFixture } from './helpers/react-render.js';
import {
  HERO_FORBIDDEN_VOCABULARY,
  HERO_PROGRESS_COPY,
} from '../shared/hero/hero-copy.js';

// ---------------------------------------------------------------------------
// Economy vocabulary scanner (word-boundary aware)
// ---------------------------------------------------------------------------

function assertNoEconomyVocab(html, label) {
  const lower = html.toLowerCase();
  for (const token of HERO_FORBIDDEN_VOCABULARY) {
    const tokenLower = token.toLowerCase();
    // Multi-word tokens: plain includes.  Single-word: word-boundary regex.
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
    lastClaim: null,
    claiming: false,
    dailyStatus: null,
    completedTaskIds: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// P3: Claiming state
// ---------------------------------------------------------------------------

describe('HeroQuestCard P3 — claiming state shows aria-busy', () => {
  it('renders claiming text and disabled button with aria-busy', async () => {
    const html = await renderHeroQuestCardFixture({
      hero: heroModel({ claiming: true }),
    });
    assert.ok(html.includes('data-hero-card'), 'card renders');
    assert.ok(
      html.includes(HERO_PROGRESS_COPY.claiming),
      'claiming copy shown',
    );
    assert.ok(html.includes('aria-busy="true"'), 'aria-busy is set');
    assert.ok(html.includes('disabled'), 'button is disabled');
  });
});

// ---------------------------------------------------------------------------
// P3: Task claimed state
// ---------------------------------------------------------------------------

describe('HeroQuestCard P3 — task-claimed state', () => {
  it('shows task complete copy when lastClaim.status is claimed', async () => {
    const html = await renderHeroQuestCardFixture({
      hero: heroModel({
        lastClaim: { status: 'claimed', taskId: 'task-001' },
        completedTaskIds: ['task-001'],
        canStart: true,
      }),
    });
    assert.ok(
      html.includes(HERO_PROGRESS_COPY.taskComplete),
      'task complete text shown',
    );
    assert.ok(
      html.includes(HERO_PROGRESS_COPY.taskCompleteDetail),
      'task complete detail shown',
    );
  });

  it('shows "Next Hero task is ready." when more tasks remain', async () => {
    const html = await renderHeroQuestCardFixture({
      hero: heroModel({
        lastClaim: { status: 'claimed', taskId: 'task-001' },
        completedTaskIds: ['task-001'],
        effortPlanned: 18, // 3 tasks total, 1 done
        canStart: true,
      }),
    });
    assert.ok(
      html.includes(HERO_PROGRESS_COPY.nextTaskReady),
      'next task ready text shown',
    );
  });

  it('does not show next task text when all tasks are done', async () => {
    const html = await renderHeroQuestCardFixture({
      hero: heroModel({
        lastClaim: { status: 'claimed', taskId: 'task-003' },
        completedTaskIds: ['task-001', 'task-002', 'task-003'],
        effortPlanned: 18, // 3 tasks total, 3 done
        canStart: false,
      }),
    });
    assert.ok(
      !html.includes(HERO_PROGRESS_COPY.nextTaskReady),
      'next task ready text NOT shown when all done',
    );
  });
});

// ---------------------------------------------------------------------------
// P3: Daily complete state
// ---------------------------------------------------------------------------

describe('HeroQuestCard P3 — daily-complete state', () => {
  it('shows daily complete copy with no CTA', async () => {
    const html = await renderHeroQuestCardFixture({
      hero: heroModel({ dailyStatus: 'completed' }),
    });
    assert.ok(html.includes('data-hero-card'), 'card renders');
    // SSR encodes apostrophe as &#x27; so check for partial matches
    assert.ok(
      html.includes('Hero Quest is complete.'),
      'daily complete text shown',
    );
    assert.ok(
      html.includes(HERO_PROGRESS_COPY.dailyCompleteDetail),
      'daily complete detail shown',
    );
    // No CTA button
    assert.ok(!html.includes('<button'), 'no button when daily is complete');
  });

  it('daily complete has aria-live="polite"', async () => {
    const html = await renderHeroQuestCardFixture({
      hero: heroModel({ dailyStatus: 'completed' }),
    });
    assert.ok(html.includes('aria-live="polite"'), 'aria-live polite present');
  });
});

// ---------------------------------------------------------------------------
// P3: Error state preserves aria-live
// ---------------------------------------------------------------------------

describe('HeroQuestCard P3 — error state retains aria-live', () => {
  it('error state has aria-live="polite"', async () => {
    const html = await renderHeroQuestCardFixture({
      hero: heroModel({
        error: 'hero_quest_refreshed',
        canStart: false,
        canContinue: false,
        nextTask: null,
      }),
    });
    assert.ok(html.includes('aria-live="polite"'), 'aria-live polite on error');
  });
});

// ---------------------------------------------------------------------------
// P3: Progress indicator in ready/continue states
// ---------------------------------------------------------------------------

describe('HeroQuestCard P3 — progress indicator', () => {
  it('shows progress count in ready state when tasks completed > 0', async () => {
    const html = await renderHeroQuestCardFixture({
      hero: heroModel({
        completedTaskIds: ['task-001'],
        effortPlanned: 18,
      }),
    });
    assert.ok(
      html.includes('1 of 3 tasks complete'),
      'progress indicator shows 1 of 3',
    );
  });

  it('shows progress count in continue state when tasks completed > 0', async () => {
    const html = await renderHeroQuestCardFixture({
      hero: heroModel({
        canStart: false,
        canContinue: true,
        nextTask: null,
        activeHeroSession: activeSession(),
        completedTaskIds: ['task-001', 'task-002'],
        effortPlanned: 18,
      }),
    });
    assert.ok(
      html.includes('2 of 3 tasks complete'),
      'progress indicator shows 2 of 3',
    );
  });

  it('does not show progress when completedTaskIds is empty', async () => {
    const html = await renderHeroQuestCardFixture({
      hero: heroModel({ completedTaskIds: [] }),
    });
    assert.ok(
      !html.includes('tasks complete'),
      'no progress indicator when empty',
    );
  });
});

// ---------------------------------------------------------------------------
// P2 preserved: disabled/loading returns null
// ---------------------------------------------------------------------------

describe('HeroQuestCard P3 — P2 states preserved', () => {
  it('returns null when disabled', async () => {
    const html = await renderHeroQuestCardFixture({
      hero: heroModel({ enabled: false }),
    });
    assert.equal(html.trim(), '', 'card not rendered when disabled');
  });

  it('returns null when loading', async () => {
    const html = await renderHeroQuestCardFixture({
      hero: heroModel({ status: 'loading' }),
    });
    assert.equal(html.trim(), '', 'card not rendered when loading');
  });
});

// ---------------------------------------------------------------------------
// No economy vocabulary in any P3 rendered state
// ---------------------------------------------------------------------------

describe('HeroQuestCard P3 — no economy vocabulary in P3 states', () => {
  const states = [
    { label: 'claiming', hero: heroModel({ claiming: true }) },
    { label: 'task-claimed', hero: heroModel({ lastClaim: { status: 'claimed', taskId: 'task-001' }, completedTaskIds: ['task-001'], canStart: true }) },
    { label: 'daily-complete', hero: heroModel({ dailyStatus: 'completed' }) },
    { label: 'progress-ready', hero: heroModel({ completedTaskIds: ['task-001'], effortPlanned: 18 }) },
    { label: 'progress-continue', hero: heroModel({ canStart: false, canContinue: true, nextTask: null, activeHeroSession: activeSession(), completedTaskIds: ['task-001'], effortPlanned: 18 }) },
  ];

  for (const { label, hero } of states) {
    it(`state "${label}" — zero forbidden vocabulary`, async () => {
      const html = await renderHeroQuestCardFixture({ hero });
      assertNoEconomyVocab(html, label);
    });
  }
});

// ---------------------------------------------------------------------------
// Boundary: HERO_PROGRESS_COPY contains no economy vocabulary
// ---------------------------------------------------------------------------

describe('HeroQuestCard P3 — copy constants are economy-free', () => {
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
