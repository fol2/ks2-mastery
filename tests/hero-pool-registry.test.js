'use strict';

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  HERO_POOL_REGISTRY,
  HERO_POOL_INITIAL_MONSTER_IDS,
  HERO_MONSTER_INVITE_COST,
  HERO_MONSTER_GROW_COSTS,
  getHeroMonsterDefinition,
  getInviteCost,
  getGrowCost,
  isValidHeroMonsterId,
  isValidBranch,
  isValidHeroMonsterBranch,
  getMaxStage,
} from '../shared/hero/hero-pool.js';

// ── Registry completeness ───────────────────────────────────────────

describe('HERO_POOL_REGISTRY', () => {
  it('contains exactly 6 unique monster IDs', () => {
    const ids = Object.keys(HERO_POOL_REGISTRY);
    assert.equal(ids.length, 6);
    assert.equal(new Set(ids).size, 6);
  });

  it('initial monster IDs array matches registry keys in display order', () => {
    assert.deepEqual(
      HERO_POOL_INITIAL_MONSTER_IDS,
      Object.keys(HERO_POOL_REGISTRY).sort(
        (a, b) => HERO_POOL_REGISTRY[a].displayOrder - HERO_POOL_REGISTRY[b].displayOrder
      )
    );
  });

  it('all definitions have complete required fields', () => {
    const requiredFields = [
      'monsterId', 'displayName', 'sourceAssetMonsterId', 'origin',
      'displayOrder', 'maxStage', 'inviteCost', 'growCosts',
      'branchOptions', 'childBlurb',
    ];
    for (const [id, def] of Object.entries(HERO_POOL_REGISTRY)) {
      for (const field of requiredFields) {
        assert.ok(
          field in def,
          `Monster '${id}' is missing field '${field}'`
        );
      }
      assert.equal(def.monsterId, id);
    }
  });
});

// ── Cost invariants ─────────────────────────────────────────────────

describe('Cost contract', () => {
  it('invite cost is a positive integer', () => {
    assert.equal(typeof HERO_MONSTER_INVITE_COST, 'number');
    assert.ok(HERO_MONSTER_INVITE_COST > 0);
    assert.ok(Number.isInteger(HERO_MONSTER_INVITE_COST));
  });

  it('grow costs are positive integers that strictly increase by stage', () => {
    const stages = Object.keys(HERO_MONSTER_GROW_COSTS).map(Number).sort((a, b) => a - b);
    assert.deepEqual(stages, [1, 2, 3, 4]);

    let prev = 0;
    for (const stage of stages) {
      const cost = HERO_MONSTER_GROW_COSTS[stage];
      assert.equal(typeof cost, 'number');
      assert.ok(Number.isInteger(cost));
      assert.ok(cost > prev, `Stage ${stage} cost ${cost} must exceed prev ${prev}`);
      prev = cost;
    }
  });

  it('getInviteCost() returns the invite cost constant', () => {
    assert.equal(getInviteCost(), HERO_MONSTER_INVITE_COST);
  });

  it('getGrowCost(targetStage) returns correct costs', () => {
    assert.equal(getGrowCost(1), 300);
    assert.equal(getGrowCost(2), 600);
    assert.equal(getGrowCost(3), 1000);
    assert.equal(getGrowCost(4), 1600);
  });

  it('getGrowCost(5) returns undefined (beyond max stage)', () => {
    assert.equal(getGrowCost(5), undefined);
  });
});

// ── Stage and branch invariants ─────────────────────────────────────

