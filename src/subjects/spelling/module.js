import { monsterSummaryFromSpellingAnalytics } from '../../platform/game/monster-system.js';
import { monsterAsset, monsterAssetSrcSet } from '../../platform/game/monsters.js';
import { escapeHtml, formatElapsedMinutes } from '../../platform/core/utils.js';
import { REGION_BACKGROUND_URLS } from '../../surfaces/home/data.js';
import { createInitialSpellingState } from './service-contract.js';
import {
  spellingSessionContextNote,
  spellingSessionInfoChips,
  spellingSessionInputPlaceholder,
  spellingSessionSubmitLabel,
  spellingSessionVoiceNote,
} from './session-ui.js';

const SPELLING_ACCENT = '#3E6FA8';
const DAY_MS = 24 * 60 * 60 * 1000;

function accentFor(subject) {
  return subject?.accent || SPELLING_ACCENT;
}

/* --------------------------------------------------------------
   Hero-bg picker
   Deterministic per learner so setup/session/summary share the
   same scribe-downs backdrop on a given day. Spread across the
   round so long rounds get visual variety.
   -------------------------------------------------------------- */
function stableHash(value) {
  const text = String(value || '');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function heroBgForLearner(learnerId) {
  if (!REGION_BACKGROUND_URLS.length) return '';
  const index = stableHash(`spelling:${learnerId}`) % REGION_BACKGROUND_URLS.length;
  return REGION_BACKGROUND_URLS[index];
}

function heroBgForSession(learnerId, session) {
  if (!REGION_BACKGROUND_URLS.length) return '';
  const total = Math.max(1, Number(session?.progress?.total) || 1);
  const done = Math.max(0, Number(session?.progress?.done) || 0);
  const offset = stableHash(`spelling:${learnerId}`) % REGION_BACKGROUND_URLS.length;
  const step = Math.min(REGION_BACKGROUND_URLS.length - 1,
    Math.floor((done / total) * REGION_BACKGROUND_URLS.length));
  return REGION_BACKGROUND_URLS[(offset + step) % REGION_BACKGROUND_URLS.length];
}

function heroBgStyle(url) {
  return url ? `--hero-bg: url('${escapeHtml(url)}');` : '';
}

/* --------------------------------------------------------------
   Shared helpers retained from the previous port (codex + utils)
   -------------------------------------------------------------- */
function summaryCards(cards = []) {
  return `
    <div class="stat-grid">
      ${cards.map((card) => `
        <div class="stat">
          <div class="stat-label">${escapeHtml(card.label)}</div>
          <div class="stat-value">${escapeHtml(card.value)}</div>
          <div class="stat-sub">${escapeHtml(card.sub || '')}</div>
        </div>
      `).join('')}
    </div>
  `;
}

/* --------------------------------------------------------------
   Word-bank helpers
   Status vocabulary translates production tokens to the v1 pill
   tokens ('new' → 'unseen', 'trouble' → 'weak') so the CSS pill
   palette from the design comp applies directly.
   -------------------------------------------------------------- */
function normaliseSearchText(value) {
  return String(value || '').trim().toLowerCase();
}

const WORD_BANK_STATUS_ORDER = ['due', 'trouble', 'learning', 'new', 'secure'];

/* Valid word bank filter IDs. Uses v1 tokens on the wire (unseen/weak) so the
   persisted transientUi value reads naturally and matches the filter chip
   label. wordBankFilterMatchesStatus() translates back to the production
   status vocabulary at render time. */
const WORD_BANK_FILTER_IDS = new Set(['all', 'due', 'weak', 'learning', 'secure', 'unseen']);

function wordBankFilterMatchesStatus(filter, status) {
  if (filter === 'all') return true;
  if (filter === 'weak') return status === 'trouble';
  if (filter === 'unseen') return status === 'new';
  return filter === status;
}

function wordProgressTone(status) {
  if (status === 'new') return 'new';
  if (status === 'learning') return 'learning';
  if (status === 'secure') return 'good';
  if (status === 'due') return 'warn';
  if (status === 'trouble') return 'bad';
  return 'neutral';
}

function wordStatusLabel(status) {
  const labels = {
    new: 'New',
    learning: 'Learning',
    due: 'Due',
    secure: 'Secure',
    trouble: 'Trouble',
  };
  return labels[status] || 'Learning';
}

function wordBankPillClass(status) {
  /* Maps production status → v1 pill token used by .wb-pill.{token}. */
  if (status === 'new') return 'unseen';
  if (status === 'trouble') return 'weak';
  return status;
}

function wordMatchesSearch(word, query) {
  if (!query) return true;
  const fields = [
    word.slug,
    word.word,
    word.family,
    word.yearLabel,
    word.explanation,
    ...(Array.isArray(word.familyWords) ? word.familyWords : []),
  ].map(normaliseSearchText);
  return fields.some((field) => field.includes(query));
}

function accuracyPercent(progress) {
  const attempts = Math.max(0, Number(progress?.attempts) || 0);
  const correct = Math.max(0, Number(progress?.correct) || 0);
  if (!attempts) return null;
  return Math.round((correct / attempts) * 100);
}

function dueLabel(progress) {
  if (!progress) return 'Unseen';
  const attempts = Math.max(0, Number(progress.attempts) || 0);
  if (!attempts) return 'Unseen';
  const dueDay = Number(progress.dueDay);
  if (!Number.isFinite(dueDay)) return 'Unseen';
  const daysUntilDue = Math.floor(dueDay - Math.floor(Date.now() / DAY_MS));
  if (daysUntilDue <= 0) return 'Today';
  if (daysUntilDue === 1) return 'In 1 day';
  return `In ${daysUntilDue} days`;
}

/* --------------------------------------------------------------
   Inline icons
   Kept tiny so the template string stays readable. Shared across
   session + setup + summary.
   -------------------------------------------------------------- */
const ICON_ARROW_RIGHT = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`;
const ICON_CHECK = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12l6 6 10-14"/></svg>`;
const ICON_SPEAKER = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4Z" fill="currentColor" fill-opacity="0.12"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>`;
const ICON_SPEAKER_SLOW = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4Z" fill="currentColor" fill-opacity="0.12"/><path d="M15.5 10a3 3 0 0 1 0 4"/><text x="15.5" y="20" font-size="5.5" font-family="Inter,system-ui" font-weight="800" fill="currentColor" stroke="none">0.5x</text></svg>`;
const ICON_SEARCH = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>`;

/* --------------------------------------------------------------
   Path progress (session head dots)
   Caps visible dots at 20. Each dot represents multiple
   questions when the total exceeds the cap.
   -------------------------------------------------------------- */
function renderPathProgress({ done, current, total }) {
  const safeTotal = Math.max(1, Number(total) || 1);
  const display = Math.min(safeTotal, 20);
  const perDot = safeTotal / display;
  const dots = [];
  for (let i = 0; i < display; i += 1) {
    const start = i * perDot;
    const end = (i + 1) * perDot;
    let cls = 'path-step';
    if (end <= done) cls += ' done';
    else if (current >= start && current < end) cls += ' current';
    dots.push(`<span class="${cls}"></span>`);
  }
  return `<div class="path" aria-label="Word ${Math.min(safeTotal, current + 1)} of ${safeTotal}">${dots.join('')}</div>`;
}

/* --------------------------------------------------------------
   Cloze renderer — splits on the ________ blank sentinel and wraps
   the missing word with a .blank span (or the exact answer chip on
   the correct-feedback variant).
   -------------------------------------------------------------- */
function renderCloze(sentence, { answer = '', revealAnswer = false } = {}) {
  const raw = String(sentence || '');
  if (!raw.includes('________')) {
    return `<div class="cloze">${escapeHtml(raw)}</div>`;
  }
  const [lead, tail = ''] = raw.split('________');
  const inside = revealAnswer && answer
    ? escapeHtml(answer)
    : '&nbsp;';
  return `<div class="cloze">${escapeHtml(lead)}<span class="blank">${inside}</span>${escapeHtml(tail)}</div>`;
}

/* --------------------------------------------------------------
   Drill cloze builder — word-bank sentences are stored as natural
   prose (no ________ sentinel), so for the drill we must synthesise
   a blanked variant by replacing the target word with the sentinel
   before handing off to renderCloze. Uses a word-boundary, case-
   insensitive regex so "flight" in "flight." matches without
   clipping punctuation. If the target word does not appear in the
   sentence (e.g. the word-bank entry uses a close inflection), fall
   back to a synthetic cloze that renders just the blank — better a
   missing context than a leaked answer.
   -------------------------------------------------------------- */
function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildDrillCloze(sentence, word) {
  const raw = String(sentence || '');
  const target = String(word?.word || '').trim();
  if (!target) return raw;
  if (raw.includes('________')) return raw;
  const pattern = new RegExp(`\\b${escapeRegExp(target)}\\b`, 'i');
  if (pattern.test(raw)) {
    return raw.replace(pattern, '________');
  }
  /* No occurrence — give the learner just the blank so the answer
     never leaks into the prompt. */
  return '________';
}

/* --------------------------------------------------------------
   Setup scene (practice tab dashboard)
   Translates v1 scenes.jsx:144 into server-rendered markup while
   preserving every production data-action binding and the
   "Round setup" H2 that smoke.test.js pins.
   -------------------------------------------------------------- */
const MODE_CARDS = [
  { id: 'smart', icon: '◎', title: 'Smart Review', desc: 'Due · weak · one fresh word.' },
  { id: 'trouble', icon: '⚡', title: 'Trouble Drill', desc: 'Only the words you usually miss.' },
  { id: 'test', icon: '⌒', title: 'SATs Test', desc: 'One-shot dictation, no retries.' },
];

const ROUND_LENGTH_OPTIONS = ['10', '20', '40'];
const YEAR_FILTER_OPTIONS = [
  { value: 'y3-4', label: 'Y3-4' },
  { value: 'y5-6', label: 'Y5-6' },
  { value: 'all', label: 'All' },
];

function beginLabel(prefs) {
  if (prefs.mode === 'test') return 'Begin SATs test';
  if (prefs.mode === 'trouble') return 'Begin trouble drill';
  const length = prefs.roundLength || '10';
  return `Begin ${length} words`;
}

/* Mode card — plain button so the visual card chrome is the only affordance.
   The `value` attribute is read by the generic click dispatcher in main.js as
   `data.value`, which `spelling-set-mode` consumes verbatim. `aria-pressed`
   doubles up with the `.selected` class so assistive tech hears the selection
   without needing a radiogroup wrapper.

   When `disabled` is true the card is taken out of the tab order and the
   engine never sees a click (native button `disabled` suppresses the event),
   which stops Trouble Drill from silently swapping to Smart Review when
   there are no trouble words yet. `description` overrides the default card
   copy; `badge` renders the existing `.mc-badge` pill in the top-right. */
function renderModeCard(mode, selected, { disabled = false, description, badge } = {}) {
  const desc = description != null ? description : mode.desc;
  const classes = ['mode-card'];
  if (selected && !disabled) classes.push('selected');
  if (disabled) classes.push('is-disabled');
  const disabledAttrs = disabled ? ' disabled aria-disabled="true"' : '';
  return `
    <button type="button" class="${classes.join(' ')}" data-action="spelling-set-mode" value="${escapeHtml(mode.id)}" aria-pressed="${selected && !disabled ? 'true' : 'false'}"${disabledAttrs}>
      ${badge ? `<span class="mc-badge">${escapeHtml(badge)}</span>` : ''}
      <div class="mc-icon">${escapeHtml(mode.icon)}</div>
      <h4>${escapeHtml(mode.title)}</h4>
      <p>${escapeHtml(desc)}</p>
    </button>
  `;
}

function renderLengthPicker(prefs) {
  const options = ROUND_LENGTH_OPTIONS.map((value) => {
    const selected = prefs.roundLength === value;
    return `
      <button type="button" role="radio" aria-checked="${selected ? 'true' : 'false'}" class="length-option${selected ? ' selected' : ''}" data-action="spelling-set-pref" data-pref="roundLength" value="${escapeHtml(value)}">
        <span>${escapeHtml(value)}</span>
      </button>
    `;
  }).join('');
  return `
    <div class="length-picker" role="radiogroup" aria-label="Round length">
      ${options}
      <span class="length-unit">words</span>
    </div>
  `;
}

/* Segmented year picker — same visual vocabulary as the length picker so the
   setup scene reads as a single row of related choices. Reuses `.length-picker`
   / `.length-option` tokens; no new CSS needed. */
function renderYearPicker(prefs) {
  const options = YEAR_FILTER_OPTIONS.map(({ value, label }) => {
    const selected = (prefs.yearFilter || 'all') === value;
    return `
      <button type="button" role="radio" aria-checked="${selected ? 'true' : 'false'}" class="length-option${selected ? ' selected' : ''}" data-action="spelling-set-pref" data-pref="yearFilter" value="${escapeHtml(value)}">
        <span>${escapeHtml(label)}</span>
      </button>
    `;
  }).join('');
  return `
    <div class="length-picker" role="radiogroup" aria-label="Year group">
      ${options}
    </div>
  `;
}

function renderToggleChip(pref, checked, label) {
  return `
    <button type="button" class="toggle-chip${checked ? ' on' : ''}" aria-pressed="${checked ? 'true' : 'false'}" data-action="spelling-toggle-pref" data-pref="${escapeHtml(pref)}">
      <span class="box" aria-hidden="true">${checked ? ICON_CHECK : ''}</span>
      ${escapeHtml(label)}
    </button>
  `;
}

/* Compact caught-only strip for the "Where you stand" side card. Mirrors the
   v1 design exactly: up to three static portraits with the shared ss-breathe
   floating animation (driven by styles/app.css). Stage-0 entries show as eggs
   via the `.egg` modifier. Uncaught companions are omitted entirely so the
   meadow reads as a celebration of progress rather than a status list. */
function renderSSMeadow(codex) {
  const caught = (Array.isArray(codex) ? codex : []).filter((entry) => entry?.progress?.caught);
  const shown = caught.slice(0, 3);
  if (!shown.length) {
    return '<div class="ss-meadow-empty small muted">Catch your first monster to populate this meadow.</div>';
  }
  return `
    <div class="ss-meadow" aria-label="${shown.length} caught monster${shown.length === 1 ? '' : 's'}">
      ${shown.map(({ monster, progress }) => `
        <div class="ss-meadow-cell${progress.stage === 0 ? ' egg' : ''}">
          <img alt="" src="${escapeHtml(monsterAsset(monster.id, progress.stage, 320, progress.branch))}" srcset="${escapeHtml(monsterAssetSrcSet(monster.id, progress.stage, progress.branch))}" sizes="min(30vw, 120px)" />
        </div>
      `).join('')}
    </div>
  `;
}

function renderSSStatGrid(stats) {
  const cells = [
    { label: 'Total spellings', value: stats.total },
    { label: 'Secure', value: stats.secure },
    { label: 'Due today', value: stats.due, warn: true },
    { label: 'Weak spots', value: stats.trouble },
    { label: 'Unseen', value: stats.fresh },
    { label: 'Accuracy', value: stats.accuracy == null ? '—' : `${stats.accuracy}%` },
  ];
  return `
    <div class="ss-stat-grid">
      ${cells.map((cell) => `
        <div class="ss-stat">
          <div class="ss-stat-label">${escapeHtml(cell.label)}</div>
          <div class="ss-stat-value"${cell.warn ? ' style="color:var(--warn-strong);"' : ''}>${escapeHtml(cell.value)}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderPracticeDashboard({ learner, service, subject, repositories }) {
  const accent = accentFor(subject);
  const prefs = service.getPrefs(learner.id);
  const stats = service.getStats(learner.id, prefs.yearFilter);
  const codex = monsterSummaryFromSpellingAnalytics(service.getAnalyticsSnapshot(learner.id), {
    learnerId: learner.id,
    gameStateRepository: repositories?.gameState,
    persistBranches: false,
  });
  const heroBg = heroBgForLearner(learner.id);
  const begin = beginLabel(prefs);
  /* SATs Test is a one-shot dictation, so the round length and year filter both
     lose their meaning — the engine forces the full list at a fixed length. We
     keep the rows in the DOM but hide them with `.is-placeholder` so the hero
     keeps its exact height (visibility:hidden preserves layout). */
  const hideTweaks = prefs.mode === 'test';
  const tweakMod = hideTweaks ? ' is-placeholder' : '';
  const tweakAria = hideTweaks ? ' aria-hidden="true"' : '';
  return `
    <div class="setup-grid" style="grid-column:1/-1;">
      <section class="setup-main" style="${heroBgStyle(heroBg)}">
        <div class="hero-art pan" aria-hidden="true"></div>
        <div class="setup-content">
          <p class="eyebrow">Round setup</p>
          <h1 class="title">Choose today’s journey.</h1>
          <p class="lede">Smart Review mixes what’s due, what wobbled last time, and one or two new words. You can go straight to trouble drills or SATs rehearsal if you’d rather.</p>
          <div class="mode-row">
            ${MODE_CARDS.map((mode) => {
              if (mode.id === 'trouble' && !stats.trouble) {
                return renderModeCard(mode, prefs.mode === mode.id, {
                  disabled: true,
                  description: 'No trouble words yet — come back after a round.',
                  badge: 'NONE YET',
                });
              }
              return renderModeCard(mode, prefs.mode === mode.id);
            }).join('')}
          </div>
          <div class="tweak-row${tweakMod}"${tweakAria}>
            <span class="tool-label">Round length</span>
            ${renderLengthPicker(prefs)}
          </div>
          <div class="tweak-row${tweakMod}"${tweakAria}>
            <span class="tool-label">Year group</span>
            ${renderYearPicker(prefs)}
          </div>
          <div class="tweak-row">
            <span class="tool-label">Options</span>
            ${renderToggleChip('showCloze', Boolean(prefs.showCloze), 'Show sentence')}
            ${renderToggleChip('autoSpeak', Boolean(prefs.autoSpeak), 'Auto-play audio')}
          </div>
          <div class="setup-begin-row">
            <button type="button" class="btn primary xl" style="--btn-accent:${accent};" data-action="spelling-start">
              ${escapeHtml(begin)} ${ICON_ARROW_RIGHT}
            </button>
          </div>
        </div>
      </section>

      <aside class="setup-side">
        <div class="ss-card">
          <div class="ss-head">
            <p class="eyebrow">Where you stand</p>
            <button type="button" class="ss-codex-link" data-action="open-codex" aria-label="Open the full codex">
              Open codex →
            </button>
          </div>
          ${renderSSMeadow(codex)}
          ${renderSSStatGrid(stats)}
          <button type="button" class="ss-bank-link" data-action="spelling-open-word-bank">
            <span class="ss-bank-link-body">
              <span class="ss-bank-link-head">Browse the word bank</span>
              <span class="ss-bank-link-sub">Every word ${escapeHtml(learner.name)} is learning, with progress and difficulty.</span>
            </span>
            <span class="ss-bank-link-arrow" aria-hidden="true">→</span>
          </button>
        </div>
      </aside>
    </div>
  `;
}

/* --------------------------------------------------------------
   Session scene (live spelling round)
   Keeps the production <form data-action="spelling-submit-form">
   wrapper so Enter + button both route through the same handler
   and `data.formData.get('typed')` keeps working.
   -------------------------------------------------------------- */
function renderRibbon({ tone, icon, headline, word, sub }) {
  return `
    <div class="ribbon ${tone}" role="status">
      <div class="ribbon-ic">${icon || ''}</div>
      <div class="ribbon-body">
        ${headline ? `<b>${escapeHtml(headline)}</b>` : ''}
        ${word ? `<span class="word">“${escapeHtml(word)}”</span>` : ''}
        ${sub ? `<div class="sub">${escapeHtml(sub)}</div>` : ''}
      </div>
    </div>
  `;
}

/* Single family-chip renderer shared by the in-session feedback slot and the
   word-detail modal. The default `label` ("Word family") renders an inline
   `<span class="flabel">` and hides when the list has one or fewer entries
   (no family to show). Callers that supply a custom `label` get a chip row
   that renders even for single-entry lists — the modal wraps this in its own
   `wb-modal-section` so the label is rendered by the surrounding markup. */
function renderFamilyChips(words, { label = 'Word family', requireMultiple = true } = {}) {
  const list = Array.isArray(words) ? words.filter(Boolean) : [];
  if (requireMultiple && list.length <= 1) return '';
  if (!list.length) return '';
  return `
    <div class="family-chips">
      ${label ? `<span class="flabel">${escapeHtml(label)}</span>` : ''}
      ${list.map((word) => `<span class="fchip">${escapeHtml(word)}</span>`).join('')}
    </div>
  `;
}

function feedbackTone(kind) {
  /* Engine emits 'info' for most mid-round correct outcomes ("Locked in.",
     "Good recovery.", "Correct now.") — those are positive signals, so they
     must render as the green 'good' ribbon. Only 'error' flips to the red
     'bad' tone, and 'warn' is reserved for genuine advisory states (e.g.
     retry prompts). */
  if (kind === 'error') return 'bad';
  if (kind === 'warn') return 'warn';
  return 'good';
}

function feedbackIconFor(tone) {
  if (tone === 'good') return ICON_CHECK;
  if (tone === 'warn') return '!';
  return '×';
}

function renderFeedbackSlot(feedback) {
  if (!feedback) {
    /* Placeholder keeps the prompt-card total height stable between the
       question variant and the post-submit variants. The slot reuses the
       real ribbon shape (non-breaking space body) so the reserved pixels
       match the live ribbon exactly, but CSS (`visibility: hidden`) and
       aria-hidden keep it out of sight and out of assistive tech. */
    return `
      <div class="feedback-slot is-placeholder" aria-hidden="true">
        <div class="ribbon good" role="presentation">
          <div class="ribbon-ic">&nbsp;</div>
          <div class="ribbon-body"><b>&nbsp;</b><div class="sub">&nbsp;</div></div>
        </div>
      </div>
    `;
  }
  const tone = feedbackTone(feedback.kind);
  return `
    <div class="feedback-slot">
      ${renderRibbon({
        tone,
        icon: feedbackIconFor(tone),
        headline: feedback.headline || '',
        word: feedback.answer || '',
        sub: feedback.body || '',
      })}
      ${feedback.footer ? `<p class="feedback-foot small muted">${escapeHtml(feedback.footer)}</p>` : ''}
      ${renderFamilyChips(feedback.familyWords)}
    </div>
  `;
}

function renderSession({ learner, service, ui, subject }) {
  const accent = accentFor(subject);
  const prefs = service.getPrefs(learner.id);
  const session = ui.session;
  const card = session?.currentCard;
  const showCloze = prefs.showCloze && session?.type !== 'test';
  const awaitingAdvance = Boolean(ui.awaitingAdvance);
  const submitLabel = spellingSessionSubmitLabel(session, awaitingAdvance);
  const inputPlaceholder = spellingSessionInputPlaceholder(session);
  const contextNote = spellingSessionContextNote(session);
  const voiceNote = spellingSessionVoiceNote();
  const infoChips = spellingSessionInfoChips(session);
  if (!session || !card || !card.word) {
    return `
      <section class="card" style="grid-column:1/-1;">
        <div class="eyebrow">No active session</div>
        <h2 class="section-title">Start a spelling round</h2>
        <button class="btn primary" style="--btn-accent:${accent};" data-action="spelling-back">Back to spelling dashboard</button>
      </section>
    `;
  }

  const progressTotal = session.progress.total;
  const done = session.progress.done;
  const progressCurrent = progressTotal <= 0 ? 0 : Math.min(progressTotal, done + 1);
  const pathDone = Math.min(progressTotal, done);
  const pathCurrent = Math.min(Math.max(progressCurrent - 1, 0), progressTotal);
  const heroBg = heroBgForSession(learner.id, session);
  const showingCorrection = session.phase === 'correction';

  /* Correction phase reveals the correct answer inline inside the cloze. Other
     phases keep the blank empty so the learner has to recall the word. */
  const clozeHtml = showCloze
    ? renderCloze(card.prompt?.cloze, {
        answer: showingCorrection ? card.word.word : '',
        revealAnswer: showingCorrection,
      })
    : `<div class="cloze muted"><span class="blank">&nbsp;</span></div>`;

  const promptInstr = session.type === 'test'
    ? 'Type the word dictated by the audio.'
    : 'Spell the word you hear.';

  const audioRow = `
    <div class="audio-row">
      <button type="button" class="btn icon lg" aria-label="Replay the dictated word" data-action="spelling-replay">${ICON_SPEAKER}</button>
      <button type="button" class="btn icon lg" aria-label="Replay slowly" data-action="spelling-replay-slow">${ICON_SPEAKER_SLOW}</button>
    </div>
  `;

  const skipBtn = session.type !== 'test' && !awaitingAdvance && session.phase === 'question'
    ? '<button class="btn ghost lg" type="button" data-action="spelling-skip">Skip for now</button>'
    : '';

  const continueBtn = awaitingAdvance
    ? `<button class="btn good lg" type="button" data-action="spelling-continue">Continue ${ICON_ARROW_RIGHT}</button>`
    : '';

  return `
    <div class="spelling-in-session" style="grid-column:1/-1; ${heroBgStyle(heroBg)}">
      <div class="session">
        <header class="session-head">
          ${renderPathProgress({ done: pathDone, current: pathCurrent, total: progressTotal })}
          <span class="path-count">Word ${progressCurrent} of ${progressTotal}</span>
        </header>

        <div class="prompt-card">
          ${infoChips.length ? `
            <div class="info-chip-row">
              ${infoChips.map((value) => `<span class="chip">${escapeHtml(value)}</span>`).join('')}
            </div>
          ` : ''}
          <div class="prompt-instr">${escapeHtml(promptInstr)}</div>
          ${clozeHtml}
          ${!showCloze ? `<p class="prompt-sentence muted">${escapeHtml(contextNote)}</p>` : ''}

          <form data-action="spelling-submit-form" class="session-form">
            <div class="word-input-wrap">
              <input class="word-input" name="typed" data-autofocus="true" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="${escapeHtml(inputPlaceholder)}" aria-label="Type the spelling" ${awaitingAdvance ? 'disabled' : ''} />
            </div>
            ${audioRow}
            <div class="action-row">
              <button class="btn primary lg" style="--btn-accent:${accent};" type="submit" ${awaitingAdvance ? 'disabled' : ''}>
                ${escapeHtml(submitLabel)}${awaitingAdvance ? '' : ` ${ICON_ARROW_RIGHT}`}
              </button>
              ${continueBtn}
              ${skipBtn}
            </div>
          </form>

          ${renderFeedbackSlot(ui.feedback)}
        </div>

        <footer class="session-footer">
          <div class="session-footer-left">
            <div class="keys-hint">
              <kbd>Esc</kbd> replay · <kbd>⇧</kbd>+<kbd>Esc</kbd> slow · <kbd>Alt</kbd>+<kbd>S</kbd> skip · <kbd>Enter</kbd> submit
            </div>
            <div class="voice-note small muted">${escapeHtml(voiceNote)}</div>
          </div>
          <div class="session-footer-right">
            <button class="btn sm bad" type="button" data-action="spelling-end-early">End round early</button>
          </div>
        </footer>
      </div>
    </div>
  `;
}

/* --------------------------------------------------------------
   Summary scene (round complete)
   Builds the 4-up stat strip directly from the engine's
   summary.cards (deterministic; don't re-compute anything here).
   The design renders only the headline value + label per cell —
   no sub-copy — so the grid stays compact under the ribbon.
   -------------------------------------------------------------- */
function renderSummaryStatGrid(cards = []) {
  return `
    <div class="summary-stats">
      ${cards.map((card) => `
        <div class="summary-stat">
          <div class="v">${escapeHtml(card.value)}</div>
          <div class="l">${escapeHtml(card.label)}</div>
        </div>
      `).join('')}
    </div>
  `;
}

/* Human-readable label for the round's mode token. Mirrors the chooser
   labels in the dashboard and the design comp ("Smart Review" / "Trouble
   Drill" / "SATs Test"). */
function summaryModeLabel(mode) {
  if (mode === 'trouble') return 'Trouble Drill';
  if (mode === 'test') return 'SATs Test';
  if (mode === 'single') return 'Single-word Drill';
  return 'Smart Review';
}

/* Pick the punchy "X of N words landed." headline when we have usable
   totals; otherwise fall back to the engine's prose message so nothing
   regresses for edge cases (e.g. zero-word rounds, legacy summaries). */
function summaryHeadline(summary) {
  if (summary.totalWords > 0 && typeof summary.correct === 'number') {
    return `${summary.correct} of ${summary.totalWords} words landed.`;
  }
  return summary.message;
}

function renderSummary({ learner, ui, subject }) {
  const accent = accentFor(subject);
  const summary = ui.summary;
  if (!summary) return '';
  /* Hero continuity: advance the backdrop as if the learner finished every
     word in the round, so the summary matches the last question's scene
     rather than resetting to the learner's default. Falls back to a
     single-word virtual progress when the round was empty so the helper
     never divides by zero. Contract exposes totalWords / correct /
     accuracy on the normalised summary so the renderer just reads them. */
  const progressTotal = Math.max(1, summary.totalWords || 1);
  const heroBg = heroBgForSession(learner.id, {
    progress: { done: progressTotal, total: progressTotal },
  });
  const toneGood = !summary.mistakes.length;
  const headline = summaryHeadline(summary);
  const modeLabel = summaryModeLabel(summary.mode);
  const durationLabel = formatElapsedMinutes(summary.elapsedMs);
  const accuracyLabel = typeof summary.accuracy === 'number'
    ? `${summary.accuracy}% accuracy`
    : '';
  const subParts = [modeLabel, durationLabel];
  if (accuracyLabel) subParts.push(accuracyLabel);
  const ribbonSub = subParts.join(' · ');
  return `
    <div class="spelling-in-session summary-shell" style="grid-column:1/-1; ${heroBgStyle(heroBg)}">
      <div class="session summary">
        <header class="session-head">
          ${renderPathProgress({ done: progressTotal, current: progressTotal, total: progressTotal })}
          <span class="path-count">Round complete</span>
        </header>

        <div class="prompt-card summary-card">
          <h3 class="summary-title sr-only">Session summary</h3>
          ${renderRibbon({
            tone: toneGood ? 'good' : 'warn',
            icon: toneGood ? ICON_CHECK : '!',
            headline,
            sub: ribbonSub,
          })}

          ${renderSummaryStatGrid(summary.cards)}

          ${summary.mistakes.length ? `
            <div class="summary-drill">
              <div class="summary-drill-head">
                <h4>Words that need another go</h4>
                <span class="small muted">A quick drill cycles each of these again before you close the round.</span>
              </div>
              <div class="summary-drill-chips">
                ${summary.mistakes.map((word) => `
                  <button type="button" class="fchip" data-action="spelling-drill-single" data-slug="${escapeHtml(word.slug)}">${escapeHtml(word.word)}</button>
                `).join('')}
                <button type="button" class="btn primary sm" data-action="spelling-drill-all">Drill all ${summary.mistakes.length} ${ICON_ARROW_RIGHT}</button>
              </div>
            </div>
          ` : ''}

          <div class="summary-actions">
            <button type="button" class="btn ghost lg" data-action="spelling-back">Back to dashboard</button>
            <button type="button" class="btn primary lg" style="--btn-accent:${accent};" data-action="spelling-start-again">Start another round ${ICON_ARROW_RIGHT}</button>
            <button type="button" class="summary-bank-link" data-action="spelling-open-word-bank">
              Open word bank ${ICON_ARROW_RIGHT}
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

/* --------------------------------------------------------------
   Word bank (analytics tab)
   The status filter chips translate production tokens to the v1
   visual language ("weak" for trouble, "unseen" for new) on the
   pill element, while keeping production status names on the
   underlying data-action button so test pins stay valid.
   -------------------------------------------------------------- */
function renderWordBankFilterChips({ counts, activeFilter }) {
  /* v1-style filter tabs. Each chip is a real button wired to the
     spelling-analytics-status-filter dispatch so a click updates the
     transientUi state and re-renders the list. The count pill next to
     the label mirrors the approved design. */
  const chips = [
    { id: 'all', label: 'All' },
    { id: 'due', label: 'Due' },
    { id: 'weak', label: 'Weak' },
    { id: 'learning', label: 'Learning' },
    { id: 'secure', label: 'Secure' },
    { id: 'unseen', label: 'Unseen' },
  ];
  /* Chips are button-role filters, not WAI-ARIA tabs — there's no companion
     tabpanel, and the design (designs/ks2-redesign-v1.html) treats them as
     pressable segmented controls. `aria-pressed` communicates the active
     state to assistive tech without the broken tab contract. */
  return `
    <div class="wb-chips" role="group" aria-label="Filter word bank by status">
      ${chips.map((chip) => {
        const active = chip.id === activeFilter;
        const count = counts[chip.id] ?? 0;
        return `
          <button
            type="button"
            aria-pressed="${active ? 'true' : 'false'}"
            class="wb-chip${active ? ' on' : ''}"
            data-action="spelling-analytics-status-filter"
            data-value="${escapeHtml(chip.id)}"
          >
            <span class="wb-chip-label">${escapeHtml(chip.label)}</span>
            <span class="wb-chip-count">${count}</span>
          </button>
        `;
      }).join('')}
    </div>
  `;
}

function countWordBankStatus(words, status) {
  return words.reduce((count, word) => count + (word.status === status ? 1 : 0), 0);
}

function sortWordBank(words) {
  return words.slice().sort((a, b) => {
    const pa = WORD_BANK_STATUS_ORDER.indexOf(a.status);
    const pb = WORD_BANK_STATUS_ORDER.indexOf(b.status);
    const rankA = pa === -1 ? 99 : pa;
    const rankB = pb === -1 ? 99 : pb;
    if (rankA !== rankB) return rankA - rankB;
    return String(a.word).localeCompare(String(b.word));
  });
}

function renderWordBankRow(word) {
  const pillToken = wordBankPillClass(word.status);
  const statusLabel = wordStatusLabel(word.status);
  const accuracy = accuracyPercent(word.progress);
  const due = dueLabel(word.progress);
  const attempts = Math.max(0, Number(word.progress?.attempts) || 0);
  const openExplainLabel = `Open ${word.word} · ${statusLabel}`;
  const openDrillLabel = `Drill ${word.word} — practice only`;
  /* The whole row is a button that opens the modal in explain mode. The inner
     arrow button (the "wb-action" chip on the right) jumps straight to drill
     mode. `closest('[data-action]')` in the central dispatcher correctly picks
     the inner button on arrow click and the outer row otherwise. */
  return `
    <li class="wb-row" role="button" tabindex="0" data-status="${escapeHtml(pillToken)}" data-action="spelling-word-detail-open" data-slug="${escapeHtml(word.slug)}" data-value="explain" aria-label="${escapeHtml(openExplainLabel)}">
      <div class="wb-cell-word">
        <span class="wb-word">${escapeHtml(word.word)}</span>
        <span class="wb-pill ${escapeHtml(pillToken)}">${escapeHtml(statusLabel)}</span>
      </div>
      <div class="wb-cell-meta">
        <span class="wb-meta"><span class="wb-meta-label">Accuracy</span><span class="wb-meta-value">${accuracy == null ? '—' : `${accuracy}%`}</span></span>
        <span class="wb-meta"><span class="wb-meta-label">Next due</span><span class="wb-meta-value">${escapeHtml(due)}</span></span>
        <span class="wb-meta"><span class="wb-meta-label">Attempts</span><span class="wb-meta-value">${attempts}</span></span>
      </div>
      <button type="button" class="wb-action" data-action="spelling-word-detail-open" data-slug="${escapeHtml(word.slug)}" data-value="drill" aria-label="${escapeHtml(openDrillLabel)}">
        <span class="wb-action-label">Drill</span>
        ${ICON_ARROW_RIGHT}
      </button>
    </li>
  `;
}

function renderWordBank({ learner, analytics, searchQuery = '', statusFilter = 'all' }) {
  const query = normaliseSearchText(searchQuery);
  const activeFilter = WORD_BANK_FILTER_IDS.has(statusFilter) ? statusFilter : 'all';
  const groups = Array.isArray(analytics.wordGroups) ? analytics.wordGroups : [];
  const allWords = groups.flatMap((group) => Array.isArray(group.words) ? group.words : []);

  /* Apply status filter first, then search. Order matters because the status
     count pills on the filter tabs always reflect the unfiltered totals; only
     the list rows respect the combined filter+search. */
  const statusMatched = allWords.filter((word) => wordBankFilterMatchesStatus(activeFilter, word.status));
  const visibleWords = sortWordBank(statusMatched.filter((word) => wordMatchesSearch(word, query)));

  const counts = {
    all: allWords.length,
    due: countWordBankStatus(allWords, 'due'),
    weak: countWordBankStatus(allWords, 'trouble'),
    learning: countWordBankStatus(allWords, 'learning'),
    secure: countWordBankStatus(allWords, 'secure'),
    unseen: countWordBankStatus(allWords, 'new'),
  };

  const rows = visibleWords.length
    ? visibleWords.map(renderWordBankRow).join('')
    : '<li class="wb-empty">No words match your search.</li>';

  /* v1 lede format: "{total} words tracked — {secure} secure, {due} due today,
     {weak} weak spots." Switches to the search-narrow variant when the
     learner has typed a query so the line stays informative instead of
     stale. */
  const totalWords = allWords.length;
  const ledeBase = `${totalWords} word${totalWords === 1 ? '' : 's'} tracked — ${counts.secure} secure, ${counts.due} due today, ${counts.weak} weak spots.`;
  const ledeSearch = query
    ? ` Showing ${visibleWords.length} match${visibleWords.length === 1 ? '' : 'es'} for "${escapeHtml(searchQuery)}".`
    : '';
  const footText = `Showing ${visibleWords.length} of ${totalWords} tracked spellings.`;
  const learnerName = learner?.name ? `${learner.name}’s` : 'Learner';

  return `
    <section class="word-bank-card">
      <div class="wb-card">
        <header class="wb-head">
          <p class="eyebrow">Word bank progress</p>
          <h1 class="title">${escapeHtml(learnerName)} word bank</h1>
          <p class="lede">${escapeHtml(ledeBase)}${ledeSearch} Tap any word to open the explainer or jump straight to a drill.</p>
        </header>

        <div class="wb-toolbar">
          <label class="wb-search">
            <span class="wb-search-icon" aria-hidden="true">${ICON_SEARCH}</span>
            <input type="search" name="spellingAnalyticsSearch" autocomplete="off" placeholder="Search words…" value="${escapeHtml(searchQuery)}" data-action="spelling-analytics-search" aria-label="Search word bank" />
          </label>
          ${renderWordBankFilterChips({ counts, activeFilter })}
        </div>

        <ul class="wb-list">
          ${rows}
        </ul>

        <div class="wb-foot small muted">${escapeHtml(footText)}</div>
      </div>
    </section>
  `;
}

/* --------------------------------------------------------------
   Word-detail modal
   Opened from the word bank row (explain mode) or the row-arrow
   button (drill mode). The drill is entirely self-contained: no
   engine mutation, just a local string comparison against the
   target word. This keeps "browse" and "practise" conceptually
   separate from the scheduled-session flow.
   -------------------------------------------------------------- */
function renderWordDetailExplain(word) {
  const sentence = (word.sentence || '').replace(/________/g, word.word);
  const explanation = word.explanation || '';
  return `
    <div class="wb-modal-body">
      <div class="wb-modal-section">
        <p class="wb-modal-section-label">What it means</p>
        ${explanation
          ? `<p class="wb-modal-def">${escapeHtml(explanation)}</p>`
          : '<p class="wb-modal-def">No meaning note on file for this word yet.</p>'}
      </div>
      <div class="wb-modal-section">
        <p class="wb-modal-section-label">Example sentence</p>
        ${sentence
          ? `<blockquote class="wb-modal-sample">${escapeHtml(sentence)}</blockquote>`
          : '<p class="wb-modal-def">No example sentence on file for this word yet.</p>'}
      </div>
    </div>
  `;
}

function renderWordDetailDrill(word, { typed = '', result = null, accent = SPELLING_ACCENT }) {
  const sentence = word.sentence || '';
  /* Word-bank sentences arrive in natural form (no ________ sentinel),
     so synthesise a drill-friendly cloze that hides the target word.
     This replaces the previous call chain that let the raw sentence
     reach renderCloze's no-blank branch and leak the answer verbatim. */
  const drillCloze = sentence ? buildDrillCloze(sentence, word) : '';
  const showFeedback = result === 'correct' || result === 'incorrect';
  const feedbackTone = result === 'correct' ? 'good' : 'warn';
  const inputState = result === 'correct' ? 'is-correct' : result === 'incorrect' ? 'is-wrong' : '';
  const feedbackBody = result === 'correct'
    ? `<span class="wb-drill-feedback-icon" aria-hidden="true">✓</span><div><b>Nice — "${escapeHtml(word.word)}" is spot on.</b> Browse on, or try another word.</div>`
    : `<span class="wb-drill-feedback-icon" aria-hidden="true">!</span><div><b>Close — the word is "${escapeHtml(word.word)}".</b> Listen again and have another go.</div>`;
  return `
    <div class="wb-modal-body">
      <div class="wb-modal-section">
        <p class="wb-modal-section-label">${sentence ? 'Listen to the sentence, then type the missing word' : 'Listen to the word, then type it'}</p>
        ${sentence ? `<p class="wb-drill-sentence">${renderCloze(drillCloze, { answer: word.word, revealAnswer: result === 'correct' })}</p>` : ''}
      </div>
      <div class="wb-drill-audio">
        <button type="button" class="wb-drill-audio-btn" data-action="spelling-word-bank-drill-replay" data-slug="${escapeHtml(word.slug)}" aria-label="Replay the word">
          ${ICON_SPEAKER}
          <span class="wb-drill-audio-label">Replay</span>
        </button>
        <button type="button" class="wb-drill-audio-btn slow" data-action="spelling-word-bank-drill-replay-slow" data-slug="${escapeHtml(word.slug)}" aria-label="Replay slowly">
          ${ICON_SPEAKER_SLOW}
          <span class="wb-drill-audio-label">Slowly</span>
        </button>
      </div>
      <form class="wb-drill-form" data-action="spelling-word-bank-drill-submit" data-slug="${escapeHtml(word.slug)}">
        <input
          type="text"
          name="typed"
          class="wb-drill-input ${inputState}"
          autocomplete="off"
          autocapitalize="none"
          spellcheck="false"
          placeholder="Type the word…"
          value="${escapeHtml(typed)}"
          data-autofocus="true"
          data-action="spelling-word-bank-drill-input"
          aria-label="Type the drill word"
          ${result === 'correct' ? 'disabled' : ''}
        />
        <button type="submit" class="btn primary" style="--btn-accent:${accent};" ${result === 'correct' ? 'disabled' : ''}>Check ${ICON_ARROW_RIGHT}</button>
      </form>
      ${showFeedback ? `<div class="wb-drill-feedback ${feedbackTone}" role="status">${feedbackBody}</div>` : ''}
      <div class="wb-modal-actions">
        ${result === 'correct'
          ? `<button type="button" class="btn ghost" data-action="spelling-word-detail-mode" data-value="explain" data-slug="${escapeHtml(word.slug)}">Back to explainer</button>
             <button type="button" class="btn primary" style="--btn-accent:${accent};" data-action="spelling-word-bank-drill-try-again" data-slug="${escapeHtml(word.slug)}">Try again ${ICON_ARROW_RIGHT}</button>`
          : result === 'incorrect'
            ? `<button type="button" class="btn ghost" data-action="spelling-word-detail-mode" data-value="explain" data-slug="${escapeHtml(word.slug)}">Back to explainer</button>
               <button type="button" class="btn ghost" data-action="spelling-word-bank-drill-try-again" data-slug="${escapeHtml(word.slug)}">Try again</button>`
            : ''}
      </div>
      <p class="wb-modal-note">Drilling here never writes to the scheduler — it's a free practice tool.</p>
    </div>
  `;
}

function renderWordDetailModal({ word, mode = 'explain', typed = '', result = null, accent = SPELLING_ACCENT }) {
  if (!word) return '';
  const slug = word.slug;
  const safeMode = mode === 'drill' ? 'drill' : 'explain';
  const body = safeMode === 'drill'
    ? renderWordDetailDrill(word, { typed, result, accent })
    : renderWordDetailExplain(word);
  /* In drill mode the speaker is decorative — the learner must not be able
     to click it and hear the answer before trying. In explain mode it stays
     a fully interactive replay affordance tied to the same replay handler. */
  const speaker = safeMode === 'drill'
    ? `<span class="wb-modal-speaker muted" aria-hidden="true">${ICON_SPEAKER}</span>`
    : `<button type="button" class="wb-modal-speaker" data-action="spelling-word-bank-word-replay" data-slug="${escapeHtml(slug)}" aria-label="Replay the word">${ICON_SPEAKER}</button>`;
  const heading = safeMode === 'drill'
    ? `<h2 id="wb-modal-word" class="wb-modal-word wb-modal-word-prompt">Listen, then spell the missing word.</h2>`
    : `<h2 id="wb-modal-word" class="wb-modal-word">${escapeHtml(word.word)}</h2>`;
  return `
    <div class="wb-modal-scrim" role="dialog" aria-modal="true" aria-labelledby="wb-modal-word">
      <div class="wb-modal-backdrop" tabindex="-1" aria-hidden="true"></div>
      <div class="wb-modal" data-slug="${escapeHtml(slug)}">
        <header class="wb-modal-head">
          <div class="wb-modal-head-main">
            ${speaker}
            <div>
              <p class="wb-modal-eyebrow">${escapeHtml(word.yearLabel || 'Word')}</p>
              ${heading}
            </div>
          </div>
          <button type="button" class="wb-modal-close" data-action="spelling-word-detail-close" aria-label="Close">×</button>
        </header>
        <div class="wb-modal-tabs" role="tablist">
          <button type="button" role="tab" class="wb-modal-tab${safeMode === 'explain' ? ' on' : ''}" aria-selected="${safeMode === 'explain' ? 'true' : 'false'}" data-action="spelling-word-detail-mode" data-value="explain" data-slug="${escapeHtml(slug)}">
            Explain
          </button>
          <button type="button" role="tab" class="wb-modal-tab${safeMode === 'drill' ? ' on' : ''}" aria-selected="${safeMode === 'drill' ? 'true' : 'false'}" data-action="spelling-word-detail-mode" data-value="drill" data-slug="${escapeHtml(slug)}">
            Drill
          </button>
        </div>
        ${body}
      </div>
    </div>
  `;
}

/* --------------------------------------------------------------
   Word-bank scene (ui.phase === 'word-bank')
   Owns the three-col aggregate cards that used to live on the
   retired Analytics tab, plus the word bank card itself, plus the
   optional modal overlay when transientUi points at a word.
   -------------------------------------------------------------- */
function renderWordBankAggregates(analytics) {
  const all = analytics.pools.all;
  const y34 = analytics.pools.y34;
  const y56 = analytics.pools.y56;
  return `
    <div class="three-col wb-aggregates">
      <section class="wb-card wb-card-compact">
        <div class="eyebrow">All spellings</div>
        <h2 class="section-title">Whole-list progress</h2>
        ${summaryCards([
          { label: 'Total', value: all.total, sub: 'Words on the list' },
          { label: 'Secure', value: all.secure, sub: 'Stage 4+' },
          { label: 'Due now', value: all.due, sub: 'Due today or overdue' },
          { label: 'Accuracy', value: all.accuracy == null ? '—' : `${all.accuracy}%`, sub: 'Across stored attempts' },
        ])}
      </section>
      <section class="wb-card wb-card-compact">
        <div class="eyebrow">Years 3-4</div>
        <h2 class="section-title">Lower KS2 spelling pool</h2>
        ${summaryCards([
          { label: 'Total', value: y34.total, sub: 'Words in pool' },
          { label: 'Secure', value: y34.secure, sub: 'Stable recall' },
          { label: 'Trouble', value: y34.trouble, sub: 'Weak or fragile' },
          { label: 'Unseen', value: y34.fresh, sub: 'Not yet introduced' },
        ])}
      </section>
      <section class="wb-card wb-card-compact">
        <div class="eyebrow">Years 5-6</div>
        <h2 class="section-title">Upper KS2 spelling pool</h2>
        ${summaryCards([
          { label: 'Total', value: y56.total, sub: 'Words in pool' },
          { label: 'Secure', value: y56.secure, sub: 'Stable recall' },
          { label: 'Trouble', value: y56.trouble, sub: 'Weak or fragile' },
          { label: 'Unseen', value: y56.fresh, sub: 'Not yet introduced' },
        ])}
      </section>
    </div>
  `;
}

function findWordBankEntry(analytics, slug) {
  if (!slug) return null;
  const groups = Array.isArray(analytics?.wordGroups) ? analytics.wordGroups : [];
  for (const group of groups) {
    const words = Array.isArray(group.words) ? group.words : [];
    const match = words.find((entry) => entry.slug === slug);
    if (match) return match;
  }
  return null;
}

function renderWordBankScene({ appState, learner, service, subject }) {
  const analytics = service.getAnalyticsSnapshot(learner.id);
  const accent = accentFor(subject);
  const searchQuery = appState?.transientUi?.spellingAnalyticsWordSearch || '';
  const statusFilter = appState?.transientUi?.spellingAnalyticsStatusFilter || 'all';
  const detailSlug = appState?.transientUi?.spellingWordDetailSlug || '';
  const detailMode = appState?.transientUi?.spellingWordDetailMode || 'explain';
  const drillTyped = appState?.transientUi?.spellingWordBankDrillTyped || '';
  const drillResult = appState?.transientUi?.spellingWordBankDrillResult || null;
  const heroBg = heroBgForLearner(learner.id);
  const detailWord = findWordBankEntry(analytics, detailSlug);
  return `
    <div class="spelling-in-session word-bank-shell" style="grid-column:1/-1; ${heroBgStyle(heroBg)}">
      <div class="word-bank-scene">
        <header class="word-bank-topbar">
          <button type="button" class="btn ghost sm" data-action="spelling-close-word-bank">← Back to setup</button>
          <h1 class="word-bank-title">${escapeHtml(learner.name)}’s spellings</h1>
        </header>
        ${renderWordBankAggregates(analytics)}
        ${renderWordBank({ learner, analytics, searchQuery, statusFilter })}
      </div>
      ${detailWord ? renderWordDetailModal({ word: detailWord, mode: detailMode, typed: drillTyped, result: drillResult, accent }) : ''}
    </div>
  `;
}

export const spellingModule = {
  id: 'spelling',
  name: 'Spelling',
  blurb: 'Learn tricky words by sound, sight and meaning.',
  accent: '#3E6FA8',
  accentSoft: '#DCE6F3',
  accentTint: '#EEF3FA',
  icon: 'pen',
  available: true,
  initState() {
    return createInitialSpellingState();
  },
  getDashboardStats(appState, { service }) {
    const learner = appState.learners.byId[appState.learners.selectedId];
    const prefs = service.getPrefs(learner.id);
    const stats = service.getStats(learner.id, prefs.yearFilter);
    const codex = monsterSummaryFromSpellingAnalytics(service.getAnalyticsSnapshot(learner.id));
    return {
      pct: stats.total ? Math.round((stats.secure / stats.total) * 100) : 0,
      due: stats.due,
      streak: codex.reduce((max, entry) => Math.max(max, entry.progress.level), 0),
      nextUp: stats.trouble ? 'Trouble drill' : stats.due ? 'Due review' : 'Fresh spellings',
    };
  },
  renderPractice(context) {
    const { appState } = context;
    const learner = appState.learners.byId[appState.learners.selectedId];
    const ui = context.service.initState(appState.subjectUi.spelling, learner.id);
    if (ui.phase === 'summary') return renderSummary({ ...context, learner, ui });
    if (ui.phase === 'session') return renderSession({ ...context, learner, ui });
    if (ui.phase === 'word-bank') return renderWordBankScene({ ...context, learner });
    return renderPracticeDashboard({ ...context, learner });
  },
  handleAction(action, context) {
    const { appState, data, store, service, tts } = context;
    const learnerId = appState.learners.selectedId;
    const ui = service.initState(appState.subjectUi.spelling, learnerId);

    function applyTransition(transition) {
      if (!transition) return true;
      if (typeof context.applySubjectTransition === 'function') {
        return context.applySubjectTransition('spelling', transition);
      }
      store.updateSubjectUi('spelling', transition.state);
      if (transition.audio?.word) tts.speak(transition.audio);
      return true;
    }

    if (action === 'spelling-set-mode') {
      service.savePrefs(learnerId, { mode: data.value });
      store.updateSubjectUi('spelling', { phase: 'dashboard', error: '' });
      return true;
    }

    if (action === 'spelling-set-pref') {
      service.savePrefs(learnerId, { [data.pref]: data.value });
      store.updateSubjectUi('spelling', { phase: 'dashboard', error: '' });
      return true;
    }

    if (action === 'spelling-toggle-pref') {
      /* The toggle chip is a `<button aria-pressed="…">`, not a checkbox, so
         `data.checked` is always undefined. Read the current value from prefs
         and flip it so the chip acts as a true toggle. */
      const current = service.getPrefs(learnerId);
      service.savePrefs(learnerId, { [data.pref]: !current[data.pref] });
      store.updateSubjectUi('spelling', { phase: 'dashboard', error: '' });
      return true;
    }

    if (action === 'spelling-analytics-search') {
      const spellingAnalyticsWordSearch = String(data.value || '').slice(0, 80);
      store.patch((current) => ({
        transientUi: {
          ...current.transientUi,
          spellingAnalyticsWordSearch,
        },
      }));
      return true;
    }

    if (action === 'spelling-analytics-status-filter') {
      /* Word bank filter tab — v1 tokens (unseen/weak) are accepted verbatim;
         normalisation into the validator set happens inside the store on patch.
         Unknown values collapse to 'all' so the learner always sees the full
         list rather than a confusing empty state. */
      const raw = String(data.value || 'all');
      const next = WORD_BANK_FILTER_IDS.has(raw) ? raw : 'all';
      store.patch((current) => ({
        transientUi: {
          ...current.transientUi,
          spellingAnalyticsStatusFilter: next,
        },
      }));
      return true;
    }

    if (action === 'spelling-start' || action === 'spelling-start-again') {
      const prefs = service.getPrefs(learnerId);
      tts.stop();
      return applyTransition(service.startSession(learnerId, {
        mode: prefs.mode,
        yearFilter: prefs.yearFilter,
        length: prefs.roundLength,
      }));
    }

    if (action === 'spelling-shortcut-start') {
      const mode = data.mode;
      if (!mode) return true;
      if (ui.phase === 'session') {
        const confirmed = globalThis.confirm?.('End the current spelling session and switch?');
        if (confirmed === false) return true;
      }
      service.savePrefs(learnerId, { mode });
      const prefs = service.getPrefs(learnerId);
      tts.stop();
      return applyTransition(service.startSession(learnerId, {
        mode: prefs.mode,
        yearFilter: prefs.yearFilter,
        length: prefs.roundLength,
      }));
    }

    if (action === 'spelling-submit-form') {
      const typed = data.formData.get('typed');
      return applyTransition(service.submitAnswer(learnerId, ui, typed));
    }

    if (action === 'spelling-continue') {
      return applyTransition(service.continueSession(learnerId, ui));
    }

    if (action === 'spelling-skip') {
      return applyTransition(service.skipWord(learnerId, ui));
    }

    if (action === 'spelling-replay') {
      if (ui.session?.currentCard?.word) {
        tts.speak({ word: ui.session.currentCard.word, sentence: ui.session.currentCard.prompt?.sentence });
      }
      return true;
    }

    if (action === 'spelling-replay-slow') {
      if (ui.session?.currentCard?.word) {
        tts.speak({ word: ui.session.currentCard.word, sentence: ui.session.currentCard.prompt?.sentence, slow: true });
      }
      return true;
    }

    if (action === 'spelling-end-early') {
      const confirmed = globalThis.confirm?.('End this session now?');
      if (confirmed === false) return true;
      tts.stop();
      return applyTransition(service.endSession(learnerId, ui));
    }

    if (action === 'spelling-back') {
      tts.stop();
      return applyTransition(service.endSession(learnerId, ui));
    }

    if (action === 'spelling-drill-all') {
      if (!ui.summary?.mistakes?.length) return true;
      tts.stop();
      return applyTransition(service.startSession(learnerId, {
        mode: 'trouble',
        words: ui.summary.mistakes.map((word) => word.slug),
        yearFilter: 'all',
        length: ui.summary.mistakes.length,
      }));
    }

    if (action === 'spelling-drill-single') {
      const slug = data.slug;
      if (!slug) return true;
      tts.stop();
      return applyTransition(service.startSession(learnerId, {
        mode: 'single',
        words: [slug],
        yearFilter: 'all',
        length: 1,
      }));
    }

    /* ------------------------------------------------------------
       Word-bank scene actions
       The word bank is its own phase ('word-bank'); opening and
       closing it simply switches the spelling ui.phase. The detail
       modal lives on transientUi so it survives session churn and
       the drill stays isolated from the scheduler entirely. */
    if (action === 'spelling-open-word-bank') {
      tts.stop();
      store.patch((current) => ({
        transientUi: {
          ...current.transientUi,
          spellingWordDetailSlug: '',
          spellingWordDetailMode: 'explain',
          spellingWordBankDrillTyped: '',
          spellingWordBankDrillResult: null,
        },
      }));
      store.updateSubjectUi('spelling', { phase: 'word-bank', error: '' });
      return true;
    }

    if (action === 'spelling-close-word-bank') {
      tts.stop();
      store.patch((current) => ({
        transientUi: {
          ...current.transientUi,
          spellingWordDetailSlug: '',
          spellingWordDetailMode: 'explain',
          spellingWordBankDrillTyped: '',
          spellingWordBankDrillResult: null,
        },
      }));
      store.updateSubjectUi('spelling', { phase: 'dashboard', error: '' });
      return true;
    }

    if (action === 'spelling-word-detail-open') {
      const slug = data.slug;
      if (!slug) return true;
      const rawMode = data.value === 'drill' ? 'drill' : 'explain';
      const word = findWordBankEntry(service.getAnalyticsSnapshot(learnerId), slug);
      if (word && rawMode === 'drill') {
        tts.speak({ word: word.word, sentence: word.sentence });
      }
      store.patch((current) => ({
        transientUi: {
          ...current.transientUi,
          spellingWordDetailSlug: slug,
          spellingWordDetailMode: rawMode,
          spellingWordBankDrillTyped: '',
          spellingWordBankDrillResult: null,
        },
      }));
      return true;
    }

    if (action === 'spelling-word-detail-close') {
      tts.stop();
      store.patch((current) => ({
        transientUi: {
          ...current.transientUi,
          spellingWordDetailSlug: '',
          spellingWordDetailMode: 'explain',
          spellingWordBankDrillTyped: '',
          spellingWordBankDrillResult: null,
        },
      }));
      return true;
    }

    if (action === 'spelling-word-detail-mode') {
      const rawMode = data.value === 'drill' ? 'drill' : 'explain';
      const slug = data.slug || appState?.transientUi?.spellingWordDetailSlug || '';
      const currentMode = appState?.transientUi?.spellingWordDetailMode === 'drill' ? 'drill' : 'explain';
      const modeChanged = rawMode !== currentMode;
      if (rawMode === 'drill' && slug) {
        const word = findWordBankEntry(service.getAnalyticsSnapshot(learnerId), slug);
        if (word) tts.speak({ word: word.word, sentence: word.sentence });
      }
      /* Only wipe typed progress when the tab actually changes. Re-clicking the
         current tab (a re-entry into the same mode) is a no-op for the input
         state — apart from re-speaking above — so the learner never loses what
         they were midway through typing. */
      store.patch((current) => ({
        transientUi: {
          ...current.transientUi,
          spellingWordDetailMode: rawMode,
          ...(modeChanged
            ? { spellingWordBankDrillTyped: '', spellingWordBankDrillResult: null }
            : {}),
        },
      }));
      return true;
    }

    if (action === 'spelling-word-bank-drill-input') {
      const typed = String(data.value || '').slice(0, 80);
      store.patch((current) => ({
        transientUi: {
          ...current.transientUi,
          spellingWordBankDrillTyped: typed,
          /* A keystroke after a previous incorrect result clears the feedback
             slot so the learner isn't dragging a red ribbon through their
             retry. Correct is sticky — it drives the try-again button. */
          spellingWordBankDrillResult: current.transientUi?.spellingWordBankDrillResult === 'correct'
            ? 'correct'
            : null,
        },
      }));
      return true;
    }

    if (action === 'spelling-word-bank-drill-submit') {
      const slug = data.slug || appState?.transientUi?.spellingWordDetailSlug || '';
      if (!slug) return true;
      const word = findWordBankEntry(service.getAnalyticsSnapshot(learnerId), slug);
      if (!word) return true;
      const typed = String(data.formData?.get?.('typed') || '').trim();
      const result = typed.toLowerCase() === String(word.word).toLowerCase() ? 'correct' : 'incorrect';
      store.patch((current) => ({
        transientUi: {
          ...current.transientUi,
          spellingWordBankDrillTyped: typed,
          spellingWordBankDrillResult: result,
        },
      }));
      return true;
    }

    if (action === 'spelling-word-bank-drill-try-again') {
      const slug = data.slug || appState?.transientUi?.spellingWordDetailSlug || '';
      if (slug) {
        const word = findWordBankEntry(service.getAnalyticsSnapshot(learnerId), slug);
        if (word) tts.speak({ word: word.word, sentence: word.sentence });
      }
      store.patch((current) => ({
        transientUi: {
          ...current.transientUi,
          spellingWordBankDrillTyped: '',
          spellingWordBankDrillResult: null,
        },
      }));
      return true;
    }

    if (action === 'spelling-word-bank-word-replay') {
      const slug = data.slug || appState?.transientUi?.spellingWordDetailSlug || '';
      if (!slug) return true;
      const word = findWordBankEntry(service.getAnalyticsSnapshot(learnerId), slug);
      if (!word) return true;
      tts.speak({
        word: word.word,
        wordOnly: true,
      });
      return true;
    }

    if (action === 'spelling-word-bank-drill-replay' || action === 'spelling-word-bank-drill-replay-slow') {
      const slug = data.slug || appState?.transientUi?.spellingWordDetailSlug || '';
      if (!slug) return true;
      const word = findWordBankEntry(service.getAnalyticsSnapshot(learnerId), slug);
      if (!word) return true;
      tts.speak({
        word: word.word,
        sentence: word.sentence,
        slow: action === 'spelling-word-bank-drill-replay-slow',
      });
      return true;
    }

    return false;
  },
};
