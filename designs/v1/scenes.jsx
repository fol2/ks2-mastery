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
  TopNav, CompanionStage, MonsterMeadow, Ring, CodexTile, SubjectCard, ModeCard,
  ToggleChip, Stepper, PathProgress, PhaseBadge, Ribbon, FamilyChips,
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
function SpellingSetupScene({ theme, onToggleTheme, device }) {
  const [mode, setMode] = useState('smart');
  const [cloze, setCloze] = useState(true);
  const [autoplay, setAutoplay] = useState(true);
  const [length, setLength] = useState(10);

  return (
    <ShellPadding device={device}>
      <TopNav theme={theme} onToggleTheme={onToggleTheme} />

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '0 4px 14px' }}>
        <a href="#" className="small muted" style={{ textDecoration: 'none' }}>← Dashboard</a>
        <span className="small muted">/</span>
        <span className="small" style={{ fontWeight: 700 }}>English Spelling</span>
      </div>

      <div className="setup-grid">
        <div className="setup-main">
          <p className="eyebrow">Round setup</p>
          <h1 className="title">Choose today’s journey.</h1>
          <p className="lede">Smart Review mixes what’s due, what wobbled last time, and one or two new words. You can go straight to trouble drills or SATs rehearsal if you’d rather.</p>

          <div className="mode-row">
            <ModeCard
              icon="◎"
              title="Smart Review"
              desc="Due · weak · one fresh word."
              selected={mode === 'smart'}
              recommended
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
            <Stepper value={length} onChange={setLength} />
            <span className="tool-label" style={{ marginLeft: 14 }}>Options</span>
            <ToggleChip on={cloze} onClick={() => setCloze(v => !v)} label="Show sentence" />
            <ToggleChip on={autoplay} onClick={() => setAutoplay(v => !v)} label="Auto-play audio" />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 28, gap: 14, flexWrap: 'wrap' }}>
            <div className="small muted" style={{ maxWidth: 420 }}>
              {mode === 'test'
                ? 'SATs mode: the word plays once, you submit once. No retries, no family hint.'
                : 'Learning loop: quick feedback, a retry, then a clean write-through before we move on.'}
            </div>
            <button className="btn primary xl" data-action="spelling-start">
              Begin {length} words <IconArrowRight />
            </button>
          </div>
        </div>

        <div className="setup-side">
          <div className="ss-card">
            <p className="eyebrow">Where you stand</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <CompanionStage size="petite" />
              <div>
                <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, fontSize: '1.1rem', letterSpacing: '-0.01em' }}>
                  {COMPANION.name}
                </div>
                <div className="small muted">Inklet — stage {COMPANION.stage} of 4</div>
              </div>
            </div>
            <div className="ss-stat-grid">
              <div className="ss-stat">
                <div className="ss-stat-label">Secure</div>
                <div className="ss-stat-value">{LEARNER.secureWords}</div>
              </div>
              <div className="ss-stat">
                <div className="ss-stat-label">Due now</div>
                <div className="ss-stat-value" style={{ color: 'var(--warn-strong)' }}>{LEARNER.dueCount}</div>
              </div>
              <div className="ss-stat">
                <div className="ss-stat-label">Accuracy</div>
                <div className="ss-stat-value">{Math.round(LEARNER.accuracy * 100)}%</div>
              </div>
              <div className="ss-stat">
                <div className="ss-stat-label">Streak</div>
                <div className="ss-stat-value">{LEARNER.streakDays}d</div>
              </div>
            </div>
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

  const inputPlaceholder =
    variant === 'wrong' ? 'Try once more from memory' :
    variant === 'correct' ? 'Saved' :
    'Type what you hear';

  return (
    <ShellPadding device={device}>
      <TopNav theme={theme} onToggleTheme={onToggleTheme} />

      <div className="session">
        <div className="session-head">
          <PathProgress done={SESSION.done} current={SESSION.current} total={SESSION.total} />
          <span className="path-count">Word {SESSION.current + 1} of {SESSION.total}</span>
          <PhaseBadge phase={variant === 'wrong' ? 'learning' : SESSION.phase} />
        </div>

        <div className="prompt-card">
          <div className="prompt-instr">Spell the word you hear.</div>
          <div className="cloze">
            {SESSION.cloze.split('________')[0]}
            <span className="blank">{variant === 'correct' ? 'dictated' : '_____'}</span>
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
            <button className="btn icon lg" aria-label="Replay"><IconSpeaker /></button>
            <button className="btn icon lg" aria-label="Replay slowly"><IconSpeakerSlow /></button>
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

          {variant === 'correct' && (
            <>
              <Ribbon
                tone="good"
                icon={<IconCheck />}
                headline="Nailed it."
                word={SESSION.word}
                sub="Went straight to the secure pile. Next stop is coming."
              />
              <FamilyChips words={SESSION.family} />
            </>
          )}

          {variant === 'wrong' && (
            <>
              <Ribbon
                tone="warn"
                icon="!"
                headline="Not quite — one more try from memory."
                sub='You wrote "dictatted". Hear the ending again, then type it once more.'
              />
              <FamilyChips words={SESSION.family} />
            </>
          )}
        </div>

        <div className="companion-dock" aria-hidden="true">
          <img src={COMPANION.imgSmall} alt="" />
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
});
