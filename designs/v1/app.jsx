/*
 * App shell for KS2 redesign v1 — Codex Journal.
 * Reads primitives from window (set by components.jsx + scenes.jsx).
 */

const { useState, useEffect } = React;
const { createRoot } = ReactDOM;

const {
  HomeScene,
  SpellingSetupScene,
  SpellingQuestionScene,
  SpellingCorrectScene,
  SpellingWrongScene,
  SpellingSummaryScene,
  WordBankScene,
  MonsterCatchScene,
  MonsterEvolveScene,
} = window;

const SCENES = [
  { group: 'Landing',
    items: [
      { id: 'home', label: 'Home / dashboard', Component: HomeScene },
    ]
  },
  { group: 'Spelling',
    items: [
      { id: 'spelling-setup',    label: 'Setup / choose round',   Component: SpellingSetupScene },
      { id: 'spelling-question', label: 'Session — question',    Component: SpellingQuestionScene },
      { id: 'spelling-correct',  label: 'Session — correct feedback', Component: SpellingCorrectScene },
      { id: 'spelling-wrong',    label: 'Session — wrong feedback',   Component: SpellingWrongScene },
      { id: 'spelling-summary',  label: 'Summary — page complete',    Component: SpellingSummaryScene },
      { id: 'word-bank',         label: 'Word bank',                   Component: WordBankScene },
    ]
  },
  { group: 'Game layer',
    items: [
      { id: 'monster-catch',  label: 'Monster catch — toast',   Component: MonsterCatchScene },
      { id: 'monster-evolve', label: 'Monster evolve — modal', Component: MonsterEvolveScene },
    ]
  },
];

const DEFAULT_SCENE = 'home';

function readStored(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : v;
  } catch (err) { return fallback; }
}

function writeStored(key, val) {
  try { localStorage.setItem(key, val); } catch (err) {}
}

