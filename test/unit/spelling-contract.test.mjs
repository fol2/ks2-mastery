import { describe, expect, it } from "vitest";
import {
  buildSpellingAdvanceContinueResponse,
  buildSpellingAdvanceDoneResponse,
  buildSpellingSessionCreatedResponse,
  buildSpellingSkipResponse,
  parseCreateSpellingSessionPayload,
  parseSpellingPrefsPayload,
  parseSpellingSessionIdParam,
  parseSpellingSubmissionPayload,
} from "../../worker/contracts/spelling-contract.js";

const SAMPLE_SESSION = {
  id: "session-1",
  type: "learning",
  mode: "smart",
  label: "Smart",
  phase: "prompt",
  fallbackToSmart: false,
  progress: {
    total: 3,
    checked: 0,
    done: 0,
    wrongCount: 0,
  },
  currentCard: null,
};

const SAMPLE_MONSTERS = {
  inklet: { mastered: 1, stage: 0, level: 0, caught: false, masteredList: [] },
  glimmerbug: { mastered: 0, stage: 0, level: 0, caught: false, masteredList: [] },
  phaeton: { mastered: 1, stage: 0, level: 0, caught: false, masteredList: [] },
};

const SAMPLE_SPELLING = {
  stats: { all: null, y3_4: null, y5_6: null },
  prefs: { yearFilter: "all", roundLength: "20", showCloze: true, autoSpeak: true },
};

describe("parseCreateSpellingSessionPayload", () => {
  it("defaults unknown modes to smart and preserves the all sentinel", () => {
    expect(
      parseCreateSpellingSessionPayload({
        mode: "mystery",
        length: "all",
        words: [1, "accident"],
      }),
    ).toEqual({
      mode: "smart",
      yearFilter: "all",
      // MAX_SAFE_INTEGER is the JSON-safe "unbounded" marker — Infinity
      // would stringify to null across the Durable Object RPC boundary.
      length: Number.MAX_SAFE_INTEGER,
      words: ["1", "accident"],
    });
  });

  it("forces test sessions back to 20 words", () => {
    expect(
      parseCreateSpellingSessionPayload({ mode: "test", length: "all" }),
    ).toEqual({
      mode: "test",
      yearFilter: "all",
      length: 20,
      words: null,
    });
  });
});

describe("spelling request contracts", () => {
  it("preserves explicit false preferences", () => {
    expect(
      parseSpellingPrefsPayload({ yearFilter: "y5-6", showCloze: false, autoSpeak: false }),
    ).toEqual({
      yearFilter: "y5-6",
      roundLength: "20",
      showCloze: false,
      autoSpeak: false,
    });
  });

  it("keeps submission text verbatim", () => {
    expect(parseSpellingSubmissionPayload({ typed: " word " })).toEqual({ typed: " word " });
  });

  it("rejects a missing spelling session id", () => {
    expect(() => parseSpellingSessionIdParam("")).toThrow(/session id is required/i);
  });
});

describe("spelling response contracts", () => {
  it("builds session lifecycle envelopes", () => {
    expect(buildSpellingSessionCreatedResponse(SAMPLE_SESSION)).toEqual({
      ok: true,
      session: SAMPLE_SESSION,
    });

    expect(buildSpellingAdvanceContinueResponse(SAMPLE_SESSION)).toEqual({
      ok: true,
      done: false,
      session: SAMPLE_SESSION,
    });

    expect(
      buildSpellingSkipResponse({ result: { phase: "prompt" }, session: SAMPLE_SESSION }),
    ).toEqual({
      ok: true,
      result: { phase: "prompt" },
      session: SAMPLE_SESSION,
    });
  });

  it("builds the advance-done envelope", () => {
    expect(
      buildSpellingAdvanceDoneResponse({
        summary: { accuracy: 1 },
        monsters: SAMPLE_MONSTERS,
        spelling: SAMPLE_SPELLING,
      }),
    ).toEqual({
      ok: true,
      done: true,
      summary: { accuracy: 1 },
      monsters: SAMPLE_MONSTERS,
      spelling: SAMPLE_SPELLING,
    });
  });
});
