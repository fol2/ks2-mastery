/*
 * Scene components for KS2 redesign v1 — Codex Journal.
 * Pulls shared primitives from window (components.jsx sets them).
 */

const {
  // data
  LEARNER, COMPANION, SUBJECTS, CODEX_TILES, MEADOW_MONSTERS, SESSION, SUMMARY,
  // icons
  IconSun, IconMoon, IconSpeaker, IconSpeakerSlow, IconArrowRight, IconCheck, IconSparkle,
  // primitives
  TopNav, CompanionStage, MonsterMeadow, SSMeadow, Ring, CodexTile, SubjectCard, ModeCard,
  ToggleChip, Stepper, LengthPicker, PathProgress, PhaseBadge, Ribbon, FamilyChips,
  CatchToast, ShellPadding,
} = window;

/* ----------------------------------------------------------
   Time-of-day greeting — mirrors what the real app will show
   once wired to the learner's locale / device clock.
   ---------------------------------------------------------- */
function greetForHour(hour) {
  if (hour < 5)  return 'Late night';
  if (hour < 12) return 'Morning';
  if (hour < 18) return 'Afternoon';
  return 'Evening';
}

function dueCopy(due) {
  if (due === 0) return 'Nothing due today — explore for fun.';
  if (due === 1) return 'One word due — one careful try.';
  return `${due} due — you can do this.`;
}

/* ==========================================================
   HOME — landing / learner dashboard
   ========================================================== */
const HERO_BG_URLS = [
  '/assets/regions/the-scribe-downs/the-scribe-downs-bg-a1.1280.webp',
  '/assets/regions/the-scribe-downs/the-scribe-downs-bg-a2.1280.webp',
  '/assets/regions/the-scribe-downs/the-scribe-downs-bg-a3.1280.webp',
  '/assets/regions/the-scribe-downs/the-scribe-downs-bg-b1.1280.webp',
  '/assets/regions/the-scribe-downs/the-scribe-downs-bg-b2.1280.webp',
  '/assets/regions/the-scribe-downs/the-scribe-downs-bg-b3.1280.webp',
];

/* --------------------------------------------------------------
   Hero luminance probe
   --------------------------------------------------------------
   Samples the average Rec. 709 luminance of a hero image so the
   session chrome (footer keys, any over-bg chip) can flip between
   light and dark ink tokens at runtime. Cached per URL to amortise
   the image decode cost; composited with the live --panel colour
   so the call respects the current theme's wash. */
const HERO_LUM_CACHE = new Map();

function computeRelLuminance(url) {
  if (HERO_LUM_CACHE.has(url)) return Promise.resolve(HERO_LUM_CACHE.get(url));
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const W = 32, H = 32;
        const canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, W, H);
        const data = ctx.getImageData(0, 0, W, H).data;
        let sum = 0;
        for (let i = 0; i < data.length; i += 4) {
          sum += 0.2126 * (data[i] / 255)
               + 0.7152 * (data[i + 1] / 255)
               + 0.0722 * (data[i + 2] / 255);
        }
        const raw = sum / (W * H);
        HERO_LUM_CACHE.set(url, raw);
        resolve(raw);
      } catch (err) {
        // Tainted canvas or decode failure — fall back to a neutral light value
        // so the chrome stays on the safe-default dark ink.
        HERO_LUM_CACHE.set(url, 0.6);
        resolve(0.6);
      }
    };
    img.onerror = () => { HERO_LUM_CACHE.set(url, 0.6); resolve(0.6); };
    img.src = url;
  });
}

function HomeScene({ theme, onToggleTheme, device, showCatchToast }) {
  const greet = greetForHour(new Date().getHours());
  const round = Math.floor(LEARNER.secureWords / 5) + 1;
  const heroBg = useMemo(
    () => HERO_BG_URLS[Math.floor(Math.random() * HERO_BG_URLS.length)],
    []
  );
  return (
    <ShellPadding device={device}>
      <TopNav theme={theme} onToggleTheme={onToggleTheme} />

      <div className="hero-paper" style={{ '--hero-bg': `url('${heroBg}')` }}>
        <div className="hero-art" aria-hidden="true" />
        <MonsterMeadow monsters={MEADOW_MONSTERS} maxSlots={10} />
        <div className="hero-mission">
          <div className="greet"><b>{greet}, {LEARNER.name}.</b> {COMPANION.name} is ready for round {round}.</div>
          <h1 className="mission">Today’s words are <em>waiting.</em><br />{dueCopy(LEARNER.dueCount)}</h1>
          <div className="hero-cta-row">
            <button className="btn primary xl" data-action="spelling-open">
              Begin today’s round <IconArrowRight />
            </button>
            <button className="btn ghost" data-action="open-codex">
              Open codex
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '28px 4px 6px', gap: 12 }}>
        <h2 className="section-title">Your subjects</h2>
        <a className="small muted" style={{ textDecoration: 'none' }} href="#" data-action="open-parent-hub">
          Parent hub →
        </a>
      </div>
      <div className="subject-grid">
        {SUBJECTS.map(s => <SubjectCard key={s.id} subject={s} />)}
      </div>

      {showCatchToast && (
        <div className="toast-shelf">
          <CatchToast
            monster={COMPANION}
            headline="A new friend joined you."
            body="Scribbla caught Glimmer Egg — open your codex to see."
          />
        </div>
      )}
    </ShellPadding>
  );
}

/* ==========================================================
   SPELLING SETUP
   ========================================================== */
