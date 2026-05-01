// UI Refactor P4 U2: HomeHeroScene must be the single dashboard hero
// composition, not an extra CTA wrapper below the legacy hero.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  cleanupHomeSurfaceRenderer,
  renderHomeSurfaceStandalone,
} from './helpers/home-surface-render.js';

const SUBJECTS = Object.freeze([
  { id: 'spelling', name: 'Spelling', blurb: 'Spelling practice', available: true },
  { id: 'punctuation', name: 'Punctuation', blurb: 'Punctuation practice', available: true },
  { id: 'grammar', name: 'Grammar', blurb: 'Grammar practice', available: true },
  { id: 'reading', name: 'Reading', blurb: 'Reading practice', available: false },
  { id: 'reasoning', name: 'Reasoning', blurb: 'Reasoning practice', available: false },
  { id: 'arithmetic', name: 'Arithmetic', blurb: 'Arithmetic practice', available: false },
]);

function modelWithSubjects(subjects) {
  return {
    theme: 'light',
    learner: { id: 'learner-a', name: 'Ava' },
    learnerLabel: 'Ava',
    learnerOptions: [],
    signedInAs: null,
    subjects,
    monsterSummary: [],
    dashboardStats: {
      spelling: { pct: 10, due: 0, streak: 0, nextUp: 'Fresh spellings' },
      punctuation: { pct: 20, due: 3, streak: 1, nextUp: 'Due review' },
      grammar: { pct: 5, due: 0, streak: 0, nextUp: 'Start Grammar retrieval' },
    },
    dueTotal: 3,
    roundNumber: 1,
    now: new Date('2026-04-22T12:00:00Z'),
    permissions: { canOpenParentHub: true },
    persistence: { mode: 'local-only', label: 'Local-only' },
    hero: { enabled: false, status: 'idle' },
  };
}

function countMatches(html, pattern) {
  return (html.match(pattern) || []).length;
}

function countPrimaryLearnerCtas(html) {
  return countMatches(
    html,
    /<button\b(?=[^>]*class="btn primary xl")(?=[^>]*data-action="open-subject")[^>]*>/g,
  );
}

test.after(() => {
  cleanupHomeSurfaceRenderer();
});

test('HomeSurface normal path renders one HomeHeroScene and one primary learner CTA', () => {
  const html = renderHomeSurfaceStandalone({ model: modelWithSubjects(SUBJECTS.slice(0, 3)) });

  assert.equal(countMatches(html, /data-scene="home-hero"/g), 1);
  assert.equal(countMatches(html, /class="hero-paper"/g), 1);
  assert.equal(countMatches(html, /class="home-hero-scene-actions"/g), 0);
  assert.equal(countPrimaryLearnerCtas(html), 1);
  assert.match(html, /data-action="open-subject"\s+data-subject-id="punctuation"/);
  assert.match(html, /data-action="open-codex"/);
  assert.match(html, /Parent hub/);
});

test('HomeSurface renders subject cards exactly once for zero, one, three and six ready subjects', () => {
  for (const size of [0, 1, 3, 6]) {
    const subjects = SUBJECTS.slice(0, size);
    const html = renderHomeSurfaceStandalone({ model: modelWithSubjects(subjects) });

    assert.equal(
      countMatches(html, /class="subject-grid"/g),
      1,
      `subject-grid should render once for ${size} ready subjects`,
    );
    assert.equal(
      countMatches(html, /class="subject-card/g),
      size,
      `subject card count should match ready subject count for ${size} ready subjects`,
    );
    for (const subject of subjects) {
      assert.equal(
        countMatches(
          html,
          new RegExp(`class="subject-card[^"]*" data-action="open-subject" data-subject-id="${subject.id}"`, 'g'),
        ),
        1,
        `${subject.id} card should render exactly once`,
      );
    }
  }
});
