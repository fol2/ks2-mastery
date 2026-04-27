// Pure view-model helpers for the Punctuation surface. Frozen option lists,
// child-facing label/tone mappings, dashboard + Punctuation Map model builders,
// forbidden-term fixture. No React imports. No SSR. Every helper is a pure
// function over plain data so tests can assert behaviour without rendering
// JSX.
//
// The pattern mirrors `src/subjects/grammar/components/grammar-view-model.js`
// and `src/subjects/spelling/components/spelling-view-model.js` — subject-
// scoped lists + filter helpers + aggregate card builders. The intent is that
// every JSX unit in Phase 3 imports from this single file plus
// `../session-ui.js` rather than restating copy, filter predicates, or the
// composite-disabled helper inline. When new forbidden terms appear we add
// them here once and every child surface inherits the guard through U10's
// fixture-driven sweep.
//
// Parity guard: `composeIsDisabled` deliberately lives here and nowhere else
// in Punctuation's surface. Grammar and Spelling do NOT carry an equivalent
// export today — their scenes inline the same pending/availability gate. Any
// future shared extraction must prove Spelling byte-for-byte parity in the PR
// (AGENTS.md:14).

import { resolveMonsterVisual } from '../../../platform/game/monster-visual-config.js';
import { MONSTERS_BY_SUBJECT } from '../../../platform/game/monsters.js';
import { PUNCTUATION_CLIENT_SKILLS } from '../read-model.js';
import {
  PUNCTUATION_MAP_DETAIL_TAB_IDS,
  PUNCTUATION_MAP_MONSTER_FILTER_IDS,
  PUNCTUATION_MAP_STATUS_FILTER_IDS,
} from '../service-contract.js';

// U5 layer fix (adv-219-005): the Map filter + detail-tab id lists are the
// service-contract's single source of truth. The view-model re-exports them
// under their existing names so renderers / tests keep their current import
// paths while the one-way `contract → view-model` dependency is restored.
export {
  PUNCTUATION_MAP_DETAIL_TAB_IDS,
  PUNCTUATION_MAP_MONSTER_FILTER_IDS,
  PUNCTUATION_MAP_STATUS_FILTER_IDS,
};

const BELLSTORM_BASE = '/assets/regions/bellstorm-coast';

const SETUP_SCENES = Object.freeze(['bellstorm-coast-cover', 'bellstorm-coast-a1', 'bellstorm-coast-b1', 'bellstorm-coast-c1']);
const SUMMARY_SCENES = Object.freeze(['bellstorm-coast-d1', 'bellstorm-coast-d2', 'bellstorm-coast-e1', 'bellstorm-coast-e2']);
const FALLBACK_MONSTER = 'pealark';

function sceneUrl(name, size = 1280) {
  return `${BELLSTORM_BASE}/${name}.${size}.webp`;
}

// --- Bellstorm scene selector ----------------------------------------------

// Setup, Map, and active-item phases use the Bellstorm Coast A–C daily sets.
// Summary + feedback reach for the D–E boss moments. Map is a browsing scene
// and therefore reads as a daily view, not a boss view. Unknown phases fall
// back to the Setup cover so the hero never renders broken assets.
export function bellstormSceneForPhase(phase = 'setup') {
  const useSummarySet = phase === 'summary' || phase === 'feedback';
  const scenes = useSummarySet ? SUMMARY_SCENES : SETUP_SCENES;
  let index = 0;
  if (phase === 'active-item') index = 2;
  else if (phase === 'feedback') index = 1;
  else if (phase === 'summary') index = 3;
  else if (phase === 'map') index = 1; // Map uses Bellstorm Coast A-1 (daily B1 slot)
  const name = scenes[index] || scenes[0];
  return {
    name,
    src: sceneUrl(name, 1280),
    srcSet: `${sceneUrl(name, 640)} 640w, ${sceneUrl(name, 1280)} 1280w`,
  };
}

export function punctuationMonsterAsset(monsterId = FALLBACK_MONSTER, stage = 0, branch = 'b1', visualConfig = null) {
  const safeMonster = typeof monsterId === 'string' && monsterId ? monsterId : FALLBACK_MONSTER;
  const safeStage = Math.max(0, Math.min(4, Number(stage) || 0));
  const visual = resolveMonsterVisual({
    monsterId: safeMonster,
    branch,
    stage: safeStage,
    context: 'codexCard',
    config: visualConfig,
    preferredSize: 640,
  });
  return {
    id: safeMonster,
    stage: safeStage,
    src: visual.src,
    srcSet: visual.srcSet,
  };
}

export function punctuationPhaseLabel(phase = 'setup') {
  if (phase === 'active-item') return 'Practice';
  if (phase === 'feedback') return 'Feedback';
  if (phase === 'summary') return 'Summary';
  if (phase === 'unavailable') return 'Unavailable';
  if (phase === 'map') return 'Punctuation Map';
  return 'Setup';
}

export function currentItemInstruction(item = {}) {
  if (item.inputKind === 'choice') return 'Choose the best sentence.';
  if (item.mode === 'transfer') return 'Write one accurate sentence.';
  if (item.mode === 'combine') return 'Combine the parts into one punctuated sentence.';
  if (item.mode === 'paragraph') return 'Repair the whole passage.';
  if (item.mode === 'fix') return 'Correct the sentence.';
  return 'Type the sentence with punctuation.';
}

// --- Composite disable signal ----------------------------------------------

// Mutation controls (start, submit, continue, skip, end, Map filters, Modal
// Practise) must pause whenever a command is in flight, the runtime is
// degraded/unavailable, or the platform has flipped the subject read-only.
// The adapter layer (subject-command-client) is the authoritative dedupe;
// the UI signal here is the visual echo. Every Phase 3 scene threads this
// helper — there is no per-scene composite signal.
export function composeIsDisabled(ui) {
  const availabilityStatus = ui?.availability?.status || 'ready';
  const runtimeReadOnly = Boolean(ui?.runtime?.readOnly);
  const pending = Boolean(ui?.pendingCommand);
  return pending
    || runtimeReadOnly
    || availabilityStatus === 'degraded'
    || availabilityStatus === 'unavailable';
}

// Navigation controls (Summary Back to dashboard, Map top-bar Back, Skill
// Detail modal close) must remain reachable under every mutation-side signal
// that `composeIsDisabled` trips on. Trapping a child on a Summary /Map /
// modal scene when `pendingCommand` hangs or availability flips is the exact
// Phase 4 U6 failure mode this helper fixes (plan R7 / AE7). The only
// structural guard is the null-`ui` fail-closed: if the UI shape is missing
// entirely there is nothing to dispatch from, so the button renders disabled
// rather than emitting an attention-free "enabled" affordance. Every call
// site is the paired Back / close button on the Summary, Map, and Skill
// Detail Modal surfaces — mutation buttons on the same scenes continue to
// use `composeIsDisabled` unchanged.
export function composeIsNavigationDisabled(ui) {
  if (ui === null || ui === undefined) return true;
  return false;
}

// --- Primary mode cards (Setup scene) --------------------------------------

// The dashboard's three primary journey cards. `smart` sits first as the
// obvious default action; `weak` covers "Wobbly Spots"; `gps` is the quick
// timed check. Order is plan-fixed so every scene renders the same three
// cards in the same order without restating copy.
export const PUNCTUATION_PRIMARY_MODE_IDS = Object.freeze(['smart', 'weak', 'gps']);

export const PUNCTUATION_PRIMARY_MODE_CARDS = Object.freeze([
  Object.freeze({
    id: 'smart',
    label: 'Smart Review',
    description: "A short mix of today's best practice.",
    badge: 'Recommended',
  }),
  Object.freeze({
    id: 'weak',
    label: 'Wobbly Spots',
    description: 'Practise the things that needed another go.',
  }),
  Object.freeze({
    id: 'gps',
    label: 'GPS Check',
    description: 'A quick check-up — answers come at the end.',
  }),
]);

// --- Punctuation Map filter lists ------------------------------------------
//
// Status, monster, and detail-tab id lists moved to service-contract.js in U5
// (adv-219-005 layer fix). The view-model re-exports them via the top-of-file
// `export { ... }` block so downstream imports keep working.

