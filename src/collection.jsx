// CollectionScreen — the Pokédex-style collection page.
// Top-level route: 'collection'. Shows all monsters across subjects with catch/level/stage/progress.

function CollectionScreen({ profile, onBack }) {
  const pid = profile?.id || 'default';
  const [selected, setSelected] = React.useState(null);

  // Flatten all monsters across subjects
  const allMonsterIds = SUBJECT_ORDER.flatMap(sid => MONSTERS_BY_SUBJECT[sid] || []);
  const totalCount = allMonsterIds.length;
  const caughtCount = allMonsterIds.filter(id =>
    MonsterEngine.getMonsterProgress(pid, id).caught
  ).length;

  return (
    <div style={{ padding: '32px 28px 48px', maxWidth: 1280, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 10 }}>
        <Btn variant="ghost" icon="back" onClick={onBack} size="sm">Back to dashboard</Btn>
      </div>
      <div style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        gap: 20, marginBottom: 28, flexWrap: 'wrap',
      }}>
        <div>
          <div style={{
            fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
            textTransform: 'uppercase', color: TOKENS.muted, marginBottom: 6,
          }}>Your collection</div>
          <h1 style={{
            margin: 0, fontFamily: TOKENS.fontSerif, fontWeight: 800,
            fontSize: 42, letterSpacing: '-0.025em', color: TOKENS.ink, lineHeight: 1.05,
          }}>Monster Codex</h1>
          <p style={{
            margin: '10px 0 0', color: TOKENS.ink2, fontSize: 15.5, maxWidth: 560, lineHeight: 1.5,
          }}>
            Master words and skills to catch new friends. Every 10 words levels them up, and reaching
            50 / 80 / 100 mastered evolves them — all the way to <strong>Mega Form</strong>.
          </p>
        </div>
        <div style={{
          display: 'flex', gap: 12, alignItems: 'center',
          background: TOKENS.panel, border: `1px solid ${TOKENS.line}`,
          padding: '14px 20px', borderRadius: TOKENS.radius,
          boxShadow: TOKENS.shadow,
        }}>
          <div>
            <div style={{ fontSize: 12, color: TOKENS.muted, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Caught</div>
            <div style={{ fontFamily: TOKENS.fontSerif, fontSize: 28, fontWeight: 800, color: TOKENS.ink }}>
              {caughtCount} <span style={{ color: TOKENS.muted, fontWeight: 500 }}>/ {totalCount}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Active subjects — each has at least one monster to collect */}
      {SUBJECT_ORDER
        .filter(sid => (MONSTERS_BY_SUBJECT[sid] || []).length > 0)
        .map(sid => {
          const subject = SUBJECTS[sid];
          const monsterIds = MONSTERS_BY_SUBJECT[sid] || [];
          return (
            <section key={sid} style={{ marginBottom: 32 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16,
              }}>
                <SubjectGlyph subject={subject} size={34} filled />
                <h2 style={{
                  margin: 0, fontFamily: TOKENS.fontSerif, fontSize: 22, fontWeight: 700,
                  color: TOKENS.ink, letterSpacing: '-0.01em',
                }}>{subject.name}</h2>
                <Chip tone="neutral">{monsterIds.length} friend{monsterIds.length === 1 ? '' : 's'}</Chip>
              </div>
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: 18,
              }}>
                {monsterIds.map(mid => {
                  const monster = MONSTERS[mid];
                  const prog = MonsterEngine.getMonsterProgress(pid, mid);
                  return (
                    <MonsterCard key={mid} monster={monster} progress={prog}
                      profileId={pid}
                      onOpen={() => setSelected({ monster, progress: prog })} />
                  );
                })}
              </div>
            </section>
          );
        })}

      {/* Coming-soon subjects compressed into a single reassurance strip */}
      <ComingSoonStrip subjectIds={
        SUBJECT_ORDER.filter(sid => (MONSTERS_BY_SUBJECT[sid] || []).length === 0)
      } />

      {selected && (
        <MonsterDetailDialog
          monster={selected.monster}
          progress={selected.progress}
          profileId={pid}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

// Single compact row reassuring the reader that more monsters are on the way,
// without letting empty subjects dominate the page above the real collection.
function ComingSoonStrip({ subjectIds }) {
  if (!subjectIds.length) return null;
  return (
    <section style={{
      marginTop: 8, padding: '18px 20px',
      background: TOKENS.panelSoft,
      border: `1.5px dashed ${TOKENS.line}`,
      borderRadius: TOKENS.radius,
      display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
    }}>
      <div style={{
        fontSize: 11, fontWeight: 800, letterSpacing: '0.1em',
        textTransform: 'uppercase', color: TOKENS.muted,
      }}>Arriving soon</div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {subjectIds.map(sid => {
          const subject = SUBJECTS[sid];
          return (
            <span key={sid} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 10px 4px 4px', borderRadius: 999,
              background: TOKENS.panel, border: `1px solid ${TOKENS.line}`,
              fontSize: 12.5, fontWeight: 600, color: TOKENS.ink2,
            }}>
              <SubjectGlyph subject={subject} size={22} filled />
              {subject.name}
            </span>
          );
        })}
      </div>
      <div style={{
        fontSize: 12.5, color: TOKENS.muted, fontWeight: 500,
        marginLeft: 'auto', maxWidth: 320, lineHeight: 1.4,
      }}>
        More friends hatch as these subjects come online. Keep practising to be first to meet them.
      </div>
    </section>
  );
}

