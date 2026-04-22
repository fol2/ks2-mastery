import { monsterSummaryFromSpellingAnalytics } from '../../platform/game/monster-system.js';
import { monsterAsset, monsterAssetSrcSet } from '../../platform/game/monsters.js';
import { escapeHtml, formatElapsed } from '../../platform/core/utils.js';
import { REGION_BACKGROUND_URLS } from '../../surfaces/home/data.js';
import { createInitialSpellingState } from './service-contract.js';
import {
  spellingSessionContextNote,
  spellingSessionFooterNote,
  spellingSessionInfoChips,
  spellingSessionInputPlaceholder,
  spellingSessionProgressLabel,
  spellingSessionSubmitLabel,
} from './session-ui.js';

const SPELLING_ACCENT = '#3E6FA8';

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

function renderMonsterCodexVisual(monster, progress) {
  if (!progress?.caught) {
    return `<div class="monster-placeholder" aria-label="${escapeHtml(`${monster.name} not caught`)}">?</div>`;
  }
  return `<img alt="${escapeHtml(monster.name)}" src="${escapeHtml(monsterAsset(monster.id, progress.stage, 320, progress.branch))}" srcset="${escapeHtml(monsterAssetSrcSet(monster.id, progress.stage, progress.branch))}" sizes="min(50vw, 220px)" />`;
}

