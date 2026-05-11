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
import { activeReasoningMonsterSummaryFromState } from '../../../platform/game/mastery/reasoning.js';
import { buildMonsterAssetKey, resolveMonsterVisual } from '../../../platform/game/monster-visual-config.js';
import { MONSTER_ASSET_MANIFEST } from '../../../platform/game/monster-asset-manifest.js';
import { monsterVisualFrameStyle } from '../../../platform/game/monster-visual-style.js';
import {
  REASONING_MODE_OPTIONS,
  REASONING_PRIMARY_MODE_IDS,
  REASONING_ROUND_LENGTH_OPTIONS,
  REASONING_SET_SIZE_OPTIONS,
  REASONING_SKILL_OPTIONS,
  questionTypeLabel,
} from '../metadata.js';
import { normaliseReasoningReadModel } from '../client-read-models.js';

const MONSTER_CODEX_SYSTEM_ID = 'monster-codex';
const REASONING_HERO_BASE = '/assets/regions/paradox-spires';
const MONSTER_ASSET_KEYS = new Set(MONSTER_ASSET_MANIFEST.assets.map((asset) => asset.key));

const PRIMARY_MODE_CARDS = Object.freeze([
  { id: 'smart', glyph: 'S', title: 'Smart Review', desc: 'Mixed due, weak and new reasoning structures.', badge: 'RECOMMENDED' },
  { id: 'trouble', glyph: 'T', title: 'Trouble Drill', desc: 'Recent misses and weak templates first.' },
  { id: 'satsset', glyph: 'P', title: 'SATs Mini-Set', desc: 'Timed mixed practice with delayed feedback.' },
]);

const MORE_MODE_CARDS = Object.freeze(
  REASONING_MODE_OPTIONS
    .filter((option) => !REASONING_PRIMARY_MODE_IDS.includes(option.id))
    .map((option) => Object.freeze({ id: option.id, title: option.label, desc: option.description })),
);

const MODE_REGION = Object.freeze({
  smart: 'a',
  skill: 'b',
  trouble: 'b',
  worked: 'c',
  faded: 'c',
  sats: 'd',
  satsset: 'e',
});

const HERO_CONTRAST = Object.freeze({
  1: Object.freeze({ tone: '1', shell: 'light', controls: 'light', cards: Object.freeze(['light', 'light', 'light']) }),
  2: Object.freeze({ tone: '2', shell: 'dark', controls: 'dark', cards: Object.freeze(['dark', 'dark', 'dark']) }),
  3: Object.freeze({ tone: '3', shell: 'light', controls: 'light', cards: Object.freeze(['light', 'light', 'light']) }),
});

function dispatch(actions, action, data = {}) {
  if (typeof actions?.dispatch === 'function') actions.dispatch(action, data);
}

function reasoningHeroTone(learnerId = '') {
  const source = String(learnerId || 'reasoning');
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) hash = ((hash * 31) + source.charCodeAt(index)) >>> 0;
  return String((hash % 3) + 1);
}

function reasoningHeroBgForMode(mode = 'smart', learnerId = '') {
  const region = MODE_REGION[mode] || MODE_REGION.smart;
  const tone = reasoningHeroTone(learnerId);
  return `${REASONING_HERO_BASE}/paradox-spires-${region}${tone}.1280.webp`;
}