// --- Card for a monster in the codex ---
// Pre-catch state no longer hides identity. We reveal the monster's name and the
// concrete hook it needs (e.g. "6 of 10 words to hatch") so the card pulls the
// child toward the next action instead of feeling like a blank mystery.
function MonsterCard({ monster, progress, onOpen, profileId }) {
  const { mastered, stage, level, caught } = progress;
  const stageLabel = MONSTER_STAGES[stage].label;
  const hook = hatchHookFor(monster, progress, profileId);

  return (
    <button onClick={onOpen} style={{
      textAlign: 'left', padding: 0, border: 'none', cursor: 'pointer',
      background: TOKENS.panel, borderRadius: TOKENS.radius,
      outline: `1px solid ${caught ? monster.secondary : TOKENS.line}`,
      boxShadow: TOKENS.shadow, overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
      transition: 'transform 0.15s, box-shadow 0.15s',
      fontFamily: TOKENS.fontSans,
    }}
    onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
    onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
    >
      {/* Art panel */}
      <div style={{
        background: caught ? monster.pale : TOKENS.panelSoft,
        padding: '18px 14px', display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative', minHeight: 172,
      }}>
        {caught ? (
          <MonsterArt monster={monster} stage={stage} size={140} />
        ) : (
          <MonsterArt monster={monster} stage={0} size={140} silhouette />
        )}
        {caught && stage === 4 && (
          <div style={{
            position: 'absolute', top: 10, right: 10,
            padding: '3px 8px', borderRadius: 999, fontSize: 10.5, fontWeight: 800,
            background: monster.primary, color: '#fff', letterSpacing: '0.08em',
          }}>★ MEGA</div>
        )}
        {!caught && (
          <div style={{
            position: 'absolute', top: 10, right: 12,
            fontSize: 10.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase',
            color: monster.primary,
            background: monster.pale,
            border: `1px solid ${monster.secondary}80`,
            padding: '3px 8px', borderRadius: 999,
          }}>Unhatched</div>
        )}
      </div>

      {/* Meta */}
      <div style={{ padding: '14px 16px 16px' }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4, gap: 8,
        }}>
          <h3 style={{
            margin: 0, fontFamily: TOKENS.fontSerif, fontSize: 18, fontWeight: 700,
            color: TOKENS.ink, letterSpacing: '-0.01em',
          }}>{caught ? monster.nameByStage[stage] : monster.name}</h3>
          {caught
            ? <span style={{ fontSize: 12, color: monster.primary, fontWeight: 800 }}>Lv {level}</span>
            : <span style={{
                fontSize: 11, color: monster.primary, fontWeight: 800,
                letterSpacing: '0.08em', textTransform: 'uppercase',
              }}>Egg</span>
          }
        </div>
        <div style={{ fontSize: 12, color: TOKENS.muted, marginBottom: 10 }}>
          {monster.subtitle} · {caught ? stageLabel : 'Awaiting hatch'}
        </div>
        <ProgressBar value={mastered} max={monster.masteredMax || 100} accent={monster.primary} height={6} />
        <div style={{
          display: 'flex', justifyContent: 'space-between', marginTop: 6,
          fontSize: 11.5, color: TOKENS.muted, fontWeight: 600,
        }}>
          <span>{hook.left}</span>
          <span>{hook.right}</span>
        </div>
      </div>
    </button>
  );
}

