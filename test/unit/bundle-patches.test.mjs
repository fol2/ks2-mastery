import { describe, expect, it } from "vitest";
import {
  patchBundleForChildState,
  patchBundleForNewChild,
  patchBundleForSelectedChild,
  patchBundleForUpdatedChild,
} from "../../worker/services/bundle-patches.js";

const BASE_CHILD = (id, name = "Child") => ({
  id,
  userId: "user-1",
  name,
  yearGroup: "Y5",
  avatarColor: "#3E6FA8",
  goal: "sats",
  dailyMinutes: 15,
  weakSubjects: [],
  createdAt: 1,
  updatedAt: 1,
});

function makeBundle() {
  const firstChild = BASE_CHILD("child-1", "Maya");
  return {
    session: { id: "session-1", user_id: "user-1", selected_child_id: "child-1" },
    user: { id: "user-1", email: "parent@example.test" },
    children: [firstChild],
    selectedChild: firstChild,
    childState: {
      spellingProgress: { accident: { stage: 2 } },
      monsterState: {},
      spellingPrefs: { roundLength: "20" },
      updatedAt: 100,
    },
    subscription: { planCode: "free", status: "active", paywallEnabled: false },
  };
}

describe("patchBundleForNewChild", () => {
  it("appends the child, selects it, and starts a fresh learning state", () => {
    const bundle = makeBundle();
    const newChild = BASE_CHILD("child-2", "Noah");
    const patched = patchBundleForNewChild(bundle, newChild);

    expect(patched.children).toEqual([bundle.children[0], newChild]);
    expect(patched.selectedChild).toBe(newChild);
    expect(patched.session.selected_child_id).toBe("child-2");
    expect(patched.childState.spellingProgress).toEqual({});
    expect(patched.childState.monsterState).toEqual({});
    expect(patched.childState.spellingPrefs).toEqual({});
    // Pre-existing fields carry through untouched.
    expect(patched.user).toBe(bundle.user);
    expect(patched.subscription).toBe(bundle.subscription);
  });
});

describe("patchBundleForUpdatedChild", () => {
  it("swaps the matching child in-place without altering selection or learning state", () => {
    const bundle = makeBundle();
    const updated = { ...bundle.children[0], name: "Maya Updated" };
    const patched = patchBundleForUpdatedChild(bundle, updated);

    expect(patched.children[0].name).toBe("Maya Updated");
    expect(patched.selectedChild).toBe(updated);
    expect(patched.childState).toBe(bundle.childState);
    expect(patched.session).toBe(bundle.session);
  });

  it("does not touch selectedChild when a non-selected child is updated", () => {
    const bundle = makeBundle();
    const secondChild = BASE_CHILD("child-2", "Noah");
    bundle.children.push(secondChild);
    const updated = { ...secondChild, name: "Noah Updated" };
    const patched = patchBundleForUpdatedChild(bundle, updated);

    expect(patched.children.find((c) => c.id === "child-2").name).toBe("Noah Updated");
    expect(patched.selectedChild).toBe(bundle.selectedChild);
  });
});

describe("patchBundleForSelectedChild", () => {
  it("switches the selected child and installs the freshly-loaded learning state", () => {
    const bundle = makeBundle();
    const otherChild = BASE_CHILD("child-2", "Noah");
    const nextChildState = {
      spellingProgress: { banana: { stage: 4 } },
      monsterState: { inklet: { mastered: ["banana"] } },
      spellingPrefs: { yearFilter: "y5-6" },
      updatedAt: 200,
    };

    const patched = patchBundleForSelectedChild(bundle, otherChild, nextChildState);

    expect(patched.selectedChild).toBe(otherChild);
    expect(patched.session.selected_child_id).toBe("child-2");
    expect(patched.childState).toBe(nextChildState);
    expect(patched.children).toBe(bundle.children);
  });
});

describe("patchBundleForChildState", () => {
  it("replaces childState without disturbing anything else", () => {
    const bundle = makeBundle();
    const nextState = { ...bundle.childState, spellingPrefs: { roundLength: "40" } };
    const patched = patchBundleForChildState(bundle, nextState);

    expect(patched.childState).toBe(nextState);
    expect(patched.session).toBe(bundle.session);
    expect(patched.selectedChild).toBe(bundle.selectedChild);
    expect(patched.children).toBe(bundle.children);
  });
});
