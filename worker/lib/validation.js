import { ValidationError } from "./http.js";
import { safeEmail } from "./security.js";

export function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

export function ensure(condition, message) {
  if (!condition) throw new ValidationError(message);
}

export function asObject(value) {
  return isPlainObject(value) ? value : {};
}

export function asString(value, options = {}) {
  const { defaultValue = "", trim = true } = options;
  const resolved = value === undefined || value === null ? defaultValue : String(value);
  return trim ? resolved.trim() : resolved;
}

export function asEmail(value) {
  return safeEmail(asString(value));
}

export function asBoolean(value, options = {}) {
  const { defaultValue = false } = options;
  return typeof value === "boolean" ? value : defaultValue;
}

export function asInteger(value, options = {}) {
  const {
    defaultValue = 0,
    min = Number.NEGATIVE_INFINITY,
    max = Number.POSITIVE_INFINITY,
  } = options;

  const clamp = (input) => Math.max(min, Math.min(max, Math.round(input)));
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return clamp(defaultValue);
  return clamp(parsed);
}

export function asStringArray(value, options = {}) {
  const { maxItems = Number.POSITIVE_INFINITY, trim = true } = options;
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, maxItems)
    .map((item) => asString(item, { trim }))
    .filter(Boolean);
}

export function assertObject(value, message) {
  invariant(isPlainObject(value), message);
}

export function assertArray(value, message) {
  invariant(Array.isArray(value), message);
}

export function assertString(value, message) {
  invariant(typeof value === "string", message);
}

export function assertBoolean(value, message) {
  invariant(typeof value === "boolean", message);
}

export function assertNumber(value, message) {
  invariant(typeof value === "number" && Number.isFinite(value), message);
}

export function assertNullableObject(value, message) {
  invariant(value === null || isPlainObject(value), message);
}
