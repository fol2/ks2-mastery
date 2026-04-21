/*
 * Shared primitives for KS2 redesign v1 — Codex Journal.
 * Exports all names to window so other <script type="text/babel"> tags can use them.
 * (Babel standalone gives each script its own scope.)
 */

const { useState, useEffect, useMemo, useRef, useLayoutEffect } = React;

/* ==========================================================
   Sample data (mirrors real-app state shape, placeholder values)
   ========================================================== */
const LEARNER = {
  id: 'learner-alex',
  name: 'Alex',
  yearGroup: 'Year 4',
  goal: 'Settle the spring dictation list.',
  dailyMinutes: 12,
  streakDays: 3,
  secureWords: 42,
  totalWords: 134,
  dueCount: 6,
  accuracy: 0.82,
};

const COMPANION = {
  id: 'inklet',
  name: 'Scribbla',
  stage: 2,
  variant: 'b1',
  primary: 'var(--inklet)',
  soft: 'var(--inklet-soft)',
  img: '/assets/monsters/inklet/b1/inklet-b1-2.640.webp',
  imgSmall: '/assets/monsters/inklet/b1/inklet-b1-2.320.webp',
};

const SUBJECTS = [
  {
    id: 'spelling',
    name: 'English Spelling',
    eyebrow: 'The Scribe Downs',
    blurb: 'Weighted review, trouble drill, SATs rehearsal.',
    status: 'live',
    glyph: 'Sp',
    accent: 'linear-gradient(135deg, var(--inklet), var(--glimmer))',
    region: {
      id: 'the-scribe-downs',
      label: 'The Scribe Downs',
      bgBase: '/assets/regions/the-scribe-downs/the-scribe-downs-bg-a1',
    },
    progress: 0.31,
    progressLabel: '42 secure · 6 due',
  },
  {
    id: 'arithmetic',
    name: 'Arithmetic',
    eyebrow: null,
    blurb: 'Build speed and fluency with the four operations.',
    status: 'soon',
    glyph: '×÷',
    accent: 'linear-gradient(135deg, #C06B3E, #F2B756)',
    progress: 0.0,
    progressLabel: 'Coming soon',
  },
  {
    id: 'reasoning',
    name: 'Reasoning',
    eyebrow: null,
    blurb: 'Multi-step maths: plan, work it out, check.',
    status: 'soon',
    glyph: '∴',
    accent: 'linear-gradient(135deg, #8A5A9D, #C4A5D4)',
    progress: 0.0,
    progressLabel: 'Coming soon',
  },
  {
    id: 'grammar',
    name: 'Grammar',
    eyebrow: null,
    blurb: 'Word classes, clauses, tenses and sentence shape.',
    status: 'soon',
    glyph: '¶',
    accent: 'linear-gradient(135deg, #2E8479, #78C2B4)',
    progress: 0.0,
    progressLabel: 'Coming soon',
  },
  {
    id: 'punctuation',
    name: 'Punctuation',
    eyebrow: null,
    blurb: 'Commas, apostrophes, speech marks and more.',
    status: 'soon',
    glyph: ';',
    accent: 'linear-gradient(135deg, #B8873F, #E8C88E)',
    progress: 0.0,
    progressLabel: 'Coming soon',
  },
  {
    id: 'reading',
    name: 'Reading',
    eyebrow: null,
    blurb: 'Retrieve, infer and explain from passages.',
    status: 'soon',
    glyph: 'Rd',
    accent: 'linear-gradient(135deg, #4B7A4A, #9CC59A)',
    progress: 0.0,
    progressLabel: 'Coming soon',
  },
];

const CODEX_TILES = [
  {
    id: 'inklet',
    species: 'inklet',
    name: 'Scribbla',
    stage: 2,
    caught: true,
    progress: 0.42,
    img: '/assets/monsters/inklet-2.320.webp',
    color: 'var(--inklet)',
    soft: 'var(--inklet-soft)',
  },
  {
    id: 'glimmerbug',
    species: 'glimmerbug',
    name: 'Glimmer Egg',
    stage: 0,
    caught: false,
    progress: 0.05,
    img: '/assets/monsters/glimmerbug-0.320.webp',
    color: 'var(--glimmer)',
    soft: 'var(--glimmer-soft)',
  },
  {
    id: 'phaeton',
    species: 'phaeton',
    name: 'Stardrop Egg',
    stage: 0,
    caught: false,
    progress: 0.12,
    img: '/assets/monsters/phaeton-0.320.webp',
    color: 'var(--phaeton)',
    soft: 'var(--phaeton-soft)',
  },
];