function SpellingSetupScene({ theme, onToggleTheme, device, onOpenWordBank }) {
  const [mode, setMode] = useState('smart');
  const [cloze, setCloze] = useState(true);
  const [autoplay, setAutoplay] = useState(true);
  const [length, setLength] = useState(10);
  const heroBg = useMemo(
    () => HERO_BG_URLS[Math.floor(Math.random() * HERO_BG_URLS.length)],
    []
  );

  return (
    <ShellPadding device={device}>
      <TopNav theme={theme} onToggleTheme={onToggleTheme} />

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '0 4px 14px' }}>
        <a href="#" className="small muted" style={{ textDecoration: 'none' }}>← Dashboard</a>
        <span className="small muted">/</span>
        <span className="small" style={{ fontWeight: 700 }}>English Spelling</span>
      </div>

      <div className="setup-grid">
        <div className="setup-main" style={{ '--hero-bg': `url('${heroBg}')` }}>
          <div className="hero-art pan" aria-hidden="true" />
          <div className="setup-content">
            <p className="eyebrow">Round setup</p>
            <h1 className="title">Choose today’s journey.</h1>
            <p className="lede">Smart Review mixes what’s due, what wobbled last time, and one or two new words. You can go straight to trouble drills or SATs rehearsal if you’d rather.</p>

            <div className="mode-row">
              <ModeCard
                icon="◎"
                title="Smart Review"
                desc="Due · weak · one fresh word."
                selected={mode === 'smart'}
                onClick={() => setMode('smart')}
              />
              <ModeCard
                icon="⚡"
                title="Trouble Drill"
                desc="Only the words you usually miss."
                selected={mode === 'drill'}
                onClick={() => setMode('drill')}
              />
              <ModeCard
                icon="⌒"
                title="SATs Test"
                desc="One-shot dictation, no retries."
                selected={mode === 'test'}
                onClick={() => setMode('test')}
              />
            </div>

            <div className="tweak-row">
              <span className="tool-label">Round length</span>
              <LengthPicker value={length} onChange={setLength} />
            </div>

            <div className="tweak-row">
              <span className="tool-label">Options</span>
              <ToggleChip on={cloze} onClick={() => setCloze(v => !v)} label="Show sentence" />
              <ToggleChip on={autoplay} onClick={() => setAutoplay(v => !v)} label="Auto-play audio" />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginTop: 28 }}>
              <button className="btn primary xl" data-action="spelling-start">
                Begin {length} words <IconArrowRight />
              </button>
            </div>
          </div>
        </div>

        <div className="setup-side">
          <div className="ss-card">
            <div className="ss-head">
              <p className="eyebrow">Where you stand</p>
              <button type="button" className="ss-codex-link" data-action="codex-open">
                Open codex →
              </button>
            </div>
            <SSMeadow monsters={MEADOW_MONSTERS} limit={3} />
            <div className="ss-stat-grid">
              <div className="ss-stat">
                <div className="ss-stat-label">Total spellings</div>
                <div className="ss-stat-value">{LEARNER.totalWords}</div>
              </div>
              <div className="ss-stat">
                <div className="ss-stat-label">Secure</div>
                <div className="ss-stat-value">{LEARNER.secureWords}</div>
              </div>
              <div className="ss-stat">
                <div className="ss-stat-label">Due today</div>
                <div className="ss-stat-value" style={{ color: 'var(--warn-strong)' }}>{LEARNER.dueCount}</div>
              </div>
              <div className="ss-stat">
                <div className="ss-stat-label">Weak spots</div>
                <div className="ss-stat-value">{LEARNER.weakCount}</div>
              </div>
              <div className="ss-stat">
                <div className="ss-stat-label">Unseen</div>
                <div className="ss-stat-value">{LEARNER.unseenWords}</div>
              </div>
              <div className="ss-stat">
                <div className="ss-stat-label">Accuracy</div>
                <div className="ss-stat-value">{Math.round(LEARNER.accuracy * 100)}%</div>
              </div>
            </div>

            {/* Word bank jump — sits below the stat grid so the learner can
                drop into the full word list without going through a round.
                Matches the ss-stat visual vocabulary so it reads as part of
                the "where you stand" card rather than a separate action. */}
            <button
              type="button"
              className="ss-bank-link"
              onClick={onOpenWordBank}
              data-action="word-bank-open"
            >
              <span className="ss-bank-link-body">
                <span className="ss-bank-link-head">Browse the word bank</span>
                <span className="ss-bank-link-sub">
                  Every word Alex is learning, with progress and difficulty.
                </span>
              </span>
              <span className="ss-bank-link-arrow" aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      </div>
    </ShellPadding>
  );
}

/* ==========================================================
   SPELLING SESSION — shared layout for question / correct / wrong
   ========================================================== */
function SessionShell({ theme, onToggleTheme, device, variant }) {
  // variant: 'question' | 'correct' | 'wrong'
  const [typed, setTyped] = useState(
    variant === 'correct' ? SESSION.word
      : variant === 'wrong' ? 'dictatted'
      : ''
  );

  // Transient audio-playback state drives the glow on the audio icon buttons.
  // null | 'normal' | 'slow' — reset automatically after a short window so the
  // prototype visibly demonstrates the "currently playing" affordance.
  const [playingAudio, setPlayingAudio] = useState(null);
  const audioTimerRef = useRef(null);
  const playAudio = (kind) => {
    if (audioTimerRef.current) window.clearTimeout(audioTimerRef.current);
    setPlayingAudio(kind);
    audioTimerRef.current = window.setTimeout(() => setPlayingAudio(null), 1800);
  };

  // Evenly distribute the six region backgrounds across the session. For a
  // 10-word round each image gets ~1–2 questions; for 30 words each gets ~5.
  const heroBg = HERO_BG_URLS[
    Math.min(HERO_BG_URLS.length - 1,
      Math.floor(SESSION.current * HERO_BG_URLS.length / SESSION.total))
  ];

  // Runtime luminance probe — the shell gets a `hero-dark` class when the
  // region art itself is darker than mid-grey. We intentionally read the raw
  // image luminance (not a theme-wash composite) so the decision tracks the
  // art's own character rather than being masked by the overlay.
  const [heroIsDark, setHeroIsDark] = useState(false);
  useEffect(() => {
    let cancelled = false;
    computeRelLuminance(heroBg).then((raw) => {
      if (cancelled) return;
      setHeroIsDark(raw < 0.5);
    });
    return () => { cancelled = true; };
  }, [heroBg]);

  const inputPlaceholder =
    variant === 'wrong' ? 'Try once more from memory' :
    variant === 'correct' ? 'Saved' :
    'Type what you hear';

  return (
    <ShellPadding
      device={device}
      extra={'in-session' + (heroIsDark ? ' hero-dark' : '')}
      style={{ '--hero-bg': `url('${heroBg}')` }}
    >
      <TopNav theme={theme} onToggleTheme={onToggleTheme} />

      <div className="session">
        <div className="session-head">
          <PathProgress done={SESSION.done} current={SESSION.current} total={SESSION.total} />
          <span className="path-count">Word {SESSION.current + 1} of {SESSION.total}</span>
        </div>

        <div className="prompt-card">
          <div className="prompt-instr">Spell the word you hear.</div>
          <div className="cloze">
            {SESSION.cloze.split('________')[0]}
            <span className="blank">{variant === 'correct' ? 'dictated' : '\u00A0'}</span>
            {SESSION.cloze.split('________')[1]}
          </div>

          <div className="word-input-wrap">
            <input
              className="word-input"
              type="text"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder={inputPlaceholder}
              value={typed}
              onChange={e => setTyped(e.target.value)}
              aria-label="Type the spelling"
            />
          </div>

          <div className="audio-row">
            <button
              className={'btn icon lg' + (playingAudio === 'normal' ? ' playing' : '')}
              aria-label="Replay"
              aria-pressed={playingAudio === 'normal'}
              onClick={() => playAudio('normal')}
            ><IconSpeaker /></button>
            <button
              className={'btn icon lg' + (playingAudio === 'slow' ? ' playing' : '')}
              aria-label="Replay slowly"
              aria-pressed={playingAudio === 'slow'}
              onClick={() => playAudio('slow')}
            ><IconSpeakerSlow /></button>
          </div>

          <div className="action-row">
            {variant === 'question' && (
              <>
                <button className="btn primary lg" data-action="spelling-submit">Submit <IconArrowRight /></button>
                <button className="btn ghost" data-action="spelling-skip">Skip</button>
              </>
            )}
            {variant === 'correct' && (
              <button className="btn primary lg" data-action="spelling-advance">Save and next <IconArrowRight /></button>
            )}
            {variant === 'wrong' && (
              <>
                <button className="btn primary lg" data-action="spelling-retry">Try again <IconArrowRight /></button>
                <button className="btn ghost" data-action="spelling-skip">Skip</button>
              </>
            )}
          </div>

          {/* Always render the feedback slot so the card has identical height
              across question/correct/wrong. In question mode it becomes an
              invisible placeholder — `visibility: hidden` + `aria-hidden`
              keep the reserved space without leaking content to users or AT. */}
          <div
            className={'feedback-slot' + (variant === 'question' ? ' is-placeholder' : '')}
            aria-hidden={variant === 'question' ? 'true' : undefined}
          >
            {variant === 'wrong' ? (
              <Ribbon
                tone="warn"
                icon="!"
                headline="Not quite — one more try from memory."
                sub='You wrote "dictatted". Hear the ending again, then type it once more.'
              />
            ) : (
              // Used for both `correct` and placeholder (`question`) — identical
              // layout keeps the slot height locked to the post-submit state.
              <Ribbon
                tone="good"
                icon={<IconCheck />}
                headline="Nailed it."
                word={SESSION.word}
                sub="Went straight to the secure pile. Next stop is coming."
              />
            )}
            <FamilyChips words={SESSION.family} />
          </div>
        </div>

        <div className="session-footer">
          <div className="keys-hint">
            <kbd>Esc</kbd> replay · <kbd>⇧</kbd>+<kbd>Esc</kbd> slow · <kbd>Enter</kbd> submit
          </div>
          <button className="btn sm bad" data-action="spelling-end">End round early</button>
        </div>
      </div>
    </ShellPadding>
  );
}