// Short, child-facing rule one-liners for the Punctuation Map scene's skill
// cards. Each line is a single sentence in KS2-friendly copy — no dotted
// misconception tags, no adult jargon. Map scene renders one per card; U6's
// Skill Detail modal reaches for richer content (rule + worked example +
// contrast) rather than these one-liners. A missing skill falls back to
// `'Practise this punctuation skill.'` so the card never renders empty.
const PUNCTUATION_SKILL_RULE_ONE_LINERS = Object.freeze({
  sentence_endings: 'Start with a capital; end with . ! or ? — no gaps.',
  list_commas: 'Put a comma between each item in a list.',
  apostrophe_contractions: "Slot the mark in where the missing letters belong.",
  apostrophe_possession: "Add 's to show belonging; a plural ending in s takes one mark.",
  speech: 'Speech marks wrap the spoken words; the end mark sits inside.',
  // Phase 4 U7 (review follow-on FINDING B): rule one-liners rewritten in
  // child register. The prior "whole sentence" substitute was
  // pedagogically wrong for semicolon / dash contexts — calling the
  // joined parts "whole sentences" reinforces the comma-splicing
  // misconception those rules teach children to AVOID ("whole sentence"
  // in child speech means "complete standalone sentence ending in a full
  // stop"). Replaced with "idea" / "closely-related ideas", which is
  // safer across every context (semicolon, colon_list, fronted_adverbial)
  // without re-invoking "sentence".
  fronted_adverbial: 'Put a comma after the opener when it comes before the rest of the sentence.',
  parenthesis: 'Mark an extra idea with two commas, two brackets, or two dashes — one pair only.',
  comma_clarity: 'Add a comma when it stops the sentence from being misread.',
  colon_list: 'Use a colon to introduce a list after a complete opening idea.',
  semicolon: 'Use a semi-colon to link two closely-related ideas.',
  dash_clause: 'Use a pair of dashes to break off a side thought.',
  semicolon_list: 'Use semi-colons between long list items that already contain commas.',
  bullet_points: 'Keep bullet punctuation consistent across every item in the list.',
  hyphen: 'Hyphenate word pairs before a noun when they act as one idea.',
});

/**
 * Returns the child-facing rule one-liner for a skill id, used by U5's Map
 * scene skill cards. Unknown ids fall back to a generic "Practise this" line
 * rather than surfacing the raw id. Output is always a single sentence
 * suitable for a KS2 reader.
 */
export function punctuationSkillRuleOneLiner(skillId) {
  if (typeof skillId !== 'string' || !skillId) return 'Practise this punctuation skill.';
  const line = PUNCTUATION_SKILL_RULE_ONE_LINERS[skillId];
  return typeof line === 'string' && line ? line : 'Practise this punctuation skill.';
}

// Client-safe cluster → monster mapping. The Worker canonical source of truth
// is `shared/punctuation/content.js`'s `PUNCTUATION_CLUSTERS`, which the
// bundle-audit rules forbid from the browser bundle. This constant is the
// client mirror of that mapping for U5's Map scene — it must stay in lock-step
// with the shared content's `monsterId` field on every cluster. Skills whose
// cluster maps to `structure` land on Curlune (List / Structure cluster); the
// grand monster (Quoral) is reserved for the "published release" aggregate
// and is the fallback target for any skill whose cluster is unknown (see
// `buildPunctuationMapModel`).
export const PUNCTUATION_CLIENT_CLUSTER_TO_MONSTER = Object.freeze({
  endmarks: 'pealark',
  speech: 'pealark',
  boundary: 'pealark',
  apostrophe: 'claspin',
  comma_flow: 'curlune',
  structure: 'curlune',
});

// --- Active monster roster -------------------------------------------------

// The four learner-facing Punctuation monsters. Read from
// `MONSTERS_BY_SUBJECT.punctuation` so the order stays in lock-step with
// `src/platform/game/monsters.js:186-203`. Reserved monsters are never
// included. If the code-level roster changes, this list follows automatically.
const PUNCTUATION_ACTIVE_ROSTER_SOURCE = Object.freeze(
  Array.isArray(MONSTERS_BY_SUBJECT?.punctuation)
    ? [...MONSTERS_BY_SUBJECT.punctuation]
    : ['pealark', 'curlune', 'claspin', 'quoral'],
);

export const ACTIVE_PUNCTUATION_MONSTER_IDS = Object.freeze(PUNCTUATION_ACTIVE_ROSTER_SOURCE);

// Phase 4 U5 review follow-on (FINDING F — maintainability MEDIUM): shared
// Set over `ACTIVE_PUNCTUATION_MONSTER_IDS` for O(1) membership checks from
// any consumer that needs to filter payloads against the active roster.
// Previously the Summary scene kept a scene-local duplicate
// (`ACTIVE_MONSTER_ID_SET`) which drifted from this view-model export whenever
// the roster changed. Exporting here means U9's Worker-side telemetry
// filters, U2's Home companion filter, and any future non-React consumer can
// all read the same frozen value.
export const ACTIVE_PUNCTUATION_MONSTER_ID_SET = new Set(ACTIVE_PUNCTUATION_MONSTER_IDS);

// Phase 4 U5 review follow-on (FINDING F): detect an "advancing" stage delta
// for the monster-progress teaser + `monster-progress-changed` telemetry.
// Returns `{monsterId, stageFrom, stageTo}` only when:
//   - `summary.monsterProgress` is a plain object with a string `monsterId`,
//   - `monsterId` is on the active roster (reserved monsters Colisk /
//     Hyphang / Carillon are filtered out here, not in the Worker producer —
//     keeps the single active-roster source of truth on the client),
//   - both `stageFrom` and `stageTo` are finite numbers,
//   - `stageTo > stageFrom` (a zero-delta or regression is a no-op —
//     teasers celebrate an advance, never a standstill).
// Returns `null` in every other shape. Moved from `PunctuationSummaryScene.jsx`
// so U9 Worker-side or any non-React consumer (Codex render, future parent
// hub summary email) can share the same filter without a scene import.
export function extractPunctuationMonsterProgress(summary) {
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) return null;
  const raw = summary.monsterProgress;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const monsterId = typeof raw.monsterId === 'string' ? raw.monsterId : '';
  if (!monsterId || !ACTIVE_PUNCTUATION_MONSTER_ID_SET.has(monsterId)) return null;
  const stageFrom = Number(raw.stageFrom);
  const stageTo = Number(raw.stageTo);
  if (!Number.isFinite(stageFrom) || !Number.isFinite(stageTo)) return null;
  if (stageTo <= stageFrom) return null;
  return { monsterId, stageFrom, stageTo };
}

// Child-facing display names for the active Punctuation monsters. Reserved
// monsters are intentionally absent. Falls back to titlecase of the id for
// any future active addition that lacks an explicit entry.
export const ACTIVE_PUNCTUATION_MONSTER_DISPLAY_NAMES = Object.freeze({
  pealark: 'Pealark',
  claspin: 'Claspin',
  curlune: 'Curlune',
  quoral: 'Quoral',
});

function titlecase(value) {
  return String(value || '')
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();
}

export function punctuationMonsterDisplayName(monsterId) {
  if (typeof monsterId !== 'string' || !monsterId) return '';
  return ACTIVE_PUNCTUATION_MONSTER_DISPLAY_NAMES[monsterId] || titlecase(monsterId);
}

// --- Summary headline ------------------------------------------------------

// Child-facing celebration copy for the Punctuation Summary scene hero. The
// session-summary payload from `shared/punctuation/service.js` carries a
// clinical `summary.label` of `'Punctuation session summary'` — a Year 3-6
// child reading "Session complete." after a round gets zero sense of the
// round's tone. The helper branches on `summary.accuracy` to produce a copy
// register that mirrors the child's experience:
//
//  - accuracy >= 80  → celebratory ("Great round!")
//  - accuracy >= 50  → encouraging ("Good try! Here's what you got.")
//  - accuracy  < 50  → supportive ("Keep going — every round helps.")
//
// Returns `null` when the summary payload is missing / malformed so the
// caller can fall back to `summary.label` without a string-comparison dance.
// No adult register, no dotted tags, no Worker terms — U10's forbidden-term
// sweep treats every string emitted here as child copy.
export function punctuationSummaryHeadline(summary) {
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) return null;
  const rawAccuracy = Number(summary.accuracy);
  if (!Number.isFinite(rawAccuracy)) return null;
  const accuracy = Math.max(0, Math.min(100, rawAccuracy));
  if (accuracy >= 80) return 'Great round!';
  if (accuracy >= 50) return "Good try! Here's what you got.";
  return 'Keep going — every round helps.';
}

// --- Dashboard hero copy ---------------------------------------------------

