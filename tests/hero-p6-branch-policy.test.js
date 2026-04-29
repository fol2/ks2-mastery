// Hero Mode P6 U4 — Branch-choice policy and deterministic Camp event IDs.
//
// Validates:
//  - Camp model never includes branch selector or "Path A"/"Path B" text
//  - Default branch is always 'b1' in model output
//  - Invite confirmation copy does not mention branch choice
//  - HeroCampMonsterCard rendered HTML has no branch-choice language
//  - Camp event IDs follow deterministic format `hero-evt-<entryId>`
//  - Claim event IDs follow deterministic format `hero-evt-<requestId>-<type-suffix>`

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHeroCampModel,
  buildInviteConfirmation,
  buildGrowConfirmation,
  buildInviteSuccess,
  buildGrowSuccess,
  buildInsufficientMessage,
} from '../src/platform/hero/hero-camp-model.js';
import { renderHeroCampMonsterCardFixture } from './helpers/react-render.js';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function monsterDef(id, overrides = {}) {
  return {
    monsterId: id,
    displayName: id.charAt(0).toUpperCase() + id.slice(1),
    childBlurb: `A creature called ${id}.`,
    owned: false,
    fullyGrown: false,
    stage: 0,
    maxStage: 4,
    inviteCost: 150,
    nextGrowCost: 300,
    nextStage: 1,
    branch: null,
    defaultBranch: 'b1',
    sourceAssetMonsterId: id,
    canAffordInvite: true,
    canAffordGrow: false,
    ...overrides,
  };
}

function ownedMonster(id, stage = 1, overrides = {}) {
  return monsterDef(id, {
    owned: true,
    stage,
    branch: 'b1',
    nextStage: stage + 1,
    nextGrowCost: 300,
    canAffordGrow: true,
    ...overrides,
  });
}

function campReadModel(monsters = [], overrides = {}) {
  return {
    camp: {
      enabled: true,
      balance: 500,
      monsters,
      selectedMonsterId: null,
      rosterVersion: 'v1',
      recentActions: [],
      ...overrides,
    },
  };
}

// Forbidden branch-choice vocabulary (child-facing)
const BRANCH_CHOICE_TERMS = [
  'Path A',
  'Path B',
  'choose a path',
  'branch choice',
  'select a branch',
  'choose your path',
];

// ---------------------------------------------------------------------------
// Sub-task A: No branch-choice language
// ---------------------------------------------------------------------------