const SESSION = {
  word: 'dictated',
  cloze: 'Our teacher ________ the story aloud.',
  phase: 'learning',
  done: 3,
  total: 10,
  current: 3,
  mode: 'Smart Review',
  family: ['dictate', 'dictation', 'dictator', 'contradiction'],
};

const SUMMARY = {
  mode: 'Smart Review',
  minutes: 9,
  correct: 18,
  total: 20,
  accuracy: 0.9,
  secured: 4,
  mistakes: ['seize', 'mischief'],
  monsterUpdate: {
    name: 'Scribbla gained 4 words',
    body: 'Two more rounds until Quillorn.',
    img: '/assets/monsters/inklet-2.640.webp',
  },
};

/* ----------------------------------------------------------
   Asset-native facing direction per monster. Most sprites are
   drawn facing left, but the art pipeline has a handful of
   right-facing frames. We align movement direction to the face
   the asset was drawn with: outer `--face` (1 | -1) multiplies
   every X translation (and rotation sign) inside the keyframes,
   so "forward" is always the character's own forward — whatever
   way the image faces. Flipped (scaleX(-1)) cycles reverse the
   direction naturally because the translate sign flips too.
   ---------------------------------------------------------- */
const MONSTER_FACE = {
  'inklet-b1-0': 'left', 'inklet-b1-1': 'left', 'inklet-b1-2': 'left',
  'inklet-b1-3': 'left', 'inklet-b1-4': 'left',
  'inklet-b2-0': 'left', 'inklet-b2-1': 'left', 'inklet-b2-2': 'left',
  'inklet-b2-3': 'left', 'inklet-b2-4': 'left',
  'glimmerbug-b1-0': 'left', 'glimmerbug-b1-1': 'left', 'glimmerbug-b1-2': 'left',
  'glimmerbug-b1-3': 'left', 'glimmerbug-b1-4': 'left',
  'glimmerbug-b2-0': 'left', 'glimmerbug-b2-1': 'left', 'glimmerbug-b2-2': 'left',
  'glimmerbug-b2-3': 'left', 'glimmerbug-b2-4': 'right',
  'phaeton-b1-0': 'right', 'phaeton-b1-1': 'right', 'phaeton-b1-2': 'right',
  'phaeton-b1-3': 'right', 'phaeton-b1-4': 'right',
  'phaeton-b2-0': 'left', 'phaeton-b2-1': 'left', 'phaeton-b2-2': 'right',
  'phaeton-b2-3': 'left', 'phaeton-b2-4': 'left',
};

function monsterFaceSign(m) {
  const key = `${m.species}-${m.variant}-${m.stage}`;
  return MONSTER_FACE[key] === 'left' ? -1 : 1;
}

/* ----------------------------------------------------------
   Meadow monsters — caught companions that roam the hero.
   `path` picks one of three CSS keyframes:
     - walk  : ground-dweller, horizontal only, turns around
     - fly-a : looping flyer, wide X + gentle Y + slight rotate
     - fly-b : drifty flyer, counter-direction of fly-a
   Positions are percentages inside the hero paper; the meadow
   layer fills it edge-to-edge so text and monsters share space.
   ---------------------------------------------------------- */
const MEADOW_MONSTERS = [
  { id: 'scribbla',   species: 'inklet',     stage: 2, variant: 'b1', img: '/assets/monsters/inklet/b1/inklet-b1-2.640.webp',         size: 148, left: '56%', top: '52%', path: 'walk',  dur: 26, delay: 0,   bobDelay: 0   },
  { id: 'glimmer-3',  species: 'glimmerbug', stage: 3, variant: 'b1', img: '/assets/monsters/glimmerbug/b1/glimmerbug-b1-3.640.webp', size: 112, left: '76%', top: '10%', path: 'fly-a', dur: 16, delay: 1.2, bobDelay: 0.6 },
  { id: 'phaeton-2',  species: 'phaeton',    stage: 2, variant: 'b1', img: '/assets/monsters/phaeton/b1/phaeton-b1-2.640.webp',       size: 108, left: '38%', top: '24%', path: 'fly-b', dur: 19, delay: 2.4, bobDelay: 1.2 },
  { id: 'inklet-1',   species: 'inklet',     stage: 1, variant: 'b2', img: '/assets/monsters/inklet/b2/inklet-b2-1.320.webp',         size:  82, left: '86%', top: '48%', path: 'walk',  dur: 22, delay: 3.6, bobDelay: 0.3 },
  { id: 'glimmer-1',  species: 'glimmerbug', stage: 1, variant: 'b2', img: '/assets/monsters/glimmerbug/b2/glimmerbug-b2-1.320.webp', size:  72, left: '64%', top:  '2%', path: 'fly-a', dur: 14, delay: 4.8, bobDelay: 0.9 },
  { id: 'phaeton-0',  species: 'phaeton',    stage: 0, variant: 'b1', img: '/assets/monsters/phaeton/b1/phaeton-b1-0.320.webp',       size:  68, left: '44%', top: '58%' },
  { id: 'glimmer-0',  species: 'glimmerbug', stage: 0, variant: 'b2', img: '/assets/monsters/glimmerbug/b2/glimmerbug-b2-0.320.webp', size:  60, left: '62%', top: '64%' },
];