// Hero headline + subheadline for the Setup / dashboard scene. Frozen so U1
// can swap it in one place after James reviews the final copy. Child-facing
// only — U10's sweep validates.
export const PUNCTUATION_DASHBOARD_HERO = Object.freeze({
  eyebrow: 'Bellstorm Coast',
  headline: "Today's punctuation mission",
  subtitle: "Pick a short round — we'll queue what matters next.",
});

// --- Setup round-length toggle options -------------------------------------

// The three stops the child Setup toggle exposes. Tighter subset of the
// service-contract `PUNCTUATION_ROUND_LENGTHS` superset (which accepts
// 1 / 2 / 3 / 4 / 6 / 8 / 12 / 'all' so the /start Worker command can still
// honour legacy per-skill drills). The Setup dispatch handler validates
// against THIS narrower enum so a rogue payload cannot smuggle an off-menu
// length (e.g. 'all' or '1') in via the primary dashboard control
// (adv-234-001). Shared so the Scene and the module handler agree byte-
// for-byte on what a legitimate Setup round-length dispatch looks like.
export const PUNCTUATION_SETUP_ROUND_LENGTH_OPTIONS = Object.freeze(['4', '8', '12']);

// --- Forbidden-terms fixture -----------------------------------------------

// Every adult / internal term that must not appear in child-facing
// Punctuation scenes (Setup, Session, Feedback, Summary, Map, Skill Detail).
// U10 iterates this list against every child phase. Additions land here once
// and propagate automatically. The list includes:
//  - Engine / Worker infrastructure terms ('Worker', 'Worker-held', …)
//  - Redaction forbidden-key names ('accepted', 'correctIndex', 'rubric', …)
//  - Internal state terms ('subjectUi', 'weakFocus', 'hasEvidence', …)
//  - Dotted misconception-tag prefixes (`speech.`, `comma.`, …) — catches raw
//    IDs like `speech.quote_missing` that currently leak via
//    `PunctuationPracticeSurface.jsx:322` (pre-Phase-3). U4's Summary rewrite
//    pipes these through `punctuationChildMisconceptionLabel(tag)` and hides
//    chips with no mapped child label.
//  - `/\bWorker\b/i` — a whole-word catch-all for any case-variant leakage.
export const PUNCTUATION_CHILD_FORBIDDEN_TERMS = Object.freeze([
  'Worker',
  'Worker-held',
  'Worker-marked',
  'accepted',
  'correctIndex',
  'rubric',
  'validator',
  'generator',
  'rawGenerator',
  'mastery key',
  'mastery-key',
  'release id',
  'releaseId',
  'facet weight',
  'publishedTotal',
  'denominator',
  'projection',
  'reward route',
  'read model',
  'misconception tag',
  'supportLevel',
  'contextPack',
  'Context pack',
  'skill-bank',
  'weakFocus',
  'hasEvidence',
  'subjectUi',
  // Dotted misconception-tag prefixes — catches raw IDs like
  // `speech.quote_missing` that leak via the current monolith's SummaryView.
  'speech.',
  'comma.',
  'boundary.',
  'apostrophe.',
  'structure.',
  'endmarks.',
  // Phase 4 U7 — adult grammar terms that engine-files
  // (`shared/punctuation/marking.js` + `shared/punctuation/generators.js`)
  // emit via `note` / `prompt` strings. The engine is scope-locked by the
  // oracle replay, so the client-side `punctuationChildRegisterOverride`
  // helper intercepts these at display time. Listed here so the forbidden-
  // term sweep catches any call site that forgets to thread the helper.
  'fronted adverbial',
  'main clause',
  'complete clause',
  'subordinate',
  // Whole-word catch-all for any case-variant leakage.
  /\bWorker\b/i,
]);

/**
 * Returns `true` iff `text` contains none of
 * `PUNCTUATION_CHILD_FORBIDDEN_TERMS`. String terms match
 * case-insensitively; RegExp terms apply directly. Empty / non-string
 * input returns `true` so the helper is safe to call against e.g.
 * `undefined` chip labels.
 */
export function isPunctuationChildCopy(text) {
  if (typeof text !== 'string' || !text) return true;
  const haystack = text.toLowerCase();
  for (const term of PUNCTUATION_CHILD_FORBIDDEN_TERMS) {
    if (term instanceof RegExp) {
      if (term.test(text)) return false;
      continue;
    }
    if (typeof term !== 'string' || !term) continue;
    if (haystack.includes(term.toLowerCase())) return false;
  }
  return true;
}

// --- Child status-label map ------------------------------------------------

const PUNCTUATION_CHILD_STATUS_LABELS = Object.freeze({
  new: 'New',
  learning: 'Learning',
  due: 'Due today',
  weak: 'Wobbly',
  secure: 'Secure',
  // Phase 4 U3 — degraded-analytics state. Distinct from `'new'` (fresh
  // learner) so a payload-failure does not masquerade as an empty-evidence
  // Map. Paired with the helper sub-line the Map scene renders under each
  // unknown row (see `punctuationChildUnknownHelperCopy`).
  //
  // Review follow-on (PR #269): the original 'Unknown' label was adult /
  // clinical register and fired against EVERY fresh learner because the
  // default null-branch in `deriveAnalyticsAvailability` produced `false`.
  // Flipping the null-branch to `'empty'` means this label now only ever
  // surfaces when the upstream EXPLICITLY emits degraded state — so the
  // wording can relax into child register per plan R4 (line 541:
  // "`punctuationChildStatusLabel('unknown')` → 'Check back later' or
  // similar"). Chose the plan's first-suggested wording verbatim.
  unknown: 'Check back later',
});

/**
 * Child-facing label for an internal skill status id. Unknown inputs fall
 * back to `New` so a rogue payload still reads as child copy rather than
 * leaking an adult id.
 */
export function punctuationChildStatusLabel(status) {
  if (typeof status !== 'string' || !status) return 'New';
  return PUNCTUATION_CHILD_STATUS_LABELS[status] || 'New';
}

// Phase 4 U3 (review follow-on): the helper sub-line that renders under
// every `'unknown'` skill row. Routed through this helper so the copy
// lands under the same governance layer as `punctuationChildStatusLabel`
// — a future forbidden-term sweep over the helper text lands here, not
// in a JSX literal inside the scene file. The wording softens away from
// the original "We'll unlock this after your next round." because the
// upstream worker does NOT currently wire `ui.analytics` on round
// complete (that upstream emission is deferred by plan R4 to a future
// PR). Until that wiring lands, a causal "next round" promise would be
// broken. The replacement phrasing keeps the reassuring tone (nothing
// the learner did wrong) without the unhonourable causal claim.
export function punctuationChildUnknownHelperCopy() {
  return "We're still loading your progress.";
}

// --- Phase 4 U7 — child-register override layer ----------------------------
//
// Plan R8 locks the engine files (`shared/punctuation/marking.js`,
// `shared/punctuation/generators.js`, `shared/punctuation/scheduler.js`,
// `shared/punctuation/service.js`, `shared/punctuation/legacy-parity.js`)
// under the oracle replay gate — byte-for-byte identical output is the
// proof the engine was not touched. But those files emit adult grammar
// terminology (`fronted adverbial`, `main clause`, …) inside `note` /
// `prompt` strings that the child reads in the guided teach-box,
// feedback panel, and Skill Detail modal. The two-layered fix is:
//   1. `shared/punctuation/content.js` `rule` fields (edit-safe — not
//      engine-bound) are rewritten in child register directly.
//   2. This display-time helper intercepts engine-sourced strings on
//      the way to the render and rewrites adult phrases using a frozen
//      override table. Every call site that renders a Worker / engine
//      atom threads it through this helper.
//
// The table is ordered longest-match first so multi-word phrases
// (`complete clause`, `complex sentence`) replace before shorter
// overlapping entries (`clause`, `sentence`) and the replacement is
// stable. Case is preserved — a capitalised input produces a
// capitalised replacement.

