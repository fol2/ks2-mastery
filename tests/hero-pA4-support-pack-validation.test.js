import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACK_PATH = resolve(__dirname, '../docs/plans/james/hero-mode/A/hero-pA4-support-pack.md');
const content = readFileSync(PACK_PATH, 'utf-8');

describe('Hero pA4 Support Pack — structural validation', () => {
  const requiredSections = [
    'Section 1: Support Triage Guide',
    'Section 2: Safe Collection / Forbidden Collection',
    'Section 3: Rollback Instruction',
    'Section 4: Known Issues',
    'Section 5: Escalation Rules',
    'Section 6: Daily Review Checklist',
  ];

  for (const section of requiredSections) {
    it(`contains required heading: ${section}`, () => {
      assert.ok(
        content.includes(`## ${section}`),
        `Missing section heading: "${section}"`
      );
    });
  }
});

describe('Hero pA4 Support Pack — safe collection items', () => {
  const safeItems = [
    'Account ID',
    'Learner ID',
    'dateKey',
    'time',
    'Device/browser',
    'Surface visible',
    'Request ID',
    'Issue category',
  ];

  for (const item of safeItems) {
    it(`lists safe collection item: ${item}`, () => {
      assert.ok(
        content.toLowerCase().includes(item.toLowerCase()),
        `Missing safe collection item: "${item}"`
      );
    });
  }
});

describe('Hero pA4 Support Pack — forbidden collection', () => {
  it('explicitly states DO NOT collect', () => {
    assert.ok(
      content.includes('DO NOT collect'),
      'Missing explicit "DO NOT collect" statement'
    );
  });

  const forbiddenItems = [
    'raw answer text',
    'raw prompt text',
    'child free text',
    'screenshots containing sensitive child content',
  ];

  for (const item of forbiddenItems) {
    it(`lists forbidden item: ${item}`, () => {
      assert.ok(
        content.toLowerCase().includes(item.toLowerCase()),
        `Missing forbidden collection item: "${item}"`
      );
    });
  }
});

describe('Hero pA4 Support Pack — rollback step-by-step', () => {
  it('contains rollback step-by-step procedure', () => {
    assert.ok(
      content.includes('Step-by-step procedure'),
      'Missing rollback step-by-step procedure heading'
    );
  });

  it('references all 6 HERO_MODE flags', () => {
    const flags = [
      'HERO_MODE_SHADOW_ENABLED',
      'HERO_MODE_LAUNCH_ENABLED',
      'HERO_MODE_CHILD_UI_ENABLED',
      'HERO_MODE_PROGRESS_ENABLED',
      'HERO_MODE_ECONOMY_ENABLED',
      'HERO_MODE_CAMP_ENABLED',
    ];
    for (const flag of flags) {
      assert.ok(
        content.includes(flag),
        `Missing rollback flag reference: "${flag}"`
      );
    }
  });

  it('references HERO_EXTERNAL_ACCOUNTS removal', () => {
    assert.ok(
      content.includes('HERO_EXTERNAL_ACCOUNTS'),
      'Missing HERO_EXTERNAL_ACCOUNTS reference in rollback'
    );
  });

  it('states hero state remains preserved (dormant)', () => {
    assert.ok(
      content.toLowerCase().includes('dormant'),
      'Missing dormancy statement in rollback'
    );
  });

  it('describes re-enablement procedure', () => {
    assert.ok(
      content.toLowerCase().includes('re-enable'),
      'Missing re-enablement instruction'
    );
  });
});

describe('Hero pA4 Support Pack — escalation categories', () => {
  const escalationCategories = [
    'Privacy violation',
    'Duplicate rewards',
    'Dead CTA',
    'State corruption',
    'Non-cohort exposure',
  ];

  for (const category of escalationCategories) {
    it(`contains escalation category: ${category}`, () => {
      assert.ok(
        content.includes(category),
        `Missing escalation category: "${category}"`
      );
    });
  }

  it('each escalation has detection method', () => {
    const detectionCount = (content.match(/\*\*Detection method:\*\*/g) || []).length;
    assert.ok(
      detectionCount >= 5,
      `Expected at least 5 detection method entries, found ${detectionCount}`
    );
  });

  it('each escalation has response action', () => {
    const responseCount = (content.match(/\*\*Response action:\*\*/g) || []).length;
    assert.ok(
      responseCount >= 5,
      `Expected at least 5 response action entries, found ${responseCount}`
    );
  });

  it('each escalation has escalation target', () => {
    const targetCount = (content.match(/\*\*Escalation target:\*\*/g) || []).length;
    assert.ok(
      targetCount >= 5,
      `Expected at least 5 escalation target entries, found ${targetCount}`
    );
  });
});

describe('Hero pA4 Support Pack — no pressure vocabulary', () => {
  const pressureWords = [
    'hurry',
    'limited time',
    'running out',
    "don't miss",
    'streak',
    'penalty',
    'taken away',
    'expired',
    'urgent',
    'act now',
    'last chance',
  ];

  for (const word of pressureWords) {
    it(`does not contain pressure word: "${word}"`, () => {
      assert.ok(
        !content.toLowerCase().includes(word.toLowerCase()),
        `Found pressure vocabulary: "${word}"`
      );
    });
  }
});

describe('Hero pA4 Support Pack — daily review checklist', () => {
  it('contains checklist items with checkboxes', () => {
    const checkboxCount = (content.match(/- \[ \]/g) || []).length;
    assert.ok(
      checkboxCount >= 5,
      `Expected at least 5 checklist items, found ${checkboxCount}`
    );
  });

  it('references operator-lookup script', () => {
    assert.ok(
      content.includes('hero-pA4-operator-lookup'),
      'Missing reference to operator-lookup script'
    );
  });

  it('includes non-cohort verification check', () => {
    assert.ok(
      content.toLowerCase().includes('non-cohort'),
      'Missing non-cohort verification in daily checklist'
    );
  });

  it('includes evidence template recording', () => {
    assert.ok(
      content.toLowerCase().includes('evidence'),
      'Missing evidence template reference in daily checklist'
    );
  });
});
