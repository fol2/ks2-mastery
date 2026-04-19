import { describe, expect, it } from "vitest";
import {
  MONSTER_AGGREGATES,
  eventFromTransition,
  aggregateEventsForWrite,
} from "../../worker/lib/monster-aggregates.js";

// Inlined fixture helper — vitest-pool-workers 0.14.x does not bundle non-entry
// helper files into the Worker runtime, so shared helpers must live in-file.
function mkState({ ink = 0, glim = 0 } = {}) {
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

describe("MONSTER_AGGREGATES.phaeton", () => {
  it("declares inklet + glimmerbug as sources", () => {
    expect(MONSTER_AGGREGATES.phaeton.sources.sort()).toEqual([
      "glimmerbug",
      "inklet",
    ]);
  });

  it("stays uncaught while only one side has reached 10 mastered", () => {
    const prog = MONSTER_AGGREGATES.phaeton.derive(
      mkState({ ink: 9, glim: 20 }),
    );
    expect(prog.caught).toBe(false);
    expect(prog.stage).toBe(0);
  });

  it("reaches stage 1 (hatched) when both sides hit 10 and combined >= 20", () => {
    const prog = MONSTER_AGGREGATES.phaeton.derive(
      mkState({ ink: 11, glim: 11 }),
    );
    expect(prog.stage).toBe(1);
    expect(prog.caught).toBe(true);
    expect(prog.mastered).toBe(22);
  });

  it("only reaches Mega (stage 4) when BOTH pools are fully mastered", () => {
    const shortOfMega = MONSTER_AGGREGATES.phaeton.derive(
      mkState({ ink: 100, glim: 99 }),
    );
    expect(shortOfMega.stage).toBe(3);

    const mega = MONSTER_AGGREGATES.phaeton.derive(
      mkState({ ink: 100, glim: 100 }),
    );
    expect(mega.stage).toBe(4);
    expect(mega.caught).toBe(true);
    expect(mega.mastered).toBe(200);
  });

  it("caps level at 10", () => {
    const prog = MONSTER_AGGREGATES.phaeton.derive(
      mkState({ ink: 100, glim: 100 }),
    );
    expect(prog.level).toBe(10);
  });
});

describe("eventFromTransition", () => {
  it("returns null when there is no meaningful transition", () => {
    const prev = { mastered: 5, stage: 0, level: 0, caught: false };
    const next = { mastered: 6, stage: 0, level: 0, caught: false };
    expect(eventFromTransition("inklet", prev, next)).toBeNull();
  });

  it("emits 'caught' on the first-catch boundary", () => {
    const prev = { mastered: 9, stage: 0, level: 0, caught: false };
    const next = { mastered: 10, stage: 1, level: 1, caught: true };
    const ev = eventFromTransition("inklet", prev, next);
    expect(ev).toMatchObject({
      kind: "caught",
      monsterId: "inklet",
      stage: 1,
      level: 1,
      mastered: 10,
    });
  });

  it("emits 'evolve' on stage transitions below mega", () => {
    const prev = { mastered: 49, stage: 1, level: 4, caught: true };
    const next = { mastered: 50, stage: 2, level: 5, caught: true };
    const ev = eventFromTransition("inklet", prev, next);
    expect(ev.kind).toBe("evolve");
  });

  it("emits 'mega' when stage reaches 4", () => {
    const prev = { mastered: 99, stage: 3, level: 9, caught: true };
    const next = { mastered: 100, stage: 4, level: 10, caught: true };
    const ev = eventFromTransition("inklet", prev, next);
    expect(ev.kind).toBe("mega");
  });

  it("emits 'levelup' on level-only transitions", () => {
    const prev = { mastered: 19, stage: 1, level: 1, caught: true };
    const next = { mastered: 20, stage: 1, level: 2, caught: true };
    const ev = eventFromTransition("inklet", prev, next);
    expect(ev.kind).toBe("levelup");
  });
});

describe("aggregateEventsForWrite", () => {
  it("emits Phaeton 'caught' when Glimmerbug's 10th mastery crosses the both-caught gate", () => {
    const prev = mkState({ ink: 15, glim: 9 });
    const next = mkState({ ink: 15, glim: 10 });
    const events = aggregateEventsForWrite(prev, next, "glimmerbug");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "caught", monsterId: "phaeton" });
  });

  it("emits nothing when the direct write does not affect any aggregate source", () => {
    const prev = mkState({ ink: 15, glim: 15 });
    const next = mkState({ ink: 15, glim: 15 });
    const events = aggregateEventsForWrite(prev, next, "nonexistent-monster");
    expect(events).toEqual([]);
  });

  it("emits Phaeton 'mega' when the 100th Inklet word finishes the both-maxed gate", () => {
    const prev = mkState({ ink: 99, glim: 100 });
    const next = mkState({ ink: 100, glim: 100 });
    const events = aggregateEventsForWrite(prev, next, "inklet");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "mega", monsterId: "phaeton" });
  });

  it("emits nothing on a Glimmerbug mastery that does not cross a Phaeton threshold", () => {
    const prev = mkState({ ink: 20, glim: 20 });
    const next = mkState({ ink: 20, glim: 21 });
    const events = aggregateEventsForWrite(prev, next, "glimmerbug");
    expect(events).toEqual([]);
  });
});
