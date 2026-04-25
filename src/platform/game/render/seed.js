// Shared deterministic seeding helpers used by motion effects.
//
// Behaviour is byte-identical to the original implementations that lived
// alongside `eggBreatheStyle` and `monsterMotionStyle` in
// `src/surfaces/home/data.js`. Multiple effects need the same FNV-1a hash
// and value-mapping, so they sit here under the render library.

export function hashString(value) {
  let hash = 2166136261;
  const text = String(value || '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function valueBetween(hash, min, max) {
  return min + (hash / 0xffffffff) * (max - min);
}
