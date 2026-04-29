// Hero Mode P5 U9 — Hero Camp UI surface and monster card tests.
//
// Validates:
//  - Camp panel visibility (enabled vs disabled)
//  - Hero Quest remains primary action (not displaced by Camp)
//  - Monster card rendering (invite, grow, fully grown)
//  - Insufficient balance messaging
//  - Confirmation dialog copy
//  - Vocabulary boundary (no shop/deal/loot/limited-time/streak)
//  - Keyboard accessibility (buttons are focusable with labels)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  renderHeroCampPanelFixture,
  renderHeroCampMonsterCardFixture,
  renderHeroCampConfirmationFixture,
  renderHomeSurfaceWithCampFixture,
} from './helpers/react-render.js';
import { HERO_FORBIDDEN_VOCABULARY } from '../shared/hero/hero-copy.js';
import { buildHeroCampModel } from '../src/platform/hero/hero-camp-model.js';

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
    nextGrowCost: stage === 1 ? 300 : stage === 2 ? 600 : stage === 3 ? 1000 : 1600,
    canAffordGrow: true,
    ...overrides,
  });
}

function fullyGrownMonster(id) {
  return monsterDef(id, {
    owned: true,
    fullyGrown: true,
    stage: 4,
    maxStage: 4,
    branch: 'b1',
    nextStage: null,
    nextGrowCost: null,
    canAffordGrow: false,
    canAffordInvite: false,
  });
}

function sixMonsters(overrides = []) {
  const ids = ['glossbloom', 'loomrill', 'mirrane', 'colisk', 'hyphang', 'carillon'];
  return ids.map((id, i) => overrides[i] ? { ...monsterDef(id), ...overrides[i] } : monsterDef(id));
}

function campModelEnabled(monsters = sixMonsters(), balance = 500) {
  return {
    campEnabled: true,
    balance,
    balanceLabel: `${balance} Hero Coins`,
    monsters,
    selectedMonsterId: null,
    rosterVersion: 'hero-pool-v1',
    recentActions: [],
    lastAction: null,
    hasAffordableAction: monsters.some(m => m.canAffordInvite || m.canAffordGrow),
    insufficientBalanceMessage: 'Save more Hero Coins by completing Hero Quests.',
  };
}

function campModelDisabled() {
  return { campEnabled: false, balance: 0, monsters: [] };
}

function heroModel(overrides = {}) {
  return {
    status: 'ready',
    enabled: true,
    nextTask: {
      taskId: 'task-001',
      subjectId: 'spelling',
      intent: 'weak-repair',
      launcher: 'standard-practice',
      launchStatus: 'launchable',
      childLabel: 'Spelling: Practise something tricky',
      childReason: 'This will help you get better at something you find tricky.',
    },
    activeHeroSession: null,
    canStart: true,
    canContinue: false,
    error: '',
    effortPlanned: 18,
    eligibleSubjects: ['spelling', 'grammar'],
    lockedSubjects: [],
    lastLaunch: null,
    coinsEnabled: true,
    coinBalance: 500,
    dailyStatus: 'none',
    ...overrides,
  };
}

// Build a heroReadModel that will produce camp data through buildHeroCampModel
function heroReadModelWithCamp(monsters = sixMonsters(), balance = 500) {
  return {
    camp: {
      enabled: true,
      balance,
      monsters,
      selectedMonsterId: null,
      rosterVersion: 'hero-pool-v1',
      recentActions: [],
    },
  };
}

// ---------------------------------------------------------------------------
// Camp panel integration on HomeSurface
// ---------------------------------------------------------------------------