// Produces the two small captions under the progress bar. Pre-catch shows a
// concrete hatch hook (e.g. "6 of 10 to hatch"). For monsters with a custom
// pre-catch rule (Phaeton — both-caught gate), the monster itself overrides
// the hook text via a `hatchHook` field so the card can stay generic.
function hatchHookFor(monster, progress, profileId) {
  const { mastered, stage, caught } = progress;
  const max = monster.masteredMax || 100;
  const thresholds = monster.stageThresholds;

  if (caught) {
    return {
      left:  `${mastered}/${max} mastered`,
      right: stage < 4
        ? `Next: ${MONSTER_STAGES[stage + 1].label} at ${thresholds ? thresholds[stage + 1] : MONSTER_STAGES[stage + 1].threshold}`
        : 'Max form',
    };
  }

  // Pre-catch. Allow monster to override with a custom hook (used by Phaeton).
  if (typeof monster.hatchHook === 'function') {
    const custom = monster.hatchHook(profileId, progress);
    if (custom) return custom;
  }
  const toGo = Math.max(0, 10 - mastered);
  return {
    left:  `${mastered} of 10 to hatch`,
    right: toGo === 0 ? 'Ready to hatch' : `${toGo} more to go`,
  };
}

// --- Detail dialog for a monster ---
function MonsterDetailDialog({ monster, progress, onClose, profileId }) {
  const { mastered, stage, level, caught } = progress;

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(29,43,58,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 2500, padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: TOKENS.panel, borderRadius: TOKENS.radiusLg,
        boxShadow: TOKENS.shadowLg, width: '100%', maxWidth: 680,
        overflow: 'hidden', fontFamily: TOKENS.fontSans,
        maxHeight: 'calc(100vh - 40px)', display: 'flex', flexDirection: 'column',
      }}>
        {/* Hero */}
        <div style={{
          background: monster.pale, padding: '24px 28px 16px',
          display: 'flex', gap: 20, alignItems: 'center',
          borderBottom: `1px solid ${TOKENS.line}`,
          flex: '0 0 auto',
        }}>
          <div>
            {caught ? (
              <MonsterArt monster={monster} stage={stage} size={140} />
            ) : (
              <MonsterArt monster={monster} stage={0} size={140} silhouette />
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: monster.primary, marginBottom: 4,
            }}>{monster.subtitle}</div>
            <h2 style={{
              margin: 0, fontFamily: TOKENS.fontSerif, fontSize: 26, fontWeight: 800,
              color: TOKENS.ink, letterSpacing: '-0.02em',
            }}>{caught ? monster.nameByStage[stage] : monster.name}</h2>
            <div style={{
              marginTop: 6, color: TOKENS.ink2, fontSize: 14,
            }}>
              {caught
                ? `${MONSTER_STAGES[stage].label} form · Level ${level}`
                : `Awaiting hatch · ${dialogHatchCopy(monster, progress, profileId)}`}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: TOKENS.muted, padding: 6,
          }}><Icon name="close" size={20} /></button>
        </div>

        {/* Scrollable body — progress + timeline + mastered words */}
        <div style={{ padding: '20px 28px', overflowY: 'auto', minHeight: 0 }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', marginBottom: 8,
            fontSize: 13, color: TOKENS.ink2, fontWeight: 600,
          }}>
            <span>Mastery progress</span>
            <span style={{ color: monster.primary, fontWeight: 800 }}>
              {mastered} / {monster.masteredMax || 100} words
            </span>
          </div>
          <ProgressBar value={mastered} max={monster.masteredMax || 100} accent={monster.primary} height={10} />

          {/* Evolution timeline — uses monster-specific thresholds when provided */}
          <div style={{
            marginTop: 22, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8,
          }}>
            {MONSTER_STAGES.map((s, i) => {
              const unlocked = stage >= i;
              const threshold = monster.stageThresholds ? monster.stageThresholds[i] : s.threshold;
              return (
                <div key={i} style={{
                  textAlign: 'center', opacity: unlocked ? 1 : 0.4,
                }}>
                  <div style={{
                    background: unlocked ? monster.pale : TOKENS.panelSoft,
                    border: `1.5px solid ${unlocked ? monster.secondary : TOKENS.line}`,
                    borderRadius: 14, padding: '6px', marginBottom: 6,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    height: 70,
                  }}>
                    {unlocked ? (
                      <MonsterArt monster={monster} stage={i} size={58} />
                    ) : (
                      <MonsterArt monster={monster} stage={i} size={58} silhouette />
                    )}
                  </div>
                  <div style={{
                    fontSize: 11, fontWeight: 700, color: unlocked ? TOKENS.ink : TOKENS.muted,
                    letterSpacing: '0.04em', textTransform: 'uppercase',
                  }}>{s.label}</div>
                  <div style={{ fontSize: 10.5, color: TOKENS.muted, marginTop: 2 }}>
                    {threshold === 0 ? '0' : threshold}+ words
                  </div>
                </div>
              );
            })}
          </div>

          <MasteredWordsPeek monster={monster} progress={progress} profileId={profileId} />

          <div style={{
            marginTop: 18, padding: '14px 16px', background: TOKENS.panelSoft,
            border: `1px solid ${TOKENS.line}`, borderRadius: 12,
            fontSize: 13, color: TOKENS.ink2, lineHeight: 1.55,
          }}>
            <strong style={{ color: TOKENS.ink }}>How to grow {monster.name}:</strong>{' '}
            {typeof monster.growGuidance === 'string'
              ? monster.growGuidance
              : <>Practise the <strong>{monster.subtitle}</strong> in Spelling.
                A word is mastered when you spell it correctly enough times for the engine to
                mark it secure. Every mastered word feeds into this monster.</>}
          </div>
        </div>
      </div>
    </div>
  );
}