function reasoningHeroToneForBg(url) {
  const match = String(url || '').match(/paradox-spires-[a-e]([1-3])\.1280\.webp(?:$|[?#])/);
  return match?.[1] || '';
}

function reasoningHeroContrastProfile(url) {
  const tone = reasoningHeroToneForBg(url);
  return HERO_CONTRAST[tone] || null;
}

function selectedModeLabel(mode) {
  return REASONING_MODE_OPTIONS.find((option) => option.id === mode)?.label || 'Smart Review';
}

function isPending(ui) {
  return Boolean(ui?.pendingCommand);
}

function statusLabel(status) {
  return ({ blank: 'Not answered', saved: 'Saved', correct: 'Correct', partial: 'Partly right', wrong: 'Review' })[status] || 'Not answered';
}

function statusTone(status) {
  return ({ saved: 'saved', correct: 'good', partial: 'warn', wrong: 'bad' })[status] || 'blank';
}

function canGoPrevious(session) {
  return Boolean(session && session.currentQuestionIndex > 0);
}

function canGoNext(session) {
  return Boolean(session && session.currentQuestionIndex < (session.questionCount || 1) - 1);
}

function resolveReasoningRewardState(repositories, learnerId) {
  if (!learnerId || typeof repositories?.gameState?.read !== 'function') return {};
  try {
    const state = repositories.gameState.read(learnerId, MONSTER_CODEX_SYSTEM_ID);
    return state && typeof state === 'object' && !Array.isArray(state) ? state : {};
  } catch (_error) {
    return {};
  }
}

export function reasoningMonsterImageVisual(monsterId, progress, config) {
  const stage = Math.max(0, Math.min(4, Number(progress?.displayStage ?? progress?.stage) || 0));
  const branch = progress?.branch || 'b1';
  const assetMonsterId = progress?.monster?.assetId || monsterId;
  const assetKey = buildMonsterAssetKey(assetMonsterId, branch, stage);
  if (!MONSTER_ASSET_KEYS.has(assetKey)) return null;
  const visual = resolveMonsterVisual({ monsterId: assetMonsterId, branch, stage, context: 'meadow', config, preferredSize: 320 });
  return {
    style: monsterVisualFrameStyle(visual),
    imageProps: { src: visual.src, srcSet: visual.srcSet, sizes: '(max-width: 720px) 96px, 120px', loading: 'lazy', decoding: 'async' },
  };
}

function ModeCard({ card, selected, disabled, actions, textTone }) {
  const classes = ['reading-primary-mode', 'mode-card'];
  if (selected) classes.push('selected');
  if (disabled) classes.push('is-disabled');
  return (
    <button
      type="button"
      className={classes.join(' ')}
      data-mode-id={card.id}
      data-action="reasoning-save-prefs"
      data-text-tone={textTone}
      disabled={disabled}
      onClick={() => dispatch(actions, 'reasoning-save-prefs', { mode: card.id })}
    >
      <span className="mode-glyph" aria-hidden="true">{card.glyph}</span>
      <span className="mode-copy"><strong>{card.title}</strong><span>{card.desc}</span></span>
      {card.badge ? <span className="mode-badge">{card.badge}</span> : null}
    </button>
  );
}

function MoreModeCard({ card, selected, disabled, actions }) {
  const classes = ['setup-more-practice-card'];
  if (selected) classes.push('selected');
  return (
    <button type="button" className={classes.join(' ')} disabled={disabled} onClick={() => dispatch(actions, 'reasoning-save-prefs', { mode: card.id })}>
      <strong>{card.title}</strong>
      <span>{card.desc}</span>
    </button>
  );
}

function SetupSelect({ label, name, value, options, disabled, onChange }) {
  return (
    <label className="reading-setup-select">
      <span className="tool-label">{label}</span>
      <select name={name} value={String(value ?? '')} disabled={disabled} onChange={(event) => onChange(name, event.currentTarget.value)}>
        {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
    </label>
  );
}

function ReasoningSetup({ appState, ui, actions, repositories }) {
  const learnerId = appState?.learners?.selectedId || '';
  const learnerName = appState?.learners?.byId?.[learnerId]?.name || 'learner';
  const prefs = ui.prefs || {};
  const setupDisabled = Boolean(ui.pendingCommand);
  const heroBg = reasoningHeroBgForMode(prefs.mode, learnerId);
  const heroContrast = useSetupHeroContrast(heroBg, prefs.mode, {
    staticContrastForBg: reasoningHeroContrastProfile,
    cardSelector: '.reasoning-primary-mode, .reading-primary-mode',
    controlSelectors: ['.tool-label', '.length-unit'],
  });
  const setupClasses = ['setup-main', 'reading-setup-main', 'reasoning-setup-main'];
  if (heroContrast.contrast.shell === 'light') setupClasses.push('hero-dark');

  const rewardState = resolveReasoningRewardState(repositories, learnerId);
  const monsterVisualConfig = useMonsterVisualConfig();
  const panelMonsterEntries = activeReasoningMonsterSummaryFromState(rewardState).slice(0, 4);
  const panelMonsterVisuals = panelMonsterEntries
    .map(({ monster, progress }) => ({
      id: monster.id,
      visual: reasoningMonsterImageVisual(monster.assetId || monster.id, { ...progress, monster }, monsterVisualConfig?.config),
      isEgg: (progress.displayStage ?? progress.stage) === 0,
    }))
    .filter((entry) => entry.visual);
  const panelMonsterFallbacks = panelMonsterEntries.map(({ monster }) => ({ name: monster.name || monster.id, discovered: true }));
  const overview = ui.stats?.overview || {};
  const startLabel = ui.pendingCommand === 'start-session' ? 'Starting...' : `Start ${selectedModeLabel(prefs.mode)}`;

  function updatePref(name, value) {
    const parsed = name === 'roundLength' || name === 'setSize' ? Number(value) : value;
    dispatch(actions, 'reasoning-save-prefs', { [name]: parsed });
  }

  function start() {
    dispatch(actions, 'reasoning-start', prefs);
  }

  return (
    <PracticeStage subjectId="reasoning" scene="setup" backdrop="spires" motion="calm">
      <SubjectThemeScope subjectId="reasoning" className="setup-grid reading-setup-grid reasoning-setup-grid">
        <section
          className={setupClasses.join(' ')}
          data-react-hero-contrast="true"
          data-hero-tone={heroContrast.contrast.tone || undefined}
          data-controls-tone={heroContrast.contrast.controls}
          ref={heroContrast.ref}
          aria-label="Start Reasoning practice"
        >
          <HeroBackdrop url={heroBg} />
          <div className="setup-content">
            <p className="eyebrow">Paradox Spires</p>
            <h1 className="title reading-hero-title">Reasoning missions</h1>
            <p className="lede reading-hero-subtitle">Read the problem, choose the structure, work accurately, then check whether the answer makes sense.</p>
            <HeroWelcome name={learnerName} className="reading-hero-welcome" />
            <div className="mode-row reading-mode-row reasoning-mode-row">
              {PRIMARY_MODE_CARDS.map((card, index) => (
                <ModeCard card={card} selected={prefs.mode === card.id} disabled={setupDisabled} actions={actions} textTone={heroContrast.contrast.cards[index] || heroContrast.contrast.shell} key={card.id} />
              ))}
            </div>
            <div className="setup-control-stack reading-control-stack reasoning-control-stack">
              <div className="tweak-row reading-preference-row">
                <SetupSelect label="Reasoning focus" name="focusSkillId" value={prefs.focusSkillId} options={REASONING_SKILL_OPTIONS} disabled={setupDisabled} onChange={updatePref} />
                <SetupSelect label="Round length" name="roundLength" value={String(prefs.roundLength || 6)} options={REASONING_ROUND_LENGTH_OPTIONS} disabled={setupDisabled || prefs.mode === 'satsset'} onChange={updatePref} />
              </div>
              <div className="tweak-row reading-preference-row">
                <SetupSelect label="Mini-set size" name="setSize" value={String(prefs.setSize || 8)} options={REASONING_SET_SIZE_OPTIONS} disabled={setupDisabled || prefs.mode !== 'satsset'} onChange={updatePref} />
                <SetupSelect label="Question view" name="viewMode" value={prefs.viewMode || 'one'} options={[{ id: 'one', label: 'One at a time' }, { id: 'list', label: 'Full question list' }]} disabled={setupDisabled || prefs.mode === 'satsset'} onChange={updatePref} />
              </div>
            </div>
            {ui.error ? <div className="feedback bad" role="alert"><strong>Reasoning is unavailable right now</strong><div>{ui.error}</div></div> : null}
            <div className="setup-begin-row reading-start-row">
              <Button size="xl" data-featured="true" dataAction="reasoning-start" disabled={setupDisabled} onClick={start}>{startLabel}</Button>
            </div>
          </div>
        </section>
        <SetupSidePanel
          asideClassName="reading-setup-sidebar reasoning-setup-sidebar"
          cardClassName="reading-setup-sidebar-card reasoning-setup-sidebar-card"
          ariaLabel="Where you stand in Reasoning"
          body={(
            <SubjectCompanionPanel
              subjectId="reasoning"
              visible
              head={(<><p className="eyebrow">Where you stand</p><button type="button" className="ss-codex-link" data-action="open-codex" aria-label="Open the full codex" onClick={() => dispatch(actions, 'open-codex')}>Open codex →</button></>)}
              monsterVisuals={panelMonsterVisuals}
              monsters={panelMonsterVisuals.length ? [] : panelMonsterFallbacks}
              meadowEmpty={panelMonsterFallbacks.length ? '' : 'Start practising to discover your Reasoning creatures.'}
              stats={[
                { label: 'Marked', value: String(overview.totalQuestions || 0) },
                { label: 'Accuracy', value: `${overview.accuracy || 0}%` },
                { label: 'Independent', value: `${overview.independentAccuracy || 0}%` },
                { label: 'Due today', value: String(overview.due || 0), tone: overview.due > 0 ? 'warn' : undefined },
              ]}
              nextFocus={overview.weak > 0 ? 'Weak Reasoning structures need repair' : ui.parentSummary}
            />
          )}
        />
        <SetupMorePractice
          summary="More Reasoning practice"
          disclosureClassName="setup-more-practice reading-more-practice reasoning-more-practice"
          gridClassName="setup-more-practice-grid reading-more-practice-grid reasoning-more-practice-grid"
          cards={MORE_MODE_CARDS}
          renderCard={(card) => <MoreModeCard card={card} selected={prefs.mode === card.id} disabled={setupDisabled} actions={actions} key={card.id} />}
        />
      </SubjectThemeScope>
    </PracticeStage>
  );
}

function fieldName(name, prefix = '') {
  return `${prefix || ''}${name}`;
}

function QuestionInput({ question, response = {}, disabled = false, prefix = '' }) {
  const spec = question?.inputSpec || { type: 'text', label: 'Answer' };
  if (spec.type === 'multi') {
    return (
      <div className="answer-grid reasoning-answer-grid">
        {(spec.fields || []).map((field) => <OneField key={field.key} field={field} value={response[field.key]} disabled={disabled} prefix={prefix} />)}
      </div>
    );
  }
  return (
    <label className="answer-box reasoning-answer-box">
      <span className="tool-label">{spec.label || 'Answer'}</span>
      <input name={fieldName('answer', prefix)} type="text" inputMode={spec.type === 'number' ? 'numeric' : undefined} defaultValue={response.answer || ''} disabled={disabled} placeholder={spec.placeholder || ''} />
    </label>
  );
}

function OneField({ field, value = '', disabled = false, prefix = '' }) {
  const name = fieldName(field.key, prefix);
  if (field.kind === 'select') {
    return (
      <label className="answer-box reasoning-answer-box">
        <span className="tool-label">{field.label}</span>
        <select name={name} defaultValue={value || ''} disabled={disabled}>
          <option value="">Choose</option>
          {(field.options || []).map(([val, label]) => <option key={val} value={val}>{label}</option>)}
        </select>
      </label>
    );
  }
  if (field.kind === 'radio') {
    return (
      <fieldset className="answer-box reasoning-answer-box">
        <legend>{field.label}</legend>
        {(field.options || []).map(([val, label]) => (
          <label className="option-row" key={val}>
            <input type="radio" name={name} value={val} defaultChecked={String(value || '') === String(val)} disabled={disabled} />
            <span>{label}</span>
          </label>
        ))}
      </fieldset>
    );
  }
  return (
    <label className="answer-box reasoning-answer-box">
      <span className="tool-label">{field.label}</span>
      <input name={name} type="text" inputMode={field.kind === 'number' ? 'numeric' : undefined} defaultValue={value || ''} disabled={disabled} placeholder={field.placeholder || ''} />
    </label>
  );
}

function QuestionNavBar({ session, actions, disabled, formId }) {
  const nav = session?.questionNav || [];
  if (nav.length <= 1) return null;
  function move(event, index) {
    const form = formId ? document.getElementById(formId) : null;
    if (!disabled && form && !session.result) dispatch(actions, 'reasoning-save-response', { formData: new FormData(form), move: { questionIndex: index } });
    else dispatch(actions, 'reasoning-move', { questionIndex: index });
  }
  return (
    <div className="mini-paper-nav reading-question-nav reasoning-question-nav">
      {nav.map((entry) => <button key={entry.id} type="button" className={`${entry.current ? 'current' : ''} ${entry.status !== 'blank' ? 'done' : ''}`} onClick={(event) => move(event, entry.index)}>{entry.index + 1}</button>)}
    </div>
  );
}

function WorkedSupport({ question, supportLevel }) {
  if (!supportLevel || !question?.solutionLines?.length) return null;
  const lines = supportLevel >= 2 ? question.solutionLines : question.solutionLines.slice(0, Math.max(1, Math.ceil(question.solutionLines.length / 2)));
  return (
    <div className="scaffold reasoning-scaffold">
      <strong>{supportLevel >= 2 ? 'Worked solution' : 'Partly worked support'}</strong>
      <ol>{lines.map((line, index) => <li key={`${line}-${index}`}>{line}</li>)}</ol>
    </div>
  );
}

function Feedback({ feedback, question, supportLevel }) {
  if (supportLevel && !feedback?.result) return <WorkedSupport question={question} supportLevel={supportLevel} />;
  const result = feedback?.result;
  if (!result) return null;
  const tone = result.correct ? 'good' : result.score > 0 ? 'warn' : 'bad';
  const final = feedback.final !== false;
  return (
    <div className={`feedback ${tone} reasoning-feedback`}>
      <h3>{result.correct ? 'Correct' : result.score > 0 ? 'Partly right' : 'Not quite yet'}</h3>
      <p>{final ? (result.feedbackLong || result.feedbackShort) : (result.feedbackShort || result.minimalHint)}</p>
      {!final && result.minimalHint ? <p><strong>Small nudge:</strong> {result.minimalHint}</p> : null}
      {feedback.misconceptionLabel && final ? <p><strong>Likely issue:</strong> {feedback.misconceptionLabel}</p> : null}
      {final ? <WorkedSupport question={question || feedback.question} supportLevel={2} /> : null}
      {final && (question?.checkLine || feedback.question?.checkLine) ? <p className="tiny"><strong>Check:</strong> {question?.checkLine || feedback.question?.checkLine}</p> : null}
      {final && (question?.reflectionPrompt || feedback.question?.reflectionPrompt) ? <p className="tiny"><strong>Quick reflection:</strong> {question?.reflectionPrompt || feedback.question?.reflectionPrompt}</p> : null}
    </div>
  );
}

function QuestionPanel({ ui, actions }) {
  const session = ui.session;
  const question = session?.currentQuestion;
  if (!session || !question) return null;
  const result = session.result;
  const response = session.response || {};
  const disabled = Boolean(result);
  const pending = isPending(ui);
  const formId = `reasoning-question-form-${session.id}`;
  const primaryLabel = result ? 'Continue' : session.delayedFeedback ? (canGoNext(session) ? 'Save and next' : 'Save answer') : 'Submit answer';
  function submit(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    if (result) {
      dispatch(actions, 'reasoning-continue');
      return;
    }
    if (session.delayedFeedback) dispatch(actions, 'reasoning-save-response', { formData, advance: true });
    else dispatch(actions, 'reasoning-submit-form', { formData });
  }
  function saveAndMove(event, move) {
    const form = event.currentTarget.form;
    if (!disabled && form) dispatch(actions, 'reasoning-save-response', { formData: new FormData(form), move });
    else dispatch(actions, 'reasoning-move', move);
  }
  function mark(event) {
    const form = event.currentTarget.form;
    dispatch(actions, 'reasoning-mark-set', { formData: form ? new FormData(form) : null });
  }
  return (
    <section className="card reading-question-card reasoning-question-card">
      <div className="reading-active-step reasoning-active-step">
        <div><div className="eyebrow">Question {session.currentQuestionIndex + 1} of {session.questionCount}</div><h2 className="section-title">Solve the reasoning problem</h2></div>
        <span className={`reading-status-badge ${statusTone(session.questionNav?.[session.currentQuestionIndex]?.status)}`}>{statusLabel(session.questionNav?.[session.currentQuestionIndex]?.status)}</span>
      </div>
      <QuestionNavBar session={session} actions={actions} disabled={pending} formId={formId} />
      <div className="chip-row reading-chip-row-before reasoning-chip-row-before">
        <span className="chip">{question.marks} mark{question.marks === 1 ? '' : 's'}</span>
        <span className="chip">{questionTypeLabel(question.type)}</span>
        {question.domain ? <span className="chip">{question.domain}</span> : null}
        {question.skillNames?.slice(0, 2).map((name) => <span className="chip" key={name}>{name}</span>)}
      </div>
      <div className="callout reading-session-guidance reasoning-session-guidance">
        {session.strict && !result ? 'Strict practice: save your answers and mark only when the set is complete.' : result ? 'Review the worked structure, then continue.' : 'Try independently first. Support appears only after effort.'}
      </div>
      <form id={formId} key={question.id} onSubmit={submit} data-reasoning-active-form="true">
        <div className="question-stem reasoning-question-stem" dangerouslySetInnerHTML={{ __html: question.stemHtml }} />
        {question.visualHtml ? <div className="question-visual reasoning-question-visual" dangerouslySetInnerHTML={{ __html: question.visualHtml }} /> : null}
        <QuestionInput question={question} response={response} disabled={disabled} />
        <label className="answer-box reasoning-working-box"><span className="tool-label">Working (optional)</span><textarea name="working" defaultValue={response.working || ''} disabled={disabled} placeholder="Show the steps you used." /></label>
        <div className="actions reading-actions-spaced reasoning-actions-spaced">
          <button className="btn primary" type="submit" disabled={pending}>{primaryLabel}</button>
          <button className="btn ghost" type="button" onClick={(event) => saveAndMove(event, { delta: -1 })} disabled={pending || !canGoPrevious(session)}>Previous</button>
          <button className="btn secondary" type="button" onClick={(event) => saveAndMove(event, { delta: 1 })} disabled={pending || !canGoNext(session)}>{disabled ? 'Next question' : 'Save draft and next'}</button>
          {session.delayedFeedback || session.strict ? <button className="btn warn" type="button" onClick={mark} disabled={pending}>Mark set</button> : null}
          {!result && !session.strict ? <button className="btn secondary" type="button" onClick={() => dispatch(actions, 'reasoning-support-faded')} disabled={pending}>Partly worked support</button> : null}
          {!result && !session.strict ? <button className="btn secondary" type="button" onClick={() => dispatch(actions, 'reasoning-support-worked')} disabled={pending}>Worked solution</button> : null}
          <button className="btn ghost" type="button" onClick={() => dispatch(actions, 'reasoning-end')} disabled={pending}>End round</button>
        </div>
      </form>
      <Feedback feedback={ui.feedback || (result ? { result, final: true } : null)} question={question} supportLevel={session.supportLevel} />
    </section>
  );
}

function QuestionListPanel({ ui, actions }) {
  const session = ui.session;
  const questions = session?.questions || [];
  if (!session || !questions.length) return null;
  const pending = isPending(ui);
  function mark(event) {
    event.preventDefault();
    dispatch(actions, 'reasoning-mark-set', { formData: new FormData(event.currentTarget) });
  }
  function save(event) {
    const form = event.currentTarget.form;
    dispatch(actions, 'reasoning-save-all', { formData: form ? new FormData(form) : null });
  }
  return (
    <section className="card reading-question-card reading-question-list-card reasoning-question-list-card">
      <div className="reading-active-step reasoning-active-step"><div><div className="eyebrow">Mixed reasoning set</div><h2 className="section-title">Answer the question list</h2></div><span className="chip warn">Delayed feedback</span></div>
      <form className="reading-list-form reasoning-list-form" onSubmit={mark} data-reasoning-active-form="true">
        {questions.map((question) => {
          const disabled = Boolean(question.result);
          const prefix = `q_${question.id}_`;
          return (
            <section className="review-card reasoning-list-question" key={question.id}>
              <div className="reading-active-step"><div className="eyebrow">Question {question.index + 1} · {question.marks} mark{question.marks === 1 ? '' : 's'}</div><span className={`reading-status-badge ${statusTone(question.status)}`}>{statusLabel(question.status)}</span></div>
              <div className="question-stem reasoning-question-stem" dangerouslySetInnerHTML={{ __html: question.stemHtml }} />
              {question.visualHtml ? <div className="question-visual reasoning-question-visual" dangerouslySetInnerHTML={{ __html: question.visualHtml }} /> : null}
              <QuestionInput question={question} response={question.response || {}} disabled={disabled} prefix={prefix} />
              <Feedback feedback={question.result ? { result: question.result, final: true, question } : null} question={question} supportLevel={question.supportLevel} />
            </section>
          );
        })}
        <div className="actions reading-actions-spaced reasoning-actions-spaced">
          <button className="btn primary" type="submit" disabled={pending}>Mark set</button>
          <button className="btn secondary" type="button" onClick={save} disabled={pending}>Save answers</button>
          <button className="btn ghost" type="button" onClick={() => dispatch(actions, 'reasoning-end')} disabled={pending}>End round</button>
        </div>
      </form>
    </section>
  );
}

function SessionHud({ ui }) {
  const session = ui.session || {};
  return (
    <section className="card reading-session-hud reasoning-session-hud">
      <div className="stats-row">
        <div className="stat"><div className="label">Answered</div><div className="value">{session.answeredCount || 0}/{session.questionCount || 0}</div></div>
        <div className="stat"><div className="label">Marked</div><div className="value">{session.markedCount || 0}</div></div>
        <div className="stat"><div className="label">Score</div><div className="value">{session.score || 0}/{session.maxScore || 0}</div></div>
        <div className="stat"><div className="label">Mode</div><div className="value">{selectedModeLabel(session.mode)}</div></div>
      </div>
    </section>
  );
}

function ReasoningSession({ ui, actions }) {
  const session = { ...ui.session };
  const uiWithActions = { ...ui, actions, session };
  return <><SessionHud ui={uiWithActions} />{session.viewMode === 'list' || session.strict ? <QuestionListPanel ui={uiWithActions} actions={actions} /> : <QuestionPanel ui={uiWithActions} actions={actions} />}</>;
}

function ReasoningSummary({ ui, actions }) {
  const summary = ui.summary || {};
  return (
    <div className="grid two">
      <section className="card border-top reading-accent-card reasoning-accent-card">
        <div className="eyebrow">Reasoning session complete</div>
        <h2 className="section-title">{summary.score || 0}/{summary.maxScore || 0} marks</h2>
        <p className="subtitle">Accuracy: {summary.accuracy || 0}% · {summary.questionCount || 0} questions marked.</p>
        <div className="actions reading-actions-spaced reasoning-actions-spaced">
          <button className="btn primary" type="button" onClick={() => dispatch(actions, 'reasoning-start', ui.prefs)}>Start another</button>
          <button className="btn ghost" type="button" onClick={() => dispatch(actions, 'reasoning-back')}>← Back to setup</button>
        </div>
      </section>
      <section className="card"><div className="eyebrow">What to do next</div><p>{ui.parentSummary}</p></section>
    </div>
  );
}

function ReasoningAnalytics({ ui }) {
  const skills = ui.analytics?.skills || ui.stats?.skills || [];
  return (
    <section className="card reading-analytics reasoning-analytics">
      <div className="eyebrow">Reasoning strength</div>
      <div className="skill-list">
        {skills.map((skill) => (
          <div className="skill-row" key={skill.id}>
            <div><strong>{skill.name}</strong><div className="tiny">{skill.domain} · {skill.status}</div></div>
            <ProgressMeter className="reading-skill-meter reasoning-skill-meter" value={skill.strength || 0} label={`${skill.name} strength`} />
            <div>{skill.strength || 0}%</div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ReasoningPracticeSurface({ appState, actions, repositories }) {
  const learnerId = appState?.learners?.selectedId || '';
  const ui = normaliseReasoningReadModel(appState?.subjectUi?.reasoning, learnerId);
  if (ui.phase === 'summary') return <ReasoningSummary ui={ui} actions={actions} />;
  if (ui.session) return <ReasoningSession ui={ui} actions={actions} />;
  return <><ReasoningSetup appState={appState} ui={ui} actions={actions} repositories={repositories} /><ReasoningAnalytics ui={ui} /></>;
}