describe('Hero Camp panel on HomeSurface', () => {
  it('camp panel appears when hero is active and camp is enabled', async () => {
    const html = await renderHomeSurfaceWithCampFixture({
      hero: heroModel(),
      heroCamp: { campEnabled: true },
    });
    assert.ok(html.includes('data-hero-camp-panel'), 'camp panel is rendered');
    assert.ok(html.includes('Hero Camp'), 'camp title is rendered');
  });

  it('camp panel does NOT appear when camp is disabled', async () => {
    const html = await renderHomeSurfaceWithCampFixture({
      hero: heroModel(),
      heroCamp: { campEnabled: false },
    });
    assert.ok(!html.includes('data-hero-camp-panel'), 'camp panel is not rendered');
  });

  it('camp panel does NOT appear when hero is not active', async () => {
    const html = await renderHomeSurfaceWithCampFixture({
      hero: { enabled: false, status: 'idle' },
      heroCamp: { campEnabled: true },
    });
    assert.ok(!html.includes('data-hero-camp-panel'), 'camp panel not rendered without hero');
  });

  it('Hero Quest remains primary action — camp panel is secondary', async () => {
    const html = await renderHomeSurfaceWithCampFixture({
      hero: heroModel(),
      heroCamp: { campEnabled: true },
    });
    const heroCardPos = html.indexOf('data-hero-card');
    const campPanelPos = html.indexOf('data-hero-camp-panel');
    assert.ok(heroCardPos >= 0, 'hero card is present');
    assert.ok(campPanelPos >= 0, 'camp panel is present');
    assert.ok(heroCardPos < campPanelPos, 'hero card appears before camp panel');
  });
});

// ---------------------------------------------------------------------------
// HeroCampPanel (standalone)
// ---------------------------------------------------------------------------

describe('HeroCampPanel', () => {
  it('renders nothing when campModel is disabled', async () => {
    const html = await renderHeroCampPanelFixture({
      campModel: campModelDisabled(),
      balance: 500,
    });
    assert.ok(!html.includes('data-hero-camp-panel'), 'panel is not rendered');
  });

  it('renders six monster cards when camp model has 6 monsters', async () => {
    const html = await renderHeroCampPanelFixture({
      campModel: campModelEnabled(),
      balance: 500,
    });
    assert.ok(html.includes('data-hero-camp-panel'), 'panel renders');
    // Count monster cards by data-monster-id
    const matches = html.match(/data-monster-id/g);
    assert.equal(matches?.length, 6, 'six monster cards rendered');
  });

  it('shows balance', async () => {
    const html = await renderHeroCampPanelFixture({
      campModel: campModelEnabled(sixMonsters(), 750),
      balance: 750,
    });
    assert.ok(html.includes('750'), 'balance value is shown');
    assert.ok(html.includes('Hero Coins'), 'Hero Coins label is shown');
  });

  it('shows invite prompt when no monsters are owned', async () => {
    const html = await renderHeroCampPanelFixture({
      campModel: campModelEnabled(),
      balance: 500,
    });
    assert.ok(html.includes('Choose a Hero monster to invite.'), 'invite prompt shown');
  });

  it('shows all-grown message when every monster is fully grown', async () => {
    const allGrown = ['glossbloom', 'loomrill', 'mirrane', 'colisk', 'hyphang', 'carillon']
      .map(id => fullyGrownMonster(id));
    const html = await renderHeroCampPanelFixture({
      campModel: campModelEnabled(allGrown),
      balance: 500,
    });
    assert.ok(html.includes('fully grown'), 'all-grown message shown');
    assert.ok(html.includes('Well done'), 'celebratory message shown');
  });

  it('has section role with aria-label', async () => {
    const html = await renderHeroCampPanelFixture({
      campModel: campModelEnabled(),
      balance: 500,
    });
    assert.ok(html.includes('aria-label="Hero Camp"'), 'section has aria-label');
  });
});

// ---------------------------------------------------------------------------
// HeroCampMonsterCard
// ---------------------------------------------------------------------------

