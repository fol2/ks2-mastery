import { describe, expect, it } from "vitest";
import { ValidationError } from "../../worker/lib/http.js";
import {
  asBoolean,
  asInteger,
  asObject,
  asString,
  asStringArray,
  assertArray,
  assertBoolean,
  assertNullableObject,
  assertNumber,
  assertObject,
  assertString,
  ensure,
  invariant,
  isPlainObject,
} from "../../worker/lib/validation.js";

describe("isPlainObject", () => {
  it("rejects arrays, nulls, and primitives", () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject({ a: 1 })).toBe(true);
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject(undefined)).toBe(false);
    expect(isPlainObject("x")).toBe(false);
    expect(isPlainObject(5)).toBe(false);
  });
});

describe("asString / asObject", () => {
  it("trims by default and respects trim:false", () => {
    expect(asString("  hi  ")).toBe("hi");
    expect(asString("  hi  ", { trim: false })).toBe("  hi  ");
  });

  it("uses defaultValue when input is null/undefined", () => {
    expect(asString(undefined, { defaultValue: "fallback" })).toBe("fallback");
    expect(asString(null, { defaultValue: "fallback" })).toBe("fallback");
  });

  it("asObject returns {} for arrays and primitives", () => {
    expect(asObject([])).toEqual({});
    expect(asObject(null)).toEqual({});
    expect(asObject({ a: 1 })).toEqual({ a: 1 });
  });
});

describe("asInteger clamp / rounding", () => {
  it("clamps to min/max and rounds", () => {
    expect(asInteger(7.6, { min: 0, max: 10 })).toBe(8);
    expect(asInteger(-5, { min: 0, max: 10 })).toBe(0);
    expect(asInteger(999, { min: 0, max: 10 })).toBe(10);
  });

  it("falls back on NaN / non-finite input to the clamped defaultValue", () => {
    expect(asInteger("abc", { defaultValue: 3, min: 0, max: 10 })).toBe(3);
    // Infinity is not finite, so the helper returns the clamped defaultValue
    // rather than clamping Infinity to `max` — document the shape explicitly
    // so a caller who wants a high-water mark stub picks a large finite int.
    expect(asInteger(Infinity, { defaultValue: 5, min: 0, max: 10 })).toBe(5);
    expect(asInteger(Infinity, { defaultValue: 999, min: 0, max: 10 })).toBe(10);
  });
});

describe("asStringArray", () => {
  it("trims, stringifies, and drops empty strings", () => {
    // Non-string falsy entries get stringified first (0 -> "0") and survive
    // the filter; null/undefined become "" via asString and are then filtered.
    expect(asStringArray([" a ", " b", 1, 0, null, undefined, "", "x"])).toEqual([
      "a",
      "b",
      "1",
      "0",
      "x",
    ]);
  });

  it("honours maxItems", () => {
    expect(asStringArray(["a", "b", "c"], { maxItems: 2 })).toEqual(["a", "b"]);
  });

  it("honours trim:false", () => {
    expect(asStringArray([" x ", " y "], { trim: false })).toEqual([" x ", " y "]);
  });

  it("returns [] when input is not an array", () => {
    expect(asStringArray("nope")).toEqual([]);
  });
});

describe("asBoolean", () => {
  it("only returns true for actual booleans", () => {
    expect(asBoolean(true)).toBe(true);
    expect(asBoolean(false)).toBe(false);
    expect(asBoolean("true")).toBe(false);
    expect(asBoolean(1, { defaultValue: true })).toBe(true);
  });
});

describe("ensure vs invariant", () => {
  it("ensure throws ValidationError on false", () => {
    expect(() => ensure(false, "bad")).toThrowError(ValidationError);
    expect(() => ensure(true, "bad")).not.toThrow();
  });

  it("invariant throws plain Error on false", () => {
    expect(() => invariant(false, "bad")).toThrowError(Error);
    // Must NOT be a ValidationError — invariants are programmer errors.
    try {
      invariant(false, "bad");
    } catch (error) {
      expect(error).not.toBeInstanceOf(ValidationError);
    }
  });
});

describe("assert helpers", () => {
  it("guards object / array / string / boolean / number", () => {
    expect(() => assertObject({}, "msg")).not.toThrow();
    expect(() => assertObject([], "msg")).toThrow();
    expect(() => assertArray([], "msg")).not.toThrow();
    expect(() => assertArray({}, "msg")).toThrow();
    expect(() => assertString("x", "msg")).not.toThrow();
    expect(() => assertString(5, "msg")).toThrow();
    expect(() => assertBoolean(true, "msg")).not.toThrow();
    expect(() => assertBoolean(1, "msg")).toThrow();
    expect(() => assertNumber(1, "msg")).not.toThrow();
    expect(() => assertNumber(Infinity, "msg")).toThrow();
    expect(() => assertNumber("1", "msg")).toThrow();
    expect(() => assertNullableObject(null, "msg")).not.toThrow();
    expect(() => assertNullableObject({}, "msg")).not.toThrow();
    expect(() => assertNullableObject([], "msg")).toThrow();
  });
});
