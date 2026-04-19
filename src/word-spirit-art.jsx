// Word Spirit procedural art — per-word collectibles used by the
// Collection grid, Sanctuary zones, combat catch ceremony, and the
// flashcard retrieval dialog.
//
// This is a separate model from MONSTERS (Inklet/Glimmerbug/Phaeton),
// which are pool-level named creatures. Word Spirits are per-word: the
// resting form of the same creature the kid met during a question
// (Unit 4's combat skin). Keyed to the slug so the same word always
// yields the same silhouette across devices and rerenders.
//
// Signature: WordSpiritArt({ slug, subjectId, size, silhouette, caught })
//   - Template pick: `hash(slug) % templates.length` (four generic
//     creature shapes; subjects share them for now).
//   - Palette: derived from SUBJECTS[subjectId] so the spirit sits
//     inside the subject's visual identity without new tokens.
//   - Seed: slug hash + template index. Drives the per-slug
//     variations (ear length, tail curl) inside a template.

// ─── Pure helpers ─────────────────────────────────────────────────
// Kept at module top-level so Unit 8's jsdom-backed tests can exercise
// them without a DOM via globalThis.__ks2WordSpiritArt.

// djb2 — cheap, stable, spreads short-slug collisions well enough for
// a 4-slot modulo. Absolute value because (h << 5) can go negative.
function hashSlug(slug) {
  let h = 5381;
  const s = String(slug == null ? '' : slug);
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function wordSpiritTemplateIndex(slug, templatesLength) {
  if (!templatesLength) return 0;
  return hashSlug(slug) % templatesLength;
}

// Same LCG shape as monster-overlay.jsx:15 so snapshots stay stable
// across renders.
function wordSpiritSeededRandom(seed) {
  let s = seed | 0;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function wordSpiritPaletteFor(subjectId) {
  const subjects = (typeof window !== 'undefined' && window.SUBJECTS) || {};
  const tokens = (typeof window !== 'undefined' && window.TOKENS) || {};
  const entry = subjects[subjectId];
  if (entry) {
    return {
      accent: entry.accent,
      accentSoft: entry.accentSoft,
      accentTint: entry.accentTint,
      ink: tokens.ink || '#1D2B3A',
    };
  }
  return {
    accent: '#3E6FA8',
    accentSoft: '#DCE6F3',
    accentTint: '#EEF3FA',
    ink: tokens.ink || '#1D2B3A',
  };
}

// ─── Templates ────────────────────────────────────────────────────
// Four generic creature shapes. Each template returns an SVG given
// (palette, rand, size). `rand` is the seeded RNG — templates may
// call it any number of times, but must consume in a deterministic
// order so the same seed produces the same output every render.

function tmplPuff(palette, rand, size) {
  const ear = 10 + Math.floor(rand() * 10);
  const gap = 16 + Math.floor(rand() * 8);
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden="true">
      <ellipse cx="60" cy="78" rx="34" ry="28" fill={palette.accent}/>
      <path d={`M40 50 L46 ${50 - ear} L54 48 Z`} fill={palette.accent}/>
      <path d={`M66 48 L74 ${50 - ear} L80 50 Z`} fill={palette.accent}/>
      <ellipse cx="54" cy="74" rx="18" ry="12" fill={palette.accentSoft} opacity="0.55"/>
      <circle cx={60 - gap / 2} cy="72" r="4" fill={palette.ink}/>
      <circle cx={60 + gap / 2} cy="72" r="4" fill={palette.ink}/>
      <path d="M54 88 q6 4 12 0" stroke={palette.ink} strokeWidth="2" fill="none" strokeLinecap="round"/>
    </svg>
  );
}

function tmplSerpent(palette, rand, size) {
  const amp = 6 + Math.floor(rand() * 6);
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden="true">
      <path
        d={`M18 64 q12 -${amp * 2} 24 0 q12 ${amp * 2} 24 0 q12 -${amp * 2} 24 0 q6 ${amp} 12 ${amp}`}
        stroke={palette.accent} strokeWidth="18" fill="none"
        strokeLinecap="round" strokeLinejoin="round"
      />
      <circle cx="100" cy="56" r="7" fill={palette.accentSoft}/>
      <circle cx="102" cy="56" r="3" fill={palette.ink}/>
      <path d="M108 64 l6 2 l-6 2" stroke={palette.ink} strokeWidth="1.5" fill="none" strokeLinecap="round"/>
    </svg>
  );
}

