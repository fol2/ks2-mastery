// Server-side catalogue of monsters returned through the bootstrap payload.
// Kept in sync with src/monsters.jsx MONSTERS_BY_SUBJECT — add a new id here
// whenever the client catalogue grows, then update buildBootstrapStats in
// spelling-service.js to emit it. The bootstrap response validator consumes
// this list so drift between writer and validator fails loudly in tests.
export const MONSTER_IDS = Object.freeze(["inklet", "glimmerbug", "phaeton"]);