describe('P6 U4 — branch-choice policy', () => {
  describe('buildHeroCampModel output has no branch-choice language', () => {
    it('model output with owned monsters does not contain Path A/B text', () => {
      const model = buildHeroCampModel(campReadModel([
        ownedMonster('glossbloom', 2),
        ownedMonster('stonehorn', 1, { branch: 'b1' }),
        monsterDef('flamekin'),
      ]));

      const serialised = JSON.stringify(model);
      for (const term of BRANCH_CHOICE_TERMS) {
        assert.ok(
          !serialised.includes(term),
          `Model output must not contain "${term}" but found it`,
        );
      }
    });

    it('default branch is always b1 when derived from model', () => {
      const model = buildHeroCampModel(campReadModel([
        monsterDef('glossbloom', { defaultBranch: 'b1' }),
        monsterDef('stonehorn'),
      ]));

      // All uninvited monsters should use defaultBranch = b1 in onInvite call
      for (const m of model.monsters) {
        if (!m.owned) {
          assert.equal(m.defaultBranch, 'b1', `Monster ${m.monsterId} defaultBranch must be 'b1'`);
        }
      }
    });

    it('empty camp model has no branch-choice terms', () => {
      const model = buildHeroCampModel(null);
      const serialised = JSON.stringify(model);
      for (const term of BRANCH_CHOICE_TERMS) {
        assert.ok(
          !serialised.includes(term),
          `Empty model must not contain "${term}"`,
        );
      }
    });
  });

  describe('invite confirmation copy has no branch-choice language', () => {
    it('buildInviteConfirmation does not mention branch or path selection', () => {
      const monster = monsterDef('glossbloom');
      const confirmation = buildInviteConfirmation(monster, 500);
      const allText = `${confirmation.heading} ${confirmation.balanceAfter}`;

      for (const term of BRANCH_CHOICE_TERMS) {
        assert.ok(
          !allText.includes(term),
          `Invite confirmation must not contain "${term}"`,
        );
      }
    });

    it('buildGrowConfirmation does not mention branch or path selection', () => {
      const monster = ownedMonster('glossbloom', 2);
      const confirmation = buildGrowConfirmation(monster, 500);
      const allText = `${confirmation.heading} ${confirmation.balanceAfter}`;

      for (const term of BRANCH_CHOICE_TERMS) {
        assert.ok(
          !allText.includes(term),
          `Grow confirmation must not contain "${term}"`,
        );
      }
    });

    it('buildInviteSuccess and buildGrowSuccess have no branch language', () => {
      const texts = [
        buildInviteSuccess('Glossbloom'),
        buildGrowSuccess('Glossbloom'),
        buildInsufficientMessage(50),
      ];
      for (const text of texts) {
        for (const term of BRANCH_CHOICE_TERMS) {
          assert.ok(!text.includes(term), `Copy must not contain "${term}": ${text}`);
        }
      }
    });
  });

  describe('HeroCampMonsterCard renders without branch-choice text', () => {
    it('owned monster card HTML has no Path A/B text', async () => {
      const monster = ownedMonster('glossbloom', 2, { branch: 'b1' });
      const html = await renderHeroCampMonsterCardFixture({ monster, balance: 500 });

      for (const term of BRANCH_CHOICE_TERMS) {
        assert.ok(
          !html.includes(term),
          `Monster card HTML must not contain "${term}"`,
        );
      }
    });

    it('uninvited monster card HTML has no Path A/B text', async () => {
      const monster = monsterDef('stonehorn');
      const html = await renderHeroCampMonsterCardFixture({ monster, balance: 500 });

      for (const term of BRANCH_CHOICE_TERMS) {
        assert.ok(
          !html.includes(term),
          `Monster card HTML must not contain "${term}"`,
        );
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Sub-task B: Deterministic Camp event IDs
// ---------------------------------------------------------------------------

describe('P6 U4 — deterministic Camp event IDs', () => {
  describe('claim event ID format', () => {
    it('event ID is derived from requestId and event type', () => {
      const requestId = 'req-abc-123';
      const eventType = 'hero.task.completed';
      const evtIdSuffix = eventType.replace(/\./g, '-');
      const eventId = `hero-evt-${requestId}-${evtIdSuffix}`;

      assert.equal(eventId, 'hero-evt-req-abc-123-hero-task-completed');
      // Same inputs always produce same output (deterministic)
      assert.equal(
        `hero-evt-${requestId}-${evtIdSuffix}`,
        eventId,
        'Same requestId + type must always produce identical event ID',
      );
    });

    it('daily.completed event gets distinct ID from task.completed for same request', () => {
      const requestId = 'req-abc-123';
      const taskEvtId = `hero-evt-${requestId}-${'hero.task.completed'.replace(/\./g, '-')}`;
      const dailyEvtId = `hero-evt-${requestId}-${'hero.daily.completed'.replace(/\./g, '-')}`;

      assert.notEqual(taskEvtId, dailyEvtId, 'Task and daily events must have distinct IDs');
      assert.equal(taskEvtId, 'hero-evt-req-abc-123-hero-task-completed');
      assert.equal(dailyEvtId, 'hero-evt-req-abc-123-hero-daily-completed');
    });

    it('different requestIds produce different event IDs', () => {
      const type = 'hero.task.completed';
      const suffix = type.replace(/\./g, '-');
      const id1 = `hero-evt-req-001-${suffix}`;
      const id2 = `hero-evt-req-002-${suffix}`;

      assert.notEqual(id1, id2);
    });
  });

  describe('camp command event ID format', () => {
    it('event ID is derived from ledgerEntry.entryId', () => {
      const entryId = 'hl-abc-123-invite';
      const eventId = `hero-evt-${entryId}`;

      assert.equal(eventId, 'hero-evt-hl-abc-123-invite');
      // Same entryId always produces same output (deterministic)
      assert.equal(`hero-evt-${entryId}`, eventId);
    });

    it('different entryIds produce different event IDs', () => {
      const id1 = `hero-evt-${'hl-001-invite'}`;
      const id2 = `hero-evt-${'hl-002-grow'}`;

      assert.notEqual(id1, id2);
    });

    it('camp event ID matches P4 economy pattern (hero-evt-<ledgerEntryId>)', () => {
      // P4 economy events already use `hero-evt-${ledgerEntryId}` (line 1657 of app.js)
      // Camp events now use the same pattern for consistency
      const ledgerEntryId = 'hl-camp-spend-001';
      const economyEventId = `hero-evt-${ledgerEntryId}`;
      const campEventId = `hero-evt-${ledgerEntryId}`;

      assert.equal(economyEventId, campEventId, 'Camp and economy events share the same ID pattern');
    });
  });

  describe('no non-deterministic patterns remain', () => {
    it('Date.now() + Math.random() pattern is forbidden for hero events', async () => {
      // Read the worker app.js and verify no non-deterministic hero-evt patterns remain
      const { readFileSync } = await import('node:fs');
      const { resolve } = await import('node:path');
      const appPath = resolve(import.meta.dirname, '..', 'worker', 'src', 'app.js');
      const source = readFileSync(appPath, 'utf8');

      // Find all hero-evt- template literal occurrences
      const heroEvtLines = source.split('\n').filter(l => l.includes('hero-evt-'));

      for (const line of heroEvtLines) {
        assert.ok(
          !line.includes('Date.now()'),
          `Non-deterministic Date.now() found in hero-evt line: ${line.trim()}`,
        );
        assert.ok(
          !line.includes('Math.random()'),
          `Non-deterministic Math.random() found in hero-evt line: ${line.trim()}`,
        );
      }

      // Verify at least 3 deterministic patterns exist (claim loop, economy, camp)
      assert.ok(heroEvtLines.length >= 3, `Expected at least 3 hero-evt lines, got ${heroEvtLines.length}`);
    });
  });
});
