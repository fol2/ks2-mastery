import { describe, expect, it } from "vitest";
import {
  buildBootstrapStats,
  recordMonsterMastery,
  savePrefs,
  SPELLING_MODES,
} from "../../worker/lib/spelling-service.js";
import { aggregateEventsForWrite } from "../../worker/lib/monster-aggregates.js";

function mkChildState(overrides = {}) {
  return {
    spellingProgress: {},
    monsterState: {},
    spellingPrefs: {},
    updatedAt: 0,
    ...overrides,
  };
}

function mkMonsters({ ink = 0, glim = 0 } = {}) {
  return {
    inklet: {
      mastered: Array.from({ length: ink }, (_, i) => `ink-${i}`),
      caught: ink >= 10,
    },
    glimmerbug: {
      mastered: Array.from({ length: glim }, (_, i) => `glim-${i}`),
      caught: glim >= 10,
    },
  };
}

const CHILD_ID = "test-child";

describe("Phaeton aggregate (via buildBootstrapStats)", () => {
  it("stays uncaught at stage 0 until BOTH pools have >=10 AND combined >=20", () => {
    const oneSideShort = buildBootstrapStats(CHILD_ID, mkChildState({
      monsterState: mkMonsters({ ink: 9, glim: 20 }),
    }));
    expect(oneSideShort.monsters.phaeton.caught).toBe(false);
    expect(oneSideShort.monsters.phaeton.stage).toBe(0);

    const stage1 = buildBootstrapStats(CHILD_ID, mkChildState({
      monsterState: mkMonsters({ ink: 11, glim: 11 }),
    }));
    expect(stage1.monsters.phaeton.caught).toBe(true);
    expect(stage1.monsters.phaeton.stage).toBe(1);
  });

  it("hits stage 2 at combined 60 when both sides are caught", () => {
    const got = buildBootstrapStats(CHILD_ID, mkChildState({
      monsterState: mkMonsters({ ink: 30, glim: 30 }),
    }));
    expect(got.monsters.phaeton.stage).toBe(2);
  });

  it("hits stage 3 at combined 120", () => {
    const got = buildBootstrapStats(CHILD_ID, mkChildState({
      monsterState: mkMonsters({ ink: 60, glim: 60 }),
    }));
    expect(got.monsters.phaeton.stage).toBe(3);
  });

  it("only reaches Mega (stage 4) when BOTH pools are fully mastered (100+100)", () => {
    const shortOfMega = buildBootstrapStats(CHILD_ID, mkChildState({
      monsterState: mkMonsters({ ink: 100, glim: 99 }),
    }));
    expect(shortOfMega.monsters.phaeton.stage).toBe(3);

    const mega = buildBootstrapStats(CHILD_ID, mkChildState({
      monsterState: mkMonsters({ ink: 100, glim: 100 }),
    }));
    expect(mega.monsters.phaeton.stage).toBe(4);
    expect(mega.monsters.phaeton.mastered).toBe(200);
    expect(mega.monsters.phaeton.caught).toBe(true);
  });

  it("caps level at 10 and reports combined mastery count", () => {
    const got = buildBootstrapStats(CHILD_ID, mkChildState({
      monsterState: mkMonsters({ ink: 100, glim: 100 }),
    }));
    expect(got.monsters.phaeton.level).toBe(10);
  });

  it("includes Inklet, Glimmerbug, and Phaeton in every bootstrap payload", () => {
    const got = buildBootstrapStats(CHILD_ID, mkChildState());
    expect(Object.keys(got.monsters).sort()).toEqual(["glimmerbug", "inklet", "phaeton"]);
  });
});

describe("savePrefs", () => {
  it("normalises missing fields to safe defaults", () => {
    const next = savePrefs(mkChildState(), {});
    expect(next.spellingPrefs).toEqual({
      yearFilter: "all",
      roundLength: "20",
      showCloze: true,
      autoSpeak: true,
    });
  });

  it("preserves explicit boolean falses (user switched auto-speak off)", () => {
    const next = savePrefs(mkChildState(), { showCloze: false, autoSpeak: false });
    expect(next.spellingPrefs.showCloze).toBe(false);
    expect(next.spellingPrefs.autoSpeak).toBe(false);
  });
});

describe("SPELLING_MODES", () => {
  it("freezes the four canonical mode ids", () => {
    expect(Object.values(SPELLING_MODES).sort()).toEqual([
      "single",
      "smart",
      "test",
      "trouble",
    ]);
  });
});

describe("recordMonsterMastery — mutation safety", () => {
  it("does not mutate the caller's monsterState when a word crosses the catch threshold", () => {
    const monsterState = {
      glimmerbug: {
        mastered: Array.from({ length: 9 }, (_, i) => `glim-${i}`),
        caught: false,
      },
    };
    const snapshot = JSON.parse(JSON.stringify(monsterState));
    recordMonsterMastery(monsterState, "glimmerbug", "glim-9");
    expect(monsterState).toEqual(snapshot);
  });

  it("leaves the aliased 'prev' state unchanged so aggregate diffs still detect Phaeton hatch", () => {
    // Reproduces `submitSession`'s aliasing sequence verbatim: the caller
    // stashes `prevMonsterState = monsterState` before calling
    // `recordMonsterMastery`, then diffs against the returned state via
    // `aggregateEventsForWrite`. If the function mutated the shared inner
    // entry, the diff would see prev === next and miss the Phaeton 'caught'
    // event. This test would fail under that regression.
    const monsterState = {
      inklet: {
        mastered: Array.from({ length: 12 }, (_, i) => `ink-${i}`),
        caught: true,
      },
      glimmerbug: {
        mastered: Array.from({ length: 9 }, (_, i) => `glim-${i}`),
        caught: false,
      },
    };
    const prevMonsterState = monsterState;
    const update = recordMonsterMastery(monsterState, "glimmerbug", "glim-9");
    const events = aggregateEventsForWrite(prevMonsterState, update.state, "glimmerbug");
    const phaeton = events.find((e) => e.monsterId === "phaeton");
    expect(phaeton).toBeDefined();
    expect(phaeton.kind).toBe("caught");
  });
});
