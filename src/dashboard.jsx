// Dashboard — the home page showing all 6 subjects.
// Each subject card: glyph, name, blurb, progress bar, "continue" button, last-session chip.

function Dashboard({ onOpenSubject, onOpenCollection, profile, onEditProfile }) {
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  })();
  const firstName = (profile?.name || 'there').split(' ')[0];
  const pid = profile?.id || 'default';

  // Gather every Spelling monster (the only subject with monsters today) so the
  // hero playground can show the whole cohort — catching the 2nd / 3rd friend
  // should feel visible and adjacent, not hidden in a Codex subpage.
  // Re-reads on the `monster:progress` event so the playground refreshes when
  // the spelling game records a mastery in another component tree.
  const [progressTick, setProgressTick] = React.useState(0);
  React.useEffect(() => {
    const handler = () => setProgressTick(t => t + 1);
    window.addEventListener('monster:progress', handler);
    return () => window.removeEventListener('monster:progress', handler);
  }, []);

  const spellingMonsters = React.useMemo(() => {
    if (!window.MonsterEngine || !window.MONSTERS_BY_SUBJECT) return [];
    const ids = window.MONSTERS_BY_SUBJECT.spelling || [];
    return ids
      .map(mid => {
        const monster = window.MONSTERS[mid];
        if (!monster) return null;
        return { monster, progress: window.MonsterEngine.getMonsterProgress(pid, mid) };
      })
      .filter(Boolean);
  }, [pid, progressTick]);

  // Mock per-subject progress
  const progress = {
    spelling:    { pct: 68, due: 12, lastScore: '8/10', streak: 7,  nextUp: 'Silent letters' },
    arithmetic:  { pct: 82, due: 5,  lastScore: '23/25', streak: 12, nextUp: 'Long division' },
    reasoning:   { pct: 41, due: 18, lastScore: '6/10', streak: 3,  nextUp: 'Ratio word problems' },
    grammar:     { pct: 55, due: 9,  lastScore: '12/15', streak: 4, nextUp: 'Relative clauses' },
    punctuation: { pct: 73, due: 6,  lastScore: '9/10', streak: 5,  nextUp: 'Apostrophes' },
    reading:     { pct: 60, due: 11, lastScore: '14/20', streak: 2, nextUp: 'Inference' },
  };

  // Hero strip stats
  const totalDue = Object.values(progress).reduce((a, b) => a + b.due, 0);
  const avgPct = Math.round(
    Object.values(progress).reduce((a, b) => a + b.pct, 0) / SUBJECT_ORDER.length
  );
  const bestStreak = Math.max(...Object.values(progress).map(p => p.streak));

  return (
    <div style={{ padding: '32px 28px 48px', maxWidth: 1280, margin: '0 auto' }}>

      {/* Hero */}
      <section style={{
        display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 20,
        marginBottom: 24,
      }}>
        <div style={{
          background: TOKENS.panel,
          border: `1px solid ${TOKENS.line}`,
          borderRadius: TOKENS.radiusLg,
          padding: '32px 36px',
          boxShadow: TOKENS.shadow,
          position: 'relative', overflow: 'hidden',
        }}>
          {/* Monster playground — the whole spelling cohort walks/floats here */}
          <MonsterPlayground monsters={spellingMonsters} onOpenCollection={onOpenCollection} />

          <div style={{ position: 'relative' }}>
            <div style={{
              fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: TOKENS.muted, marginBottom: 8,
            }}>
              {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
            </div>
            <h1 style={{
              margin: 0, fontFamily: TOKENS.fontSerif, fontWeight: 800,
              fontSize: 42, letterSpacing: '-0.025em', color: TOKENS.ink,
              lineHeight: 1.05,
            }}>{greeting}, {firstName}.</h1>
          </div>
          <p style={{
            margin: '10px 0 22px', color: TOKENS.ink2,
            fontSize: 15, maxWidth: 440, lineHeight: 1.5, position: 'relative',
          }}>
            You have <strong>{totalDue} items</strong> due for review across all subjects.
            Keep your streak going — 15 minutes is enough today.
          </p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', position: 'relative', maxWidth: 440 }}>
              <Btn variant="primary" icon="play" size="lg" onClick={() => onOpenSubject('spelling')}>
                Resume
              </Btn>
              <Btn variant="secondary" icon="target" size="lg">
                Mixed session
              </Btn>
            </div>

            {/* Profile chip — pinned to hero's bottom-left, keeping the button row lean */}
            {profile && (
              <button onClick={onEditProfile} title="Edit profile" style={{
                position: 'absolute', bottom: 20, left: 36, zIndex: 2,
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '6px 14px 6px 6px', borderRadius: 999,
                background: TOKENS.panelSoft, border: `1px solid ${TOKENS.line}`,
                cursor: 'pointer', fontFamily: TOKENS.fontSans,
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: profile.avatarColor || TOKENS.ink, color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: TOKENS.fontSerif, fontWeight: 800, fontSize: 13,
                }}>{initials(profile.name)}</div>
                <span style={{ fontWeight: 700, color: TOKENS.ink, fontSize: 13 }}>{profile.yearGroup}</span>
              </button>
            )}
          </div>

        {/* Right: snapshot stats */}
        <div style={{
          display: 'grid', gridTemplateRows: '1fr 1fr', gap: 20,
        }}>
          <Panel eyebrow="Today" title="Snapshot" padded>
            <div style={{ display: 'flex', gap: 12 }}>
              <Stat label="Due now" value={totalDue} />
              <Stat label="Avg mastery" value={`${avgPct}%`} />
              <Stat label="Best streak" value={`${bestStreak}d`} />
            </div>
          </Panel>
          <Panel eyebrow="This week" title="Time studied">
            <WeekBars />
          </Panel>
        </div>
      </section>

      {/* Subjects grid */}
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        marginBottom: 14,
      }}>
        <h2 style={{
          margin: 0, fontFamily: TOKENS.fontSerif, fontWeight: 700,
          fontSize: 22, color: TOKENS.ink, letterSpacing: '-0.01em',
        }}>Your subjects</h2>
        <span style={{ fontSize: 13, color: TOKENS.muted }}>Pick one to start — or let Smart Review mix them.</span>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: 18,
      }}>
        {SUBJECT_ORDER.map(id => (
          <SubjectCard
            key={id}
            subject={SUBJECTS[id]}
            progress={progress[id]}
            onOpen={() => onOpenSubject(id)}
          />
        ))}
      </div>
    </div>
  );
}