function tmplBird(palette, rand, size) {
  const wing = 14 + Math.floor(rand() * 8);
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden="true">
      <ellipse cx="62" cy="68" rx="24" ry="20" fill={palette.accent}/>
      <path d={`M62 48 l-${wing} -14 l${wing * 2} 0 Z`} fill={palette.accent} opacity="0.8"/>
      <path d={`M86 70 q${wing / 2} -${wing / 2} ${wing + 4} -2`} fill={palette.accentSoft}/>
      <circle cx="54" cy="64" r="3" fill={palette.ink}/>
      <path d="M40 72 l-10 -2 l8 6 Z" fill={palette.accent}/>
      <path d="M56 90 l4 6 l4 -6 M66 90 l4 6 l4 -6"
            stroke={palette.accent} strokeWidth="3" fill="none" strokeLinecap="round"/>
    </svg>
  );
}

function tmplQuad(palette, rand, size) {
  const tail  = 14 + Math.floor(rand() * 10);
  const earUp = 6 + Math.floor(rand() * 6);
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden="true">
      <ellipse cx="60" cy="72" rx="28" ry="18" fill={palette.accent}/>
      <rect x="38" y="86" width="6" height="16" rx="2" fill={palette.accent}/>
      <rect x="52" y="86" width="6" height="16" rx="2" fill={palette.accent}/>
      <rect x="66" y="86" width="6" height="16" rx="2" fill={palette.accent}/>
      <rect x="80" y="86" width="6" height="16" rx="2" fill={palette.accent}/>
      <path d={`M86 68 q${tail} -${tail / 2} ${tail + 6} -${tail + 6}`}
            stroke={palette.accent} strokeWidth="5" fill="none" strokeLinecap="round"/>
      <circle cx="42" cy="62" r="12" fill={palette.accent}/>
      <path d={`M34 52 l2 -${earUp} l6 0 Z`} fill={palette.accent}/>
      <path d={`M48 52 l2 -${earUp} l6 0 Z`} fill={palette.accent}/>
      <circle cx="38" cy="60" r="2.2" fill={palette.ink}/>
    </svg>
  );
}

// Subjects share the generic template set for now. Keep the map
// explicit so per-subject divergence is a one-line swap later.
const WORD_SPIRIT_GENERIC_TEMPLATES = [tmplPuff, tmplSerpent, tmplBird, tmplQuad];
const WordSpiritTemplates = {
  spelling:    WORD_SPIRIT_GENERIC_TEMPLATES,
  arithmetic:  WORD_SPIRIT_GENERIC_TEMPLATES,
  reasoning:   WORD_SPIRIT_GENERIC_TEMPLATES,
  grammar:     WORD_SPIRIT_GENERIC_TEMPLATES,
  punctuation: WORD_SPIRIT_GENERIC_TEMPLATES,
  reading:     WORD_SPIRIT_GENERIC_TEMPLATES,
};

function WordSpiritArt({ slug, subjectId, size = 72, silhouette = false, caught = true }) {
  const templates = WordSpiritTemplates[subjectId] || WORD_SPIRIT_GENERIC_TEMPLATES;
  const index     = wordSpiritTemplateIndex(slug, templates.length);
  const palette   = wordSpiritPaletteFor(subjectId);
  const rand      = wordSpiritSeededRandom(hashSlug(slug) + index);
  const svg       = (templates[index] || templates[0])(palette, rand, size);

  if (caught && !silhouette) return svg;
  // Silhouette treatment mirrors MonsterArt (monsters.jsx:624) so the
  // spirit grid reads consistently next to monster chips.
  return (
    <div style={{
      width: size, height: size, position: 'relative',
      filter: 'brightness(0.1) opacity(0.35)',
    }}>{svg}</div>
  );
}

// Factory-style export mirrors Unit 2's globalThis hook so Unit 8's
// jsdom-backed tests can reach these pure helpers without a DOM. Kept
// alongside window.* so browser callers see the existing contract.
if (typeof globalThis !== 'undefined') {
  globalThis.__ks2WordSpiritArt = {
    hashSlug,
    wordSpiritTemplateIndex,
    wordSpiritSeededRandom,
    wordSpiritPaletteFor,
    WordSpiritTemplates,
    WordSpiritArt,
  };
}

if (typeof window !== 'undefined') {
  Object.assign(window, { WordSpiritArt, WordSpiritTemplates });
}
