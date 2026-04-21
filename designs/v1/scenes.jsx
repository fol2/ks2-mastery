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
   ========================================================== */
function SpellingSummaryScene({ theme, onToggleTheme, device }) {
  return (
    <ShellPadding device={device}>
      <TopNav theme={theme} onToggleTheme={onToggleTheme} />

      <div className="page-complete">
        <div className="pc-head">
          <div className="pc-seal">✓</div>
          <div>
            <p className="eyebrow">Page complete</p>
            <h1 className="pc-headline">{SUMMARY.correct} of {SUMMARY.total} words landed.</h1>
            <div className="pc-meta">{SUMMARY.mode} · {SUMMARY.minutes} minutes · {Math.round(SUMMARY.accuracy * 100)}% accuracy</div>
          </div>
        </div>

        <div className="pc-stats">
          <div className="pc-stat"><div className="v">{SUMMARY.correct}</div><div className="l">Correct</div></div>
          <div className="pc-stat"><div className="v">{SUMMARY.total - SUMMARY.correct}</div><div className="l">To revisit</div></div>
          <div className="pc-stat"><div className="v">{SUMMARY.secured}</div><div className="l">New secures</div></div>
          <div className="pc-stat"><div className="v">{SUMMARY.minutes}<span style={{ fontSize: '0.6em', fontWeight: 600, color: 'var(--muted)' }}>m</span></div><div className="l">Round time</div></div>
        </div>

        {SUMMARY.mistakes.length > 0 && (
          <div className="pc-drill">
            <h4>Words that need another go</h4>
            <div className="small muted">A quick drill cycles these three times, then you’re done.</div>
            <div className="pc-drill-chips">
              {SUMMARY.mistakes.map(w => (
                <button key={w} className="fchip" data-action="spelling-drill-single" data-slug={w}>{w}</button>
              ))}
              <button className="btn primary sm" data-action="spelling-drill-all">Drill all <IconArrowRight /></button>
            </div>
          </div>
        )}

        <div className="pc-companion">
          <img src={SUMMARY.monsterUpdate.img} alt="" />
          <div className="pc-companion-body">
            <b>{SUMMARY.monsterUpdate.name}</b>
            <div className="small muted" style={{ marginTop: 2 }}>{SUMMARY.monsterUpdate.body}</div>
          </div>
        </div>

        <div className="pc-actions">
          <button className="btn ghost lg" data-action="back-dashboard">Back to dashboard</button>
          <button className="btn primary lg" data-action="spelling-start">Start another round <IconArrowRight /></button>
        </div>
      </div>
    </ShellPadding>
  );
}

/* ==========================================================
   MONSTER CELEBRATIONS
   ========================================================== */
function MonsterCatchScene(props) {
  return <HomeScene {...props} showCatchToast />;
}

function MonsterEvolveScene({ theme, onToggleTheme, device }) {
  return (
    <div style={{ position: 'relative', minHeight: 700 }}>
      <HomeScene theme={theme} onToggleTheme={onToggleTheme} device={device} />
      <div className="celeb-modal" role="dialog" aria-label="Evolution celebration">
        <div className="celeb-ring" />
        <div className="celeb-card">
          <img src="/assets/monsters/inklet-3.640.webp" alt="" className="celeb-mon" />
          <h2 className="celeb-title">Scribbla evolved into Quillorn.</h2>
          <p className="celeb-sub">Sixty mastered words unlocked a new form.</p>
          <button className="btn primary xl" style={{ marginTop: 20 }}>
            Meet Quillorn <IconArrowRight />
          </button>
        </div>
      </div>
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

const WORD_BANK = [
  /* due — surface to top */
  { word: 'dictated',   status: 'due',      acc: 0.68, nextDue: 'Today',     attempts: 7 },
  { word: 'measurable', status: 'due',      acc: 0.61, nextDue: 'Today',     attempts: 6 },
  { word: 'rehearsal',  status: 'due',      acc: 0.70, nextDue: 'Today',     attempts: 9 },
  { word: 'separate',   status: 'due',      acc: 0.55, nextDue: 'Today',     attempts: 5 },
  { word: 'particular', status: 'due',      acc: 0.64, nextDue: 'Today',     attempts: 8 },
  /* weak spots */
  { word: 'necessary',  status: 'weak',     acc: 0.42, nextDue: 'Tomorrow',  attempts: 11 },
  { word: 'occasion',   status: 'weak',     acc: 0.38, nextDue: 'In 2 days', attempts: 12 },
  { word: 'rhythm',     status: 'weak',     acc: 0.33, nextDue: 'In 2 days', attempts: 14 },
  { word: 'conscience', status: 'weak',     acc: 0.45, nextDue: 'Tomorrow',  attempts: 9 },
  /* learning */
  { word: 'breathe',    status: 'learning', acc: 0.74, nextDue: 'In 3 days', attempts: 8 },
  { word: 'community',  status: 'learning', acc: 0.79, nextDue: 'In 4 days', attempts: 7 },
  { word: 'courageous', status: 'learning', acc: 0.72, nextDue: 'In 3 days', attempts: 9 },
  { word: 'existence',  status: 'learning', acc: 0.66, nextDue: 'In 4 days', attempts: 10 },
  { word: 'familiar',   status: 'learning', acc: 0.81, nextDue: 'In 5 days', attempts: 6 },
  { word: 'mention',    status: 'learning', acc: 0.77, nextDue: 'In 4 days', attempts: 7 },
  /* secure — long intervals */
  { word: 'literature', status: 'secure',   acc: 0.95, nextDue: 'In 14 days', attempts: 12 },
  { word: 'continue',   status: 'secure',   acc: 0.93, nextDue: 'In 12 days', attempts: 10 },
  { word: 'believe',    status: 'secure',   acc: 0.91, nextDue: 'In 10 days', attempts: 9 },
  { word: 'experience', status: 'secure',   acc: 0.89, nextDue: 'In 10 days', attempts: 11 },
  { word: 'different',  status: 'secure',   acc: 0.92, nextDue: 'In 12 days', attempts: 9 },
  { word: 'history',    status: 'secure',   acc: 0.96, nextDue: 'In 16 days', attempts: 10 },
  /* unseen — no attempts yet */
  { word: 'committee',  status: 'unseen',   acc: null, nextDue: null, attempts: 0 },
  { word: 'correspond', status: 'unseen',   acc: null, nextDue: null, attempts: 0 },
  { word: 'parliament', status: 'unseen',   acc: null, nextDue: null, attempts: 0 },
];

function countWordsByStatus(status) {
  return WORD_BANK.filter(w => w.status === status).length;
}

function WordBankScene({ theme, onToggleTheme, device, onBack }) {
  const [query, setQuery]   = useState('');
  const [filter, setFilter] = useState('all');

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
            <li key={row.word} className="wb-row" data-status={row.status}>
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
                aria-label={`Drill the word ${row.word}`}
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