function renderCodex(monsters) {
  const entries = Array.isArray(monsters) ? monsters : [];
  return `
    <div class="codex-grid">
      ${entries.map(({ monster, progress }) => `
        <div class="monster-tile ${progress.caught ? '' : 'not-caught'}">
          ${renderMonsterCodexVisual(monster, progress)}
          <div>
            <p class="monster-name">${escapeHtml(monster.name)}</p>
            <div class="monster-meta">${escapeHtml(monster.blurb)}</div>
          </div>
          <div class="chip-row" style="justify-content:center;">
            <span class="chip">${progress.caught ? `Stage ${progress.stage}` : 'Not caught'}</span>
            <span class="chip">${progress.mastered} secure</span>
          </div>
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
  const dueDay = Number(progress.dueDay);
  if (!Number.isFinite(dueDay)) return 'Unseen';
  if (dueDay <= 0) return 'Today';
  if (dueDay === 1) return 'In 1 day';
  return `In ${dueDay} days`;
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
   Setup scene (practice tab dashboard)
   Translates v1 scenes.jsx:144 into server-rendered markup while
   preserving every production data-action binding and the
   "Practice setup" H2 that smoke.test.js pins.
   -------------------------------------------------------------- */
const MODE_CARDS = [
  { id: 'smart', icon: '◎', title: 'Smart Review', desc: 'Due · weak · one fresh word.' },
  { id: 'trouble', icon: '⚡', title: 'Trouble Drill', desc: 'Only the words you usually miss.' },
  { id: 'test', icon: '⌒', title: 'SATs Test', desc: 'One-shot dictation, no retries.' },
];

const ROUND_LENGTH_OPTIONS = ['10', '20', '40'];

function beginLabel(prefs) {
  if (prefs.mode === 'test') return 'Begin SATs test';
  if (prefs.mode === 'trouble') return 'Begin trouble drill';
  if (prefs.roundLength === 'all') return 'Begin all words';
  const length = prefs.roundLength || '10';
  return `Begin ${length} words`;
}

function renderModeCard(mode, selected) {
  return `
    <label class="mode-card${selected ? ' selected' : ''}">
      <input type="radio" name="spelling-mode" value="${escapeHtml(mode.id)}" ${selected ? 'checked' : ''} data-action="spelling-set-mode" />
      <div class="mc-icon">${escapeHtml(mode.icon)}</div>
      <h4>${escapeHtml(mode.title)}</h4>
      <p>${escapeHtml(mode.desc)}</p>
    </label>
  `;
}

function renderLengthPicker(prefs) {
  const disabled = prefs.mode === 'test';
  const options = ROUND_LENGTH_OPTIONS.map((value) => `
    <label class="length-option${prefs.roundLength === value ? ' selected' : ''}${disabled ? ' disabled' : ''}">
      <input type="radio" name="spelling-round-length" value="${value}" ${prefs.roundLength === value ? 'checked' : ''} data-action="spelling-set-pref" data-pref="roundLength" ${disabled ? 'disabled' : ''} />
      <span>${value}</span>
    </label>
  `).join('');
  return `
    <div class="length-picker" role="radiogroup" aria-label="Round length">
      ${options}
      <span class="length-unit">words</span>
    </div>
  `;
}

function renderToggleChip(pref, checked, label) {
  return `
    <label class="toggle-chip${checked ? ' on' : ''}">
      <input type="checkbox" data-action="spelling-toggle-pref" data-pref="${escapeHtml(pref)}" ${checked ? 'checked' : ''} />
      <span class="box" aria-hidden="true">${checked ? ICON_CHECK : ''}</span>
      ${escapeHtml(label)}
    </label>
  `;
}

function renderSSMeadow(codex) {
  const entries = Array.isArray(codex) ? codex : [];
  /* Show up to three stages of companion progress in the "where you stand" card.
     Uncaught entries still render a .monster-placeholder so render.test.js can
     assert both the placeholder and the "Not caught" status on the spelling
     practice tab without losing the v1 meadow vocabulary. */
  const shown = entries.slice(0, 3);
  if (!shown.length) {
    return '<div class="ss-meadow-empty small muted">Catch your first monster to populate this meadow.</div>';
  }
  return `
    <div class="ss-meadow" aria-label="${shown.length} tracked monsters">
      ${shown.map(({ monster, progress }) => `
        <div class="ss-meadow-cell${progress.caught ? (progress.stage === 0 ? ' egg' : '') : ' uncaught'}">
          ${renderMonsterCodexVisual(monster, progress)}
          <span class="ss-meadow-label">${progress.caught ? `Stage ${progress.stage}` : 'Not caught'}</span>
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
  return `
    <div class="setup-grid" style="grid-column:1/-1;">
      <section class="setup-main" style="border-top:3px solid ${accent}; ${heroBgStyle(heroBg)}">
        <div class="hero-art pan" aria-hidden="true"></div>
        <div class="setup-content">
          <p class="eyebrow">Practice setup</p>
          <h1 class="title">Choose today’s journey.</h1>
          <p class="lede">Smart Review mixes what’s due, what wobbled last time, and one or two new words. You can go straight to trouble drills or SATs rehearsal if you’d rather.</p>
          <div class="mode-row">
            ${MODE_CARDS.map((mode) => renderModeCard(mode, prefs.mode === mode.id)).join('')}
          </div>
          <div class="tweak-row">
            <span class="tool-label">Year group</span>
            <select class="select length-select" data-action="spelling-set-pref" data-pref="yearFilter" aria-label="Year group">
              <option value="all" ${prefs.yearFilter === 'all' ? 'selected' : ''}>Years 3-4 and 5-6</option>
              <option value="y3-4" ${prefs.yearFilter === 'y3-4' ? 'selected' : ''}>Years 3-4 only</option>
              <option value="y5-6" ${prefs.yearFilter === 'y5-6' ? 'selected' : ''}>Years 5-6 only</option>
            </select>
          </div>
          <div class="tweak-row">
            <span class="tool-label">Round length</span>
            ${renderLengthPicker(prefs)}
          </div>
          <div class="tweak-row">
            <span class="tool-label">Options</span>
            ${renderToggleChip('showCloze', Boolean(prefs.showCloze), 'Show sentence')}
            ${renderToggleChip('autoSpeak', Boolean(prefs.autoSpeak), 'Auto-play audio')}
          </div>
          <div class="setup-begin-row">
            <button type="button" class="btn primary xl" style="background:${accent};" data-action="spelling-start">
              ${escapeHtml(begin)} ${ICON_ARROW_RIGHT}
            </button>
          </div>
        </div>
      </section>

      <aside class="setup-side">
        <div class="ss-card">
          <div class="ss-head">
            <p class="eyebrow">Where you stand</p>
            <button type="button" class="ss-codex-link" data-action="navigate-home" aria-label="Open the codex on the dashboard">
              Open codex →
            </button>
          </div>
          ${renderSSMeadow(codex)}
          ${renderSSStatGrid(stats)}
          <button type="button" class="ss-bank-link" data-action="subject-set-tab" data-tab="analytics">
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

function renderFamilyChips(words) {
  const list = Array.isArray(words) ? words.filter(Boolean) : [];
  if (list.length <= 1) return '';
  return `
    <div class="family-chips">
      <span class="flabel">Word family</span>
      ${list.map((word) => `<span class="fchip">${escapeHtml(word)}</span>`).join('')}
    </div>
  `;
}

function feedbackTone(kind) {
  if (kind === 'success') return 'good';
  if (kind === 'error') return 'bad';
  return 'warn';
}

function feedbackIconFor(tone) {
  if (tone === 'good') return ICON_CHECK;
  if (tone === 'warn') return '!';
  return '×';
}

function renderFeedbackSlot(feedback) {
  if (!feedback) {
    /* Placeholder keeps the prompt-card total height stable between the
       question variant and the post-submit variants. aria-hidden + display:
       visibility:hidden in CSS mean the copy never reaches assistive tech. */
    return `
      <div class="feedback-slot is-placeholder" aria-hidden="true">
        ${renderRibbon({ tone: 'good', icon: ICON_CHECK, headline: 'Placeholder', sub: 'Reserved height.' })}
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

function renderSessionActionRow({ session, awaitingAdvance, accent, submitLabel }) {
  const isTest = session.type === 'test';
  const isQuestion = !awaitingAdvance && session.phase === 'question';
  const showSkip = !isTest && (session.phase === 'question' || session.phase === 'retry');
  const showEnd = true;
  return `
    <div class="action-row">
      <button class="btn primary lg" style="background:${accent};" type="submit" ${awaitingAdvance ? 'disabled' : ''}>
        ${escapeHtml(submitLabel)} ${awaitingAdvance ? '' : ICON_ARROW_RIGHT}
      </button>
      ${awaitingAdvance ? `<button class="btn good lg" type="button" data-action="spelling-continue">Continue ${ICON_ARROW_RIGHT}</button>` : ''}
      ${showSkip ? '<button class="btn ghost" type="button" data-action="spelling-skip">Skip</button>' : ''}
      ${isQuestion ? '' : ''}
      ${showEnd ? '' : ''}
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
  const footerNote = spellingSessionFooterNote(session);
  const infoChips = spellingSessionInfoChips(session);
  if (!session || !card || !card.word) {
    return `
      <section class="card" style="grid-column:1/-1;">
        <div class="eyebrow">No active session</div>
        <h2 class="section-title">Start a spelling round</h2>
        <button class="btn primary" style="background:${accent};" data-action="spelling-back">Back to spelling dashboard</button>
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
              <button class="btn primary lg" style="background:${accent};" type="submit" ${awaitingAdvance ? 'disabled' : ''}>
                ${escapeHtml(submitLabel)}${awaitingAdvance ? '' : ` ${ICON_ARROW_RIGHT}`}
              </button>
              ${continueBtn}
              ${skipBtn}
            </div>
          </form>

          ${renderFeedbackSlot(ui.feedback)}
          <p class="session-foot-note small muted">${escapeHtml(footerNote)}</p>
        </div>

        <footer class="session-footer">
          <div class="keys-hint">
            <kbd>Esc</kbd> replay · <kbd>⇧</kbd>+<kbd>Esc</kbd> slow · <kbd>Alt</kbd>+<kbd>S</kbd> skip · <kbd>Enter</kbd> submit
          </div>
          <div class="session-footer-right">
            <span class="session-progress-chip">${escapeHtml(spellingSessionProgressLabel(session))}</span>
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
   -------------------------------------------------------------- */
function renderSummaryStatGrid(cards = []) {
  return `
    <div class="summary-stats">
      ${cards.map((card) => `
        <div class="summary-stat">
          <div class="v">${escapeHtml(card.value)}</div>
          <div class="l">${escapeHtml(card.label)}</div>
          ${card.sub ? `<div class="s">${escapeHtml(card.sub)}</div>` : ''}
        </div>
      `).join('')}
    </div>
  `;
}

function renderSummary({ learner, ui, subject }) {
  const accent = accentFor(subject);
  const summary = ui.summary;
  if (!summary) return '';
  const heroBg = heroBgForLearner(learner.id);
  const toneGood = !summary.mistakes.length;
  const headline = summary.message;
  const eyebrow = summary.label || 'Round complete';
  return `
    <div class="spelling-in-session summary-shell" style="grid-column:1/-1; ${heroBgStyle(heroBg)}">
      <div class="session summary">
        <header class="session-head">
          ${renderPathProgress({ done: 1, current: 0, total: 1 })}
          <span class="path-count">Round complete</span>
        </header>

        <div class="prompt-card summary-card">
          <h3 class="summary-title sr-only">Session summary</h3>
          ${renderRibbon({
            tone: toneGood ? 'good' : 'warn',
            icon: toneGood ? ICON_CHECK : '!',
            headline,
            sub: `${escapeHtml(eyebrow)} · ${escapeHtml(formatElapsed(summary.elapsedMs))}`,
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
                <button type="button" class="btn primary sm" style="background:${accent};" data-action="spelling-drill-all">Drill all ${summary.mistakes.length} ${ICON_ARROW_RIGHT}</button>
              </div>
            </div>
          ` : ''}

          <div class="summary-actions">
            <button type="button" class="btn ghost lg" data-action="spelling-back">Back to dashboard</button>
            <button type="button" class="btn primary lg" style="background:${accent};" data-action="spelling-start-again">Start another round ${ICON_ARROW_RIGHT}</button>
            <button type="button" class="summary-bank-link" data-action="subject-set-tab" data-tab="analytics">
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
  return `
    <div class="wb-chips" role="tablist" aria-label="Filter word bank by status">
      ${chips.map((chip) => {
        const active = chip.id === activeFilter;
        const count = counts[chip.id] ?? 0;
        return `
          <button
            type="button"
            role="tab"
            aria-selected="${active ? 'true' : 'false'}"
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
  const tone = wordProgressTone(word.status);
  const pillToken = wordBankPillClass(word.status);
  const statusLabel = wordStatusLabel(word.status);
  const accuracy = accuracyPercent(word.progress);
  const due = dueLabel(word.progress);
  const attempts = Math.max(0, Number(word.progress?.attempts) || 0);
  const title = `${word.word} · ${word.family} · ${word.stageLabel} · correct ${word.progress.correct}, wrong ${word.progress.wrong} · practice only`;
  const label = `${word.word}, ${statusLabel}, ${word.stageLabel}, practice only`;
  /* The inner arrow button keeps the canonical
     `class="word-progress-pill {tone}" data-action="spelling-practice-single"`
     wire so existing test pins match exactly. The outer row is a passive
     wrapper that styles the content; the button owns all keyboard + pointer
     semantics. */
  return `
    <li class="wb-row" data-status="${escapeHtml(pillToken)}">
      <div class="wb-cell-word">
        <span class="wb-word">${escapeHtml(word.word)}</span>
        <span class="wb-pill ${escapeHtml(pillToken)}">${escapeHtml(statusLabel)}</span>
      </div>
      <div class="wb-cell-meta">
        <span class="wb-meta"><span class="wb-meta-label">Accuracy</span><span class="wb-meta-value">${accuracy == null ? '—' : `${accuracy}%`}</span></span>
        <span class="wb-meta"><span class="wb-meta-label">Next due</span><span class="wb-meta-value">${escapeHtml(due)}</span></span>
        <span class="wb-meta"><span class="wb-meta-label">Attempts</span><span class="wb-meta-value">${attempts}</span></span>
        <span class="wb-meta"><span class="wb-meta-label">Family</span><span class="wb-meta-value">${escapeHtml(word.family || '—')}</span></span>
      </div>
      <button type="button" class="word-progress-pill ${tone}" data-action="spelling-practice-single" data-slug="${escapeHtml(word.slug)}" title="${escapeHtml(title)}" aria-label="${escapeHtml(label)}">
        <span class="wb-action-label">Practise</span>
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
    <section class="word-bank-card" style="grid-column:1/-1;">
      <div class="wb-card">
        <header class="wb-head">
          <p class="eyebrow">Word bank progress</p>
          <h1 class="title">${escapeHtml(learnerName)} word bank</h1>
          <p class="lede">${escapeHtml(ledeBase)}${ledeSearch} Pick any word to start a practice-only drill.</p>
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
   Analytics tab
   Top row keeps the three pool summary cards so the higher-level
   numbers are still visible; the word bank slots in below the
   aggregate view.
   -------------------------------------------------------------- */
function renderAnalytics({ appState, learner, service }) {
  const analytics = service.getAnalyticsSnapshot(learner.id);
  const searchQuery = appState?.transientUi?.spellingAnalyticsWordSearch || '';
  /* Word bank tab filter — persisted on transientUi so that switching tabs (or
     refreshing after a transient reload) keeps the chip selection. Defaults to
     'all' when the store has not yet normalised the field. */
  const statusFilter = appState?.transientUi?.spellingAnalyticsStatusFilter || 'all';
  const all = analytics.pools.all;
  const y34 = analytics.pools.y34;
  const y56 = analytics.pools.y56;
  return `
    <div class="three-col">
      <section class="card">
        <div class="eyebrow">All spellings</div>
        <h2 class="section-title">Whole-list progress</h2>
        ${summaryCards([
          { label: 'Total', value: all.total, sub: 'Words on the list' },
          { label: 'Secure', value: all.secure, sub: 'Stage 4+' },
          { label: 'Due now', value: all.due, sub: 'Due today or overdue' },
          { label: 'Accuracy', value: all.accuracy == null ? '—' : `${all.accuracy}%`, sub: 'Across stored attempts' },
        ])}
      </section>
      <section class="card">
        <div class="eyebrow">Years 3-4</div>
        <h2 class="section-title">Lower KS2 spelling pool</h2>
        ${summaryCards([
          { label: 'Total', value: y34.total, sub: 'Words in pool' },
          { label: 'Secure', value: y34.secure, sub: 'Stable recall' },
          { label: 'Trouble', value: y34.trouble, sub: 'Weak or fragile' },
          { label: 'Unseen', value: y34.fresh, sub: 'Not yet introduced' },
        ])}
      </section>
      <section class="card">
        <div class="eyebrow">Years 5-6</div>
        <h2 class="section-title">Upper KS2 spelling pool</h2>
        ${summaryCards([
          { label: 'Total', value: y56.total, sub: 'Words in pool' },
          { label: 'Secure', value: y56.secure, sub: 'Stable recall' },
          { label: 'Trouble', value: y56.trouble, sub: 'Weak or fragile' },
          { label: 'Unseen', value: y56.fresh, sub: 'Not yet introduced' },
        ])}
      </section>
      ${renderWordBank({ learner, analytics, searchQuery, statusFilter })}
    </div>
  `;
}

function renderProfiles({ learner }) {
  return `
    <div class="two-col">
      <section class="card">
        <div class="eyebrow">Current learner</div>
        <h2 class="section-title">Spelling profile hooks</h2>
        <p class="subtitle">This subject uses the shared learner profile rather than owning its own profile system.</p>
        <div class="stat-grid">
          <div class="stat"><div class="stat-label">Name</div><div class="stat-value" style="font-size:1.1rem;">${escapeHtml(learner.name)}</div></div>
          <div class="stat"><div class="stat-label">Year group</div><div class="stat-value" style="font-size:1.1rem;">${escapeHtml(learner.yearGroup)}</div></div>
          <div class="stat"><div class="stat-label">Goal</div><div class="stat-value" style="font-size:1.1rem;">${escapeHtml(learner.goal)}</div></div>
          <div class="stat"><div class="stat-label">Daily target</div><div class="stat-value" style="font-size:1.1rem;">${learner.dailyMinutes} min</div></div>
        </div>
      </section>
      <section class="card soft">
        <div class="eyebrow">Why this matters</div>
        <h2 class="section-title">Spelling routing</h2>
        <div class="callout">Year group controls pool filtering, the dashboard keeps the engine deterministic, and future personalisation can sit above the engine instead of inside it.</div>
      </section>
    </div>
  `;
}

function renderSettings({ learner, service, spellingContent }) {
  const prefs = service.getPrefs(learner.id);
  const contentSummary = spellingContent?.getSummary?.() || null;
  const validationTone = contentSummary?.ok ? 'good' : 'bad';
  const publishDisabled = contentSummary && !contentSummary.ok ? 'disabled' : '';
  return `
    <div class="two-col">
      <section class="card">
        <div class="eyebrow">Spelling settings</div>
        <h2 class="section-title">Current defaults</h2>
        <div class="chip-row">
          <span class="chip">Mode: ${escapeHtml(prefs.mode)}</span>
          <span class="chip">Year filter: ${escapeHtml(prefs.yearFilter)}</span>
          <span class="chip">Round length: ${escapeHtml(prefs.roundLength)}</span>
          <span class="chip">Cloze: ${prefs.showCloze ? 'on' : 'off'}</span>
          <span class="chip">Auto speak: ${prefs.autoSpeak ? 'on' : 'off'}</span>
        </div>
      </section>
      <section class="card soft">
        <div class="eyebrow">Deployment mode</div>
        <h2 class="section-title">Remote sync adapter</h2>
        <p class="subtitle">Production syncs learner state and spelling content through the Cloudflare Worker/D1 repository. Local mode still uses deterministic browser storage for development.</p>
      </section>
      <section class="card" style="grid-column:1/-1;">
        <div class="eyebrow">Content model</div>
        <h2 class="section-title">Draft, published release, and runtime snapshot</h2>
        <p class="subtitle">Spelling content lives in a versioned draft/publish model. Runtime reads stay pinned to the current published release snapshot, so importing draft content does not silently change live practice.</p>
        <div class="chip-row">
          <span class="chip ${validationTone}">Validation: ${contentSummary?.ok ? 'ready to publish' : 'needs fixes'}</span>
          <span class="chip">Word lists: ${contentSummary?.wordListCount || 0}</span>
          <span class="chip">Words: ${contentSummary?.wordCount || 0}</span>
          <span class="chip">Sentence variants: ${contentSummary?.sentenceCount || 0}</span>
          <span class="chip">Published release: ${contentSummary?.publishedVersion ? `v${contentSummary.publishedVersion}` : 'none'}</span>
          <span class="chip">Release id: ${escapeHtml(contentSummary?.publishedReleaseId || 'none')}</span>
          <span class="chip ${contentSummary?.errorCount ? 'bad' : 'good'}">Errors: ${contentSummary?.errorCount || 0}</span>
          <span class="chip ${contentSummary?.warningCount ? 'warn' : 'good'}">Warnings: ${contentSummary?.warningCount || 0}</span>
        </div>
        <div class="actions" style="margin-top:16px;">
          <button class="btn secondary" data-action="spelling-content-export">Export content JSON</button>
          <button class="btn secondary" data-action="spelling-content-import">Import content JSON</button>
          <button class="btn primary" style="background:${SPELLING_ACCENT};" data-action="spelling-content-publish" ${publishDisabled}>Publish current draft</button>
          <button class="btn ghost" data-action="spelling-content-reset">Reset to bundled baseline</button>
        </div>
        <input id="spelling-content-import-file" type="file" accept="application/json,.json" hidden />
        <div class="callout" style="margin-top:16px;">This is a thin operator hook only. Import/export handles content packages, publish creates an immutable release, and the learner-facing spelling engine stays isolated from editorial state.</div>
      </section>
    </div>
  `;
}

function renderMethod() {
  return `
    <div class="two-col">
      <section class="card">
        <div class="eyebrow">Learning system</div>
        <h2 class="section-title">What Spelling owns</h2>
        <div class="code-block">word data\ndeterministic scheduler\nsubmission flow\nprogress stages\nsummary generation</div>
      </section>
      <section class="card">
        <div class="eyebrow">Game layer</div>
        <h2 class="section-title">What the platform owns</h2>
        <div class="code-block">codex state\nreward events\nheader/dashboard surfaces\ncollection UI\nfuture quests and cosmetics</div>
      </section>
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
    return renderPracticeDashboard({ ...context, learner });
  },
  renderAnalytics(context) {
    const learner = context.appState.learners.byId[context.appState.learners.selectedId];
    return renderAnalytics({ ...context, learner });
  },
  renderProfiles(context) {
    const learner = context.appState.learners.byId[context.appState.learners.selectedId];
    return renderProfiles({ ...context, learner });
  },
  renderSettings(context) {
    const learner = context.appState.learners.byId[context.appState.learners.selectedId];
    return renderSettings({ ...context, learner });
  },
  renderMethod() {
    return renderMethod();
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
      service.savePrefs(learnerId, { [data.pref]: data.checked === true });
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

    if (action === 'spelling-practice-single') {
      const slug = data.slug;
      if (!slug) return true;
      tts.stop();
      return applyTransition(service.startSession(learnerId, {
        mode: 'single',
        words: [slug],
        yearFilter: 'all',
        length: 1,
        practiceOnly: true,
      }));
    }

    return false;
  },
};