/* ==========================================================
   Icon glyphs (inline SVGs, sized to container)
   ========================================================== */
function IconSun() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
    </svg>
  );
}
function IconMoon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20 14.5A8 8 0 0 1 9.5 4a0.5 0.5 0 0 0-.7-.45 9 9 0 1 0 11.6 11.6 0.5 0.5 0 0 0-.45-.7Z" />
    </svg>
  );
}
function IconSpeaker() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5 6 9H3v6h3l5 4Z" fill="currentColor" fillOpacity="0.12" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
    </svg>
  );
}
function IconSpeakerSlow() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5 6 9H3v6h3l5 4Z" fill="currentColor" fillOpacity="0.12" />
      <path d="M15.5 10a3 3 0 0 1 0 4" />
      <text x="15.5" y="20" fontSize="5.5" fontFamily="Inter" fontWeight="800" fill="currentColor" stroke="none">0.5x</text>
    </svg>
  );
}
function IconArrowRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
function IconCheck() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12l6 6 10-14" />
    </svg>
  );
}
function IconSparkle() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l1.6 4.4L18 8l-4.4 1.6L12 14l-1.6-4.4L6 8l4.4-1.6Z" />
      <path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8Z" opacity="0.7" />
    </svg>
  );
}

/* ==========================================================
   TopNav — learner pill, theme toggle
   ========================================================== */
function TopNav({ theme, onToggleTheme }) {
  return (
    <header className="topnav">
      <div className="brand">
        <span className="brand-mark">K</span>
        <div className="lockup">
          <div>KS2 Mastery</div>
          <small>Codex journal</small>
        </div>
      </div>
      <div className="nav-right">
        <div className="learner-pill" role="button" aria-label="Switch learner">
          <span>{LEARNER.name} · {LEARNER.yearGroup}</span>
        </div>
        <button className="theme-btn" aria-label="Toggle theme" onClick={onToggleTheme}>
          {theme === 'dark' ? <IconSun /> : <IconMoon />}
        </button>
      </div>
    </header>
  );
}

/* ==========================================================
   CompanionStage — the hero monster
   ========================================================== */
function CompanionStage({ size = 'large', bouncing = false, monster = COMPANION }) {
  const cls = size === 'large' ? 'companion-stage'
    : size === 'small' ? 'companion-stage small'
    : 'companion-stage petite';
  const imgCls = size === 'large' ? 'companion-img'
    : size === 'small' ? 'companion-img small'
    : 'companion-img petite';
  return (
    <div className={cls}>
      <img
        className={imgCls + (bouncing ? ' bounce' : '')}
        src={size === 'petite' ? monster.imgSmall : monster.img}
        alt={monster.name}
      />
    </div>
  );
}

/* ==========================================================
   MonsterMeadow — caught companions wander the hero.
   Positions + cadence are data-driven (per-monster CSS vars)
   so additions don't require CSS edits. `maxSlots` caps the
   crowd; extra monsters would need a second row/overflow UI.
   Reduced-motion users see static placement (see CSS).
   ========================================================== */
