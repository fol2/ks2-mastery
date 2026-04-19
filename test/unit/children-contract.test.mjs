import { describe, expect, it } from "vitest";
import { buildSignedOutBootstrapResponse } from "../../worker/contracts/bootstrap-contract.js";
import {
  buildChildrenIndexResponse,
  parseChildIdParam,
  parseChildProfilePayload,
} from "../../worker/contracts/children-contract.js";

const SAMPLE_CHILD = {
  id: "child-1",
  userId: "user-1",
  name: "Maya",
  yearGroup: "Y5",
  avatarColor: "#3E6FA8",
  goal: "sats",
  dailyMinutes: 15,
  weakSubjects: [],
  createdAt: 1,
  updatedAt: 1,
};

describe("parseChildProfilePayload", () => {
  it("normalises defaults, trims the name, and clamps daily minutes", () => {
    expect(
      parseChildProfilePayload({
        name: "  Maya  ",
        dailyMinutes: 120,
        weakSubjects: ["spelling", "maths", "grammar", "science", "reading", "writing", "extra"],
      }),
    ).toEqual({
      name: "Maya",
      yearGroup: "Y5",
      avatarColor: "#3E6FA8",
      goal: "sats",
      dailyMinutes: 60,
      weakSubjects: ["spelling", "maths", "grammar", "science", "reading", "writing"],
    });
  });

  it("rejects names shorter than two characters", () => {
    expect(() => parseChildProfilePayload({ name: "A" })).toThrow(/two characters/i);
  });
});

describe("child contracts", () => {
  it("rejects a missing child id param", () => {
    expect(() => parseChildIdParam("")).toThrow(/id is required/i);
  });

  it("builds the children index envelope", () => {
    const response = buildChildrenIndexResponse({
      children: [SAMPLE_CHILD],
      selectedChild: SAMPLE_CHILD,
    });

    expect(response).toEqual({
      ok: true,
      children: [SAMPLE_CHILD],
      selectedChild: SAMPLE_CHILD,
    });
  });

  it("builds the signed-out bootstrap envelope", () => {
    const response = buildSignedOutBootstrapResponse({});
    expect(response.auth.signedIn).toBe(false);
    expect(response.auth.providers.email).toBe(true);
    expect(response.children).toEqual([]);
    expect(response.spelling.prefs.roundLength).toBe("20");
  });
});
