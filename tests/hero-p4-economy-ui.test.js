import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildHeroHomeModel } from '../src/platform/hero/hero-ui-model.js';
import { HERO_ECONOMY_COPY, HERO_FORBIDDEN_VOCABULARY } from '../shared/hero/hero-copy.js';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/** V5 read model with economy block enabled. */
function v5ReadModel({
  coinsEnabled = true,
  balance = 500,
  coinsAwarded = 100,
  awardStatus = 'awarded',
  dailyStatus = 'completed',
} = {}) {
  return {
    version: 5,
    childVisible: true,
    coinsEnabled,
    ui: { enabled: true, surface: 'dashboard', reason: 'enabled', copyVersion: 'hero-p2-copy-v1' },
    dailyQuest: { questId: 'quest-001', effortPlanned: 6, tasks: [] },
    activeHeroSession: null,
    eligibleSubjects: ['spelling', 'grammar'],
    progress: { status: dailyStatus, effortCompleted: 6, completedTaskIds: ['t1'] },
    claim: { enabled: false },
    economy: {
      balance,
      today: { coinsAwarded, awardStatus },
    },
  };
}

/** V4 read model (no economy block). */
function v4ReadModel() {
  return {
    version: 4,
    childVisible: true,
    ui: { enabled: true, surface: 'dashboard', reason: 'enabled', copyVersion: 'hero-p2-copy-v1' },
    dailyQuest: { questId: 'quest-001', effortPlanned: 6, tasks: [] },
    activeHeroSession: null,
    eligibleSubjects: ['spelling', 'grammar'],
    progress: { status: 'completed', effortCompleted: 6, completedTaskIds: ['t1'] },
    claim: { enabled: false },
  };
}

// ---------------------------------------------------------------------------
// buildHeroHomeModel — economy field derivation
// ---------------------------------------------------------------------------

describe('buildHeroHomeModel — economy fields (P4 U6)', () => {
  it('v5 read model with economy enabled returns correct economy fields', () => {
    const heroUi = { status: 'ready', readModel: v5ReadModel() };
    const result = buildHeroHomeModel(heroUi);

    assert.equal(result.coinsEnabled, true);
    assert.equal(result.coinBalance, 500);
    assert.equal(result.coinsAwardedToday, 100);
    assert.equal(result.dailyAwardStatus, 'awarded');
    assert.equal(result.showCoinsAwarded, true);
    assert.equal(result.showCoinBalance, true);
  });

  it('v4 read model (no economy block) returns coinsEnabled: false', () => {
    const heroUi = { status: 'ready', readModel: v4ReadModel() };
    const result = buildHeroHomeModel(heroUi);

    assert.equal(result.coinsEnabled, false);
    assert.equal(result.coinBalance, 0);
    assert.equal(result.coinsAwardedToday, 0);
    assert.equal(result.dailyAwardStatus, 'not-eligible');
    assert.equal(result.showCoinsAwarded, false);
    assert.equal(result.showCoinBalance, false);
  });

  it('daily complete + economy on → showCoinsAwarded: true, correct balance', () => {
    const heroUi = {
      status: 'ready',
      readModel: v5ReadModel({ balance: 700, coinsAwarded: 100, awardStatus: 'awarded' }),
    };
    const result = buildHeroHomeModel(heroUi);

    assert.equal(result.dailyStatus, 'completed');
    assert.equal(result.showCoinsAwarded, true);
    assert.equal(result.coinBalance, 700);
    assert.equal(result.coinsAwardedToday, 100);
  });

  it('daily complete + economy off → showCoinsAwarded: false', () => {
    const heroUi = {
      status: 'ready',
      readModel: v5ReadModel({ coinsEnabled: false }),
    };
    const result = buildHeroHomeModel(heroUi);

    assert.equal(result.dailyStatus, 'completed');
    assert.equal(result.showCoinsAwarded, false);
    assert.equal(result.coinsEnabled, false);
    assert.equal(result.coinBalance, 0);
  });

  it('economy on but award not yet issued (status=available) → showCoinsAwarded: false', () => {
    const heroUi = {
      status: 'ready',
      readModel: v5ReadModel({ awardStatus: 'available', coinsAwarded: 0 }),
    };
    const result = buildHeroHomeModel(heroUi);

    assert.equal(result.coinsEnabled, true);
    assert.equal(result.dailyAwardStatus, 'available');
    assert.equal(result.showCoinsAwarded, false);
  });

  it('zero balance displays correctly (first day, coinsAwardedToday=100, coinBalance=100)', () => {
    const heroUi = {
      status: 'ready',
      readModel: v5ReadModel({ balance: 100, coinsAwarded: 100, awardStatus: 'awarded' }),
    };
    const result = buildHeroHomeModel(heroUi);

    assert.equal(result.coinBalance, 100);
    assert.equal(result.coinsAwardedToday, 100);
    assert.equal(result.showCoinsAwarded, true);
  });

  it('coinsEnabled true but economy block missing → safe defaults', () => {
    const rm = v5ReadModel();
    delete rm.economy;
    const heroUi = { status: 'ready', readModel: rm };
    const result = buildHeroHomeModel(heroUi);

    assert.equal(result.coinsEnabled, true);
    assert.equal(result.coinBalance, 0);
    assert.equal(result.coinsAwardedToday, 0);
    assert.equal(result.dailyAwardStatus, 'not-eligible');
    assert.equal(result.showCoinsAwarded, false);
  });

  it('economy block present but coinsEnabled false → fields are zeroed', () => {
    const rm = v5ReadModel({ coinsEnabled: false });
    // Still has economy block in the read model
    rm.economy = { balance: 999, today: { coinsAwarded: 100, awardStatus: 'awarded' } };
    const heroUi = { status: 'ready', readModel: rm };
    const result = buildHeroHomeModel(heroUi);

    assert.equal(result.coinsEnabled, false);
    assert.equal(result.coinBalance, 0);
    assert.equal(result.coinsAwardedToday, 0);
    assert.equal(result.showCoinsAwarded, false);
    assert.equal(result.showCoinBalance, false);
  });
});