function MonsterMeadow({ monsters = [], maxSlots = 10 }) {
  const shown = monsters.slice(0, maxSlots);
  if (shown.length === 0) {
    return (
      <div className="monster-meadow empty" aria-hidden="true">
        <span className="meadow-empty-note">Catch your first monster to populate the meadow.</span>
      </div>
    );
  }
  return (
    <div className="monster-meadow" aria-label={`${shown.length} caught monsters roaming`}>
      {shown.map(m => {
        // Depth-of-field anchored to the FEET of the sprite (bottom edge),
        // not its top-left. A big monster placed at top:52% actually stands
        // much lower than a small monster at top:48%, so ranking by top
        // alone misreads their stacking. We approximate feet% as
        //   feet% ≈ top% + (size / meadow-height) × 100
        // using a fixed meadow-height estimate; exact pixel drift at other
        // viewport sizes doesn't matter since we only use this for ordering
        // and a soft scale modifier. Eggs (stage 0) are pinned to the
        // middle-lower band in data; they don't roam.
        const MEADOW_H_EST = 420;
        const topPct   = parseFloat(m.top) || 0;
        const feetPct  = topPct + (m.size / MEADOW_H_EST) * 100;
        const depthRaw = Math.min(Math.max(feetPct, 0), 100) / 100;
        const depth    = 0.82 + depthRaw * 0.34;
        const size     = Math.round(m.size * depth);
        const zIndex   = 10 + Math.round(feetPct);
        const isEgg    = m.stage === 0;
        const faceSign = monsterFaceSign(m);
        return (
          <div
            key={m.id}
            className={'meadow-monster' + (isEgg ? ' egg' : '')}
            data-path={isEgg ? 'none' : (m.path || 'walk')}
            style={{
              '--left':      m.left,
              '--top':       m.top,
              '--size':      `${size}px`,
              '--dur':       `${m.dur || 0}s`,
              '--delay':     `${m.delay || 0}s`,
              '--bob-delay': `${m.bobDelay || 0}s`,
              '--face':      faceSign,
              zIndex,
            }}
          >
            <span className="meadow-shadow" aria-hidden="true" />
            <img src={m.img} alt="" />
          </div>
        );
      })}
    </div>
  );
}

/* ==========================================================
   CodexTile + ring
   ========================================================== */
function Ring({ pct, color = 'var(--brand)' }) {
  return (
    <span
      className="ring"
      style={{
        '--p': Math.round(pct * 100),
        background: `conic-gradient(${color} calc(${Math.round(pct * 100)} * 1%), var(--line-soft) 0)`,
      }}
    />
  );
}

function CodexTile({ tile, onClick }) {
  const pct = Math.round(tile.progress * 100);
  const speciesLabel = (tile.species || tile.id).toString();
  const capitalise = s => s.charAt(0).toUpperCase() + s.slice(1);
  const sub = tile.caught
    ? `${capitalise(speciesLabel)} · S${tile.stage}`
    : 'Uncaught';
  return (
    <button
      className={'codex-tile' + (tile.caught ? '' : ' locked')}
      onClick={onClick}
      type="button"
      style={{ appearance: 'none', width: '100%' }}
    >
      <span className="cx-portrait" style={{ background: `radial-gradient(closest-side, ${tile.soft}, var(--panel-sunken))` }}>
        <img src={tile.img} alt={tile.name} />
      </span>
      <div className="cx-info">
        <div className="cx-name">{tile.name}</div>
        <div className="cx-sub">{sub}</div>
      </div>
      <div className="cx-ring" style={{ '--p': pct, '--ring-color': tile.color }}>
        <span className="cx-pct">{pct}%</span>
      </div>
    </button>
  );
}

/* ==========================================================
   SubjectCard
   ========================================================== */
function SubjectCard({ subject }) {
  const statusLabel = { live: 'Live', ready: 'Ready', soon: 'Soon', placeholder: 'Soon' }[subject.status];
  const isPlaceholder = subject.status === 'soon' || subject.status === 'placeholder';
  const pct = Math.round(subject.progress * 100);
  const hasRegion = Boolean(subject.region && subject.region.bgBase);
  return (
    <button
      className={'subject-card' + (isPlaceholder ? ' placeholder' : '')}
      data-action="open-subject"
      data-subject-id={subject.id}
      type="button"
      style={{ appearance: 'none', textAlign: 'left' }}
    >
      {hasRegion ? (
        <div className="sc-banner sc-banner--art">
          <img
            className="sc-banner-art"
            src={`${subject.region.bgBase}.1280.webp`}
            srcSet={`${subject.region.bgBase}.640.webp 640w, ${subject.region.bgBase}.1280.webp 1280w`}
            sizes="(max-width: 980px) 100vw, 320px"
            alt=""
            aria-hidden="true"
          />
          <span className="sc-banner-fade" aria-hidden="true" />
        </div>
      ) : (
        <div className="sc-banner" style={{ background: subject.accent }}>
          <span className="sc-glyph" aria-hidden="true">{subject.glyph}</span>
          <span className="sc-status">{statusLabel}</span>
        </div>
      )}
      <div className="sc-body">
        <div className="sc-eyebrow">{subject.eyebrow || '\u00A0'}</div>
        <h3>{subject.name}</h3>
        <p>{subject.blurb}</p>
        <div className="sc-meter">
          <div className="sc-meter-head">
            <span className="sc-pct">{isPlaceholder ? '—' : `${pct}%`}</span>
            <span className="sc-meta">{subject.progressLabel}</span>
          </div>
          <div className="progress">
            <span style={{ width: `${pct}%`, background: 'var(--brand)' }} />
          </div>
        </div>
      </div>
    </button>
  );
}