function SubjectCard({ subject, progress, onOpen }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      onClick={onOpen}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        textAlign: 'left', padding: 0, border: 'none', cursor: 'pointer',
        background: TOKENS.panel,
        borderRadius: TOKENS.radius,
        boxShadow: hover ? TOKENS.shadowLg : TOKENS.shadow,
        transform: hover ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'all 0.2s ease',
        outline: `1px solid ${hover ? subject.accentSoft : TOKENS.line}`,
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}
    >
      {/* Coloured header strip */}
      <div style={{
        height: 88, background: subject.accentTint,
        padding: '18px 22px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'relative', overflow: 'hidden',
      }}>
        <SubjectGlyph subject={subject} size={52} filled />
        {/* big ghost glyph in background */}
        <div style={{
          position: 'absolute', right: -12, bottom: -18, opacity: 0.18,
          color: subject.accent,
        }}>
          <Icon name={subject.icon} size={120} />
        </div>
        <Chip tone="accent" style={{ accent: subject.accent, accentTint: '#fff' }}>
          <Icon name="flame" size={12} /> {progress.streak}d
        </Chip>
      </div>

      <div style={{ padding: '18px 22px 22px' }}>
        <h3 style={{
          margin: 0, fontFamily: TOKENS.fontSerif, fontSize: 22, fontWeight: 700,
          color: TOKENS.ink, letterSpacing: '-0.01em',
        }}>{subject.name}</h3>
        <p style={{
          margin: '6px 0 16px', color: TOKENS.muted, fontSize: 13.5, lineHeight: 1.5,
        }}>{subject.blurb}</p>

        {/* Progress */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', marginBottom: 6,
          fontSize: 12, color: TOKENS.ink2, fontWeight: 600,
        }}>
          <span>Mastery</span>
          <span style={{ color: subject.accent, fontWeight: 800 }}>{progress.pct}%</span>
        </div>
        <ProgressBar value={progress.pct} accent={subject.accent} />

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginTop: 16, gap: 8,
        }}>
          <div style={{ fontSize: 12.5, color: TOKENS.ink2 }}>
            <span style={{ color: TOKENS.muted }}>Next up · </span>
            <strong>{progress.nextUp}</strong>
          </div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            color: subject.accent, fontWeight: 700, fontSize: 13,
          }}>
            {progress.due} due <Icon name="next" size={14} />
          </div>
        </div>
      </div>
    </button>
  );
}