// Raw entries — authored in any order for maintenance clarity. The
// helper below sorts them longest-to-shortest at module load so the
// longest-match pass is CORRECT regardless of authoring order (review
// follow-on FINDING D: manual ordering was comment-enforced; now it is
// computed, so a future author inserting "clause" above "main clause"
// cannot silently break the longest-match invariant).
//
// Each entry: [adultPhrase, childPhrase]. Lower-case keys; the helper
// preserves capitalisation on the matched source.
//
// FINDING B (pedagogy): "main clause" / "complete clause" → "idea"
// rather than "whole sentence". "Whole sentence" in KS2 speech means
// "complete standalone sentence ending in a full stop" — exactly the
// mental model that semicolon / dash / comma-join rules teach children
// to AVOID. "idea" carries the right semantics ("two ideas joined with
// a semi-colon") without re-invoking the word children confuse.
const RAW_PUNCTUATION_CHILD_REGISTER_OVERRIDE_ENTRIES = [
  ['fronted adverbials', 'starter phrases'],
  ['fronted adverbial', 'starter phrase'],
  ['main clauses', 'ideas'],
  ['main clause', 'idea'],
  ['complete clauses', 'whole ideas'],
  ['complete clause', 'whole idea'],
  ['subordinate clauses', 'added ideas'],
  ['subordinate clause', 'added idea'],
  ['complex sentences', 'sentences with an added idea'],
  ['complex sentence', 'sentence with an added idea'],
  ['compound sentences', 'joined sentences'],
  ['compound sentence', 'joined sentence'],
  ['opening clauses', 'opening phrases'],
  ['opening clause', 'opening phrase'],
  ['subordinate', 'added idea'],
];

// Sorted longest-to-shortest at module load. The sort is stable under
// Array.prototype.sort for equal-length entries, so "fronted adverbials"
// (plural) always precedes "fronted adverbial" (singular) when the pair
// appears adjacent — but equal-length adjacency is irrelevant here
// because the plural/singular entries differ by an `s`.
const PUNCTUATION_CHILD_REGISTER_OVERRIDE_ENTRIES = Object.freeze(
  [...RAW_PUNCTUATION_CHILD_REGISTER_OVERRIDE_ENTRIES]
    .sort((a, b) => b[0].length - a[0].length)
    .map((pair) => Object.freeze([...pair])),
);

// Frozen public view — consumers assert the mapping via `Object.keys`
// / `Object.entries`. The internal entries array above stays ordered
// for the longest-match walk; the frozen object has no ordering
// guarantee but is sufficient for the unit test's `includes` assertions.
export const PUNCTUATION_CHILD_REGISTER_OVERRIDES = Object.freeze(
  Object.fromEntries(PUNCTUATION_CHILD_REGISTER_OVERRIDE_ENTRIES),
);