// Dialog-only pre-catch sentence. Uses the monster's hook but phrased as prose.
function dialogHatchCopy(monster, progress, profileId) {
  const hook = hatchHookFor(monster, progress, profileId);
  return `${hook.left} · ${hook.right}`;
}

// Peek at the words the child has actually secured — motivating for mid-journey, and
// for aggregate monsters (Phaeton) shows the breakdown across source pools so kids
// can see where their progress came from.
function MasteredWordsPeek({ monster, progress, profileId }) {
  const { masteredList } = progress;

  // Aggregate monsters supply their own breakdown (see Phaeton).
  if (typeof monster.masteryBreakdown === 'function') {
    const rows = monster.masteryBreakdown(profileId, progress);
    if (!rows || !rows.length) return null;
    return (
      <div style={{ marginTop: 22 }}>
        <SectionLabel>Progress sources</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map(r => (
            <div key={r.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 12,
              background: TOKENS.panelSoft, border: `1px solid ${TOKENS.line}`,
              fontSize: 13, color: TOKENS.ink2,
            }}>
              <div style={{
                width: 10, height: 10, borderRadius: 2, background: r.colour,
              }} />
              <strong style={{ color: TOKENS.ink, minWidth: 120 }}>{r.label}</strong>
              <span style={{ flex: 1 }}>{r.detail}</span>
              <span style={{ fontWeight: 800, color: r.colour }}>{r.count}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Individual monster — show the mastered word slugs as chips.
  const list = Array.isArray(masteredList) ? masteredList : [];
  if (!list.length) {
    return (
      <div style={{ marginTop: 22 }}>
        <SectionLabel>Words secured</SectionLabel>
        <div style={{
          padding: '14px 16px', borderRadius: 12, background: TOKENS.panelSoft,
          border: `1.5px dashed ${TOKENS.line}`, color: TOKENS.muted,
          fontSize: 13, textAlign: 'center',
        }}>
          Secure your first word in {monster.subtitle} to start filling this list.
        </div>
      </div>
    );
  }
  return (
    <div style={{ marginTop: 22 }}>
      <SectionLabel>
        Words secured
        <span style={{ marginLeft: 8, color: monster.primary, fontWeight: 800 }}>{list.length}</span>
      </SectionLabel>
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 6,
        maxHeight: 136, overflowY: 'auto',
        padding: '12px', borderRadius: 12,
        background: TOKENS.panelSoft, border: `1px solid ${TOKENS.line}`,
      }}>
        {list.map(slug => (
          <span key={slug} style={{
            padding: '3px 10px', borderRadius: 999, fontSize: 12,
            fontFamily: TOKENS.fontMono, color: TOKENS.ink2, fontWeight: 600,
            background: '#fff', border: `1px solid ${TOKENS.line}`,
          }}>{slug}</span>
        ))}
      </div>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      fontSize: 11, fontWeight: 800, letterSpacing: '0.1em',
      textTransform: 'uppercase', color: TOKENS.muted, marginBottom: 8,
    }}>{children}</div>
  );
}