function WeekBars() {
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const vals = [24, 18, 35, 12, 28, 40, 22];
  const max = Math.max(...vals);
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 80, padding: '6px 0' }}>
      {days.map((d, i) => (
        <div key={i} style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: 6, height: '100%',
        }}>
          <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
            <div style={{
              width: '100%', height: `${(vals[i] / max) * 100}%`,
              background: i === 5 ? TOKENS.ink : TOKENS.line,
              borderRadius: 6,
            }} />
          </div>
          <span style={{
            fontSize: 11, color: TOKENS.muted, fontWeight: 700,
          }}>{d}</span>
        </div>
      ))}
    </div>
  );
}

// ─────────────── MonsterPlayground ───────────────
// A cluster of every spelling monster living DIRECTLY in the hero card — no
// framed scene, no panel. Each monster gets a distinct motion so the scene
// feels alive:
//   - Inklet (baby/specialist)  walks left-right along the floor
//   - Glimmerbug (other specialist) floats in a gentle arc above the floor
//   - Phaeton (aggregate)       hovers with a slow bob (fills the upper-right)
// Uncaught monsters appear as soft silhouettes in their egg form so kids can
// see who's still waiting to join.
function MonsterPlayground({ monsters, onOpenCollection }) {
  // Playground frame — a tall strip running along the right side of the hero.
  const W = 360, H = 150;

  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    let raf, start = performance.now();
    const loop = () => {
      setTick(performance.now() - start);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (!monsters || !monsters.length) return null;
  const t = tick / 1000;

  // Summary line used in the small right-aligned label.
  const caughtCount = monsters.filter(m => m.progress.caught).length;
  const nextUncaught = monsters.find(m => !m.progress.caught);
  const summaryMain = caughtCount === monsters.length
    ? `All ${monsters.length} friends caught`
    : `${caughtCount} of ${monsters.length} caught`;
  const summarySub  = nextUncaught
    ? `Next: ${nextUncaught.monster.name}`
    : 'Keep evolving!';

  // Layout — each monster gets its own slot and motion rig. Kept declarative so
  // tweaks to roster order / scale are painless.
  const SLOTS = {
    inklet:     { x: 20,  floor: 110, size: 74, motion: 'walk'   },
    glimmerbug: { x: 140, floor:  92, size: 66, motion: 'float'  },
    phaeton:    { x: 244, floor:  90, size: 96, motion: 'hover'  },
  };

  return (
    <div
      onClick={onOpenCollection}
      title="Open the Monster Codex"
      style={{
        position: 'absolute', bottom: 10, right: 16, width: W, height: H,
        cursor: 'pointer', zIndex: 1, pointerEvents: 'auto',
      }}
    >
      <style>{`
        @keyframes mp-spark-hero { 0%,100% { transform: translateY(0) scale(0.9); opacity: 0; }
          50% { transform: translateY(-8px) scale(1); opacity: 0.75; } }
      `}</style>

      {monsters.map(({ monster, progress }, idx) => {
        const slot = SLOTS[monster.id] || { x: 20 + idx * 100, floor: 100, size: 72, motion: 'float' };
        const { stage, caught, mastered } = progress;
        const showStage = caught ? stage : 0;

        // Motion depending on slot.motion. All anchored to slot.floor.
        let bob = 0, hop = 0, tilt = 0, facingRight = true, offsetX = 0, offsetY = 0;
        const phaseOffset = (monster.id.charCodeAt(0) % 7) * 0.4;
        if (caught) {
          if (slot.motion === 'walk') {
            const phase = (Math.sin(t * 0.55 + phaseOffset) + 1) / 2;
            offsetX = phase * 48 - 24;
            facingRight = Math.cos(t * 0.55 + phaseOffset) >= 0;
            bob = Math.sin(t * 3 + phaseOffset) * 3;
            hop = Math.sin(t * 0.55 + phaseOffset + 1.2) > 0.985
              ? Math.abs(Math.sin(t * 14)) * 10 : 0;
            tilt = Math.sin(t * 1.5 + phaseOffset) * 3;
          } else if (slot.motion === 'float') {
            offsetX = Math.sin(t * 0.9 + phaseOffset) * 22;
            offsetY = Math.cos(t * 1.1 + phaseOffset) * 14;
            tilt = Math.sin(t * 2 + phaseOffset) * 4;
          } else { // hover
            bob = Math.sin(t * 1.6 + phaseOffset) * 6;
            tilt = Math.sin(t * 1.2 + phaseOffset) * 2;
          }
        } else {
          // Eggs — slow breathing-like bob.
          bob = Math.sin(t * 1.8 + phaseOffset) * 2.4;
        }

        const centerX = slot.x + offsetX;
        const bottom  = H - slot.floor + offsetY + hop;
        const shadowScale = 1 - hop / 60;

        return (
          <React.Fragment key={monster.id}>
            {/* Soft ground shadow (only for walkers; floaters drift too far off the floor) */}
            {slot.motion === 'walk' && (
              <div style={{
                position: 'absolute',
                left: centerX + slot.size / 2 - 26,
                bottom: H - slot.floor - 4,
                width: 52, height: 5, borderRadius: '50%',
                background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.18), rgba(0,0,0,0) 70%)',
                transform: `scaleX(${shadowScale})`,
                pointerEvents: 'none',
              }}/>
            )}

            {/* Sparkles — only for caught aggregate + phaeton is the showcase */}
            {caught && monster.id === 'phaeton' && [0, 1, 2].map(i => (
              <div key={`sp${i}`} style={{
                position: 'absolute',
                left: slot.x + 10 + i * 24, bottom: H - slot.floor + 34 + (i % 2) * 10,
                width: 5, height: 5, borderRadius: '50%',
                background: monster.secondary,
                opacity: 0.6,
                animation: `mp-spark-hero 3s ${i * 0.9}s ease-in-out infinite`,
                pointerEvents: 'none',
              }} />
            ))}

            <div style={{
              position: 'absolute',
              left: centerX, bottom,
              width: slot.size, height: slot.size,
              transform: `translateY(${bob}px) rotate(${tilt}deg) scaleX(${facingRight ? 1 : -1})`,
              transition: 'transform 0.1s linear',
              opacity: caught ? 1 : 0.55,
              filter: caught ? 'none' : 'saturate(0.6)',
              pointerEvents: 'none',
            }}>
              <MonsterArt monster={monster} stage={showStage} size={slot.size} silhouette={!caught} />
            </div>
          </React.Fragment>
        );
      })}

      {/* Floating summary label — one short line, aligned bottom-right */}
      <div style={{
        position: 'absolute', right: 4, bottom: -2,
        textAlign: 'right', fontFamily: TOKENS.fontSans,
        pointerEvents: 'none',
      }}>
        <div style={{
          fontFamily: TOKENS.fontSerif, fontSize: 13, fontWeight: 800,
          color: TOKENS.ink, lineHeight: 1.1,
        }}>{summaryMain} <span style={{
          fontSize: 9, fontWeight: 800, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: TOKENS.muted, marginLeft: 4,
        }}>Codex ↗</span></div>
        <div style={{ fontSize: 11, color: TOKENS.muted, fontWeight: 600, marginTop: 1 }}>
          {summarySub}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Dashboard });