// Match the capitalisation of `source` onto `replacement`. Three cases
// handled: all-upper (every letter uppercase), title-case (first letter
// uppercase), and default lower-case. Anything else falls back to
// lower-case which matches the authored child phrase as-is.
function matchCase(source, replacement) {
  if (!source) return replacement;
  const trimmed = source.trim();
  if (!trimmed) return replacement;
  if (trimmed === trimmed.toUpperCase() && trimmed.length > 1) {
    return replacement.toUpperCase();
  }
  if (trimmed[0] === trimmed[0].toUpperCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

/**
 * Replace adult grammar phrases in `text` with their child-register
 * equivalents using `PUNCTUATION_CHILD_REGISTER_OVERRIDES`. Longest-
 * match pass so `complete clause` replaces before `clause` could ever
 * match. Case-preserving — a capitalised adult term yields a
 * capitalised child term. Empty / non-string input returns `''`.
 *
 * Idempotent: running twice produces the same output as running once,
 * because replacements are sourced from a disjoint child vocabulary.
 */
export function punctuationChildRegisterOverrideString(text) {
  if (typeof text !== 'string' || !text) return '';
  let out = text;
  for (const [adult, child] of PUNCTUATION_CHILD_REGISTER_OVERRIDE_ENTRIES) {
    // Case-insensitive global match so every occurrence is swapped.
    // `adult` entries are guaranteed to be regex-safe (letters + spaces only).
    //
    // FINDING F (correctness): wrap the adult phrase in `\b` word
    // boundaries so `subordinate` does not swallow `insubordinate`
    // (which would have become "inadded idea" — a latent trap). The
    // boundary also guards against future single-word entries matching
    // inside compound words.
    const escaped = adult.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\b${escaped}\\b`, 'gi');
    out = out.replace(pattern, (match) => matchCase(match, child));
  }
  return out;
}

// Which atom fields carry learner-read prose and must pass through the
// override. Non-listed fields (ids, modes, numeric flags, etc.) are not
// rewritten so the override is safely scoped to user-visible copy. The
// `name` field is included because the guided teach-box carries the
// skill's human-readable name ("Commas after fronted adverbials") from
// `shared/punctuation/content.js` via `skill.name`.
//
// Exported (review follow-on, agent-native access): a downstream
// consumer (test harness, tooling, future Parent Hub mirror) can
// iterate the canonical field list without re-declaring it.
export const PUNCTUATION_ATOM_OVERRIDE_FIELDS = Object.freeze([
  'name',
  'rule',
  'note',
  'prompt',
  'body',
  'headline',
  'displayCorrection',
  'explanation',
]);

// Nested sub-objects that carry string children we also need to walk.
// `workedExample` and `contrastExample` each carry `{ before, after }`
// string fields emitted by the guided-mode Worker payload (see
// `renderActiveItemPhase` in `tests/react-punctuation-child-copy.test.js`
// for the shape). Review follow-on FINDING G — the original walker only
// covered `teachBox`, leaving example sub-objects untouched so a raw
// adult term in `workedExample.before` would have leaked unmodified.
//
// Walk depth: ONE level into each listed sub-object, walking only string
// children. We deliberately do not recurse further to keep the override
// scope scoped and predictable — sub-sub-objects stay untouched.
export const PUNCTUATION_ATOM_OVERRIDE_SUB_OBJECTS = Object.freeze([
  'teachBox',
  'workedExample',
  'contrastExample',
]);

// Example sub-objects (`workedExample`, `contrastExample`) carry
// `before` + `after` string fields rather than the teach-box field set.
// Listed separately so the walker can pick the correct field list per
// sub-object without over-walking.
const PUNCTUATION_EXAMPLE_SUB_FIELDS = Object.freeze(['before', 'after']);

function overrideStringFields(source, fields) {
  const copy = { ...source };
  for (const field of fields) {
    if (typeof copy[field] === 'string' && copy[field]) {
      copy[field] = punctuationChildRegisterOverrideString(copy[field]);
    }
  }
  return copy;
}

function overrideAtomFields(atom) {
  let out = overrideStringFields(atom, PUNCTUATION_ATOM_OVERRIDE_FIELDS);
  // TeachBox sub-object carries the atom-field set (name / rule /
  // prompt / note / …) — walk with the same field list as the outer
  // atom. Worker guided-mode teachBox payloads also carry nested
  // workedExample / contrastExample sub-objects; walk those too.
  if (out.teachBox && typeof out.teachBox === 'object' && !Array.isArray(out.teachBox)) {
    let teachBoxCopy = overrideStringFields(out.teachBox, PUNCTUATION_ATOM_OVERRIDE_FIELDS);
    if (teachBoxCopy.workedExample && typeof teachBoxCopy.workedExample === 'object' && !Array.isArray(teachBoxCopy.workedExample)) {
      teachBoxCopy = {
        ...teachBoxCopy,
        workedExample: overrideStringFields(teachBoxCopy.workedExample, PUNCTUATION_EXAMPLE_SUB_FIELDS),
      };
    }
    if (teachBoxCopy.contrastExample && typeof teachBoxCopy.contrastExample === 'object' && !Array.isArray(teachBoxCopy.contrastExample)) {
      teachBoxCopy = {
        ...teachBoxCopy,
        contrastExample: overrideStringFields(teachBoxCopy.contrastExample, PUNCTUATION_EXAMPLE_SUB_FIELDS),
      };
    }
    out = { ...out, teachBox: teachBoxCopy };
  }
  // Top-level workedExample / contrastExample sub-objects (outside the
  // teachBox wrapper — e.g. a feedback payload carrying a direct
  // example object). Walk the same `{before, after}` field pair.
  if (out.workedExample && typeof out.workedExample === 'object' && !Array.isArray(out.workedExample)) {
    out = { ...out, workedExample: overrideStringFields(out.workedExample, PUNCTUATION_EXAMPLE_SUB_FIELDS) };
  }
  if (out.contrastExample && typeof out.contrastExample === 'object' && !Array.isArray(out.contrastExample)) {
    out = { ...out, contrastExample: overrideStringFields(out.contrastExample, PUNCTUATION_EXAMPLE_SUB_FIELDS) };
  }
  return out;
}

/**
 * Display-time override: accepts either a plain string or an atom-shaped
 * object and rewrites adult grammar phrases to child register. Null /
 * undefined inputs pass through unchanged so the helper is safe to call
 * against a possibly-missing Worker payload.
 *
 * Usage: import this at any Punctuation scene that renders Worker-
 * sourced teach-box / feedback / atom prose, and route the atom through
 * `punctuationChildRegisterOverride(atom)` before referencing `.rule`,
 * `.note`, `.prompt`, etc.
 */
export function punctuationChildRegisterOverride(atom) {
  if (atom == null) return atom;
  if (typeof atom === 'string') return punctuationChildRegisterOverrideString(atom);
  if (typeof atom !== 'object' || Array.isArray(atom)) return atom;
  return overrideAtomFields(atom);
}

// --- Phase 4 U7 — Summary-card copy register helpers ------------------------
//
// The Summary scene's NextReviewHint, MonsterProgressTeaser sub-line, and
// per-skill chip badges were authored in adult SaaS register during the
// U5 build. The U5 design-lens review flagged them as copy-register
// leakage; U7 routes each through a helper so forbidden-term sweeps and
// future register passes have one seam per string.

/**
 * Child-register next-review copy derived from `ui.stats`. `stats.due`
 * drives the branch: > 0 → "more goes ready" nudge; === 0 → "come back
 * tomorrow" reassurance. Missing / malformed stats returns `null` so
 * the caller can skip the render rather than fabricating a hint.
 */
export function punctuationChildNextReviewCopy(stats) {
  if (!stats || typeof stats !== 'object' || Array.isArray(stats)) return null;
  const due = Number(stats.due);
  if (!Number.isFinite(due)) return null;
  return due > 0
    ? "More goes ready — let's do another round."
    : 'Brilliant — come back tomorrow for more.';
}

/**
 * Child-register sub-line for the monster-progress teaser. Names the
 * monster explicitly so the Bellstorm frame stays intact (U5 design-lens
 * flagged the prior "Keep going to unlock the next stage." copy as
 * generic SaaS gamification). A missing / empty monster name falls back
 * to a monster-agnostic-but-still-child line.
 */
export function punctuationChildTeaserSubLine(monsterName) {
  if (typeof monsterName === 'string' && monsterName.trim()) {
    const name = monsterName.trim();
    // Review follow-on (design-lens MEDIUM): the prior "their" pronoun
    // ambiguously back-referenced either the learner or the monster.
    // Using the monster's name twice makes the growth-target explicit.
    return `Keep training with ${name} to help ${name} grow.`;
  }
  return 'Keep training to grow your monster’s next stage.';
}

/**
 * Child-register badge label for the per-skill chip row. Prior wording
 * ("needs practice" / "secure") mixed clinical language with a
 * decorative middot; the new labels read as peer copy. Unknown /
 * missing status returns `''` so the render drops the badge.
 */
const PUNCTUATION_CHILD_SKILL_BADGE_LABELS = Object.freeze({
  'needs-practice': 'needs more goes',
  secure: 'nailed it',
});

export function punctuationChildSkillBadgeLabel(status) {
  if (typeof status !== 'string' || !status) return '';
  return PUNCTUATION_CHILD_SKILL_BADGE_LABELS[status] || '';
}

// --- Misconception-tag → child label ---------------------------------------

// Deterministic map from the dotted misconception-tag IDs emitted by
// `shared/punctuation/marking.js` to child-friendly short labels. Unknown
// tags return `null`; the caller hides the chip rather than rendering the
// raw dotted ID. U4 pipes `feedback.misconceptionTags` through this helper
// and pairs it with U10's forbidden-term sweep so a missing mapping fails
// loudly as either an empty chip list (safe) or a forbidden dotted prefix
// in rendered HTML (caught by U10).
//
// Initial translation table — expand in U4 after James reviews. The same
// table also gets tested in U1 via `tests/punctuation-view-model.test.js`.
const PUNCTUATION_MISCONCEPTION_CHILD_LABELS = Object.freeze({
  // speech.*
  'speech.quote_missing': 'Speech punctuation',
  'speech.quote_unmatched': 'Speech punctuation',
  'speech.punctuation_outside_quote': 'Speech punctuation',
  'speech.punctuation_missing': 'Speech punctuation',
  'speech.reporting_comma_missing': 'Speech punctuation',
  'speech.capitalisation_missing': 'Capital letters',
  'speech.words_changed': 'Spoken words',
  'speech.unwanted_punctuation': 'Speech punctuation',
  // comma.*
  'comma.clarity_missing': 'Comma placement',
  'comma.list_missing': 'List commas',
  'comma.list_separator_missing': 'List commas',
  'comma.list_words_changed': 'List commas',
  'comma.unnecessary_final_comma': 'List commas',
  'comma.fronted_adverbial_missing': 'Comma after the opener',
  'comma.opening_phrase_changed': 'Comma after the opener',
  'comma.main_clause_missing': 'Comma placement',
  'comma.capitalisation_missing': 'Capital letters',
  'comma.terminal_missing': 'End punctuation',
  // boundary.*
  'boundary.semicolon_missing': 'Boundary punctuation',
  'boundary.dash_missing': 'Boundary punctuation',
  'boundary.hyphen_missing': 'Hyphen',
  'boundary.comma_splice': 'Boundary punctuation',
  'boundary.words_changed': 'Boundary punctuation',
  'boundary.capitalisation_missing': 'Capital letters',
  'boundary.terminal_missing': 'End punctuation',
  // apostrophe.*
  'apostrophe.contraction_missing': 'Apostrophes',
  'apostrophe.possession_missing': 'Apostrophes',
  'apostrophe.required_forms_missing': 'Apostrophes',
  'apostrophe.unrepaired_forms': 'Apostrophes',
  'apostrophe.capitalisation_missing': 'Capital letters',
  'apostrophe.terminal_missing': 'End punctuation',
  // endmarks.*
  'endmarks.missing': 'End punctuation',
  'endmarks.question_mark_missing': 'End punctuation',
  'endmarks.question_starter_changed': 'Sentence wording',
  'endmarks.capitalisation_missing': 'Capital letters',
  // structure.*
  'structure.fronted_missing': 'Sentence structure',
  'structure.words_changed': 'Sentence structure',
  'structure.parenthesis_missing': 'Parenthesis',
  'structure.parenthesis_unbalanced': 'Parenthesis',
  'structure.colon_missing': 'Colon before a list',
  'structure.list_words_changed': 'List commas',
  'structure.list_separator_missing': 'List commas',
  'structure.semicolon_list_missing': 'Semi-colons in lists',
  'structure.bullet_colon_missing': 'Bullet points',
  'structure.bullet_marker_missing': 'Bullet points',
  'structure.bullet_punctuation_inconsistent': 'Bullet points',
  'structure.capitalisation_missing': 'Capital letters',
  'structure.terminal_missing': 'End punctuation',
});

export function punctuationChildMisconceptionLabel(tag) {
  if (typeof tag !== 'string' || !tag) return null;
  const label = PUNCTUATION_MISCONCEPTION_CHILD_LABELS[tag];
  return typeof label === 'string' && label ? label : null;
}

// --- Feedback chip builder -------------------------------------------------

/**
 * Returns up to 2 child-friendly feedback chips derived from the `facet`
 * list emitted by the marking engine. Uses `facet.label` (the friendly
 * string from `shared/punctuation/marking.js:FACET_LABELS`) — not the
 * dotted `misconceptionTags` IDs, which U4 handles separately via
 * `punctuationChildMisconceptionLabel`. Empty / non-array input returns
 * `[]`. The cap at 2 keeps the feedback tray short for KS2 learners.
 */
export function punctuationFeedbackChips(facets) {
  if (!Array.isArray(facets) || facets.length === 0) return [];
  const chips = [];
  for (const facet of facets) {
    if (!facet || typeof facet !== 'object' || Array.isArray(facet)) continue;
    const label = typeof facet.label === 'string' ? facet.label.trim() : '';
    if (!label) continue;
    chips.push({
      id: typeof facet.id === 'string' ? facet.id : label,
      label,
      ok: facet.ok === true,
    });
    if (chips.length >= 2) break;
  }
  return chips;
}

// --- Prefs mode normaliser -------------------------------------------------

// Returning learners may have `prefs.mode` set to one of the 6 cluster values
// (`endmarks`, `apostrophe`, `speech`, `comma_flow`, `boundary`, `structure`)
// or `guided`. Phase 3 removes those as primary-setup affordances; the
// dashboard renders 3 cards keyed to `smart | weak | gps`. Display-only: we
// collapse cluster / guided values to `smart` so the aria-pressed state on
// the primary mode cards stays coherent. Storage migration (a one-shot
// dispatch of `punctuation-set-mode` with `value: 'smart'`) is U2's job; U1
// only supplies the display mapping.
const PUNCTUATION_LEGACY_CLUSTER_MODE_IDS = Object.freeze(new Set([
  'endmarks',
  'apostrophe',
  'speech',
  'comma_flow',
  'boundary',
  'structure',
  'guided',
]));

export function punctuationPrimaryModeFromPrefs(prefs) {
  const mode = prefs && typeof prefs === 'object' && !Array.isArray(prefs)
    ? prefs.mode
    : prefs;
  if (typeof mode !== 'string' || !mode) return 'smart';
  if (mode === 'smart' || mode === 'weak' || mode === 'gps') return mode;
  if (PUNCTUATION_LEGACY_CLUSTER_MODE_IDS.has(mode)) return 'smart';
  return 'smart';
}

// --- Skill modal preferred example table -----------------------------------

// Per-skill override for the Skill Detail modal pedagogy field (U6). The
// Modal renders exactly 3 pedagogy fields: `rule`, `contrastBad`, and one of
// `workedGood` OR `contrastGood`. Default is `workedGood`. We override for
// skills whose `workedGood` is itself verbatim-identical to a
// `PUNCTUATION_ITEMS.accepted[0]` string — for those, `contrastGood` is the
// safer choice. A full per-skill audit runs in U6; U1 seeds only the
// plan-specified override for `comma_clarity` (whose `contrastGood`
// `'Most of the time, travellers worry about delays.'` is byte-for-byte
// identical to `cc_insert_time_travellers.accepted[0]` — see Key Technical
// Decisions in the Phase 3 plan).
//
// Additional per-skill audit findings documented in the PR body:
// - `list_commas`, `colon_list`, `semicolon`, `dash_clause`,
//   `semicolon_list`, `bullet_points` — BOTH `workedGood` and `contrastGood`
//   are verbatim-present in `PUNCTUATION_ITEMS.accepted[]` for at least one
//   insert/fix item. Neither field is safer than the other; defaulting to
//   `workedGood` is a seam U6's full audit will re-examine.
// - `comma_clarity` — only `contrastGood` overlaps → override to
//   `workedGood` (plan-specified).
// - `hyphen` — `contrastGood` overlaps but `workedGood` does not → default
//   `workedGood` already avoids the leak.
// - `sentence_endings`, `apostrophe_contractions`, `apostrophe_possession`,
//   `speech`, `fronted_adverbial`, `parenthesis` — neither field overlaps;
//   default `workedGood` is safe.
export const PUNCTUATION_SKILL_MODAL_PREFERRED_EXAMPLE = Object.freeze({
  comma_clarity: 'workedGood',
});

export function punctuationSkillModalPreferredExample(skillId) {
  if (typeof skillId !== 'string' || !skillId) return 'workedGood';
  const value = PUNCTUATION_SKILL_MODAL_PREFERRED_EXAMPLE[skillId];
  return value === 'contrastGood' ? 'contrastGood' : 'workedGood';
}

// --- Skill Detail modal pedagogy content (client mirror) --------------------
//
// U6: the Skill Detail modal renders exactly 3 pedagogy fields per skill —
// `rule`, `contrastBad`, and one of `workedGood` OR `contrastGood`. The
// canonical source for `rule` + `contrastBad` is `shared/punctuation/content.js`'s
// `PUNCTUATION_SKILLS` roster, which the bundle-audit rule forbids from
// reaching the browser bundle. The two example fields (`workedGood` +
// `contrastGood`) are authored FRESH for the client mirror: for several
// skills the shared `workedGood` / `contrastGood` are byte-for-byte identical
// to `PUNCTUATION_ITEMS.accepted[*]` strings (a learner would see the exact
// answer string in the Modal before a Practise round that expects them to
// produce it). The client mirror deliberately diverges on the two example
// fields so no rendered example collides with any accepted-answer string
// for the owning skill. A red-team test in
// `tests/punctuation-view-model.test.js` guards the disjoint property; a
// narrower drift test still pins `rule` + `contrastBad` byte-for-byte.
//
// Child register: rules and examples use Year 3-5 vocabulary. No adult
// register terms ("main clause", "fronted adverbial", "opening clause") —
// those live only in the shared content for the marking engine.
//
// No other field from `PUNCTUATION_SKILLS` ships (no `workedBad`, no `phase`,
// no `prereq`, no `published`). The modal's 3-field contract is enforced in
// the component — this map just supplies the raw strings.
export const PUNCTUATION_SKILL_MODAL_CONTENT = Object.freeze({
  sentence_endings: Object.freeze({
    rule: 'Start each sentence with a capital letter and end it with the right mark: full stop, question mark or exclamation mark.',
    workedGood: 'Where is my reading record?',
    contrastGood: 'We won the match!',
    contrastBad: 'We won the match?',
  }),
  list_commas: Object.freeze({
    rule: 'Use commas to separate items in a list. In standard KS2 examples, the final comma before and is usually not needed.',
    workedGood: 'The team brought bats, balls and cones.',
    contrastGood: 'The team brought bats, balls and cones.',
    contrastBad: 'We packed, torches maps, and water.',
  }),
  apostrophe_contractions: Object.freeze({
    rule: "Use an apostrophe to show missing letters in contractions, such as can't, didn't and we're.",
    workedGood: "We can't go because we're late.",
    contrastGood: "We can't go because we're late.",
    contrastBad: "We cant go because we're late.",
  }),
  apostrophe_possession: Object.freeze({
    rule: "Use apostrophes to show belonging: the girl's coat, the girls' coats, the children's books.",
    workedGood: "The girl's coat was on the bench.",
    contrastGood: "The girls' coats were on the bench.",
    contrastBad: 'The girls coat was on the bench.',
  }),
  speech: Object.freeze({
    rule: 'Put spoken words inside inverted commas. Use the correct punctuation inside the closing inverted comma when the punctuation belongs to the spoken words.',
    workedGood: 'Mia said, "Come here."',
    contrastGood: '"Where are you going?" asked Zara.',
    contrastBad: '"Where are you going"? asked Zara.',
  }),
  fronted_adverbial: Object.freeze({
    rule: 'Put a comma after the opening phrase that tells when, where, or how the action happens.',
    workedGood: 'Before lunch, we finished the poster.',
    contrastGood: 'Before lunch, we finished the poster.',
    contrastBad: 'Before lunch we, finished the poster.',
  }),
  parenthesis: Object.freeze({
    rule: 'Parenthesis adds extra information. It can be marked with commas, brackets or dashes.',
    workedGood: 'Mr Patel, our coach, arrived early.',
    contrastGood: 'Mr Patel (our coach) arrived early.',
    contrastBad: 'Mr Patel our coach, arrived early.',
  }),
  comma_clarity: Object.freeze({
    rule: 'A comma can make meaning clearer and avoid ambiguity.',
    workedGood: "Let's eat, Grandma.",
    contrastGood: 'After tea, the garden looked peaceful.',
    contrastBad: 'Most of the time travellers worry about delays.',
  }),
  colon_list: Object.freeze({
    rule: 'A colon comes before a list, after a short sentence.',
    workedGood: 'The bag held four items: a ruler, a pencil, a rubber and a book.',
    contrastGood: 'The bag held four items: a ruler, a pencil, a rubber and a book.',
    contrastBad: 'We needed: three things a torch, a map and a whistle.',
  }),
  semicolon: Object.freeze({
    // Review follow-on FINDING B: "short sentences" re-invoked the
    // comma-splicing confusion. "Closely related ideas" carries the
    // right semantics without the pedagogically lossy framing.
    rule: 'A semicolon joins two closely related ideas.',
    workedGood: 'The bell rang; the class fell silent.',
    contrastGood: 'The bell rang; the class fell silent.',
    contrastBad: 'The rain had stopped; and the pitch was still slippery.',
  }),
  dash_clause: Object.freeze({
    rule: 'A dash shows a sharp pause between two closely related ideas.',
    workedGood: 'The bus was late - we walked instead.',
    contrastGood: 'The bus was late - we walked instead.',
    contrastBad: 'The path was flooded -and we took the longer route.',
  }),
  semicolon_list: Object.freeze({
    rule: 'Use semi-colons to separate list items when each item already contains commas.',
    workedGood: 'We invited Ava, our captain; Zane, our goalie; and Priya, our coach.',
    contrastGood: 'We invited Ava, our captain; Zane, our goalie; and Priya, our coach.',
    contrastBad: 'We visited York, England, Cardiff, Wales; and Belfast, Northern Ireland.',
  }),
  bullet_points: Object.freeze({
    rule: 'Use a colon after the opening stem when appropriate, and punctuate bullets consistently.',
    workedGood: 'Pack:\n- your shoes\n- your bottle\n- your book',
    contrastGood: 'Pack:\n- your shoes\n- your bottle\n- your book',
    contrastBad: 'Bring\n- a drink\n- a hat\n- a sketchbook',
  }),
  hyphen: Object.freeze({
    rule: 'A hyphen can stop a phrase from being misunderstood, such as man-eating shark versus man eating shark.',
    workedGood: 'We saw a man-eating shark.',
    contrastGood: 'The ten-year-old jumper still fits.',
    contrastBad: 'The little used room was locked.',
  }),
});

/**
 * Client-safe accessor for the three modal pedagogy fields of a skill.
 * Returns `null` for unknown / non-string skill ids so the caller can short-
 * circuit the render rather than leaking a rogue payload. Pairs with
 * `punctuationSkillModalPreferredExample` — the caller chooses
 * `workedGood` vs `contrastGood` and pipes the selection through `rule` +
 * `contrastBad` + the chosen example.
 */
export function punctuationSkillModalContent(skillId) {
  if (typeof skillId !== 'string' || !skillId) return null;
  const entry = PUNCTUATION_SKILL_MODAL_CONTENT[skillId];
  return entry || null;
}

// --- Multi-skill paragraph caveat -------------------------------------------

// U6: skills that appear in at least one `PUNCTUATION_ITEMS` entry whose
// `skillIds.length > 1`. When the modal opens on one of these, the Practise
// tab renders a child-facing footnote — "Some practice questions may also
// include other punctuation skills." — so a learner who chose Guided focus
// on (say) Speech isn't surprised when a paragraph-repair item also tests
// Fronted Adverbials. Derived by hand from the cross-skill rows in
// `shared/punctuation/content.js`'s PUNCTUATION_ITEMS:
//   sp_fa_transfer_at_last_speech → speech + fronted_adverbial
//   cl_lc_transfer_toolkit        → colon_list + list_commas
//   pg_fronted_speech             → fronted_adverbial + speech
//   pg_parenthesis_speech         → parenthesis + speech
//   pg_colon_semicolon            → colon_list + semicolon
//   pg_apostrophe_mix             → apostrophe_contractions + apostrophe_possession
// A drift test in `tests/punctuation-view-model.test.js` verifies this set
// matches the live multi-skill items when the shared content evolves.
const PUNCTUATION_MULTI_SKILL_ITEM_SKILLS = Object.freeze(new Set([
  'speech',
  'fronted_adverbial',
  'colon_list',
  'list_commas',
  'parenthesis',
  'semicolon',
  'apostrophe_contractions',
  'apostrophe_possession',
]));

export function punctuationSkillHasMultiSkillItems(skillId) {
  if (typeof skillId !== 'string' || !skillId) return false;
  return PUNCTUATION_MULTI_SKILL_ITEM_SKILLS.has(skillId);
}

// --- Monster stage labels (child-facing) -----------------------------------

// Child-facing label for a monster's current stage, derived from
// `starDerivedStage` (0-5 for direct monsters, 0-5 for grand). The labels
// read as warm adventure-world status rather than clinical stage numbers.
// Stage 0 with zero stars is "Not caught" (fresh learner); Stage 0 with
// any stars is "Egg Found" (the learner has started but not hatched).
const PUNCTUATION_MONSTER_STAGE_LABELS = Object.freeze([
  'Not caught',
  'Egg Found',
  'Hatch',
  'Evolve',
  'Strong',
  'Mega',
]);

/**
 * Returns a child-facing label for the monster's current stage.
 * `stage` is the `starDerivedStage` integer (0-5). `totalStars` is
 * used to distinguish "Not caught" (0 stars at stage 0) from
 * "Egg Found" (>0 stars at stage 0). Unknown/out-of-range stages
 * fall back to "Not caught".
 */
export function punctuationStageLabel(stage, totalStars = 0) {
  const s = Number(stage);
  const stars = Number(totalStars) || 0;
  if (!Number.isFinite(s) || s < 0 || s > 5) return PUNCTUATION_MONSTER_STAGE_LABELS[0];
  // Stage 0 splits: zero stars → "Not caught"; any stars → "Egg Found"
  if (s === 0 && stars > 0) return PUNCTUATION_MONSTER_STAGE_LABELS[1];
  if (s === 0) return PUNCTUATION_MONSTER_STAGE_LABELS[0];
  return PUNCTUATION_MONSTER_STAGE_LABELS[s] || PUNCTUATION_MONSTER_STAGE_LABELS[0];
}

// --- Dashboard model builder -----------------------------------------------

function safeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? Math.floor(num) : fallback;
}

// U3 review follow-up: shared monotonic merge helper. Combines live Star
// projection values (from starView) with persisted codex high-water marks
// (maxStageEver / starHighWater from rewardState) so every scene displays
// the max of (live, persisted) for both stage and Stars. This guarantees a
// monster never appears to de-evolve after evidence lapse.
//
// Parameters:
//   liveStars      — current Star total from the read-model (starView)
//   liveStage      — current starDerivedStage from the read-model
//   codexEntry     — the rewardState entry for this monster (carries
//                    maxStageEver + starHighWater)
//
// Returns: { displayStars, displayStage } — the monotonic-max values
//          safe for child-facing rendering.
export function mergeMonotonicDisplay(liveStars, liveStage, codexEntry) {
  const stars = safeNumber(liveStars, 0);
  const stage = safeNumber(liveStage, 0);
  const maxStageEver = safeNumber(codexEntry?.maxStageEver, 0);
  const starHighWater = safeNumber(codexEntry?.starHighWater, 0);
  return {
    displayStars: Math.max(stars, starHighWater),
    displayStage: Math.max(stage, maxStageEver),
  };
}

function activeMonsterProgressFromReward(rewardState, starView) {
  const safeReward = rewardState && typeof rewardState === 'object' && !Array.isArray(rewardState)
    ? rewardState
    : {};
  const safeStarView = starView && typeof starView === 'object' && !Array.isArray(starView)
    ? starView
    : null;
  const perMonster = safeStarView && typeof safeStarView.perMonster === 'object'
    && !Array.isArray(safeStarView.perMonster)
    ? safeStarView.perMonster
    : {};
  const grand = safeStarView && typeof safeStarView.grand === 'object'
    && !Array.isArray(safeStarView.grand)
    ? safeStarView.grand
    : null;

  return ACTIVE_PUNCTUATION_MONSTER_IDS.map((monsterId) => {
    const entry = safeReward[monsterId];
    const masteredList = Array.isArray(entry?.mastered) ? entry.mastered : [];
    const mastered = masteredList.length || safeNumber(entry?.masteredCount, 0);

    // U4: merge star projection data when available. Direct monsters read
    // from perMonster[monsterId].total; the grand monster (quoral) reads
    // from grand.grandStars (NOT grand.total — that field is the cap).
    const isGrand = monsterId === 'quoral';
    const starEntry = isGrand ? grand : perMonster[monsterId];
    const totalStars = starEntry
      ? safeNumber(isGrand ? starEntry.grandStars : starEntry.total, 0)
      : 0;
    const starDerivedStage = starEntry ? safeNumber(starEntry.starDerivedStage, 0) : 0;

    // U3 (Phase 6): monotonic display values via shared helper. The codex
    // (rewardState) persists maxStageEver and starHighWater per monster —
    // these survive evidence lapse so the child never sees a monster
    // de-evolve. mergeMonotonicDisplay centralises the Math.max merge so
    // Setup, Map, and Summary all use one sanitisation path.
    const { displayStage, displayStars } = mergeMonotonicDisplay(totalStars, starDerivedStage, entry);

    return Object.freeze({
      id: monsterId,
      name: punctuationMonsterDisplayName(monsterId),
      mastered,
      totalStars,
      starDerivedStage,
      displayStage,
      displayStars,
    });
  });
}

/**
 * Builds the Setup-scene dashboard view-model. Pure reducer over the
 * Punctuation read-model stats shape + reward state. Returns a safe empty
 * shape when any input is missing, so the dashboard never throws on a fresh
 * learner. Output:
 *
 *   {
 *     todayCards:      Frozen array of { id, label, value, detail },
 *     activeMonsters:  Frozen array of { id, name, mastered },
 *     primaryMode:     string,  // normalised via punctuationPrimaryModeFromPrefs
 *     isEmpty:         boolean, // true when every Today count is zero
 *   }
 */
export function buildPunctuationDashboardModel(stats, learner, rewardState, starView) {
  const safeStats = stats && typeof stats === 'object' && !Array.isArray(stats) ? stats : {};
  const dueCount = safeNumber(safeStats.due, 0);
  const weakCount = safeNumber(safeStats.weak, 0);
  const secureCount = safeNumber(safeStats.securedRewardUnits ?? safeStats.secure, 0);
  const accuracyValue = safeNumber(safeStats.accuracy, 0);

  // HIGH 3 (adv-234 follow-up): child-register `detail` strings. The
  // previous "Reward units you own" / "This release" wording was adult-
  // register (the former leaks the internal "reward unit" token, the
  // latter the release-id token). Child copy stays in the same 3-5 word
  // slot so the card grid layout is unchanged.
  const todayCards = Object.freeze([
    Object.freeze({ id: 'secure', label: 'Secure', value: secureCount, detail: 'Skills you know well' }),
    Object.freeze({ id: 'due', label: 'Due', value: dueCount, detail: 'Come back to these today' }),
    Object.freeze({ id: 'weak', label: 'Wobbly', value: weakCount, detail: 'Needs another go' }),
    Object.freeze({ id: 'accuracy', label: 'Accuracy', value: accuracyValue, detail: 'Your best so far' }),
  ]);

  const prefs = learner && typeof learner === 'object' && !Array.isArray(learner)
    ? learner.prefs
    : null;
  const primaryMode = punctuationPrimaryModeFromPrefs(prefs);

  // Fresh learner: zero attempts, zero secure units, zero wobbly, zero due.
  const isEmpty = (dueCount + weakCount + secureCount + accuracyValue) === 0;

  return {
    todayCards,
    activeMonsters: Object.freeze(activeMonsterProgressFromReward(rewardState, starView)),
    primaryMode,
    isEmpty,
  };
}

// --- Punctuation Map model builder -----------------------------------------

/**
 * Build the 14 skill-row inputs for `buildPunctuationMapModel`. Called
 * once per Map render from `PunctuationMapScene`. When the analytics
 * snapshot carries `skillRows`, each client-held skill (name + clusterId)
 * is enriched with its per-skill status / attempts / accuracy / mastery
 * row. Fresh learners fall back to `status: 'new'` per-skill (pre-U3
 * behaviour preserved). A DEGRADED analytics state
 * (`analytics.available === false`) now coerces every skill to
 * `status: 'unknown'` — the Map no longer pretends a payload failure is
 * an empty evidence roster (plan R4 / Phase 4 U3, origin R4).
 *
 * Pure function over plain data — no React, no SSR. Exported so
 * `tests/react-punctuation-scene.test.js` can exercise the three
 * branches (true / false / 'empty') directly without the full render
 * cost, and so the scene file imports it as a plain helper.
 */
export function assembleSkillRows(ui) {
  const analytics = ui && typeof ui === 'object' && !Array.isArray(ui) ? ui.analytics : null;
  // `available === false` means the Worker projection failed or was
  // omitted entirely. Surface the degraded state honestly: every skill
  // reads as `'unknown'` with the helper sub-line the SkillCard renders.
  const degraded = analytics && analytics.available === false;
  const snapshotRows = analytics && Array.isArray(analytics.skillRows) ? analytics.skillRows : [];
  const snapshotById = new Map();
  for (const row of snapshotRows) {
    if (row && typeof row === 'object' && !Array.isArray(row) && typeof row.skillId === 'string') {
      snapshotById.set(row.skillId, row);
    }
  }
  return PUNCTUATION_CLIENT_SKILLS.map((skill) => {
    const snap = snapshotById.get(skill.id) || null;
    const rawStatus = degraded
      ? 'unknown'
      : (snap && typeof snap.status === 'string' ? snap.status : 'new');
    return {
      skillId: skill.id,
      name: skill.name,
      clusterId: skill.clusterId,
      status: rawStatus,
      attempts: Number(snap?.attempts) || 0,
      accuracy: Number.isFinite(Number(snap?.accuracy)) ? Number(snap.accuracy) : null,
      mastery: Number(snap?.mastery) || 0,
      dueAt: Number(snap?.dueAt) || 0,
    };
  });
}

function normaliseSkillRow(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const skillId = typeof row.skillId === 'string' ? row.skillId : '';
  if (!skillId) return null;
  return {
    skillId,
    name: typeof row.name === 'string' ? row.name : skillId,
    clusterId: typeof row.clusterId === 'string' ? row.clusterId : '',
    status: typeof row.status === 'string' ? row.status : 'new',
    attempts: safeNumber(row.attempts, 0),
    accuracy: Number.isFinite(Number(row.accuracy)) ? Number(row.accuracy) : null,
    mastery: safeNumber(row.mastery, 0),
    dueAt: safeNumber(row.dueAt, 0),
  };
}

function deriveStatusForSkill(row) {
  if (!row) return 'new';
  // Phase 4 U3: preserve the explicit `'unknown'` signal when the Map has
  // coerced every skill to unknown because analytics is unavailable. The
  // `attempts === 0` branch below would otherwise silently downgrade
  // unknown rows to `'new'` and re-introduce the exact bug U3 fixes.
  if (row.status === 'unknown') return 'unknown';
  if (row.attempts === 0) return 'new';
  return row.status;
}

function masteredCountForMonster(rewardState, monsterId) {
  if (!rewardState || typeof rewardState !== 'object' || Array.isArray(rewardState)) return 0;
  const entry = rewardState[monsterId];
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return 0;
  const masteredList = Array.isArray(entry.mastered) ? entry.mastered : [];
  return masteredList.length || safeNumber(entry.masteredCount, 0);
}

/**
 * Builds the Punctuation Map view-model. Pure reducer over:
 *   - `skillRows`        — analytics snapshot (already redacted).
 *   - `monsterState`     — either a reward-state map keyed by monsterId OR the
 *                          shape returned by `normalisePunctuationMonsterState`.
 *                          Both expose `{ mastered: [...] }` per entry.
 *   - `clusterToMonster` — map cluster id → monsterId. Built from
 *                          `PUNCTUATION_CLUSTERS` in the caller; U1 tests
 *                          pass a plain object.
 *
 * Output shape (U5's Map scene consumes this directly):
 *
 *   {
 *     monsters: [
 *       {
 *         monsterId, name, mastered, skills: [{ skillId, name, clusterId,
 *           status, statusLabel, attempts, accuracy, mastery, dueAt }]
 *       }, ...
 *     ]
 *   }
 *
 * Reserved monsters never appear in the output even if `monsterState`
 * contains them — the iterator is `ACTIVE_PUNCTUATION_MONSTER_IDS`, full
 * stop. A skill whose cluster maps to a reserved or unknown monster falls
 * back to the grand monster (`quoral`) so the 14-skill total stays stable.
 */
export function buildPunctuationMapModel(skillRows, monsterState, clusterToMonster) {
  const rows = (Array.isArray(skillRows) ? skillRows : [])
    .map(normaliseSkillRow)
    .filter(Boolean);
  const clusterMap = clusterToMonster && typeof clusterToMonster === 'object' && !Array.isArray(clusterToMonster)
    ? clusterToMonster
    : {};
  const activeSet = new Set(ACTIVE_PUNCTUATION_MONSTER_IDS);
  const grandMonsterId = ACTIVE_PUNCTUATION_MONSTER_IDS[ACTIVE_PUNCTUATION_MONSTER_IDS.length - 1] || 'quoral';

  const skillToMonster = new Map();
  for (const row of rows) {
    const mappedMonster = clusterMap[row.clusterId];
    const monsterId = typeof mappedMonster === 'string' && activeSet.has(mappedMonster)
      ? mappedMonster
      : grandMonsterId;
    skillToMonster.set(row.skillId, monsterId);
  }

  const monsters = ACTIVE_PUNCTUATION_MONSTER_IDS.map((monsterId) => {
    const skills = rows
      .filter((row) => skillToMonster.get(row.skillId) === monsterId)
      .map((row) => {
        const status = deriveStatusForSkill(row);
        return Object.freeze({
          skillId: row.skillId,
          name: row.name,
          clusterId: row.clusterId,
          status,
          statusLabel: punctuationChildStatusLabel(status),
          attempts: row.attempts,
          accuracy: row.accuracy,
          mastery: row.mastery,
          dueAt: row.dueAt,
        });
      });
    return Object.freeze({
      monsterId,
      name: punctuationMonsterDisplayName(monsterId),
      mastered: masteredCountForMonster(monsterState, monsterId),
      skills: Object.freeze(skills),
    });
  });

  return Object.freeze({ monsters: Object.freeze(monsters) });
}