// Compact chip used on Spelling header & dashboard to show a monster.
// Pre-catch: reveal the name + hatch hook (e.g. "6 of 10 to hatch") to give the
// child a concrete pull toward the next action.
function MonsterChip({ monster, progress, onClick, profileId, pulseKey }) {
  const { mastered, stage, level, caught } = progress;

  // Brief ring pulse fires whenever `pulseKey` changes (a mastered word was recorded
  // for this monster). The first mount shouldn't pulse — we only want a pulse in
  // response to a genuine progress tick after the chip is live.
  const [pulse, setPulse] = React.useState(0);
  const mountedRef = React.useRef(false);
  React.useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return; }
    if (pulseKey === undefined || pulseKey === null) return;
    setPulse(p => p + 1);
  }, [pulseKey]);

  const max = monster.masteredMax || 100;
  const subtitle = caught
    ? `Lv ${level} · ${mastered}/${max}`
    : `${mastered}/10 to hatch`;

  return (
    <button onClick={onClick} style={{
      position: 'relative',
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '5px 14px 5px 6px', borderRadius: 999,
      background: caught ? monster.pale : TOKENS.panelSoft,
      border: `1.5px solid ${caught ? monster.secondary : TOKENS.line}`,
      cursor: 'pointer', fontFamily: TOKENS.fontSans,
    }}>
      <style>{`
        @keyframes mc-ring {
          0%   { transform: scale(1);   opacity: 0.85; }
          80%  { opacity: 0.15; }
          100% { transform: scale(2.6); opacity: 0;   }
        }
        @keyframes mc-plus {
          0%   { transform: translateY(0)    scale(0.6); opacity: 0; }
          20%  { transform: translateY(-4px) scale(1);   opacity: 1; }
          80%  { transform: translateY(-22px) scale(1);  opacity: 1; }
          100% { transform: translateY(-30px) scale(1);  opacity: 0; }
        }
      `}</style>

      <div style={{
        position: 'relative',
        width: 34, height: 34, borderRadius: '50%',
        background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: `1.5px solid ${caught ? monster.secondary : TOKENS.line}`,
      }}>
        {caught
          ? <MonsterArt monster={monster} stage={stage} size={30} />
          : <MonsterArt monster={monster} stage={0} size={30} silhouette />
        }
        {/* Pulse ring + "+1" floater keyed to pulse counter */}
        {pulse > 0 && (
          <>
            <span key={`r${pulse}`} style={{
              position: 'absolute', inset: -3, borderRadius: '50%',
              border: `2.5px solid ${monster.primary}`,
              animation: 'mc-ring 1.1s ease-out both',
              pointerEvents: 'none',
            }}/>
            <span key={`p${pulse}`} style={{
              position: 'absolute', top: -8, right: -8,
              fontSize: 12, fontWeight: 800, color: monster.primary,
              textShadow: '0 1px 2px rgba(255,255,255,0.8)',
              animation: 'mc-plus 1.2s ease-out both',
              pointerEvents: 'none',
            }}>+1</span>
          </>
        )}
      </div>
      <div style={{ textAlign: 'left', lineHeight: 1.15 }}>
        <div style={{
          fontFamily: TOKENS.fontSerif, fontSize: 13, fontWeight: 700,
          color: TOKENS.ink,
        }}>
          {caught ? monster.nameByStage[stage] : monster.name}
        </div>
        <div style={{ fontSize: 11, color: TOKENS.muted, fontWeight: 600 }}>
          {subtitle}
        </div>
      </div>
    </button>
  );
}

Object.assign(window, {
  CollectionScreen, MonsterCard, MonsterDetailDialog, MonsterChip,
});
