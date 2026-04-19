import { providerConfig } from "../lib/oauth.js";
import { buildBootstrapStats } from "../lib/spelling-service.js";
import { serialiseSubscription } from "../lib/store.js";
import { ttsProviderConfig } from "../lib/tts.js";
import { turnstileConfig } from "../lib/turnstile.js";
import {
  assertArray,
  assertBoolean,
  assertNullableObject,
  assertNumber,
  assertObject,
  assertString,
} from "../lib/validation.js";

function defaultBilling() {
  return {
    planCode: "free",
    status: "active",
    paywallEnabled: false,
  };
}

function defaultSpelling() {
  return {
    stats: { all: null, y3_4: null, y5_6: null },
    prefs: { yearFilter: "all", roundLength: "20", showCloze: true, autoSpeak: true },
  };
}

function defaultChildStats() {
  return {
    spelling: defaultSpelling(),
    monsters: {},
  };
}

function validateProviders(providers) {
  assertObject(providers, "Bootstrap auth providers must be an object.");
  ["google", "facebook", "x", "apple", "email"].forEach((provider) => {
    assertBoolean(providers[provider], `Bootstrap auth provider '${provider}' must be a boolean.`);
  });
}

function validateTurnstile(turnstile) {
  assertObject(turnstile, "Bootstrap auth turnstile config must be an object.");
  assertBoolean(turnstile.enabled, "Bootstrap auth turnstile.enabled must be a boolean.");
  assertString(turnstile.siteKey, "Bootstrap auth turnstile.siteKey must be a string.");
}

function validateTtsProviders(providers) {
  assertObject(providers, "Bootstrap tts.providers must be an object.");
  ["browser", "gemini", "openai", "elevenlabs"].forEach((provider) => {
    assertBoolean(providers[provider], `Bootstrap tts provider '${provider}' must be a boolean.`);
  });
}

function validateBilling(billing) {
  assertObject(billing, "Bootstrap billing must be an object.");
  assertString(billing.planCode, "Bootstrap billing.planCode must be a string.");
  assertString(billing.status, "Bootstrap billing.status must be a string.");
  assertBoolean(billing.paywallEnabled, "Bootstrap billing.paywallEnabled must be a boolean.");
}

function validateSpellingOverview(spelling) {
  assertObject(spelling, "Bootstrap spelling must be an object.");
  assertObject(spelling.stats, "Bootstrap spelling.stats must be an object.");
  assertObject(spelling.prefs, "Bootstrap spelling.prefs must be an object.");
  assertString(spelling.prefs.yearFilter, "Bootstrap spelling.prefs.yearFilter must be a string.");
  assertString(spelling.prefs.roundLength, "Bootstrap spelling.prefs.roundLength must be a string.");
  assertBoolean(spelling.prefs.showCloze, "Bootstrap spelling.prefs.showCloze must be a boolean.");
  assertBoolean(spelling.prefs.autoSpeak, "Bootstrap spelling.prefs.autoSpeak must be a boolean.");
}

export function validateMonsterCollection(monsters) {
  assertObject(monsters, "Bootstrap monsters must be an object.");
  if (!Object.keys(monsters).length) return;

  ["inklet", "glimmerbug", "phaeton"].forEach((monsterId) => {
    const monster = monsters[monsterId];
    assertObject(monster, `Monster '${monsterId}' must be an object.`);
    assertNumber(monster.mastered, `Monster '${monsterId}' mastered must be a number.`);
    assertNumber(monster.stage, `Monster '${monsterId}' stage must be a number.`);
    assertNumber(monster.level, `Monster '${monsterId}' level must be a number.`);
    assertBoolean(monster.caught, `Monster '${monsterId}' caught must be a boolean.`);
    assertArray(monster.masteredList, `Monster '${monsterId}' masteredList must be an array.`);
  });
}

function validateBootstrapPayload(payload) {
  assertObject(payload, "Bootstrap response must be an object.");
  assertBoolean(payload.ok, "Bootstrap response ok must be a boolean.");
  assertObject(payload.auth, "Bootstrap auth must be an object.");
  assertBoolean(payload.auth.signedIn, "Bootstrap auth.signedIn must be a boolean.");
  validateProviders(payload.auth.providers);
  validateTurnstile(payload.auth.turnstile);
  validateBilling(payload.billing);
  assertArray(payload.children, "Bootstrap children must be an array.");
  assertNullableObject(payload.selectedChild, "Bootstrap selectedChild must be null or an object.");
  validateSpellingOverview(payload.spelling);
  validateMonsterCollection(payload.monsters);
  assertObject(payload.tts, "Bootstrap tts must be an object.");
  validateTtsProviders(payload.tts.providers);
  return payload;
}

export function buildSignedOutBootstrapResponse(env) {
  return validateBootstrapPayload({
    ok: true,
    auth: {
      signedIn: false,
      providers: providerConfig(env),
      turnstile: turnstileConfig(env),
    },
    billing: defaultBilling(),
    children: [],
    selectedChild: null,
    spelling: defaultSpelling(),
    monsters: {},
    tts: {
      providers: ttsProviderConfig(env),
    },
  });
}

export function buildSignedInBootstrapResponse(bundle, env) {
  const childStats = bundle.selectedChild
    ? buildBootstrapStats(bundle.selectedChild.id, bundle.childState)
    : defaultChildStats();

  return validateBootstrapPayload({
    ok: true,
    auth: {
      signedIn: true,
      user: bundle.user,
      providers: providerConfig(env),
      turnstile: turnstileConfig(env),
    },
    billing: serialiseSubscription(bundle.subscription),
    children: bundle.children,
    selectedChild: bundle.selectedChild,
    spelling: childStats.spelling,
    monsters: childStats.monsters,
    tts: {
      providers: ttsProviderConfig(env),
    },
  });
}

export { validateSpellingOverview };
