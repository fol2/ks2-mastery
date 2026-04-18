// MonsterOverlay + MonsterToast — monster celebration surfaces.
//
// Routing rules (owned by app.jsx):
//   - caught / evolve / mega → fullscreen MonsterOverlay, one at a time.
//   - levelup                → non-blocking bottom-right MonsterToast, stackable,
//                              auto-dismissed after ~3 s so practice flow isn't interrupted.
//
// Both components read from the same event shape emitted by MonsterEngine.

// ─────────────── Overlay geometry helpers ───────────────
// Sparkles + confetti are laid out once per mount using deterministic seeded values,
// so re-renders (phase transitions) don't reshuffle positions on screen.

// Cheap seeded RNG — produces stable sequences per seed so the overlay doesn't flicker.
function seededRandom(seed) {
  let s = seed | 0;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

// Build a full-viewport sparkle layout (top, sides and bottom), denser for mega events.
function buildSparkles(seed, count, palette) {
  const rand = seededRandom(seed);
  return Array.from({ length: count }).map((_, i) => ({
    key: i,
    left:      rand() * 100,
    top:       rand() * 100,
    size:      6 + rand() * 10,
    delay:     rand() * 2.4,
    duration:  2 + rand() * 1.6,
    colour:    palette[Math.floor(rand() * palette.length)],
    drift:     -40 - rand() * 50,
  }));
}

// Bigger confetti squares used for the mega celebration only.
function buildConfetti(seed, count, palette) {
  const rand = seededRandom(seed);
  return Array.from({ length: count }).map((_, i) => ({
    key: `c${i}`,
    left:      rand() * 100,
    size:      8 + rand() * 8,
    delay:     rand() * 1.4,
    duration:  2.4 + rand() * 1.4,
    rotation:  Math.floor(rand() * 360),
    colour:    palette[Math.floor(rand() * palette.length)],
  }));
}

// ─────────────── MonsterOverlay ───────────────
// Fullscreen transformation reveal: shows the PREVIOUS form, then a white flash,
// then the NEW form popping in. Kids should SEE the creature change, not just read
// a label telling them it did.

function MonsterOverlay({ event, onClose }) {
  if (!event) return null;
  const { kind, monster, stage, prevStage, level, mastered } = event;

  // Phase timeline:
  //   0–650ms   before : show previous form with a gentle wobble, aura pulsing
  //   650–900ms flash  : white curtain bleeds over the hero area
  //   900ms+    after  : new form pops in at full scale + label/CTA fade in
  const BEFORE_MS = 650;
  const FLASH_MS  = 250;
  const [phase, setPhase] = React.useState('before');
  React.useEffect(() => {
    const t1 = window.setTimeout(() => setPhase('flash'), BEFORE_MS);
    const t2 = window.setTimeout(() => setPhase('after'), BEFORE_MS + FLASH_MS);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
  }, [event.monsterId, event.kind, event.stage]);

  const fromStage = typeof prevStage === 'number' ? prevStage : Math.max(0, (stage || 0) - 1);
  const shownStage = phase === 'after' ? stage : fromStage;
  const revealed   = phase === 'after';

  const title = {
    caught:  "You caught a new friend!",
    evolve:  "Your friend is evolving!",
    mega:    "MEGA EVOLUTION!",
  }[kind] || "Level up!";

  const sub = {
    caught:  `${monster.name} joined your collection.`,
    evolve:  `${monster.name} evolved into ${monster.nameByStage[stage]}.`,
    mega:    `${monster.name} reached its mega form — ${monster.nameByStage[stage]}.`,
  }[kind] || `${monster.name} reached level ${level}.`;

  const bg = kind === 'mega' ? '#16132A' : '#1D2B3A';
  const heroSize = kind === 'mega' ? 280 : 240;

  // Sparkle / confetti layouts — seeded so they stay still during phase changes.
  const sparklePalette = [monster.secondary, '#FFE9A8', '#FFFFFF', monster.pale];
  const sparkleCount = kind === 'mega' ? 34 : 22;
  const sparkles = React.useMemo(
    () => buildSparkles(event.monsterId.charCodeAt(0) * 31 + stage, sparkleCount, sparklePalette),
    [event.monsterId, stage, kind] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const confetti = React.useMemo(
    () => kind === 'mega'
      ? buildConfetti(stage * 97 + 13, 24, [monster.primary, monster.secondary, '#FFE9A8', '#FFFFFF'])
      : [],
    [kind, stage, monster.primary, monster.secondary]
  );

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 3000, overflow: 'hidden',
      background: `radial-gradient(circle at 50% 38%, ${monster.primary}E6 0%, ${bg}F7 72%)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', color: '#fff',
      fontFamily: TOKENS.fontSans,
      animation: 'monster-fade-in 0.35s ease-out',
    }}>
      <style>{`
        @keyframes monster-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes mo-before-wobble {
          0%,100% { transform: translateY(0) rotate(-3deg); }
          50%     { transform: translateY(-4px) rotate(3deg); }
        }
        @keyframes mo-reveal-pop {
          0%   { transform: scale(0.2) rotate(-18deg); opacity: 0; filter: blur(4px); }
          55%  { transform: scale(1.14) rotate(2deg);  opacity: 1; filter: blur(0); }
          100% { transform: scale(1) rotate(0);       opacity: 1; filter: blur(0); }
        }
        @keyframes mo-flash {
          0% { opacity: 0; } 40% { opacity: 1; } 100% { opacity: 0; }
        }
        @keyframes mo-aura-pulse {
          0%,100% { transform: scale(1);    opacity: 0.35; }
          50%     { transform: scale(1.18); opacity: 0.7;  }
        }
        @keyframes mo-sparkle {
          0%   { transform: translateY(0) scale(0.3); opacity: 0; }
          25%  { opacity: 1; }
          100% { transform: translateY(var(--drift, -60px)) scale(1.2); opacity: 0; }
        }
        @keyframes mo-confetti-fall {
          0%   { transform: translateY(-14vh) rotate(0deg);   opacity: 0; }
          15%  { opacity: 1; }
          100% { transform: translateY(120vh) rotate(720deg); opacity: 0; }
        }
        @keyframes mo-cta-in {
          from { transform: translateY(12px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @keyframes mo-rings {
          0%   { transform: scale(0.4); opacity: 0.8; }
          100% { transform: scale(2.4); opacity: 0;   }
        }
      `}</style>

      {/* Decorative sparkles — full viewport spread */}
      {sparkles.map(s => (
        <div key={s.key} style={{
          position: 'absolute', left: `${s.left}%`, top: `${s.top}%`,
          width: s.size, height: s.size, borderRadius: '50%',
          background: s.colour,
          boxShadow: `0 0 ${s.size}px ${s.colour}`,
          animation: `mo-sparkle ${s.duration}s ${s.delay}s infinite ease-out`,
          ['--drift']: `${s.drift}px`,
          pointerEvents: 'none',
        }} />
      ))}

      {/* Confetti shower — mega only */}
      {confetti.map(c => (
        <div key={c.key} style={{
          position: 'absolute', left: `${c.left}%`, top: 0,
          width: c.size, height: c.size * 1.4, borderRadius: 2,
          background: c.colour, transform: `rotate(${c.rotation}deg)`,
          animation: `mo-confetti-fall ${c.duration}s ${c.delay}s infinite linear`,
          pointerEvents: 'none',
        }} />
      ))}

      {/* Label */}
      <div style={{
        fontSize: 13, letterSpacing: '0.3em', textTransform: 'uppercase',
        color: monster.secondary, fontWeight: 800, marginBottom: 14, opacity: 0.9,
        minHeight: 20,
      }}>
        {kind === 'caught'  && '✦ new discovery ✦'}
        {kind === 'evolve'  && '✦ ✦ evolving ✦ ✦'}
        {kind === 'mega'    && '★ ★ ★ MEGA FORM ★ ★ ★'}
        {kind === 'levelup' && '+ level up +'}
      </div>

      {/* Monster hero — the transformation happens here */}
      <div style={{ position: 'relative', marginBottom: 20, width: heroSize, height: heroSize }}>
        {/* aura */}
        <div style={{
          position: 'absolute', inset: -30, borderRadius: '50%',
          background: `radial-gradient(circle, ${monster.secondary}66 0%, transparent 70%)`,
          animation: 'mo-aura-pulse 2s ease-in-out infinite',
        }} />

        {/* Ripple rings triggered at reveal — kinetic punch */}
        {revealed && [0, 0.15, 0.3].map((d, i) => (
          <div key={i} style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            border: `3px solid ${monster.secondary}`,
            animation: `mo-rings 0.9s ${d}s ease-out both`,
            pointerEvents: 'none',
          }}/>
        ))}

        <div
          key={`hero-${phase}`}
          style={{
            position: 'relative', width: '100%', height: '100%',
            display: 'grid', placeItems: 'center',
            animation: revealed
              ? 'mo-reveal-pop 0.85s cubic-bezier(.3,1.4,.5,1) both'
              : 'mo-before-wobble 0.9s ease-in-out infinite',
          }}
        >
          <MonsterArt monster={monster} stage={shownStage} size={heroSize} />
        </div>

        {/* Flash curtain — white burst at the exact moment of transformation */}
        {phase === 'flash' && (
          <div style={{
            position: 'absolute', inset: -40, borderRadius: '50%',
            background: 'radial-gradient(circle, #FFFFFF 0%, rgba(255,255,255,0.85) 40%, rgba(255,255,255,0) 70%)',
            animation: `mo-flash ${FLASH_MS}ms ease-out both`,
            pointerEvents: 'none',
          }}/>
        )}
      </div>

      <h1 style={{
        margin: 0, fontFamily: TOKENS.fontSerif, fontWeight: 800,
        fontSize: kind === 'mega' ? 52 : 44, letterSpacing: '-0.02em', textAlign: 'center',
        animation: revealed ? 'mo-cta-in 0.5s 0.1s ease-out both' : 'none',
        opacity: revealed ? 1 : 0,
      }}>{title}</h1>
      <p style={{
        margin: '10px 0 4px', fontSize: 18, opacity: revealed ? 0.95 : 0, textAlign: 'center',
        maxWidth: 560, padding: '0 20px', lineHeight: 1.4,
        animation: revealed ? 'mo-cta-in 0.5s 0.2s ease-out both' : 'none',
      }}>{sub}</p>
      <p style={{
        margin: '4px 0 28px', fontSize: 14, opacity: revealed ? 0.72 : 0,
        animation: revealed ? 'mo-cta-in 0.5s 0.28s ease-out both' : 'none',
      }}>
        {mastered} / {monster.masteredMax || 100} words mastered · Level {level}
      </p>

      <button onClick={onClose} style={{
        padding: '14px 32px', borderRadius: 999,
        border: 'none', cursor: 'pointer',
        background: monster.secondary, color: monster.primary,
        fontFamily: TOKENS.fontSans, fontSize: 16, fontWeight: 800,
        boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
        opacity: revealed ? 1 : 0,
        transform: revealed ? 'translateY(0)' : 'translateY(12px)',
        transition: 'opacity 0.35s 0.35s ease, transform 0.35s 0.35s ease',
        pointerEvents: revealed ? 'auto' : 'none',
      }}>
        {kind === 'mega' ? "Incredible!" : "Continue"}
      </button>
    </div>
  );
}

// ─────────────── MonsterToast ───────────────
// Non-blocking celebration for level-ups. Slides in from the right, lives for ~3 s,
// then slides out. Stacks vertically if several fire in a row.

function MonsterToast({ event, onDismiss }) {
  const { monster, stage, level, mastered } = event;

  // Stay long enough for a reader to glance at it, short enough not to interrupt typing.
  const LIFETIME_MS = 3200;
  React.useEffect(() => {
    const timer = window.setTimeout(onDismiss, LIFETIME_MS);
    return () => window.clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      role="status"
      onClick={onDismiss}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        background: '#fff',
        border: `1.5px solid ${monster.secondary}`,
        borderLeft: `4px solid ${monster.primary}`,
        padding: '10px 16px 10px 10px', borderRadius: 999,
        boxShadow: '0 12px 32px rgba(29,43,58,0.22)',
        fontFamily: TOKENS.fontSans, color: TOKENS.ink,
        minWidth: 260, cursor: 'pointer', pointerEvents: 'auto',
        animation: `mt-toast-in 0.28s cubic-bezier(.3,1.3,.5,1) both, mt-toast-out 0.32s ${(LIFETIME_MS - 280) / 1000}s ease-in both`,
      }}
    >
      <div style={{
        width: 44, height: 44, borderRadius: '50%',
        background: monster.pale,
        border: `1px solid ${monster.secondary}`,
        display: 'grid', placeItems: 'center', flex: '0 0 auto',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Soft glow-pulse matching the monster colour */}
        <span style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          background: `radial-gradient(circle, ${monster.secondary}80 0%, transparent 70%)`,
          animation: 'mt-toast-pulse 1.6s ease-in-out infinite',
        }}/>
        <span style={{ position: 'relative' }}>
          <MonsterArt monster={monster} stage={stage} size={40}/>
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2, minWidth: 0 }}>
        <div style={{
          fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase',
          color: monster.primary, fontWeight: 800,
        }}>+ Level up</div>
        <div style={{
          fontFamily: TOKENS.fontSerif, fontSize: 15.5, fontWeight: 800,
          color: TOKENS.ink, letterSpacing: '-0.01em',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {monster.nameByStage[stage]} — Lv {level}
        </div>
        <div style={{ fontSize: 11.5, color: TOKENS.muted, fontWeight: 600 }}>
          {mastered} / {monster.masteredMax || 100} mastered
        </div>
      </div>
    </div>
  );
}

function MonsterToastHost({ toasts, onDismiss }) {
  if (!toasts || !toasts.length) return null;
  return (
    <div style={{
      position: 'fixed', right: 20, bottom: 24, zIndex: 2800,
      display: 'flex', flexDirection: 'column', gap: 10,
      pointerEvents: 'none',
      alignItems: 'flex-end',
    }}>
      <style>{`
        @keyframes mt-toast-in  { from { transform: translateX(120%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes mt-toast-out { to   { transform: translateX(120%); opacity: 0; } }
        @keyframes mt-toast-pulse { 0%,100% { transform: scale(1);   opacity: 0.35; }
                                    50%     { transform: scale(1.12); opacity: 0.7; } }
      `}</style>
      {toasts.map(t => (
        <MonsterToast key={t.key} event={t} onDismiss={() => onDismiss(t.key)} />
      ))}
    </div>
  );
}

window.__MONSTER_OVERLAY_V = 2;
Object.assign(window, { MonsterOverlay, MonsterToast, MonsterToastHost });
