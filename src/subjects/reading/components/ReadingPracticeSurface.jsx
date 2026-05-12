import { ProgressMeter } from '../../../platform/ui/ProgressMeter.jsx';
import { HeroBackdrop } from '../../../platform/ui/HeroBackdrop.jsx';
import { HeroWelcome } from '../../../platform/ui/HeroWelcome.jsx';
import { Button } from '../../../platform/ui/Button.jsx';
import { SetupMorePractice } from '../../../platform/ui/SetupMorePractice.jsx';
import { SetupSidePanel } from '../../../platform/ui/SetupSidePanel.jsx';
import { SubjectCompanionPanel } from '../../../platform/ui/SubjectCompanionPanel.jsx';
import { SubjectThemeScope } from '../../../platform/ui/SubjectThemeScope.jsx';
import { PracticeStage } from '../../../platform/ui/PracticeStage.jsx';
import { useSetupHeroContrast } from '../../../platform/ui/useSetupHeroContrast.js';
import { useMonsterVisualConfig } from '../../../platform/game/MonsterVisualConfigContext.jsx';
import { activeReadingMonsterSummaryFromState } from '../../../platform/game/mastery/reading.js';
import { buildMonsterAssetKey, resolveMonsterVisual } from '../../../platform/game/monster-visual-config.js';
import { MONSTER_ASSET_MANIFEST } from '../../../platform/game/monster-asset-manifest.js';
import { monsterVisualFrameStyle } from '../../../platform/game/monster-visual-style.js';
import {
  READING_DIFFICULTY_OPTIONS,
  READING_GENRE_OPTIONS,
  READING_MODE_OPTIONS,
  READING_SKILL_OPTIONS,
  questionTypeLabel,
} from '../metadata.js';
import { normaliseReadingReadModel } from '../client-read-models.js';

const MONSTER_CODEX_SYSTEM_ID = 'monster-codex';
const READING_HERO_BASE = '/assets/regions/the-moonleaf-archive';
const MONSTER_ASSET_KEYS = new Set(MONSTER_ASSET_MANIFEST.assets.map((asset) => asset.key));
const READING_PRIMARY_MODE_IDS = Object.freeze(['smart', 'guided', 'test']);
const READING_PRIMARY_MODE_CARDS = Object.freeze([
  Object.freeze({
    id: 'smart',
    glyph: 'S',
    title: 'Smart Review',
    desc: 'Weak, due and under-practised domains chosen for today.',
    badge: 'RECOMMENDED',
  }),
  Object.freeze({
    id: 'guided',
    glyph: 'G',
    title: 'Guided Practice',
    desc: 'A shorter passage with immediate feedback after each answer.',
  }),
  Object.freeze({
    id: 'test',
    glyph: 'P',
    title: 'SATs Paper',
    desc: 'Three texts, delayed feedback, and a full 50-mark routine.',
  }),
]);

const READING_MORE_MODE_CARDS = Object.freeze(
  READING_MODE_OPTIONS
    .filter((option) => !READING_PRIMARY_MODE_IDS.includes(option.id))
    .map((option) => Object.freeze({
      id: option.id,
      title: option.label,
      desc: option.description,
    })),
);

const READING_HERO_MODE_REGION = Object.freeze({
  smart: 'a',
  guided: 'a',
  core: 'b',
  evidence: 'b',
  vocab: 'c',
  inference: 'c',
  punct: 'd',
  stamina: 'e',
  stretch: 'e',
  test: 'e',
});

const READING_HERO_CONTRAST = Object.freeze({
  1: Object.freeze({
    tone: '1',
    shell: 'dark',
    controls: 'dark',
    cards: Object.freeze(['dark', 'dark', 'dark']),
  }),
  2: Object.freeze({
    tone: '2',
    shell: 'light',
    controls: 'light',
    cards: Object.freeze(['light', 'light', 'light']),
  }),
  3: Object.freeze({
    tone: '3',
    shell: 'light',
    controls: 'light',
    cards: Object.freeze(['light', 'light', 'light']),
  }),
});

function dispatch(actions, action, data = {}) {
  if (typeof actions?.dispatch === 'function') actions.dispatch(action, data);
}

function Stat({ label, value }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}