function SpellingQuestionScene(p) { return <SessionShell {...p} variant="question" />; }
function SpellingCorrectScene(p)  { return <SessionShell {...p} variant="correct" />; }
function SpellingWrongScene(p)    { return <SessionShell {...p} variant="wrong" />; }

/* ==========================================================
   SPELLING SUMMARY — page complete

   The summary re-uses the session shell on purpose: same hero art,
   same tokens, same typography. The round ending is meant to read
   as the last beat of the same flow rather than a separate view.

   Layers, back-to-front:
     1. Hero bg (on the shell's ::before)
     2. Happy monsters wandering (up to 3, behind the card) — shown
        only when the round produced any new companion activity and
        there isn't a bigger catch/evolve moment to defer to.
     3. The summary card (stats + mistakes + actions)
     4. Fireworks overlay (full-screen, non-interactive, auto-dismiss)
        — suppressed if bigEvent === 'catch' | 'evolve' because those
        get their own, bigger celebration scene.
   ========================================================== */
function SpellingSummaryScene({ theme, onToggleTheme, device }) {
  const acc = Math.round(SUMMARY.accuracy * 100);
  const toRevisit = SUMMARY.total - SUMMARY.correct;

  /* Reuse the session's background picker — the last word the learner
     saw carries through to the summary so the scene feels continuous. */
  const heroBg = HERO_BG_URLS[HERO_BG_URLS.length - 1];

  /* Luminance probe (same contract as SessionShell) so the topnav ink
     flips to white on darker hero art. */
  const [heroIsDark, setHeroIsDark] = useState(false);
  useEffect(() => {
    let cancelled = false;
    computeRelLuminance(heroBg).then((raw) => {
      if (cancelled) return;
      setHeroIsDark(raw < 0.5);
    });
    return () => { cancelled = true; };
  }, [heroBg]);

  /* Honour the "nothing to celebrate" case — no caught eggs / no
     evolved companion means we also don't wander any monsters.
     The preview data currently lists three, so it reads as the
     "happy ending" state. */
  const wanderers = (SUMMARY.happyMonsters || []).slice(0, 3);
  const showWanderers = wanderers.length > 0;

  /* Fireworks run as the summary's own small celebration when the
     round does not trigger a bigger event (catch / evolve). */
  const showFireworks = !SUMMARY.bigEvent;

  return (
    <ShellPadding
      device={device}
      extra={'in-session summary-shell' + (heroIsDark ? ' hero-dark' : '')}
      style={{ '--hero-bg': `url('${heroBg}')` }}
    >
      <TopNav theme={theme} onToggleTheme={onToggleTheme} />

      {/* Wandering monsters — absolute inside the shell so they sit
         behind the card. pointer-events:none on the container means
         they can never intercept clicks on the CTAs, per brief. */}
      {showWanderers && (
        <SummaryMonsterWander monsters={wanderers} />
      )}

      <div className="session summary">
        <div className="session-head">
          {/* All dots filled — the path is complete. done = total = total. */}
          <PathProgress done={SUMMARY.total} current={SUMMARY.total} total={SUMMARY.total} />
          <span className="path-count">Round complete</span>
        </div>

        <div className="prompt-card summary-card">
          <Ribbon
            tone="good"
            icon={<IconCheck />}
            headline={`${SUMMARY.correct} of ${SUMMARY.total} words landed.`}
            sub={`${SUMMARY.mode} · ${SUMMARY.minutes} min · ${acc}% accuracy`}
          />

          {/* Four-up stat strip — visual grammar lifted from the session
             (serif numerals, small caps labels) so the continuity reads. */}
          <div className="summary-stats">
            <div className="summary-stat">
              <div className="v">{SUMMARY.correct}</div>
              <div className="l">Correct</div>
            </div>
            <div className="summary-stat">
              <div className="v">{toRevisit}</div>
              <div className="l">To revisit</div>
            </div>
            <div className="summary-stat">
              <div className="v">{SUMMARY.secured}</div>
              <div className="l">New secures</div>
            </div>
            <div className="summary-stat">
              <div className="v">
                {SUMMARY.minutes}
                <span className="u">m</span>
              </div>
              <div className="l">Round time</div>
            </div>
          </div>

          {SUMMARY.mistakes.length > 0 && (
            <div className="summary-drill">
              <div className="summary-drill-head">
                <h4>Words that need another go</h4>
                <span className="small muted">
                  A quick drill cycles these three times, then you’re done.
                </span>
              </div>
              <div className="summary-drill-chips">
                {SUMMARY.mistakes.map(w => (
                  <button
                    key={w}
                    className="fchip"
                    data-action="spelling-drill-single"
                    data-slug={w}
                  >
                    {w}
                  </button>
                ))}
                <button
                  className="btn primary sm"
                  data-action="spelling-drill-all"
                >
                  Drill all <IconArrowRight />
                </button>
              </div>
            </div>
          )}

          <div className="summary-actions">
            <button className="btn ghost lg" data-action="back-dashboard">
              Back to dashboard
            </button>
            <button className="btn primary lg" data-action="spelling-start">
              Start another round <IconArrowRight />
            </button>
            {/* Word bank link — quiet, right-aligned, reads as "more options"
               rather than a main CTA. Same data-action name the real app
               already uses, so the existing dispatcher wires up unchanged. */}
            <button
              type="button"
              className="summary-bank-link"
              data-action="word-bank-open"
            >
              Open word bank <IconArrowRight />
            </button>
          </div>
        </div>
      </div>

      {/* Fireworks overlay — full viewport, non-interactive, auto-dismisses.
         Mounted last so it sits on top of everything else, but with
         pointer-events:none the clicks still land on the CTAs underneath. */}
      {showFireworks && <SummaryFireworks />}
    </ShellPadding>
  );
}

/* ----------------------------------------------------------
   Small helpers that only the summary scene uses.
   Kept local so they don't leak into the window namespace —
   the primitives map in components.jsx is for things other
   scenes reuse (MonsterMeadow, CompanionStage…).
   ---------------------------------------------------------- */

/* A trio of slot templates. Each one describes where the monster
   lives on the shell and its personalised wander range, so the
   three instances don't bob in unison. Positions stay clear of
   the central card area (roughly 220..780px wide, top ~140px) so
   the actions are never obscured. */
const WANDER_SLOTS = [
  {
    /* top-left corner, above the card */
    left: '6%',
    top:  '12%',
    driftX: 28,
    bounceDelay: 0,
  },
  {
    /* top-right corner, mirrored */
    right: '7%',
    top:   '9%',
    driftX: -32,
    bounceDelay: 0.6,
  },
  {
    /* below the card — picks up the eye at the end of the read */
    left: '52%',
    bottom: '8%',
    driftX: 22,
    bounceDelay: 1.1,
  },
];