/* ==========================================================
   ModeCard (spelling setup)
   ========================================================== */
function ModeCard({ id, icon, title, desc, selected, recommended, onClick }) {
  return (
    <button
      className={'mode-card' + (selected ? ' selected' : '')}
      type="button"
      style={{ appearance: 'none' }}
      onClick={onClick}
    >
      {recommended && <span className="mc-badge">Recommended</span>}
      <div className="mc-icon">{icon}</div>
      <h4>{title}</h4>
      <p>{desc}</p>
    </button>
  );
}

/* ==========================================================
   ToggleChip
   ========================================================== */
function ToggleChip({ on, label, onClick }) {
  return (
    <button
      type="button"
      className={'toggle-chip' + (on ? ' on' : '')}
      onClick={onClick}
      aria-pressed={on}
    >
      <span className="box">{on && <IconCheck />}</span>
      {label}
    </button>
  );
}

/* ==========================================================
   Stepper (round length)
   ========================================================== */
function Stepper({ value, onChange, min = 5, max = 25, step = 5, unit = 'words' }) {
  return (
    <div className="stepper">
      <button type="button" onClick={() => onChange(Math.max(min, value - step))} aria-label="Decrease">−</button>
      <span className="val">{value} <em>{unit}</em></span>
      <button type="button" onClick={() => onChange(Math.min(max, value + step))} aria-label="Increase">+</button>
    </div>
  );
}

/* ==========================================================
   Path progress (session header)
   ========================================================== */
function PathProgress({ done, current, total }) {
  const dots = [];
  for (let i = 0; i < total; i++) {
    let cls = 'path-step';
    if (i < done) cls += ' done';
    else if (i === current) cls += ' current';
    dots.push(<span key={i} className={cls} />);
  }
  return (
    <div className="path" aria-label={`Word ${current + 1} of ${total}`}>{dots}</div>
  );
}

/* ==========================================================
   PhaseBadge
   ========================================================== */
function PhaseBadge({ phase }) {
  const labels = {
    learning: 'Learning loop',
    final: 'Final attempt',
    test: 'Test mode',
  };
  return <span className={`phase-badge ${phase}`}>{labels[phase] || phase}</span>;
}

/* ==========================================================
   Ribbon (feedback)
   ========================================================== */
function Ribbon({ tone, icon, headline, word, sub, cta, onCta }) {
  return (
    <div className={`ribbon ${tone}`} role="status">
      <div className="ribbon-ic">{icon}</div>
      <div className="ribbon-body">
        <b>{headline}</b>
        {word && <span className="word">“{word}”</span>}
        {sub && <div className="sub">{sub}</div>}
      </div>
      {cta && (
        <button className="btn primary" style={{ whiteSpace: 'nowrap' }} onClick={onCta}>
          {cta} <IconArrowRight />
        </button>
      )}
    </div>
  );
}

function FamilyChips({ words }) {
  if (!words || !words.length) return null;
  return (
    <div className="family-chips">
      <span className="flabel">Word family</span>
      {words.map(w => <span key={w} className="fchip">{w}</span>)}
    </div>
  );
}

/* ==========================================================
   Monster catch toast
   ========================================================== */
function CatchToast({ monster, headline, body }) {
  return (
    <div className="toast-catch" role="status">
      <span className="cm-port"><img src={monster.imgSmall || monster.img} alt={monster.name} /></span>
      <div>
        <div className="cm-title"><IconSparkle /> {headline}</div>
        <div className="cm-body">{body}</div>
      </div>
    </div>
  );
}

/* ==========================================================
   Utility: device-aware shell padding
   ========================================================== */
function ShellPadding({ device, children }) {
  return <div className={'app-shell' + (device === 'mobile' ? ' mobile' : '')}>{children}</div>;
}

/* ==========================================================
   Export everything to window so scene/app scripts can reuse.
   ========================================================== */
Object.assign(window, {
  // data
  LEARNER, COMPANION, SUBJECTS, CODEX_TILES, MEADOW_MONSTERS, SESSION, SUMMARY,
  // icons
  IconSun, IconMoon, IconSpeaker, IconSpeakerSlow, IconArrowRight, IconCheck, IconSparkle,
  // primitives
  TopNav, CompanionStage, MonsterMeadow, Ring, CodexTile, SubjectCard, ModeCard,
  ToggleChip, Stepper, PathProgress, PhaseBadge, Ribbon, FamilyChips,
  CatchToast, ShellPadding,
});
