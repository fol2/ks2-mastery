import { ValidationError } from "../lib/http.js";
import {
  asInteger,
  asObject,
  asString,
  asStringArray,
  assertArray,
  assertBoolean,
  assertNullableObject,
  invariant,
} from "../lib/validation.js";

export function parseChildIdParam(value) {
  const childId = asString(value);
  if (!childId) throw new ValidationError("Child profile id is required.");
  return childId;
}

export function parseChildProfilePayload(body) {
  const payload = asObject(body);
  const child = {
    name: asString(payload.name),
    yearGroup: asString(payload.yearGroup) || "Y5",
    avatarColor: asString(payload.avatarColor) || "#3E6FA8",
    goal: asString(payload.goal) || "sats",
    dailyMinutes: asInteger(payload.dailyMinutes, { defaultValue: 15, min: 5, max: 60 }),
    weakSubjects: asStringArray(payload.weakSubjects, { maxItems: 6 }),
  };

  if (child.name.length < 2) {
    throw new ValidationError("Child name must be at least two characters.");
  }

  return child;
}

export function buildChildrenIndexResponse(bundle) {
  const payload = {
    ok: true,
    children: bundle.children,
    selectedChild: bundle.selectedChild,
  };

  invariant(payload.ok === true, "Children response must include ok=true.");
  assertArray(payload.children, "Children response children must be an array.");
  assertNullableObject(payload.selectedChild, "Children response selectedChild must be null or an object.");
  assertBoolean(payload.ok, "Children response ok must be a boolean.");
  return payload;
}