function SummaryMonsterWander({ monsters }) {
  return (
    <div
      className="summary-wander"
      aria-hidden="true"
      /* pointer-events handled in CSS; aria-hidden because the animation
         is decorative — the actual "you made progress" information
         belongs in the ribbon / stats, not a screen-reader meadow. */
    >
      {monsters.map((m, i) => {
        const slot = WANDER_SLOTS[i % WANDER_SLOTS.length];
        const faceSign = monsterFaceSignLocal(m);
        return (
          <div
            key={m.id}
            className="happy-monster"
            style={{
              '--size':     `${m.size}px`,
              '--drift-x':  `${slot.driftX}px`,
              '--bounce-delay': `${slot.bounceDelay}s`,
              '--face':     faceSign,
              ...(slot.left   !== undefined ? { left:   slot.left   } : {}),
              ...(slot.right  !== undefined ? { right:  slot.right  } : {}),
              ...(slot.top    !== undefined ? { top:    slot.top    } : {}),
              ...(slot.bottom !== undefined ? { bottom: slot.bottom } : {}),
            }}
          >
            {/* Decorative sparkles around each happy monster — the
               "excitement" expressed visually, per brief. */}
            <span className="happy-spark s1" aria-hidden="true" />
            <span className="happy-spark s2" aria-hidden="true" />
            <span className="happy-spark s3" aria-hidden="true" />
            <img src={m.img} alt="" />
          </div>
        );
      })}
    </div>
  );
}

/* Local duplicate of components.jsx's monsterFaceSign so the scene file
   doesn't need a new window export for a single helper. The mapping
   table is small and rarely changes. */
function monsterFaceSignLocal(m) {
  const LEFT_FACING = new Set([
    'inklet-b1', 'inklet-b2',
    'glimmerbug-b1', 'glimmerbug-b2',
    'phaeton-b2',
  ]);
  const key = `${m.species}-${m.variant}`;
  return LEFT_FACING.has(key) ? -1 : 1;
}

/* Fireworks — CSS-driven confetti bursts. Each burst is an emitter
   with 12 particles that shoot outward on random angles. We lay out
   a handful of emitters across the screen and stagger their delays
   so the bursts feel naturally spaced rather than synchronised. */
const FIREWORK_BURSTS = [
  { left: '14%', top: '26%', delay: 0.0,  hue: 'warn' },
  { left: '78%', top: '18%', delay: 0.35, hue: 'brand' },
  { left: '40%', top: '12%', delay: 0.9,  hue: 'good' },
  { left: '22%', top: '62%', delay: 1.2,  hue: 'brand' },
  { left: '70%', top: '58%', delay: 1.6,  hue: 'warn' },
];

const FIREWORK_PARTICLES = 12;