function ReadingSetupSelect({ label, name, value, options, disabled, onChange }) {
  return (
    <label className="reading-setup-select">
      <span className="tool-label">{label}</span>
      <select
        name={name}
        value={value || ''}
        disabled={disabled}
        onChange={(event) => onChange(name, event.currentTarget.value)}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function inputName(name, prefix = '') {
  return `${prefix || ''}${name}`;
}

function statusLabel(status) {
  return ({
    blank: 'Not answered',
    saved: 'Saved',
    correct: 'Correct',
    partial: 'Partly right',
    wrong: 'Review',
  })[status] || 'Not answered';
}

function statusTone(status) {
  return ({
    saved: 'saved',
    correct: 'good',
    partial: 'warn',
    wrong: 'bad',
  })[status] || 'blank';
}

function isPending(ui) {
  return Boolean(ui?.pendingCommand);
}

function canGoPrevious(session) {
  return Boolean(session && (session.currentSectionIndex > 0 || session.currentQuestionIndex > 0));
}

function canGoNext(session) {
  if (!session) return false;
  const sectionTotal = session.questionNav?.length || session.currentSection?.total || session.questionCount || 0;
  if (session.currentQuestionIndex < sectionTotal - 1) return true;
  return session.currentSectionIndex < (session.sectionNav?.length || 1) - 1;
}

function hasMarkedQuestion(question) {
  return Boolean(question?.result || question?.status === 'correct' || question?.status === 'partial' || question?.status === 'wrong');
}

function markActionLabel(session) {
  if (session?.strict) return 'Mark whole paper';
  if (session?.mode === 'stretch') return 'Mark challenge';
  if (session?.viewMode === 'list') return 'Mark this section';
  return 'Mark now';
}

function markActionHint(session) {
  if (session?.strict) return 'Checks every saved answer in this paper and then shows feedback.';
  if (session?.mode === 'stretch') return 'Checks the full stretch set after you have saved your answers, then shows feedback.';
  if (session?.viewMode === 'list') return 'Checks the visible question list and then shows feedback for this text.';
  return 'Checks your saved answer now and then shows feedback.';
}

function primarySubmitLabel(session, result) {
  if (result) return 'Next question';
  if (!session?.delayedFeedback) return 'Submit answer';
  return canGoNext(session) ? 'Save and next' : 'Save answer';
}

function readingHeroTone(learnerId = '') {
  const source = String(learnerId || 'reading');
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = ((hash * 31) + source.charCodeAt(index)) >>> 0;
  }
  return String((hash % 3) + 1);
}

function readingHeroBgForMode(mode = 'smart', learnerId = '') {
  const region = READING_HERO_MODE_REGION[mode] || READING_HERO_MODE_REGION.smart;
  const tone = readingHeroTone(learnerId);
  return `${READING_HERO_BASE}/the-moonleaf-archive-${region}${tone}.1280.webp`;
}

function readingHeroToneForBg(url) {
  const match = String(url || '').match(/the-moonleaf-archive-[a-e]([1-3])\.1280\.webp(?:$|[?#])/);
  return match?.[1] || '';
}

function readingHeroContrastProfile(url) {
  const tone = readingHeroToneForBg(url);
  return READING_HERO_CONTRAST[tone] || null;
}

export function readingMonsterImageVisual(monsterId, progress, config) {
  const stage = Math.max(0, Math.min(4, Number(progress?.displayStage ?? progress?.stage) || 0));
  const branch = progress?.branch || 'b1';
  const assetMonsterId = progress?.monster?.assetId || monsterId;
  const assetKey = buildMonsterAssetKey(assetMonsterId, branch, stage);
  if (!MONSTER_ASSET_KEYS.has(assetKey)) return null;
  const visual = resolveMonsterVisual({
    monsterId: assetMonsterId,
    branch,
    stage,
    context: 'meadow',
    config,
    preferredSize: 320,
  });
  return {
    style: monsterVisualFrameStyle(visual),
    imageProps: {
      src: visual.src,
      srcSet: visual.srcSet,
      sizes: '(max-width: 720px) 96px, 120px',
      loading: 'lazy',
      decoding: 'async',
    },
  };
}

function resolveReadingRewardState(repositories, learnerId) {
  if (!learnerId || typeof repositories?.gameState?.read !== 'function') return {};
  try {
    const state = repositories.gameState.read(learnerId, MONSTER_CODEX_SYSTEM_ID);
    return state && typeof state === 'object' && !Array.isArray(state) ? state : {};
  } catch (_error) {
    return {};
  }
}

function selectedReadingModeLabel(mode) {
  return READING_MODE_OPTIONS.find((option) => option.id === mode)?.label || 'Smart Review';
}

function ReadingModeCard({ card, selected, disabled, actions, textTone }) {
  const classes = ['reading-primary-mode', 'mode-card'];
  if (selected) classes.push('selected');
  if (disabled) classes.push('is-disabled');
  return (
    <button
      type="button"
      className={classes.join(' ')}
      data-mode-id={card.id}
      data-action="reading-save-prefs"
      data-text-tone={textTone}
      aria-pressed={selected ? 'true' : 'false'}
      disabled={disabled}
      aria-disabled={disabled ? 'true' : undefined}
      onClick={() => dispatch(actions, 'reading-save-prefs', { mode: card.id })}
    >
      <div className="mc-top">
        <span className="mc-icon mc-icon-glyph" aria-hidden="true">
          <span className="mc-glyph">{card.glyph}</span>
        </span>
        {card.badge ? <span className="mc-badge recommended">{card.badge}</span> : <span className="mc-badge-spacer" aria-hidden="true" />}
      </div>
      <h4>{card.title}</h4>
      <p>{card.desc}</p>
    </button>
  );
}

function ReadingMoreModeCard({ card, selected, disabled, actions }) {
  return (
    <button
      type="button"
      className={`reading-secondary-mode${selected ? ' selected' : ''}${disabled ? ' is-disabled' : ''}`}
      data-mode-id={card.id}
      data-action="reading-save-prefs"
      aria-pressed={selected ? 'true' : 'false'}
      disabled={disabled}
      onClick={() => dispatch(actions, 'reading-save-prefs', { mode: card.id })}
    >
      <h5>{card.title}</h5>
      <p>{card.desc}</p>
    </button>
  );
}

function ReadingSetup({ appState, ui, actions, repositories }) {
  const prefs = ui.prefs || {};
  const learnerId = appState?.learners?.selectedId || ui.learnerId || '';
  const learner = learnerId ? appState?.learners?.byId?.[learnerId] || null : null;
  const learnerName = typeof learner?.name === 'string' ? learner.name.trim() : '';
  const setupDisabled = Boolean(ui.pendingCommand);
  const stretchModeSelected = prefs.mode === 'stretch';
  const heroBg = readingHeroBgForMode(prefs.mode, learnerId);
  const heroContrast = useSetupHeroContrast(heroBg, prefs.mode, {
    staticContrastForBg: readingHeroContrastProfile,
    cardSelector: '.reading-primary-mode',
    controlSelectors: ['.tool-label', '.length-unit'],
  });
  const setupClasses = ['setup-main', 'reading-setup-main'];
  if (heroContrast.contrast.shell === 'light') setupClasses.push('hero-dark');

  const rewardState = resolveReadingRewardState(repositories, learnerId);
  const monsterVisualConfig = useMonsterVisualConfig();
  const panelMonsterEntries = activeReadingMonsterSummaryFromState(rewardState).slice(0, 4);
  const resolvedPanelMonsterVisuals = panelMonsterEntries
    .map(({ monster, progress }) => ({
      id: monster.id,
      visual: readingMonsterImageVisual(monster.assetId || monster.id, { ...progress, monster }, monsterVisualConfig?.config),
      isEgg: (progress.displayStage ?? progress.stage) === 0,
    }))
    .filter((entry) => entry.visual);
  const panelMonsterVisuals = resolvedPanelMonsterVisuals.length === panelMonsterEntries.length
    ? resolvedPanelMonsterVisuals
    : [];
  const panelMonsterFallbacks = panelMonsterEntries.map(({ monster }) => ({
    name: monster.name || monster.id,
    discovered: true,
  }));

  const overview = ui.stats?.overview || {};
  const startLabel = ui.pendingCommand === 'start-session'
    ? 'Starting...'
    : `Start ${selectedReadingModeLabel(prefs.mode)}`;

  function updatePref(name, value) {
    dispatch(actions, 'reading-save-prefs', { [name]: value });
  }

  function start() {
    dispatch(actions, 'reading-start', prefs);
  }

  return (
    <PracticeStage subjectId="reading" scene="setup" backdrop="library" motion="calm">
      <SubjectThemeScope subjectId="reading" className="setup-grid reading-setup-grid">
        <section
          className={setupClasses.join(' ')}
          data-react-hero-contrast="true"
          data-hero-tone={heroContrast.contrast.tone || undefined}
          data-controls-tone={heroContrast.contrast.controls}
          ref={heroContrast.ref}
          aria-label="Start Reading practice"
        >
          <HeroBackdrop url={heroBg} />
          <div className="setup-content">
            <p className="eyebrow">Moonleaf Archive</p>
            <h1 className="title reading-hero-title">Reading missions</h1>
            <p className="lede reading-hero-subtitle">Pick the routine, read the text carefully, and answer from evidence.</p>
            <HeroWelcome name={learnerName} className="reading-hero-welcome" />

            <div className="mode-row reading-mode-row">
              {READING_PRIMARY_MODE_CARDS.map((card, index) => (
                <ReadingModeCard
                  card={card}
                  selected={prefs.mode === card.id}
                  disabled={setupDisabled}
                  actions={actions}
                  textTone={heroContrast.contrast.cards[index] || heroContrast.contrast.shell}
                  key={card.id}
                />
              ))}
            </div>

            <div className="setup-control-stack reading-control-stack">
              <div className="tweak-row reading-preference-row">
                <ReadingSetupSelect label="Reading focus" name="focusSkillId" value={prefs.focusSkillId} options={READING_SKILL_OPTIONS} disabled={setupDisabled || stretchModeSelected} onChange={updatePref} />
                <ReadingSetupSelect label="Passage type" name="genre" value={prefs.genre} options={READING_GENRE_OPTIONS} disabled={setupDisabled} onChange={updatePref} />
              </div>
              <div className="tweak-row reading-preference-row">
                <ReadingSetupSelect label="Difficulty" name="difficulty" value={prefs.difficulty} options={READING_DIFFICULTY_OPTIONS} disabled={setupDisabled || stretchModeSelected} onChange={updatePref} />
                <ReadingSetupSelect
                  label="Question view"
                  name="viewMode"
                  value={prefs.viewMode || 'one'}
                  options={[
                    { id: 'one', label: 'One at a time' },
                    { id: 'list', label: 'Full question list' },
                  ]}
                  disabled={setupDisabled}
                  onChange={updatePref}
                />
              </div>
            </div>

            {ui.error ? (
              <div className="feedback bad" role="alert">
                <strong>Reading is unavailable right now</strong>
                <div>{ui.error}</div>
              </div>
            ) : null}

            <div className="setup-begin-row reading-start-row">
              <Button
                size="xl"
                data-featured="true"
                dataAction="reading-start"
                disabled={setupDisabled}
                onClick={start}
              >
                {startLabel}
              </Button>
            </div>
          </div>
        </section>

        <SetupSidePanel
          asideClassName="reading-setup-sidebar"
          cardClassName="reading-setup-sidebar-card"
          ariaLabel="Where you stand in Reading"
          body={(
            <SubjectCompanionPanel
              subjectId="reading"
              visible
              head={(
                <>
                  <p className="eyebrow">Where you stand</p>
                  <button
                    type="button"
                    className="ss-codex-link"
                    data-action="open-codex"
                    aria-label="Open the full codex"
                    onClick={() => dispatch(actions, 'open-codex')}
                  >
                    Open codex →
                  </button>
                </>
              )}
              monsterVisuals={panelMonsterVisuals}
              monsters={panelMonsterVisuals.length ? [] : panelMonsterFallbacks}
              meadowEmpty={panelMonsterFallbacks.length ? '' : 'Start practising to discover your Reading creatures.'}
              stats={[
                { label: 'Marked', value: String(overview.totalQuestions || 0) },
                { label: 'Accuracy', value: `${overview.accuracy || 0}%` },
                { label: 'Independent', value: `${overview.independentAccuracy || 0}%` },
                { label: 'Due today', value: String(overview.due || 0), tone: overview.due > 0 ? 'warn' : undefined },
              ]}
              nextFocus={overview.weak > 0 ? 'Weak Reading domains need repair' : ui.parentSummary}
            />
          )}
        />

        <SetupMorePractice
          summary="More Reading practice"
          disclosureClassName="setup-more-practice reading-more-practice"
          gridClassName="setup-more-practice-grid reading-more-practice-grid"
          cards={READING_MORE_MODE_CARDS}
          renderCard={(card) => (
            <ReadingMoreModeCard
              card={card}
              selected={prefs.mode === card.id}
              disabled={setupDisabled}
              actions={actions}
              key={card.id}
            />
          )}
        />
      </SubjectThemeScope>
    </PracticeStage>
  );
}

function PassagePanel({ passage, showParagraphNumbers = true }) {
  if (!passage) return null;
  return (
    <section className="card">
      <div className="eyebrow">Passage</div>
      <h2 className="section-title">{passage.title}</h2>
      <div className="chip-row reading-chip-row-before">
        <span className="chip">{passage.genre}</span>
        <span className="chip">Difficulty {passage.difficulty}</span>
        <span className="chip">{passage.wordCount} words</span>
      </div>
      <div className={`reading-passage${passage.genre === 'poetry' ? ' is-poetry' : ''}`}>
        {(passage.blocks || []).map((block, index) => (
          <p key={index}>
            {showParagraphNumbers ? <strong className="reading-paragraph-number">{index + 1}</strong> : null}
            {block}
          </p>
        ))}
      </div>
    </section>
  );
}

function QuestionInput({ question, response = {}, disabled = false, prefix = '' }) {
  if (!question) return null;
  if (question.type === 'mcq') {
    return (
      <fieldset className="answer-box" disabled={disabled}>
        <legend>Your answer</legend>
        {(question.options || []).map((option, index) => (
          <label key={index} className="option-row">
            <input type="radio" name={inputName('answer', prefix)} value={String(index)} defaultChecked={String(response.answer) === String(index)} />
            <span>{option}</span>
          </label>
        ))}
      </fieldset>
    );
  }
  if (question.type === 'multiSelect') {
    const selected = new Set((response.answer || []).map(String));
    return (
      <fieldset className="answer-box" disabled={disabled}>
        <legend>Choose all that apply</legend>
        {(question.options || []).map((option, index) => (
          <label key={index} className="option-row">
            <input type="checkbox" name={inputName('answer', prefix)} value={String(index)} defaultChecked={selected.has(String(index))} />
            <span>{option}</span>
          </label>
        ))}
      </fieldset>
    );
  }
  if (question.type === 'evidenceShort') {
    return (
      <div className="answer-grid">
        <label className="field">
          <span>Your answer</span>
          <input name={inputName('answer', prefix)} defaultValue={response.answer || ''} disabled={disabled} />
        </label>
        <label className="field">
          <span>Evidence from the text</span>
          <textarea name={inputName('evidence', prefix)} defaultValue={response.evidence || ''} disabled={disabled} />
        </label>
      </div>
    );
  }
  if (question.type === 'open') {
    return (
      <label className="field">
        <span>Your written answer</span>
        <textarea name={inputName('answer', prefix)} defaultValue={response.answer || ''} disabled={disabled} />
      </label>
    );
  }
  if (question.type === 'match') {
    return (
      <table className="small-table">
        <thead><tr><th>Detail</th><th>Best match</th></tr></thead>
        <tbody>
          {(question.prompts || []).map((prompt, index) => (
            <tr key={index}>
              <td>{prompt}</td>
              <td>
                <select name={inputName(`map_${index}`, prefix)} defaultValue={response.map?.[index] || ''} disabled={disabled}>
                  <option value="">Choose</option>
                  {(question.options || []).map((option, optionIndex) => <option key={optionIndex} value={String(optionIndex)}>{option}</option>)}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (question.type === 'order') {
    return (
      <table className="small-table">
        <thead><tr><th>Event</th><th>Position</th></tr></thead>
        <tbody>
          {(question.items || []).map((item, index) => (
            <tr key={index}>
              <td>{item}</td>
              <td>
                <select name={inputName(`order_${index}`, prefix)} defaultValue={response.order?.[index] || ''} disabled={disabled}>
                  <option value="">Choose</option>
                  {(question.items || []).map((_, posIndex) => <option key={posIndex} value={String(posIndex + 1)}>{posIndex + 1}</option>)}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  return (
    <label className="field">
      <span>Your answer</span>
      <input name={inputName('answer', prefix)} defaultValue={response.answer || ''} disabled={disabled} />
    </label>
  );
}

function Feedback({ feedback }) {
  if (!feedback?.result) return null;
  const result = feedback.result;
  const tone = result.correct ? 'good' : result.score > 0 ? 'warn' : 'bad';
  return (
    <div className={`feedback ${tone} reading-feedback`}>
      <strong>{result.correct ? 'Correct' : result.score > 0 ? 'Partly right' : 'Review this answer'}</strong>
      <p>{result.feedbackLong}</p>
      {feedback.misconceptionLabel ? <p><strong>Watch for:</strong> {feedback.misconceptionLabel}</p> : null}
      <div className="callout reading-feedback-model">
        <strong>Model answer</strong>
        <p>{result.modelAnswer}</p>
        {result.evidenceSnippets?.length ? (
          <ul>{result.evidenceSnippets.map((snippet, index) => <li key={index}>{snippet}</li>)}</ul>
        ) : null}
      </div>
    </div>
  );
}

function QuestionNavBar({ session, actions, disabled = false, formId = '' }) {
  const nav = session?.questionNav || [];
  if (!nav.length) return null;
  function jump(event, index) {
    if (disabled || index === session.currentQuestionIndex) return;
    const form = event.currentTarget.form;
    if (!session.result && form) {
      dispatch(actions, 'reading-save-response', { formData: new FormData(form), move: { questionIndex: index } });
    } else {
      dispatch(actions, 'reading-move', { questionIndex: index });
    }
  }
  return (
    <div className="reading-question-nav" aria-label="Reading question navigation">
      {nav.map((item) => (
        <button
          key={item.id}
          type="button"
          form={formId || undefined}
          className={`reading-nav-chip ${item.current ? 'current' : ''} ${statusTone(item.status)}`}
          onClick={(event) => jump(event, item.index)}
          disabled={disabled}
          aria-current={item.current ? 'step' : undefined}
          title={`Question ${item.index + 1}: ${statusLabel(item.status)}`}
        >
          <span>{item.index + 1}</span>
          <small>{statusLabel(item.status)}</small>
        </button>
      ))}
    </div>
  );
}

function QuestionPanel({ ui, actions }) {
  const session = ui.session;
  const question = session?.currentQuestion;
  const result = session?.result;
  if (!session || !question) return null;
  const response = session.response || {};
  const disabled = Boolean(result);
  const pending = isPending(ui);
  const formId = `reading-question-form-${session.id}`;
  const feedback = ui.feedback || (result ? { result } : null);
  const primaryLabel = primarySubmitLabel(session, result);
  const showDraftNextButton = !session.delayedFeedback || disabled;
  function submit(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    if (session.delayedFeedback && !result) {
      dispatch(actions, 'reading-save-response', { formData, advance: true });
      return;
    }
    dispatch(actions, 'reading-submit-form', { formData });
  }

  function saveAndMove(event, move) {
    const form = event.currentTarget.form;
    if (!disabled && form) dispatch(actions, 'reading-save-response', { formData: new FormData(form), move });
    else dispatch(actions, 'reading-move', move);
  }

  function finish(event) {
    const form = event.currentTarget.form;
    dispatch(actions, session.strict ? 'reading-mark-session' : 'reading-mark-section', { formData: form ? new FormData(form) : null });
  }

  return (
    <section className="card reading-question-card">
      <div className="reading-active-step">
        <div>
          <div className="eyebrow">Question {session.currentQuestionIndex + 1} of {session.questionNav?.length || session.questionCount}</div>
          <h2 className="section-title">Answer from the passage</h2>
        </div>
        <span className={`reading-status-badge ${statusTone(session.questionNav?.[session.currentQuestionIndex]?.status)}`}>
          {statusLabel(session.questionNav?.[session.currentQuestionIndex]?.status)}
        </span>
      </div>
      <QuestionNavBar session={session} actions={actions} disabled={pending} formId={formId} />
      <div className="chip-row reading-chip-row-before">
        <span className="chip">{question.marks} mark{question.marks === 1 ? '' : 's'}</span>
        <span className="chip">{questionTypeLabel(question.type)}</span>
        {question.skillName ? <span className="chip">{question.skillName}</span> : null}
      </div>
      <div className="callout reading-session-guidance">
        {session.delayedFeedback && !result
          ? 'Paper-style mode: save your answer, move on, and mark only when you are ready for feedback.'
          : result
            ? 'Review the model answer and evidence, then move to the next question.'
            : 'Read the passage first, answer without clues, then submit for feedback.'}
      </div>
      {session.delayedFeedback || session.strict ? <p className="tiny reading-mark-action-hint">{markActionHint(session)}</p> : null}
      <form id={formId} key={question.id} onSubmit={submit} data-reading-active-form="true">
        <p className="question-stem">{question.stem}</p>
        <QuestionInput question={question} response={response} disabled={disabled} />
        <div className="actions reading-actions-spaced">
          {!disabled ? <button className="btn primary" type="submit" disabled={pending}>{primaryLabel}</button> : null}
          <button className="btn ghost" type="button" onClick={(event) => saveAndMove(event, { delta: -1 })} disabled={pending || !canGoPrevious(session)}>Previous</button>
          {showDraftNextButton ? <button className="btn secondary" type="button" onClick={(event) => saveAndMove(event, { delta: 1 })} disabled={pending || !canGoNext(session)}>{disabled ? 'Next question' : 'Save draft and next'}</button> : null}
          {session.delayedFeedback || session.strict ? <button className="btn warn" type="button" onClick={finish} disabled={pending}>{markActionLabel(session)}</button> : null}
          <button className="btn ghost" type="button" onClick={() => dispatch(actions, 'reading-end')} disabled={pending}>End round</button>
        </div>
      </form>
      <Feedback feedback={feedback} />
    </section>
  );
}

function QuestionListPanel({ ui, actions }) {
  const session = ui.session;
  const questions = session?.questions || [];
  if (!session || !questions.length) return null;
  const pending = isPending(ui);

  function saveSection(event) {
    const form = event.currentTarget.form;
    dispatch(actions, 'reading-save-section', { formData: form ? new FormData(form) : null });
  }

  function mark(event) {
    event.preventDefault();
    dispatch(actions, session.strict ? 'reading-mark-session' : 'reading-mark-section', { formData: new FormData(event.currentTarget) });
  }

  return (
    <section className="card reading-question-card reading-question-list-card">
      <div className="reading-active-step">
        <div>
          <div className="eyebrow">{session.currentSection?.title || 'Current text'}</div>
          <h2 className="section-title">Answer this text's question list</h2>
        </div>
        <span className="reading-status-badge saved">{session.currentSection?.answered || 0}/{session.currentSection?.total || questions.length} saved</span>
      </div>
      <div className="reading-question-nav" aria-label="Question list shortcuts">
        {questions.map((questionItem) => (
          <a key={questionItem.id} className={`reading-nav-chip ${statusTone(questionItem.status)}`} href={`#reading-q-${questionItem.id}`}>
            <span>{questionItem.index + 1}</span>
            <small>{statusLabel(questionItem.status)}</small>
          </a>
        ))}
      </div>
      <div className="callout reading-session-guidance">
        {session.strict
          ? 'SATs-style mode: answer each text inside this Reading frame, then mark the whole paper when you want feedback.'
          : 'Use the passage beside this card, save the visible section as you go, and mark only when you are ready for feedback.'}
      </div>
      <p className="tiny reading-mark-action-hint">{markActionHint(session)}</p>
      <form className="reading-list-form" onSubmit={mark} data-reading-active-form="true">
        {questions.map((questionItem) => {
          const marked = hasMarkedQuestion(questionItem);
          return (
            <article key={questionItem.id} id={`reading-q-${questionItem.id}`} className={`reading-list-question ${marked ? 'is-marked' : ''}`}>
              <div className="reading-list-question-header">
                <div>
                  <strong>Question {questionItem.index + 1}</strong>
                  <div className="chip-row reading-chip-row-before">
                    <span className="chip">{questionItem.marks} mark{questionItem.marks === 1 ? '' : 's'}</span>
                    <span className="chip">{questionTypeLabel(questionItem.type)}</span>
                    {questionItem.skillName ? <span className="chip">{questionItem.skillName}</span> : null}
                  </div>
                </div>
                <span className={`reading-status-badge ${statusTone(questionItem.status)}`}>{statusLabel(questionItem.status)}</span>
              </div>
              <p className="question-stem">{questionItem.stem}</p>
              <QuestionInput question={questionItem} response={questionItem.response || {}} disabled={marked} prefix={`q_${questionItem.id}_`} />
              <Feedback feedback={questionItem.result ? { result: questionItem.result } : null} />
            </article>
          );
        })}
        <div className="actions reading-actions-spaced">
          <button className="btn secondary" type="button" onClick={saveSection} disabled={pending}>Save this section</button>
          <button className="btn warn" type="submit" disabled={pending}>{markActionLabel(session)}</button>
          <button className="btn ghost" type="button" onClick={() => dispatch(actions, 'reading-end')} disabled={pending}>End round</button>
        </div>
      </form>
    </section>
  );
}

function activeReadingFormData() {
  if (typeof document === 'undefined') return null;
  const form = document.querySelector('[data-reading-active-form="true"]');
  return form ? new FormData(form) : null;
}

function SessionHud({ ui }) {
  const session = ui.session;
  if (!session) return null;
  function moveToSection(section) {
    const move = { sectionIndex: section.index, questionIndex: 0 };
    const formData = activeReadingFormData();
    if (formData && session.viewMode === 'list') {
      dispatch(ui.actions, 'reading-save-section', { formData, move });
      return;
    }
    if (formData && !session.result) {
      dispatch(ui.actions, 'reading-save-response', { formData, move });
      return;
    }
    dispatch(ui.actions, 'reading-move', move);
  }
  return (
    <section className="card reading-session-hud">
      <div className="stats-row">
        <Stat label="Answered" value={`${session.answeredCount}/${session.questionCount}`} />
        <Stat label="Marked" value={`${session.markedCount}/${session.questionCount}`} />
        <Stat label="Score" value={`${session.score}/${session.maxScore}`} />
        <Stat label="Mode" value={session.mode} />
      </div>
      {session.sectionNav?.length > 1 ? (
        <div className="chip-row reading-section-nav">
          {session.sectionNav.map((section) => (
            <button key={section.index} className={`chip ${section.current ? 'good' : ''}`} type="button" onClick={() => moveToSection(section)}>{section.title}</button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ReadingSession({ ui, actions }) {
  const session = { ...ui.session };
  const uiWithActions = { ...ui, actions, session };
  return (
    <>
      <SessionHud ui={uiWithActions} />
      <div className="grid two subject-practice-grid">
        <PassagePanel passage={session.passage} showParagraphNumbers={ui.prefs?.showParagraphNumbers !== false} />
        {session.viewMode === 'list' ? <QuestionListPanel ui={uiWithActions} actions={actions} /> : <QuestionPanel ui={uiWithActions} actions={actions} />}
      </div>
    </>
  );
}

function ReadingSummary({ ui, actions }) {
  const summary = ui.summary || {};
  return (
    <div className="grid two">
      <section className="card border-top reading-accent-card">
        <div className="eyebrow">Reading session complete</div>
        <h2 className="section-title">{summary.score || 0}/{summary.maxScore || 0} marks</h2>
        <p className="subtitle">Accuracy: {summary.accuracy || 0}% · {summary.questionCount || 0} questions marked.</p>
        <div className="actions reading-actions-spaced">
          <button className="btn primary" type="button" onClick={() => dispatch(actions, 'reading-start', ui.prefs)}>Start another</button>
          <button className="btn ghost" type="button" onClick={() => dispatch(actions, 'reading-back')}>← Back to setup</button>
        </div>
      </section>
      <section className="card">
        <div className="eyebrow">What to do next</div>
        <p>{ui.parentSummary}</p>
      </section>
    </div>
  );
}

function ReadingAnalytics({ ui }) {
  const skills = ui.analytics?.skills || ui.stats?.skills || [];
  return (
    <section className="card reading-analytics">
      <div className="eyebrow">Reading domain strength</div>
      <div className="skill-list">
        {skills.map((skill) => (
          <div className="skill-row" key={skill.id}>
            <div><strong>{skill.name}</strong><div className="tiny">{skill.status}</div></div>
            <ProgressMeter
              className="reading-skill-meter"
              value={skill.strength || 0}
              label={`${skill.name} strength`}
            />
            <div>{skill.strength || 0}%</div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ReadingPracticeSurface({ appState, actions, repositories }) {
  const learnerId = appState?.learners?.selectedId || '';
  const ui = normaliseReadingReadModel(appState?.subjectUi?.reading, learnerId);
  if (ui.phase === 'summary') return <ReadingSummary ui={ui} actions={actions} />;
  if (ui.session) return <ReadingSession ui={ui} actions={actions} />;
  return (
    <>
      <ReadingSetup appState={appState} ui={ui} actions={actions} repositories={repositories} />
      <ReadingAnalytics ui={ui} />
    </>
  );
}
