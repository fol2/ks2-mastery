import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const explainerPath = resolve(
  __dirname,
  '../docs/plans/james/hero-mode/A/hero-pA4-parent-explainer.md'
);

const content = readFileSync(explainerPath, 'utf8');
const lower = content.toLowerCase();

describe('Hero pA4 parent explainer — required content', () => {
  it('states Hero Mode gives one daily mission across ready subjects', () => {
    assert.ok(
      lower.includes('one daily mission') && lower.includes('ready subjects'),
      'Must mention one daily mission across ready subjects'
    );
  });

  it('names Spelling, Grammar, and Punctuation as ready subjects', () => {
    assert.ok(lower.includes('spelling'), 'Must mention Spelling');
    assert.ok(lower.includes('grammar'), 'Must mention Grammar');
    assert.ok(lower.includes('punctuation'), 'Must mention Punctuation');
  });

  it('states more subjects may join later', () => {
    assert.ok(
      lower.includes('more subjects') && lower.includes('later'),
      'Must indicate more subjects may join later'
    );
  });

  it('states subject mastery and Stars still belong to each subject', () => {
    assert.ok(
      lower.includes('stars') && lower.includes('belong to each subject'),
      'Must state Stars still belong to each subject'
    );
  });

  it('states Hero Coins reward daily mission completion, not speed or every correct answer', () => {
    assert.ok(
      lower.includes('hero coins') && lower.includes('daily mission completion'),
      'Must state Hero Coins reward daily mission completion'
    );
    assert.ok(
      lower.includes('not for speed') || lower.includes('not speed'),
      'Must state coins are not for speed'
    );
  });

  it('states Hero Camp is optional and secondary', () => {
    assert.ok(
      lower.includes('hero camp') &&
        lower.includes('optional') &&
        lower.includes('secondary'),
      'Must state Hero Camp is optional and secondary'
    );
  });

  it('states this is early access and feedback is welcome', () => {
    assert.ok(lower.includes('early access'), 'Must mention early access');
    assert.ok(lower.includes('feedback'), 'Must mention feedback');
    assert.ok(lower.includes('welcome'), 'Must state feedback is welcome');
  });
});

describe('Hero pA4 parent explainer — forbidden content', () => {
  it('does not claim Hero Mode covers all six KS2 subjects', () => {
    assert.ok(
      !lower.includes('all six') && !lower.includes('six subjects'),
      'Must not claim coverage of all six KS2 subjects'
    );
  });

  it('does not state coins are earned for every right answer', () => {
    assert.ok(
      !lower.includes('every right answer') &&
        !lower.includes('every correct answer') &&
        !lower.includes('each correct answer'),
      'Must not claim coins for every right/correct answer'
    );
  });

  it('does not suggest a child loses anything for missing a day', () => {
    assert.ok(
      !lower.includes('lose progress') &&
        !lower.includes('lost stars') &&
        !lower.includes('lose stars') &&
        !lower.includes('lose coins') &&
        !lower.includes('lose their'),
      'Must not suggest a child loses anything for missing a day'
    );
  });

  it('does not claim Hero Mode replaces subject practice', () => {
    assert.ok(
      !lower.includes('replaces subject') &&
        !lower.includes('replace subject') &&
        !lower.includes('instead of subject'),
      'Must not claim Hero Mode replaces subject practice'
    );
  });

  it('does not claim Hero Mode is final or default for everyone', () => {
    assert.ok(
      !lower.includes('final version for everyone') &&
        !lower.includes('default for everyone') &&
        !lower.includes('default for all'),
      'Must not claim Hero Mode is final/default for everyone'
    );
  });
});

describe('Hero pA4 parent explainer — no pressure vocabulary', () => {
  const pressureWords = [
    'gamble',
    'gambling',
    'loot',
    'streak',
    'punishment',
    'punish',
    'miss out',
    'limited time',
    'hurry',
    'last chance',
  ];

  for (const word of pressureWords) {
    it(`does not contain pressure word: "${word}"`, () => {
      assert.ok(
        !lower.includes(word),
        `Explainer must not contain pressure vocabulary: "${word}"`
      );
    });
  }
});

describe('Hero pA4 parent explainer — locked subjects tone', () => {
  it('does not describe locked subjects negatively', () => {
    const negativePatterns = [
      'missing subjects',
      'unavailable subjects',
      'subjects are missing',
      'not available yet',
      'cannot access',
      'locked out',
      'blocked',
      'excluded',
      'left out',
      'denied',
    ];

    for (const pattern of negativePatterns) {
      assert.ok(
        !lower.includes(pattern),
        `Must not use negative language for locked subjects: "${pattern}"`
      );
    }
  });

  it('does not name locked subjects (arithmetic, reasoning, reading) negatively', () => {
    // If these subjects are mentioned at all, they should not appear with negative framing
    const lockedSubjects = ['arithmetic', 'reasoning', 'reading'];
    for (const subject of lockedSubjects) {
      if (lower.includes(subject)) {
        // If mentioned, must not be paired with negative words
        const lines = content.split('\n');
        for (const line of lines) {
          const lineLower = line.toLowerCase();
          if (lineLower.includes(subject)) {
            assert.ok(
              !lineLower.includes('not ready') &&
                !lineLower.includes('unavailable') &&
                !lineLower.includes('missing') &&
                !lineLower.includes('locked'),
              `Locked subject "${subject}" must not be described negatively`
            );
          }
        }
      }
    }
  });
});