// ---------------------------------------------------------------------------
// HeroQuestCard — economy rendering (structural assertions via source scan)
// ---------------------------------------------------------------------------

describe('HeroQuestCard — economy rendering (P4 U6)', () => {
  const cardSource = readFileSync(
    resolve(import.meta.dirname, '..', 'src', 'surfaces', 'home', 'HeroQuestCard.jsx'),
    'utf8',
  );

  it('HeroQuestCard imports HERO_ECONOMY_COPY', () => {
    assert.ok(
      cardSource.includes('HERO_ECONOMY_COPY'),
      'HeroQuestCard must import HERO_ECONOMY_COPY',
    );
  });

  it('HeroQuestCard renders economy block when showCoinsAwarded is true', () => {
    assert.ok(
      cardSource.includes('hero.showCoinsAwarded'),
      'HeroQuestCard must branch on hero.showCoinsAwarded',
    );
    assert.ok(
      cardSource.includes('hero-quest-card__economy'),
      'HeroQuestCard must have an economy container class',
    );
    assert.ok(
      cardSource.includes('hero-quest-card__coins-added'),
      'HeroQuestCard must render coins-added element',
    );
    assert.ok(
      cardSource.includes('hero-quest-card__coin-balance'),
      'HeroQuestCard must render coin-balance element',
    );
  });

  it('HeroQuestCard renders P3 dailyCompleteDetail when economy is off', () => {
    assert.ok(
      cardSource.includes('!hero.showCoinsAwarded'),
      'HeroQuestCard must handle showCoinsAwarded=false with P3 copy',
    );
    assert.ok(
      cardSource.includes('HERO_PROGRESS_COPY.dailyCompleteDetail'),
      'HeroQuestCard must show dailyCompleteDetail when economy is off',
    );
  });

  it('HeroQuestCard uses coinsAwardedToday and coinBalance from hero model', () => {
    assert.ok(
      cardSource.includes('hero.coinsAwardedToday'),
      'HeroQuestCard must display coinsAwardedToday',
    );
    assert.ok(
      cardSource.includes('hero.coinBalance'),
      'HeroQuestCard must display coinBalance',
    );
  });
});

// ---------------------------------------------------------------------------
// HeroTaskBanner — MUST remain economy-free
// ---------------------------------------------------------------------------

describe('HeroTaskBanner — no economy vocabulary (P4 U6)', () => {
  const bannerSourceRaw = readFileSync(
    resolve(import.meta.dirname, '..', 'src', 'surfaces', 'subject', 'HeroTaskBanner.jsx'),
    'utf8',
  );

  // Strip block comments (/** ... */) and line comments (// ...) to scan
  // only executable code and string literals — JSDoc may reference economy
  // terms when documenting what the banner does NOT render.
  const bannerSource = bannerSourceRaw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

  it('HeroTaskBanner does not import HERO_ECONOMY_COPY', () => {
    assert.ok(
      !bannerSource.includes('HERO_ECONOMY_COPY'),
      'HeroTaskBanner must NOT import economy copy',
    );
  });

  it('HeroTaskBanner contains no economy-related class names', () => {
    const economyPatterns = ['economy', 'coin', 'balance', 'award'];
    for (const pattern of economyPatterns) {
      assert.ok(
        !bannerSource.toLowerCase().includes(pattern),
        `HeroTaskBanner must not contain "${pattern}"`,
      );
    }
  });

  it('HeroTaskBanner source passes forbidden vocabulary scan', () => {
    const lower = bannerSource.toLowerCase();
    for (const token of HERO_FORBIDDEN_VOCABULARY) {
      const tokenLower = token.toLowerCase();
      const found = tokenLower.includes(' ')
        ? lower.includes(tokenLower)
        : new RegExp(`\\b${tokenLower}\\b`).test(lower);
      assert.ok(
        !found,
        `HeroTaskBanner contains forbidden economy token "${token}"`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// HERO_ECONOMY_COPY — structural assertions
// ---------------------------------------------------------------------------

describe('HERO_ECONOMY_COPY — structure (P4 U6)', () => {
  it('is frozen', () => {
    assert.ok(Object.isFrozen(HERO_ECONOMY_COPY));
  });

  it('has all required keys', () => {
    const requiredKeys = ['coinsAdded', 'coinsAddedDetail', 'balanceLabel', 'savedForCamp', 'dailyAvailable'];
    for (const key of requiredKeys) {
      assert.ok(key in HERO_ECONOMY_COPY, `Missing key: ${key}`);
      assert.equal(typeof HERO_ECONOMY_COPY[key], 'string');
      assert.ok(HERO_ECONOMY_COPY[key].length > 0, `${key} must be non-empty`);
    }
  });

  it('uses calm, non-pressurising language (no shop/deal/streak/loot)', () => {
    const pressureTokens = ['shop', 'deal', 'streak', 'loot', 'grind', 'jackpot', 'limited time'];
    for (const [key, text] of Object.entries(HERO_ECONOMY_COPY)) {
      const lower = text.toLowerCase();
      for (const token of pressureTokens) {
        assert.ok(
          !lower.includes(token),
          `HERO_ECONOMY_COPY['${key}'] must not contain pressure token "${token}"`,
        );
      }
    }
  });
});