describe('HeroCampMonsterCard', () => {
  it('invite CTA shows correct cost', async () => {
    const html = await renderHeroCampMonsterCardFixture({
      monster: monsterDef('glossbloom', { inviteCost: 150 }),
      balance: 500,
    });
    assert.ok(html.includes('Invite'), 'CTA contains Invite');
    assert.ok(html.includes('150 Hero Coins'), 'CTA shows cost of 150');
  });

  it('grow CTA shows correct cost and target stage', async () => {
    const html = await renderHeroCampMonsterCardFixture({
      monster: ownedMonster('loomrill', 2, { nextGrowCost: 600, nextStage: 3 }),
      balance: 1000,
    });
    assert.ok(html.includes('Grow'), 'CTA contains Grow');
    assert.ok(html.includes('600 Hero Coins'), 'CTA shows grow cost');
  });

  it('fully grown shows "Fully grown" with no action button', async () => {
    const html = await renderHeroCampMonsterCardFixture({
      monster: fullyGrownMonster('mirrane'),
      balance: 500,
    });
    assert.ok(html.includes('Fully grown'), 'shows Fully grown label');
    // No Invite or Grow CTA when fully grown
    assert.ok(!html.includes('Invite'), 'no Invite text');
    assert.ok(!html.includes('>Grow'), 'no Grow CTA');
  });

  it('insufficient balance shows calm "Save more" copy', async () => {
    const html = await renderHeroCampMonsterCardFixture({
      monster: monsterDef('colisk', { inviteCost: 150 }),
      balance: 50, // not enough
    });
    assert.ok(html.includes('Save more Hero Coins by completing Hero Quests'), 'insufficient message shown');
    assert.ok(html.includes('disabled'), 'button is disabled');
  });

  it('shows monster name and blurb', async () => {
    const html = await renderHeroCampMonsterCardFixture({
      monster: monsterDef('hyphang', { displayName: 'Hyphang', childBlurb: 'A boundary creature.' }),
      balance: 500,
    });
    assert.ok(html.includes('Hyphang'), 'monster name rendered');
    assert.ok(html.includes('A boundary creature.'), 'blurb rendered');
  });

  it('does NOT show branch badge (P6 branch-choice policy: no child-facing branch UI)', async () => {
    const html = await renderHeroCampMonsterCardFixture({
      monster: ownedMonster('glossbloom', 1, { branch: 'b1' }),
      balance: 500,
    });
    assert.ok(!html.includes('Path A'), 'branch badge must not be visible to child');
    assert.ok(!html.includes('Path B'), 'branch badge must not be visible to child');
  });

  it('shows stage indicator when owned', async () => {
    const html = await renderHeroCampMonsterCardFixture({
      monster: ownedMonster('loomrill', 2),
      balance: 500,
    });
    assert.ok(html.includes('Stage 2'), 'stage label shown');
  });
});

// ---------------------------------------------------------------------------
// HeroCampConfirmation
// ---------------------------------------------------------------------------

describe('HeroCampConfirmation', () => {
  it('renders nothing when not visible', async () => {
    const html = await renderHeroCampConfirmationFixture({
      visible: false,
      heading: 'Use 150 Hero Coins to invite Glossbloom?',
      balanceAfter: 'Your balance will be 350 Hero Coins.',
      actionLabel: 'invite',
    });
    assert.ok(!html.includes('hero-camp-confirmation'), 'dialog is not rendered');
  });

  it('shows correct cost and balance-after', async () => {
    const html = await renderHeroCampConfirmationFixture({
      visible: true,
      heading: 'Use 150 Hero Coins to invite Glossbloom?',
      balanceAfter: 'Your balance will be 350 Hero Coins.',
      actionLabel: 'invite',
    });
    assert.ok(html.includes('Use 150 Hero Coins to invite Glossbloom?'), 'heading shown');
    assert.ok(html.includes('Your balance will be 350 Hero Coins.'), 'balance-after shown');
  });

  it('shows confirm and cancel buttons', async () => {
    const html = await renderHeroCampConfirmationFixture({
      visible: true,
      heading: 'Use 300 Hero Coins to grow Loomrill?',
      balanceAfter: 'Your balance will be 200 Hero Coins.',
      actionLabel: 'grow',
    });
    assert.ok(html.includes('Yes, grow'), 'confirm button text');
    assert.ok(html.includes('Not now'), 'cancel button text');
  });

  it('has dialog role and aria-modal', async () => {
    const html = await renderHeroCampConfirmationFixture({
      visible: true,
      heading: 'Use 150 Hero Coins to invite Mirrane?',
      balanceAfter: 'Your balance will be 350 Hero Coins.',
      actionLabel: 'invite',
    });
    assert.ok(html.includes('role="dialog"'), 'has dialog role');
    assert.ok(html.includes('aria-modal="true"'), 'has aria-modal');
  });
});

// ---------------------------------------------------------------------------
// Vocabulary boundary — no forbidden words in ANY rendered output
// ---------------------------------------------------------------------------