function App() {
  const [sceneId, setSceneId] = useState(() => readStored('ks2.design.scene', DEFAULT_SCENE));
  const [theme, setTheme]     = useState(() => readStored('ks2.design.theme', 'light'));
  const [device, setDevice]   = useState(() => readStored('ks2.design.device', 'desktop'));

  useEffect(() => { writeStored('ks2.design.scene', sceneId); }, [sceneId]);
  useEffect(() => {
    writeStored('ks2.design.theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);
  useEffect(() => { writeStored('ks2.design.device', device); }, [device]);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');
  const flatScenes  = SCENES.flatMap(g => g.items);
  const current     = flatScenes.find(s => s.id === sceneId) || flatScenes[0];
  const Component   = current.Component;

  /* Per-scene navigation callbacks. Kept out of the render so new scene
     wirings can be added without touching the JSX. */
  const sceneExtras = {
    'spelling-setup': { onOpenWordBank: () => setSceneId('word-bank') },
    'word-bank':      { onBack:         () => setSceneId('spelling-setup') },
  };
  const extras = sceneExtras[current.id] || {};

  return (
    <div className="design-shell">
      <aside className="design-rail" aria-label="Scene picker">
        <h2>Codex Journal</h2>
        <p className="eyebrow">Redesign v1 · KS2 Mastery</p>

        {SCENES.map(group => (
          <React.Fragment key={group.group}>
            <div className="rail-group">{group.group}</div>
            {group.items.map(s => (
              <button
                key={s.id}
                type="button"
                className={'rail-item' + (s.id === sceneId ? ' active' : '')}
                onClick={() => setSceneId(s.id)}
              >
                <span className="dot" />
                {s.label}
              </button>
            ))}
          </React.Fragment>
        ))}

        <div style={{ marginTop: 'auto', paddingTop: 20, fontSize: '0.78rem', color: 'var(--subtle)', lineHeight: 1.5 }}>
          Design file for review.<br/>
          Tokens mirror <code>styles/app.css</code>. Monster assets reused from <code>/assets/monsters</code>.
        </div>
      </aside>

      <main className="design-canvas">
        <div className="design-toolbar">
          <div>
            <p className="eyebrow" style={{ margin: 0 }}>Scene</p>
            <h2 className="section-title" style={{ marginTop: 2 }}>{current.label}</h2>
          </div>
          <div className="tool-chip-row" style={{ gap: 12 }}>
            <span className="tool-label">Theme</span>
            <div className="seg">
              <button className={theme === 'light' ? 'on' : ''} onClick={() => setTheme('light')}>Light</button>
              <button className={theme === 'dark'  ? 'on' : ''} onClick={() => setTheme('dark')}>Dark</button>
            </div>
            <span className="tool-label" style={{ marginLeft: 6 }}>Device</span>
            <div className="seg">
              <button className={device === 'desktop' ? 'on' : ''} onClick={() => setDevice('desktop')}>Desktop</button>
              <button className={device === 'mobile'  ? 'on' : ''} onClick={() => setDevice('mobile')}>Mobile</button>
            </div>
          </div>
        </div>

        <DesignBrief />

        <div className={`device-frame ${device}`}>
          <div className="device-inner">
            <Component
              theme={theme}
              onToggleTheme={toggleTheme}
              device={device}
              {...extras}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

function DesignBrief() {
  return (
    <details className="brief">
      <summary>Design brief — why this looks like it does</summary>
      <p>
        <b>Concept — Codex Journal.</b> KS2 Mastery reads as a warm, book-like journal. The companion monster is part of the
        furniture, not a reward tacked on. Learning a word is a stop on a path; a round is a page turned.
      </p>
      <h4>What changes in the spelling flow</h4>
      <ul>
        <li><b>Progress = path dots, not a thin bar.</b> You can see every word in the round at a glance; the current one pulses.</li>
        <li><b>The input is the page.</b> No chromed card — a single underlined word line. When it’s your turn to type, chrome fades back.</li>
        <li><b>Feedback slides in as a ribbon.</b> The layout does not shift. No “Saved” state that replaces the card.</li>
        <li><b>Audio controls become icons.</b> Replay + slow replay are the same size and sit directly under the input. Keyboard hints are visible but quiet.</li>
        <li><b>Companion docks bottom-left.</b> Small, idle-floating. Reacts on feedback; never covers the input.</li>
      </ul>
      <h4>What changes on landing</h4>
      <ul>
        <li><b>Companion earns the hero.</b> The first thing you see is Scribbla, then “today’s round” as a single CTA.</li>
        <li><b>Codex is one click away, not on the home page.</b> "Open codex" sits under the hero CTA — the full codex lives on its own screen, the dashboard stays focused on today&rsquo;s round.</li>
        <li><b>Subjects as chapters.</b> Coloured banner + glyph; status chip on top, progress meter below. Placeholder subjects desaturate.</li>
      </ul>
      <h4>What stays the same</h4>
      <ul>
        <li>All <code>data-action</code> attribute names, so the existing event dispatcher still wires up.</li>
        <li>Token palette — warm off-white + warm dark (PR#11) unchanged, with two additional gradient surfaces.</li>
        <li>Monster asset paths, TTS endpoint, reduced-motion guard, 980px breakpoint semantics.</li>
        <li>Feature surface area: mode selection, cloze toggle, auto-play, round length, skip, end-early, drill, family words — all present.</li>
      </ul>
      <h4>Game layering without disrupting flow</h4>
      <ul>
        <li><b>Catch</b> → bottom-right toast, auto-dismiss. Does not interrupt typing.</li>
        <li><b>Evolution</b> → modal on return-to-dashboard (same as today, but framed as a transition, not a blocker).</li>
        <li><b>Mega</b> → full-screen (unchanged from current app).</li>
      </ul>
    </details>
  );
}

createRoot(document.getElementById('root')).render(<App />);