describe('Stage and branch contract', () => {
  it('max stage is 4 for all monsters', () => {
    for (const [id, def] of Object.entries(HERO_POOL_REGISTRY)) {
      assert.equal(def.maxStage, 4, `Monster '${id}' maxStage must be 4`);
    }
    assert.equal(getMaxStage(), 4);
  });

  it('branch options are b1 and b2 for all monsters', () => {
    for (const [id, def] of Object.entries(HERO_POOL_REGISTRY)) {
      const branches = def.branchOptions.map(b => b.branch);
      assert.deepEqual(branches, ['b1', 'b2'], `Monster '${id}' branches`);
    }
  });

  it('isValidBranch accepts b1 and b2', () => {
    assert.equal(isValidBranch('b1'), true);
    assert.equal(isValidBranch('b2'), true);
  });

  it('isValidBranch rejects b3', () => {
    assert.equal(isValidBranch('b3'), false);
  });

  it('isValidBranch rejects non-strings', () => {
    assert.equal(isValidBranch(null), false);
    assert.equal(isValidBranch(undefined), false);
    assert.equal(isValidBranch(1), false);
  });

  it('isValidHeroMonsterBranch is the same function', () => {
    assert.equal(isValidHeroMonsterBranch, isValidBranch);
  });
});

// ── Lookup helpers ──────────────────────────────────────────────────

describe('Lookup helpers', () => {
  it('getHeroMonsterDefinition returns correct definition', () => {
    const def = getHeroMonsterDefinition('glossbloom');
    assert.equal(def.monsterId, 'glossbloom');
    assert.equal(def.displayName, 'Glossbloom');
    assert.equal(def.origin, 'grammar-reserve');
  });

  it('getHeroMonsterDefinition returns undefined for unknown ID', () => {
    assert.equal(getHeroMonsterDefinition('unknown'), undefined);
  });

  it('isValidHeroMonsterId validates known IDs', () => {
    for (const id of HERO_POOL_INITIAL_MONSTER_IDS) {
      assert.equal(isValidHeroMonsterId(id), true);
    }
  });

  it('isValidHeroMonsterId rejects unknown strings', () => {
    assert.equal(isValidHeroMonsterId('unknown'), false);
    assert.equal(isValidHeroMonsterId(''), false);
  });

  it('isValidHeroMonsterId rejects non-strings', () => {
    assert.equal(isValidHeroMonsterId(null), false);
    assert.equal(isValidHeroMonsterId(123), false);
  });
});

// ── Freeze contract ─────────────────────────────────────────────────

describe('Freeze contract', () => {
  it('HERO_POOL_REGISTRY is frozen — mutations throw in strict mode', () => {
    assert.ok(Object.isFrozen(HERO_POOL_REGISTRY));
    assert.throws(() => { HERO_POOL_REGISTRY.newMonster = {}; }, TypeError);
  });

  it('individual monster definitions are frozen', () => {
    for (const def of Object.values(HERO_POOL_REGISTRY)) {
      assert.ok(Object.isFrozen(def));
    }
  });

  it('HERO_POOL_INITIAL_MONSTER_IDS is frozen', () => {
    assert.ok(Object.isFrozen(HERO_POOL_INITIAL_MONSTER_IDS));
    assert.throws(() => { HERO_POOL_INITIAL_MONSTER_IDS.push('x'); }, TypeError);
  });

  it('HERO_MONSTER_GROW_COSTS is frozen', () => {
    assert.ok(Object.isFrozen(HERO_MONSTER_GROW_COSTS));
    assert.throws(() => { HERO_MONSTER_GROW_COSTS[5] = 9999; }, TypeError);
  });
});

// ── Purity contract ─────────────────────────────────────────────────

describe('Purity contract', () => {
  it('hero-pool.js has zero imports from worker/, src/, or subject modules', () => {
    const filePath = resolve(import.meta.dirname, '..', 'shared', 'hero', 'hero-pool.js');
    const source = readFileSync(filePath, 'utf8');

    // Must not import from worker/, src/, or subject-specific modules
    const forbidden = [
      /from\s+['"].*worker\//,
      /from\s+['"].*src\//,
      /require\(['"].*worker\//,
      /require\(['"].*src\//,
      /from\s+['"]react/,
      /from\s+['"]node:/,
    ];
    for (const pattern of forbidden) {
      assert.equal(
        pattern.test(source),
        false,
        `hero-pool.js must not match: ${pattern}`
      );
    }
  });
});