describe('Hero Camp vocabulary boundary', () => {
  it('panel output contains no shop/deal/loot/limited-time/streak vocabulary', async () => {
    const html = await renderHeroCampPanelFixture({
      campModel: campModelEnabled(),
      balance: 500,
    });
    const lower = html.toLowerCase();
    for (const word of HERO_FORBIDDEN_VOCABULARY) {
      assert.ok(
        !lower.includes(word.toLowerCase()),
        `forbidden word "${word}" found in panel output`,
      );
    }
  });

  it('monster card output contains no forbidden vocabulary', async () => {
    const html = await renderHeroCampMonsterCardFixture({
      monster: monsterDef('glossbloom'),
      balance: 500,
    });
    const lower = html.toLowerCase();
    for (const word of HERO_FORBIDDEN_VOCABULARY) {
      assert.ok(
        !lower.includes(word.toLowerCase()),
        `forbidden word "${word}" found in monster card output`,
      );
    }
  });

  it('confirmation dialog output contains no forbidden vocabulary', async () => {
    const html = await renderHeroCampConfirmationFixture({
      visible: true,
      heading: 'Use 150 Hero Coins to invite Glossbloom?',
      balanceAfter: 'Your balance will be 350 Hero Coins.',
      actionLabel: 'invite',
    });
    const lower = html.toLowerCase();
    for (const word of HERO_FORBIDDEN_VOCABULARY) {
      assert.ok(
        !lower.includes(word.toLowerCase()),
        `forbidden word "${word}" found in confirmation output`,
      );
    }
  });

  it('home surface with camp output contains no forbidden vocabulary', async () => {
    const html = await renderHomeSurfaceWithCampFixture({
      hero: heroModel(),
      heroCamp: { campEnabled: true },
    });
    const lower = html.toLowerCase();
    for (const word of HERO_FORBIDDEN_VOCABULARY) {
      assert.ok(
        !lower.includes(word.toLowerCase()),
        `forbidden word "${word}" found in home surface with camp output`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Keyboard accessibility — buttons focusable with labels
// ---------------------------------------------------------------------------

describe('Hero Camp accessibility', () => {
  it('monster card invite button has aria-label', async () => {
    const html = await renderHeroCampMonsterCardFixture({
      monster: monsterDef('glossbloom', { inviteCost: 150 }),
      balance: 500,
    });
    assert.ok(html.includes('aria-label="Invite'), 'invite button has aria-label');
    assert.ok(html.includes('type="button"'), 'button has type attribute');
  });

  it('monster card grow button has aria-label', async () => {
    const html = await renderHeroCampMonsterCardFixture({
      monster: ownedMonster('loomrill', 1, { nextGrowCost: 300 }),
      balance: 500,
    });
    assert.ok(html.includes('aria-label="Grow'), 'grow button has aria-label');
  });

  it('confirmation confirm button has aria-label', async () => {
    const html = await renderHeroCampConfirmationFixture({
      visible: true,
      heading: 'Use 150 Hero Coins to invite Glossbloom?',
      balanceAfter: 'Your balance will be 350 Hero Coins.',
      actionLabel: 'invite',
    });
    assert.ok(html.includes('aria-label="Yes, invite"'), 'confirm button has label');
    assert.ok(html.includes('aria-label="Not now"'), 'cancel button has label');
  });

  it('camp panel section has aria-label', async () => {
    const html = await renderHeroCampPanelFixture({
      campModel: campModelEnabled(),
      balance: 500,
    });
    assert.ok(html.includes('aria-label="Hero Camp"'), 'section has aria-label');
  });
});

// ---------------------------------------------------------------------------
// buildHeroCampModel pure logic
// ---------------------------------------------------------------------------

describe('buildHeroCampModel', () => {
  it('returns disabled model when camp is not in read model', () => {
    const result = buildHeroCampModel(null);
    assert.equal(result.campEnabled, false);
  });

  it('returns disabled model when camp.enabled is false', () => {
    const result = buildHeroCampModel({ camp: { enabled: false } });
    assert.equal(result.campEnabled, false);
  });

  it('returns enabled model with correct balance', () => {
    const result = buildHeroCampModel({
      camp: {
        enabled: true,
        balance: 750,
        monsters: [],
        selectedMonsterId: null,
        rosterVersion: 'hero-pool-v1',
        recentActions: [],
      },
    });
    assert.equal(result.campEnabled, true);
    assert.equal(result.balance, 750);
    assert.equal(result.balanceLabel, '750 Hero Coins');
  });
});
