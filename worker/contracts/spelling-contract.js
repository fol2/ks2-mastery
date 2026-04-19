import { ValidationError } from "../lib/http.js";
import { SPELLING_MODES } from "../lib/spelling-service.js";
import {
  asBoolean,
  asObject,
  asString,
  asStringArray,
  assertBoolean,
  assertObject,
  assertString,
  invariant,
} from "../lib/validation.js";
import {
  validateMonsterCollection,
  validateSpellingOverview,
} from "./bootstrap-contract.js";

function parseSessionLength(rawLength, mode) {
  if (mode === SPELLING_MODES.TEST) return 20;
  if (rawLength === "all" || rawLength === Infinity) return Infinity;
  const parsed = Number(rawLength);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 20;
}

function validateSessionPayload(session) {
  assertObject(session, "Spelling session payload must be an object.");
  assertString(session.id, "Spelling session id must be a string.");
  assertString(session.type, "Spelling session type must be a string.");
  assertString(session.mode, "Spelling session mode must be a string.");
  assertString(session.label, "Spelling session label must be a string.");
  assertString(session.phase, "Spelling session phase must be a string.");
  assertBoolean(session.fallbackToSmart, "Spelling session fallbackToSmart must be a boolean.");
  assertObject(session.progress, "Spelling session progress must be an object.");
  invariant(
    session.currentCard === null || typeof session.currentCard === "object",
    "Spelling session currentCard must be null or an object.",
  );
}

export function parseSpellingSessionIdParam(value) {
  const sessionId = asString(value);
  if (!sessionId) throw new ValidationError("Spelling session id is required.");
  return sessionId;
}

export function parseSpellingPrefsPayload(body) {
  const payload = asObject(body);
  return {
    yearFilter: asString(payload.yearFilter) || "all",
    roundLength: asString(payload.roundLength) || "20",
    showCloze: asBoolean(payload.showCloze, { defaultValue: true }),
    autoSpeak: asBoolean(payload.autoSpeak, { defaultValue: true }),
  };
}

export function parseCreateSpellingSessionPayload(body) {
  const payload = asObject(body);
  const rawMode = asString(payload.mode).toLowerCase();
  const mode = Object.values(SPELLING_MODES).includes(rawMode)
    ? rawMode
    : SPELLING_MODES.SMART;

  return {
    mode,
    yearFilter: asString(payload.yearFilter) || "all",
    length: parseSessionLength(payload.length, mode),
    words: Array.isArray(payload.words) ? asStringArray(payload.words, { maxItems: 500 }) : null,
  };
}

export function parseSpellingSubmissionPayload(body) {
  const payload = asObject(body);
  return {
    typed: asString(payload.typed, { trim: false }),
  };
}

export function buildSpellingSessionCreatedResponse(session) {
  validateSessionPayload(session);
  return {
    ok: true,
    session,
  };
}

export function buildSpellingSubmitResponse(payload) {
  validateSessionPayload(payload.session);
  assertObject(payload.result, "Spelling submit result must be an object.");
  validateMonsterCollection(payload.monsters);
  return {
    ok: true,
    result: payload.result,
    session: payload.session,
    monsterEvent: payload.monsterEvent,
    monsters: payload.monsters,
  };
}

export function buildSpellingAdvanceContinueResponse(session) {
  validateSessionPayload(session);
  return {
    ok: true,
    done: false,
    session,
  };
}

export function buildSpellingSkipResponse(payload) {
  assertObject(payload.result, "Spelling skip result must be an object.");
  validateSessionPayload(payload.session);
  return {
    ok: true,
    result: payload.result,
    session: payload.session,
  };
}

export function buildSpellingAdvanceDoneResponse(payload) {
  assertObject(payload.summary, "Spelling summary must be an object.");
  validateMonsterCollection(payload.monsters);
  validateSpellingOverview(payload.spelling);
  return {
    ok: true,
    done: true,
    summary: payload.summary,
    monsters: payload.monsters,
    spelling: payload.spelling,
  };
}

export function buildSpellingDashboardResponse(spelling) {
  validateSpellingOverview(spelling);
  return {
    ok: true,
    spelling,
  };
}