function SummaryFireworks() {
  /* Stateless by design: the CSS `fw-fire` keyframe uses `forwards` fill
     mode and ends at opacity 0, so the particles are visually gone once
     the animation completes (~1.8s per particle + delay). We leave the
     DOM nodes in place because `pointer-events: none` on the container
     means they can never intercept a click, and keeping the JS pure
     sidesteps any hook-timing races between the summary scene's parent
     re-renders and the fireworks' own state transitions. */

  return (
    <div className="summary-fireworks" aria-hidden="true">
      {FIREWORK_BURSTS.map((b, bi) => (
        <div
          key={bi}
          className={`fw-burst hue-${b.hue}`}
          style={{
            left:  b.left,
            top:   b.top,
            '--fw-delay': `${b.delay}s`,
          }}
        >
          {Array.from({ length: FIREWORK_PARTICLES }, (_, pi) => {
            /* Twelve particles, radial spread. Each one carries its
               own angle + distance via CSS custom properties; the
               keyframe reads them and translates accordingly.     */
            const angle = (pi / FIREWORK_PARTICLES) * 360;
            const distance = 90 + (pi % 3) * 22;   // a little variance
            return (
              <span
                key={pi}
                className="fw-particle"
                style={{
                  '--angle':    `${angle}deg`,
                  '--distance': `${distance}px`,
                  '--p-delay':  `${pi * 0.015}s`,
                }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

/* ==========================================================
   MONSTER CELEBRATIONS
   ========================================================== */
function MonsterCatchScene(props) {
  return <HomeScene {...props} showCatchToast />;
}

/* Build the path for a specific species / variant / stage image. The real app
   uses an identical convention; keeping the helper here means the design file
   does not drift from production asset layout. */
function monsterStageSrc(species, variant, stage) {
  return `/assets/monsters/${species}/${variant}/${species}-${variant}-${stage}.640.webp`;
}

/* Every transition the design preview can play. `kind` controls which
   animation track the EvolveTimeline uses:
     - 'shared' : whiten-then-emerge pattern shared across egg→1, 1→2, 2→3
     - 'caught' : no previous form — sparkle gather pattern (to be designed)
     - 'mega'   : shared pattern amplified for the final 3→4 leap (to be designed)

   `placeholder: true` swaps the timeline for a holding card so we can stub
   the scene now and iterate on caught / mega one at a time. */
const EVOLVE_PAIRS = [
  { id: 'caught', label: 'Caught',     kind: 'caught',
    species: 'glimmerbug', variant: 'b1', from: null, to: 0,
    name: 'Glimmer Egg',
    eyebrow: 'New friend',
    congrats: 'A new friend joined the codex.' },
  { id: 'egg-1', label: 'Egg → 1',    kind: 'shared',
    species: 'inklet', variant: 'b1', from: 0, to: 1,
    name: 'Scribbla',
    eyebrow: 'Hatched',
    congrats: 'Your Glimmer Egg hatched into a Scribbla.' },
  { id: '1-2', label: '1 → 2',        kind: 'shared',
    species: 'inklet', variant: 'b1', from: 1, to: 2,
    name: 'Scribbla',
    eyebrow: 'Grown',
    congrats: 'Scribbla has grown stronger.' },
  { id: '2-3', label: '2 → 3',        kind: 'shared',
    species: 'inklet', variant: 'b1', from: 2, to: 3,
    name: 'Quillorn',
    eyebrow: 'Evolved',
    congrats: 'Scribbla evolved into Quillorn.' },
  { id: '3-4', label: '3 → 4 Mega',   kind: 'mega',
    species: 'inklet', variant: 'b1', from: 3, to: 4,
    name: 'Codexmark',
    eyebrow: 'Final form',
    congrats: 'Quillorn reached its final form.' },
];

/* Holds the currently previewed transition and exposes a replay button.
   We key the timeline by `${pair.id}:${replayKey}` so every replay forces
   a fresh mount — simpler than resetting a dozen CSS animations by hand.  */
function MonsterEvolveScene({ theme, onToggleTheme, device }) {
  const [pairId, setPairId]       = useState('egg-1');
  const [replayKey, setReplayKey] = useState(0);
  const pair = EVOLVE_PAIRS.find(p => p.id === pairId) || EVOLVE_PAIRS[1];

  const pick = id => {
    setPairId(id);
    setReplayKey(k => k + 1);
  };

  return (
    <div style={{ position: 'relative', minHeight: 700 }}>
      <HomeScene theme={theme} onToggleTheme={onToggleTheme} device={device} />

      <div className="ev-overlay" role="dialog" aria-label="Evolution celebration">
        <div className="ev-picker" role="tablist" aria-label="Transition">
          {EVOLVE_PAIRS.map(p => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={p.id === pairId}
              className={
                'ev-chip'
                + (p.id === pairId ? ' on' : '')
                + (p.placeholder ? ' placeholder' : '')
              }
              onClick={() => pick(p.id)}
            >
              {p.label}
              {p.placeholder && <span className="ev-chip-todo">todo</span>}
            </button>
          ))}
          {/* BETA-ONLY: replay control is a preview affordance for design
              review. Strip this button when we graduate the scene to
              production — real users see the animation once per transition. */}
          <button
            type="button"
            className="ev-replay"
            onClick={() => setReplayKey(k => k + 1)}
            aria-label="Replay animation"
          >
            ↻ Replay
          </button>
        </div>

        <EvolveTimeline key={`${pair.id}:${replayKey}`} pair={pair} />
      </div>
    </div>
  );
}

/* Dispatches to the right animation track for the selected pair. Each
   timeline shares the same reveal block (eyebrow / name / congrats / CTA)
   so the narrative ending is consistent across transitions — only the
   "how did the new form arrive" phase differs. */
function EvolveTimeline({ pair }) {
  if (pair.placeholder) {
    return (
      <div className="celeb-modal ev-modal placeholder">
        <div className="ev-placeholder-card">
          <p className="ev-eyebrow">{pair.label}</p>
          <h2 className="ev-name">Designing separately</h2>
          <p className="ev-congrats">
            This transition uses its own animation. We&rsquo;ll design it next.
          </p>
        </div>
      </div>
    );
  }
  if (pair.kind === 'caught') return <CaughtTimeline pair={pair} />;
  if (pair.kind === 'mega')   return <MegaTimeline   pair={pair} />;
  if (pair.id === 'egg-1')    return <EggCrackTimeline pair={pair} />;
  return <SharedTimeline pair={pair} />;
}

/* Shared whiten-then-emerge pattern used for egg→1, 1→2, 2→3.
   The old form enters and holds for a "behold" beat — breathing gently
   while a low halo charges — then whitens into an opaque flash, a shine
   sweeps, and the new form emerges from the white and settles.
   `data-stage` on each img drives stage-based sizing (CSS tiers), so the
   size gradient reads in one glance — bigger stage = bigger silhouette. */
function SharedTimeline({ pair }) {
  const fromSrc = monsterStageSrc(pair.species, pair.variant, pair.from);
  const toSrc   = monsterStageSrc(pair.species, pair.variant, pair.to);

  return (
    <div className="celeb-modal ev-modal">
      <div className="ev-stage">
        <div className="ev-halo"  aria-hidden="true" />
        <div className="ev-shine" aria-hidden="true" />
        <img className="ev-mon ev-mon-from" src={fromSrc} alt="" data-stage={pair.from} />
        {/* Pure-opacity white flash — replaces the old `filter: brightness/saturate`
            whiten on the monster. Dedicated element = GPU-only opacity, no CPU
            re-composite per frame, and we can crank the core all the way to
            fully-opaque white without fighting the image's own colour. */}
        <div className="ev-white" aria-hidden="true" />
        <img className="ev-mon ev-mon-to"   src={toSrc}   alt="" data-stage={pair.to} />
      </div>

      <EvolveReveal pair={pair} />
    </div>
  );
}

/* First-catch celebration. No previous form exists, so the drama comes
   from summoning: ten sparkle particles fly in from the edges, collide
   at centre, burst into the same halo + shine beat as the shared pattern,
   and the egg emerges from the white. The second half of the animation
   is intentionally identical to the shared timeline — the payoff feels
   consistent with future evolutions, only the entry differs. */
function CaughtTimeline({ pair }) {
  const toSrc = monsterStageSrc(pair.species, pair.variant, pair.to);
  /* Ten particles — dense enough to read as a shower, sparse enough that
     each one remains legible. Positions live in CSS (nth-child) so the
     set is easy to tune without touching JSX. */
  const parts = Array.from({ length: 10 }, (_, i) => i);

  return (
    <div className="celeb-modal ev-modal caught">
      <div className="ev-stage">
        <div className="ev-parts" aria-hidden="true">
          {parts.map(i => <span key={i} className="ev-part" />)}
        </div>
        <div className="ev-halo"  aria-hidden="true" />
        <div className="ev-shine" aria-hidden="true" />
        <div className="ev-white" aria-hidden="true" />
        <img className="ev-mon ev-mon-to" src={toSrc} alt="" data-stage={pair.to} />
      </div>

      <EvolveReveal pair={pair} />
    </div>
  );
}

/* Final-form celebration (stage 3 → 4). Same structural beats as the
   shared pattern — whiten → halo → shine → emerge — but everything is
   amplified: 6s duration, gold-tinted halo, screen shake on impact,
   trailing sparkle shower, gold/white/blue gradient name, "FINAL FORM"
   supertext. All amplification is CSS (.ev-modal.mega), so this
   component only adds the particle shower on top of the shared markup. */
function MegaTimeline({ pair }) {
  const fromSrc = monsterStageSrc(pair.species, pair.variant, pair.from);
  const toSrc   = monsterStageSrc(pair.species, pair.variant, pair.to);
  const parts   = Array.from({ length: 10 }, (_, i) => i);

  return (
    <div className="celeb-modal ev-modal mega">
      <div className="ev-stage">
        <div className="ev-parts" aria-hidden="true">
          {parts.map(i => <span key={i} className="ev-part" />)}
        </div>
        <div className="ev-halo"  aria-hidden="true" />
        <div className="ev-shine" aria-hidden="true" />
        <img className="ev-mon ev-mon-from" src={fromSrc} alt="" data-stage={pair.from} />
        {/* Same opacity-only white flash as shared, but sized up so the
            final-form wash reads as overwhelming. */}
        <div className="ev-white" aria-hidden="true" />
        <img className="ev-mon ev-mon-to"   src={toSrc}   alt="" data-stage={pair.to} />
      </div>

      <EvolveReveal pair={pair} />
    </div>
  );
}

/* Egg → stage 1 — discrete cracking event. Eggs *break*; they don't
   smoothly dissolve. So the timeline replaces the shared whiten beat
   with a wobble-tension build, a flash + shell-shard burst at the
   crack moment, and a squash-and-stretch pop for the new monster.
   Reuses the same .ev-* markup so the surrounding modal (background,
   reveal, CTA) is consistent — only the per-element animations differ
   via `.ev-modal.egg-crack` overrides. */
function EggCrackTimeline({ pair }) {
  const fromSrc = monsterStageSrc(pair.species, pair.variant, pair.from);
  const toSrc   = monsterStageSrc(pair.species, pair.variant, pair.to);
  /* Eight shell shards — enough to read as a full break, sparse enough
     each shard's arc is legible. Trajectories live in CSS (nth-child). */
  const shards = Array.from({ length: 8 }, (_, i) => i);

  return (
    <div className="celeb-modal ev-modal egg-crack">
      <div className="ev-stage">
        <img className="ev-mon ev-mon-from" src={fromSrc} alt="" data-stage={pair.from} />
        <div className="ev-parts" aria-hidden="true">
          {shards.map(i => <span key={i} className="ev-part" />)}
        </div>
        <div className="ev-halo"  aria-hidden="true" />
        <div className="ev-shine" aria-hidden="true" />
        <div className="ev-white" aria-hidden="true" />
        <img className="ev-mon ev-mon-to"   src={toSrc}   alt="" data-stage={pair.to} />
      </div>

      <EvolveReveal pair={pair} />
    </div>
  );
}

/* Reveal block — eyebrow / name / congrats / CTA. Extracted so every
   timeline renders an identical ending; the reveal animates in via CSS
   delay, so callers do not have to orchestrate timing. */
function EvolveReveal({ pair }) {
  return (
    <div className="ev-reveal">
      <p className="ev-eyebrow">{pair.eyebrow}</p>
      <h2 className="ev-name">{pair.name}</h2>
      <p className="ev-congrats">{pair.congrats}</p>
      <button className="btn primary xl ev-cta">
        Continue <IconArrowRight />
      </button>
    </div>
  );
}

/* ==========================================================
   WORD BANK
   Mock slice of the learner's tracked words. The real app will
   page/paginate through all 213 words; the design preview shows
   a representative two-dozen across the five status buckets.
   ========================================================== */
const WB_STATUS_ORDER = ['due', 'weak', 'learning', 'secure', 'unseen'];
const WB_STATUS_LABEL = {
  due:      'Due today',
  weak:     'Weak spot',
  learning: 'Learning',
  secure:   'Secure',
  unseen:   'Unseen',
};

/* Each entry carries just enough content for the design preview to feel real.
   In the real app the engine pulls def / sample / family from the content
   pack — the shape here mirrors that. The same `sample` sentence is reused
   for the practice drill, with the target word swapped for a blank span at
   render time (see renderClozeSentence).                                    */
const WORD_BANK = [
  /* due — surface to top */
  {
    word: 'dictated', status: 'due', acc: 0.68, nextDue: 'Today', attempts: 7,
    def: 'Said or read aloud so that someone else could write it down.',
    sample: 'Mrs. Patel dictated the paragraph twice so everyone could keep up.',
    family: ['dictate', 'dictation', 'dictator', 'predict'],
  },
  {
    word: 'measurable', status: 'due', acc: 0.61, nextDue: 'Today', attempts: 6,
    def: 'Able to be counted, weighed, or timed.',
    sample: 'Her progress this term has been small but measurable.',
    family: ['measure', 'measurement', 'immeasurable'],
  },
  {
    word: 'rehearsal', status: 'due', acc: 0.70, nextDue: 'Today', attempts: 9,
    def: 'A practice performance before the real event.',
    sample: 'The dress rehearsal went smoothly, so nerves had eased by Friday night.',
    family: ['rehearse', 'rehearsed', 'rehearsing'],
  },
  {
    word: 'separate', status: 'due', acc: 0.55, nextDue: 'Today', attempts: 5,
    def: 'Apart from something else; divided.',
    sample: 'Keep the clean laundry on separate shelves from the school sports kit.',
    family: ['separation', 'separately', 'separator'],
  },
  {
    word: 'particular', status: 'due', acc: 0.64, nextDue: 'Today', attempts: 8,
    def: 'One specific thing, not just any.',
    sample: 'He has a particular way of tying his shoelaces, starting from the outside.',
    family: ['particularly', 'particulars', 'particularity'],
  },
  /* weak spots */
  {
    word: 'necessary', status: 'weak', acc: 0.42, nextDue: 'Tomorrow', attempts: 11,
    def: 'Needed; essential.',
    sample: 'A warm coat is necessary for the school trip to the coast.',
    family: ['necessarily', 'unnecessary', 'necessity'],
  },
  {
    word: 'occasion', status: 'weak', acc: 0.38, nextDue: 'In 2 days', attempts: 12,
    def: 'A special or particular event.',
    sample: 'The birthday party was a joyful occasion for the whole family.',
    family: ['occasional', 'occasionally', 'occasions'],
  },
  {
    word: 'rhythm', status: 'weak', acc: 0.33, nextDue: 'In 2 days', attempts: 14,
    def: 'A regular, repeated pattern of sounds or movement.',
    sample: 'She clapped along to the rhythm of the drum.',
    family: ['rhythmic', 'rhythmically', 'rhythms'],
  },
  {
    word: 'conscience', status: 'weak', acc: 0.45, nextDue: 'Tomorrow', attempts: 9,
    def: 'Your inner sense of right and wrong.',
    sample: 'His conscience told him to return the wallet he found on the pavement.',
    family: ['conscientious', 'conscientiously', 'conscious'],
  },
  /* learning */
  {
    word: 'breathe', status: 'learning', acc: 0.74, nextDue: 'In 3 days', attempts: 8,
    def: 'To draw air into your lungs and let it out again.',
    sample: 'Remember to breathe slowly when you are reading aloud.',
    family: ['breath', 'breathing', 'breathless'],
  },
  {
    word: 'community', status: 'learning', acc: 0.79, nextDue: 'In 4 days', attempts: 7,
    def: 'A group of people who live or work together.',
    sample: 'Our school community raised money for the new library.',
    family: ['communities', 'communal', 'commune'],
  },
  {
    word: 'courageous', status: 'learning', acc: 0.72, nextDue: 'In 3 days', attempts: 9,
    def: 'Showing bravery in the face of difficulty.',
    sample: 'It was courageous of her to speak up when nobody else would.',
    family: ['courage', 'courageously', 'encouragement'],
  },
  {
    word: 'existence', status: 'learning', acc: 0.66, nextDue: 'In 4 days', attempts: 10,
    def: 'The state of being real or being alive.',
    sample: 'The existence of the lost manuscript was finally proved last summer.',
    family: ['exist', 'existing', 'existential'],
  },
  {
    word: 'familiar', status: 'learning', acc: 0.81, nextDue: 'In 5 days', attempts: 6,
    def: 'Known to you; recognisable.',
    sample: 'The old seaside town looked familiar, even thirty years later.',
    family: ['familiarity', 'familiarly', 'unfamiliar'],
  },
  {
    word: 'mention', status: 'learning', acc: 0.77, nextDue: 'In 4 days', attempts: 7,
    def: 'To refer to something briefly in speech or writing.',
    sample: 'Did she mention when the package would arrive?',
    family: ['mentioned', 'mentioning', 'unmentionable'],
  },
  /* secure — long intervals */
  {
    word: 'literature', status: 'secure', acc: 0.95, nextDue: 'In 14 days', attempts: 12,
    def: 'Written works, especially those valued for quality or beauty.',
    sample: 'Victorian literature is full of fogbound streets and fierce weather.',
    family: ['literary', 'literate', 'literacy'],
  },
  {
    word: 'continue', status: 'secure', acc: 0.93, nextDue: 'In 12 days', attempts: 10,
    def: 'To keep doing or happening.',
    sample: 'Please continue reading from the second paragraph.',
    family: ['continued', 'continuing', 'continuous'],
  },
  {
    word: 'believe', status: 'secure', acc: 0.91, nextDue: 'In 10 days', attempts: 9,
    def: 'To accept that something is true.',
    sample: 'I believe you, even though the story sounds unusual.',
    family: ['belief', 'believer', 'believable'],
  },
  {
    word: 'experience', status: 'secure', acc: 0.89, nextDue: 'In 10 days', attempts: 11,
    def: 'Something you have done or felt; knowledge gained over time.',
    sample: 'She wrote about her first experience of snow in the Highlands.',
    family: ['experienced', 'experiencing', 'inexperienced'],
  },
  {
    word: 'different', status: 'secure', acc: 0.92, nextDue: 'In 12 days', attempts: 9,
    def: 'Not the same as; unlike another.',
    sample: 'My brother and I have very different ideas about music.',
    family: ['difference', 'differently', 'differ'],
  },
  {
    word: 'history', status: 'secure', acc: 0.96, nextDue: 'In 16 days', attempts: 10,
    def: 'The study of past events, especially those relating to human affairs.',
    sample: 'Our history teacher made the Romans feel alive.',
    family: ['historic', 'historical', 'historian'],
  },
  /* unseen — no attempts yet */
  {
    word: 'committee', status: 'unseen', acc: null, nextDue: null, attempts: 0,
    def: 'A group of people chosen to discuss matters or make decisions.',
    sample: 'The school council committee meets every other Friday morning.',
    family: ['commit', 'committees', 'committed'],
  },
  {
    word: 'correspond', status: 'unseen', acc: null, nextDue: null, attempts: 0,
    def: 'To match up with something, or to exchange letters.',
    sample: 'The numbers on the chart correspond to the colours in the key.',
    family: ['correspondence', 'correspondent', 'corresponding'],
  },
  {
    word: 'parliament', status: 'unseen', acc: null, nextDue: null, attempts: 0,
    def: "A group of people elected to make a country's laws.",
    sample: 'The new bill will be debated in parliament this autumn.',
    family: ['parliamentary', 'parliaments', 'parliamentarian'],
  },
];

function countWordsByStatus(status) {
  return WORD_BANK.filter(w => w.status === status).length;
}

/* Highlight the matching word inside a sentence so the learner can see
   it in context. Matches are case-insensitive but keep their original
   casing in the rendered output.                                     */
function highlightWordInSentence(sentence, word) {
  if (!sentence || !word) return sentence;
  const parts = sentence.split(new RegExp(`(\\b${word}\\b)`, 'gi'));
  return parts.map((p, i) =>
    p.toLowerCase() === word.toLowerCase()
      ? <b key={i}>{p}</b>
      : <React.Fragment key={i}>{p}</React.Fragment>
  );
}

/* Design-preview pronunciation — the real app proxies TTS through the
   Worker. Here we just flash a "playing" state so the button feels alive.
   Duration varies: a word is ~700 ms, a sentence ~1.6 s normal / ~2.8 s
   slow. Those numbers are purely cosmetic in this static preview.      */
function useFakePronunciation(duration = 700) {
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => setPlaying(false), duration);
    return () => clearTimeout(t);
  }, [playing, duration]);
  return [playing, () => setPlaying(true)];
}

/* Render the sample sentence as a cloze for the drill: the target word
   becomes a blank span (with the .wb-drill-blank style) that reveals the
   original word once `revealed` is true. Case-insensitive match keeps the
   original casing in the reveal.                                       */
function renderClozeSentence(sentence, word, revealed) {
  if (!sentence || !word) return sentence;
  const parts = sentence.split(new RegExp(`(\\b${word}\\b)`, 'gi'));
  return parts.map((p, i) =>
    p.toLowerCase() === word.toLowerCase()
      ? (
        <span
          key={i}
          className={'wb-drill-blank' + (revealed ? ' revealed' : '')}
        >{revealed ? p : '\u00A0'}</span>
      )
      : <React.Fragment key={i}>{p}</React.Fragment>
  );
}

function WordDetailModal({ entry, mode, onMode, onClose }) {
  const [typed, setTyped]         = useState('');
  const [submitted, setSubmitted] = useState(false);
  /* Three separate playback hooks so the word, the full sentence and the
     slow sentence each glow independently. Durations are cosmetic in the
     static preview — they mirror roughly what TTS takes at those rates.  */
  const [speakingWord, playWord] = useFakePronunciation(700);
  const [speakingSent, playSent] = useFakePronunciation(1600);
  const [speakingSlow, playSlow] = useFakePronunciation(2800);
  const inputRef = useRef(null);

  /* Reset drill state whenever we switch mode or words. */
  useEffect(() => {
    setTyped('');
    setSubmitted(false);
  }, [mode, entry.word]);

  /* Focus the input when entering drill mode. */
  useEffect(() => {
    if (mode === 'drill' && inputRef.current) {
      const t = setTimeout(() => inputRef.current.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [mode, entry.word]);

  /* Auto-play the sentence once when the learner first lands in drill mode
     for this word, so the exercise starts "ear-first" (mirrors the real
     session's autoplay behaviour). */
  useEffect(() => {
    if (mode !== 'drill') return;
    const t = setTimeout(() => playSent(), 220);
    return () => clearTimeout(t);
  }, [mode, entry.word]);

  /* Escape closes the modal from anywhere. */
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const correct = typed.trim().toLowerCase() === entry.word.toLowerCase();
  const inDrill = mode === 'drill';

  function handleSubmit(e) {
    e.preventDefault();
    if (!typed.trim()) return;
    setSubmitted(true);
  }
  function handleTryAgain() {
    setSubmitted(false);
    setTyped('');
    if (inputRef.current) inputRef.current.focus();
  }

  return (
    <div
      className="wb-modal-scrim"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wb-modal-word"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="wb-modal">
        <div className="wb-modal-head">
          <div className="wb-modal-head-main">
            {/* In drill mode the spoken word would give the answer away, so
               we swap the speaker button for a neutral "ear" glyph and hide
               the word itself — the learner must listen to the sentence and
               type what they hear. */}
            {inDrill ? (
              <span className="wb-modal-speaker muted" aria-hidden="true">
                <IconSpeaker />
              </span>
            ) : (
              <button
                type="button"
                className={'wb-modal-speaker' + (speakingWord ? ' playing' : '')}
                data-action="word-bank-pronounce"
                aria-label={`Play pronunciation of ${entry.word}`}
                onClick={playWord}
              >
                <IconSpeaker />
              </button>
            )}
            <div style={{ minWidth: 0 }}>
              <p className="eyebrow">{WB_STATUS_LABEL[entry.status]}</p>
              {inDrill ? (
                <h2 id="wb-modal-word" className="wb-modal-word wb-modal-word-prompt">
                  Listen and type
                </h2>
              ) : (
                <h2 id="wb-modal-word" className="wb-modal-word">{entry.word}</h2>
              )}
            </div>
          </div>
          <button
            type="button"
            className="wb-modal-close"
            aria-label="Close"
            onClick={onClose}
          >×</button>
        </div>

        <div className="wb-modal-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'explain'}
            className={'wb-modal-tab' + (mode === 'explain' ? ' on' : '')}
            onClick={() => onMode('explain')}
          >Explain</button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'drill'}
            className={'wb-modal-tab' + (mode === 'drill' ? ' on' : '')}
            onClick={() => onMode('drill')}
          >Practice</button>
        </div>

        <div className="wb-modal-body">
          {mode === 'explain' ? (
            <React.Fragment>
              <div className="wb-modal-section">
                <p className="wb-modal-section-label">Meaning</p>
                <p className="wb-modal-def">{entry.def}</p>
              </div>
              <div className="wb-modal-section">
                <p className="wb-modal-section-label">In a sentence</p>
                <blockquote className="wb-modal-sample">
                  {highlightWordInSentence(entry.sample, entry.word)}
                </blockquote>
              </div>
              <div className="wb-modal-section wb-modal-section-family">
                <FamilyChips words={entry.family} />
              </div>
            </React.Fragment>
          ) : (
            <React.Fragment>
              <div className="wb-modal-section">
                <p className="wb-modal-section-label">Listen to the sentence, then type the missing word</p>
                {/* The drill reuses the dictionary's sample sentence — the
                   engine already stores one per word, so there is no need
                   for a second "drillSentence" field. renderClozeSentence
                   swaps the target word for a blank span (see helper).    */}
                <p className="wb-drill-sentence">
                  {renderClozeSentence(entry.sample, entry.word, submitted)}
                </p>
              </div>

              {/* Replay controls mirror the session scene so the learner's
                 muscle memory carries across: normal replay + slow replay,
                 same icons, same "playing" glow.                         */}
              <div
                className="wb-drill-audio"
                role="group"
                aria-label="Sentence playback"
              >
                <button
                  type="button"
                  className={'wb-drill-audio-btn' + (speakingSent ? ' playing' : '')}
                  data-action="word-bank-drill-replay"
                  aria-label="Replay the sentence"
                  aria-pressed={speakingSent}
                  onClick={playSent}
                >
                  <IconSpeaker />
                  <span className="wb-drill-audio-label">Replay</span>
                </button>
                <button
                  type="button"
                  className={'wb-drill-audio-btn slow' + (speakingSlow ? ' playing' : '')}
                  data-action="word-bank-drill-replay-slow"
                  aria-label="Replay the sentence slowly"
                  aria-pressed={speakingSlow}
                  onClick={playSlow}
                >
                  <IconSpeakerSlow />
                  <span className="wb-drill-audio-label">Slowly</span>
                </button>
              </div>

              <form onSubmit={handleSubmit} className="wb-drill-form">
                <input
                  ref={inputRef}
                  type="text"
                  className="wb-drill-input"
                  placeholder="Type the word…"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  disabled={submitted}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck="false"
                  aria-label={`Type the word for ${entry.word}`}
                />
                {!submitted && (
                  <button
                    type="submit"
                    className="btn primary"
                    disabled={!typed.trim()}
                  >
                    Check
                  </button>
                )}
              </form>

              {submitted && (
                <div className={'wb-drill-feedback ' + (correct ? 'good' : 'warn')}>
                  <span className="wb-drill-feedback-icon" aria-hidden="true">
                    {correct ? <IconCheck /> : '!'}
                  </span>
                  <span>
                    {correct ? (
                      <React.Fragment>
                        Nicely typed. This is pure practice — nothing is scored.
                      </React.Fragment>
                    ) : (
                      <React.Fragment>
                        Not quite — the word is <b>{entry.word}</b>. Try it again;
                        nothing is scored here.
                      </React.Fragment>
                    )}
                  </span>
                </div>
              )}
            </React.Fragment>
          )}
        </div>

        <div className="wb-modal-actions">
          {mode === 'explain' ? (
            <React.Fragment>
              <button type="button" className="btn" onClick={onClose}>Close</button>
              <button
                type="button"
                className="btn primary"
                onClick={() => onMode('drill')}
                data-action="word-bank-practice"
              >
                Practice this word <IconArrowRight />
              </button>
            </React.Fragment>
          ) : (
            <React.Fragment>
              <button
                type="button"
                className="btn"
                onClick={() => onMode('explain')}
              >
                ← Explanation
              </button>
              {submitted ? (
                <button
                  type="button"
                  className="btn primary"
                  onClick={handleTryAgain}
                >
                  Try again
                </button>
              ) : (
                <button type="button" className="btn" onClick={onClose}>Close</button>
              )}
            </React.Fragment>
          )}
        </div>

        <p className="wb-modal-note">
          Practice here is drill-only — no score, no streak, no codex points.
        </p>
      </div>
    </div>
  );
}

function WordBankScene({ theme, onToggleTheme, device, onBack }) {
  const [query, setQuery]     = useState('');
  const [filter, setFilter]   = useState('all');
  const [openWord, setOpenWord] = useState(null);   /* the word string, or null */
  const [openMode, setOpenMode] = useState('explain'); /* 'explain' | 'drill' */

  function openDetail(word, mode) {
    setOpenWord(word);
    setOpenMode(mode);
  }
  function closeDetail() { setOpenWord(null); }

  /* Lock page scroll while the modal is open — prevents the background
     from drifting when the learner is focused on the modal content. */
  useEffect(() => {
    if (!openWord) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [openWord]);

  const openEntry = openWord
    ? WORD_BANK.find(w => w.word === openWord)
    : null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = WORD_BANK;
    if (filter !== 'all') rows = rows.filter(r => r.status === filter);
    if (q)                rows = rows.filter(r => r.word.toLowerCase().includes(q));
    // Sort by status priority, then alphabetic so users always see due/weak first.
    return rows.slice().sort((a, b) => {
      const pa = WB_STATUS_ORDER.indexOf(a.status);
      const pb = WB_STATUS_ORDER.indexOf(b.status);
      if (pa !== pb) return pa - pb;
      return a.word.localeCompare(b.word);
    });
  }, [query, filter]);

  const chipDefs = [
    { id: 'all',      label: 'All',      count: WORD_BANK.length },
    { id: 'due',      label: 'Due',      count: countWordsByStatus('due') },
    { id: 'weak',     label: 'Weak',     count: countWordsByStatus('weak') },
    { id: 'learning', label: 'Learning', count: countWordsByStatus('learning') },
    { id: 'secure',   label: 'Secure',   count: countWordsByStatus('secure') },
    { id: 'unseen',   label: 'Unseen',   count: countWordsByStatus('unseen') },
  ];

  return (
    <ShellPadding device={device}>
      <TopNav theme={theme} onToggleTheme={onToggleTheme} />

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '0 4px 14px' }}>
        <a
          href="#"
          className="small muted"
          style={{ textDecoration: 'none', cursor: 'pointer' }}
          onClick={(e) => { e.preventDefault(); onBack && onBack(); }}
        >
          ← Spelling setup
        </a>
        <span className="small muted">/</span>
        <span className="small" style={{ fontWeight: 700 }}>Word bank</span>
      </div>

      <div className="wb-card">
        <div className="wb-head">
          <p className="eyebrow">Word bank</p>
          <h1 className="title">{LEARNER.name}’s word bank</h1>
          <p className="lede">
            {LEARNER.totalWords} words tracked — {LEARNER.secureWords} secure,{' '}
            {LEARNER.dueCount} due today, {LEARNER.weakCount} weak spots. The list
            below is a slice sorted by priority.
          </p>
        </div>

        <div className="wb-toolbar">
          <label className="wb-search">
            <span className="wb-search-icon" aria-hidden="true">⌕</span>
            <input
              type="search"
              placeholder="Search words…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search word bank"
            />
          </label>
          <div className="wb-chips" role="tablist" aria-label="Filter by status">
            {chipDefs.map(c => (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={filter === c.id}
                className={'wb-chip' + (filter === c.id ? ' on' : '')}
                onClick={() => setFilter(c.id)}
              >
                <span className="wb-chip-label">{c.label}</span>
                <span className="wb-chip-count">{c.count}</span>
              </button>
            ))}
          </div>
        </div>

        <ul className="wb-list">
          {filtered.map(row => (
            <li
              key={row.word}
              className="wb-row"
              data-status={row.status}
              role="button"
              tabIndex={0}
              aria-label={`Open details for ${row.word}`}
              onClick={() => openDetail(row.word, 'explain')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openDetail(row.word, 'explain');
                }
              }}
            >
              <div className="wb-cell-word">
                <span className="wb-word">{row.word}</span>
                <span className={'wb-pill ' + row.status}>
                  {WB_STATUS_LABEL[row.status]}
                </span>
              </div>
              <div className="wb-cell-meta">
                <span className="wb-meta">
                  <span className="wb-meta-label">Accuracy</span>
                  <span className="wb-meta-value">
                    {row.acc == null ? '—' : `${Math.round(row.acc * 100)}%`}
                  </span>
                </span>
                <span className="wb-meta">
                  <span className="wb-meta-label">Next due</span>
                  <span className="wb-meta-value">{row.nextDue || '—'}</span>
                </span>
                <span className="wb-meta">
                  <span className="wb-meta-label">Attempts</span>
                  <span className="wb-meta-value">{row.attempts}</span>
                </span>
              </div>
              <button
                type="button"
                className="wb-action"
                data-action="word-bank-drill"
                aria-label={`Practise the word ${row.word}`}
                onClick={(e) => {
                  /* Stop the row's onClick from also firing. */
                  e.stopPropagation();
                  openDetail(row.word, 'drill');
                }}
              >
                <IconArrowRight />
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="wb-empty">No words match your search.</li>
          )}
        </ul>

        <div className="wb-foot">
          Showing {filtered.length} of {WORD_BANK.length} preview entries.
        </div>
      </div>

      {openEntry && (
        <WordDetailModal
          entry={openEntry}
          mode={openMode}
          onMode={setOpenMode}
          onClose={closeDetail}
        />
      )}
    </ShellPadding>
  );
}

/* Export scenes to window */
Object.assign(window, {
  HomeScene,
  SpellingSetupScene,
  SpellingQuestionScene,
  SpellingCorrectScene,
  SpellingWrongScene,
  SpellingSummaryScene,
  MonsterCatchScene,
  MonsterEvolveScene,
  WordBankScene,
});
