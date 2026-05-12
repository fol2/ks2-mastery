import { SubjectThemeScope } from '../../../platform/ui/SubjectThemeScope.jsx';
import {
  ARITHMETIC_GOAL_OPTIONS,
  ARITHMETIC_MODE_OPTIONS,
  ARITHMETIC_SKILL_OPTIONS,
  ARITHMETIC_TEST_FORMS,
} from '../metadata.js';
import { normaliseArithmeticReadModel } from '../client-read-models.js';

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

function SelectField({ label, name, value, options, disabled }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select name={name} defaultValue={value || ''} disabled={disabled}>
        {options.map((option) => (
          <option key={option.id} value={option.id}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function Feedback({ feedback }) {
  if (!feedback?.result) return null;
  const result = feedback.result;
  const tone = result.correct ? 'good' : result.score > 0 ? 'warn' : 'bad';
  return (
    <div className={`feedback ${tone}`} role="status" aria-live="polite">
      <strong>{result.correct ? 'Correct' : result.score > 0 ? 'Partly right' : 'Not quite yet'}</strong>
      <p>{result.feedbackLong || result.feedbackShort}</p>
      {result.answerText ? <p><strong>Answer:</strong> {result.answerText}</p> : null}
      {result.minimalHint ? <p><strong>Small nudge:</strong> {result.minimalHint}</p> : null}
      {feedback.solutionLines?.length ? (
        <div className="worked">
          <strong>Worked solution</strong>
          <ol>{feedback.solutionLines.map((line) => <li key={line}>{line}</li>)}</ol>
        </div>
      ) : null}
    </div>
  );
}

function QuestionCard({ ui, actions }) {
  const question = ui.session?.currentQuestion;
  if (!question) return null;
  const pending = Boolean(ui.pendingCommand);
  const isTest = ui.session?.mode === 'test';
  const awaitingNext = Boolean(ui.feedback) && !isTest;
  const onSubmit = (event) => {
    event.preventDefault();
    const submitterAction = event.nativeEvent?.submitter?.dataset?.action || '';
    const actionName = submitterAction === 'finish-test' ? 'arithmetic-finish-test' : (isTest ? 'arithmetic-save-response' : 'arithmetic-submit-form');
    dispatch(actions, actionName, { formData: new FormData(event.currentTarget), advance: isTest && submitterAction !== 'finish-test' });
  };
  const currentPaperEntry = ui.session?.paper?.[ui.session.currentIndex] || null;
  const saved = currentPaperEntry?.response?.answer || '';
  const working = currentPaperEntry?.working || '';
  const questionKey = `${ui.session?.id || 'session'}:${ui.session?.currentIndex || 0}:${question.id || 'question'}`;

  return (
    <section className="card question-card" key={questionKey}>
      <div className="chips arithmetic-question-tags">
        <span className="chip neutral">{question.templateLabel}</span>
        <span className="chip neutral">{question.domain}</span>
        <span className="chip neutral">{question.marks} mark{question.marks === 1 ? '' : 's'}</span>
        {question.manualMethodMark ? <span className="chip warn">Final-answer auto-marking</span> : null}
      </div>
      <p className="question-stem"><strong>{question.stem}</strong></p>
      {question.visual ? <pre className="alg arithmetic-visual">{question.visual}</pre> : null}
      {question.manualMethodMark ? (
        <div className="feedback warn arithmetic-method-note">
          Official arithmetic papers can award a method mark on long multiplication and long division. This app auto-scores the final answer and leaves handwritten method quality for adult/self review.
        </div>
      ) : null}
      <form className="arithmetic-answer-form" onSubmit={onSubmit} key={questionKey}>
        <label className="field">
          <span>{question.inputSpec?.label || 'Answer'}</span>
          <input name="answer" type="text" defaultValue={saved} autoComplete="off" disabled={pending || ui.phase === 'summary' || awaitingNext} />
        </label>
        <label className="field arithmetic-working-field">
          <span>Working (optional)</span>
          <textarea name="working" defaultValue={working} disabled={pending || ui.phase === 'summary' || awaitingNext} />
        </label>
        <div className="actions arithmetic-question-actions">
          {!isTest && !ui.feedback ? <button className="btn primary" type="submit" disabled={pending}>Submit answer</button> : null}
          {isTest ? <button className="btn primary" type="submit" disabled={pending}>{ui.session.currentIndex < (ui.session.questionCount || 1) - 1 ? 'Save and next' : 'Save response'}</button> : null}
          {isTest ? <button className="btn secondary" type="submit" data-action="finish-test" disabled={pending}>Finish paper</button> : null}
          {!isTest && ui.feedback ? <button className="btn secondary" type="button" disabled={pending} onClick={() => dispatch(actions, 'arithmetic-continue')}>Next question</button> : null}
          <button className="btn ghost" type="button" disabled={pending} onClick={() => dispatch(actions, 'arithmetic-end')}>End session</button>
        </div>
      </form>
      <Feedback feedback={ui.feedback} />
    </section>
  );
}

function Setup({ ui, actions }) {
  const pending = Boolean(ui.pendingCommand);
  const onSubmit = (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    dispatch(actions, 'arithmetic-start', {
      mode: String(formData.get('mode') || 'smart'),
      focusSkillId: String(formData.get('focusSkillId') || ''),
      goal: String(formData.get('goal') || '10q'),
      testForm: String(formData.get('testForm') || 'short'),
    });
  };
  return (
    <section className="card">
      <h2>Arithmetic mission</h2>
      <p className="lede">Daily KS2 arithmetic practice with exact local-style marking on the Worker, spaced review, SATs-style test mode, and reward evidence only from clean independent wins.</p>
      <form onSubmit={onSubmit}>
        <div className="control-row">
          <SelectField label="Mode" name="mode" value={ui.prefs.mode} options={ARITHMETIC_MODE_OPTIONS} disabled={pending} />
          <SelectField label="Skill focus" name="focusSkillId" value={ui.prefs.focusSkillId} options={ARITHMETIC_SKILL_OPTIONS} disabled={pending} />
          <SelectField label="Practice goal" name="goal" value={ui.prefs.goal} options={ARITHMETIC_GOAL_OPTIONS} disabled={pending} />
          <SelectField label="Test form" name="testForm" value={ui.prefs.testForm} options={ARITHMETIC_TEST_FORMS} disabled={pending} />
        </div>
        <div className="actions arithmetic-setup-actions">
          <button className="btn primary" type="submit" disabled={pending}>Start Arithmetic</button>
        </div>
      </form>
    </section>
  );
}

function Summary({ ui, actions }) {
  if (!ui.summary) return null;
  const paperCount = ui.session?.paper?.length || ui.summary.questionCount || 0;
  const accuracyBase = paperCount || ui.summary.answered || 0;
  const accuracy = accuracyBase ? Math.round((ui.summary.correct / accuracyBase) * 100) : 0;
  const answeredLine = paperCount ? `Answered ${ui.summary.answered || 0}/${paperCount}. ` : '';
  return (
    <section className="card">
      <h2>Arithmetic session complete</h2>
      <p><strong>{ui.summary.correct}/{accuracyBase}</strong> fully correct ({accuracy}%). {answeredLine}Score: <strong>{ui.summary.score}/{ui.summary.maxScore}</strong>.</p>
      {ui.session?.paper?.length ? (
        <div className="review-list">
          {ui.session.paper.map((entry) => (
            <details key={entry.question?.id || entry.index}>
              <summary>Question {entry.index + 1}: {entry.result?.score ?? 0}/{entry.result?.maxScore ?? entry.question?.marks ?? 1}</summary>
              <p>{entry.question?.stem}</p>
              {entry.question?.visual ? <pre className="alg arithmetic-visual">{entry.question.visual}</pre> : null}
              <p><strong>Your answer:</strong> {entry.response?.answer || 'blank'}</p>
              <p><strong>Feedback:</strong> {entry.result?.feedbackLong || entry.result?.feedbackShort}</p>
              {entry.question?.solutionLines?.length ? <ol>{entry.question.solutionLines.map((line) => <li key={line}>{line}</li>)}</ol> : null}
            </details>
          ))}
        </div>
      ) : null}
      <div className="actions arithmetic-summary-actions">
        <button className="btn primary" type="button" onClick={() => dispatch(actions, 'arithmetic-start', ui.prefs)}>Start another</button>
        <button className="btn ghost" type="button" onClick={actions.navigateHome}>Dashboard</button>
      </div>
    </section>
  );
}

function Analytics({ ui }) {
  const overview = ui.stats?.overview || {};
  return (
    <section className="card">
      <h2>Arithmetic progress</h2>
      <div className="stats-row">
        <Stat label="Questions" value={overview.totalQuestions || 0} />
        <Stat label="Accuracy" value={`${overview.accuracy || 0}%`} />
        <Stat label="Due" value={overview.due || 0} />
        <Stat label="Reward units" value={overview.securedRewardUnits || 0} />
      </div>
      <p className="footer-note">{ui.parentSummary}</p>
      {ui.analytics?.strands?.length ? (
        <div className="skill-list arithmetic-strand-list">
          {ui.analytics.strands.map((strand) => (
            <div className="skill-row" key={strand.strandId}>
              <div><strong>{strand.name}</strong></div>
              <progress className="arithmetic-strength" value={strand.strength || 0} max="100" aria-label={`${strand.name} strength`} />
              <div>{strand.strength || 0}%</div>
              <div>{strand.status}</div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function ArithmeticPracticeSurface({ appState, actions }) {
  const learnerId = appState?.learners?.selectedId || '';
  const ui = normaliseArithmeticReadModel(appState?.subjectUi?.arithmetic, learnerId);
  return (
    <SubjectThemeScope subjectId="arithmetic" accent="#C06B3E" accentSoft="#FBEEE4">
      <div className="subject-practice-stack arithmetic-practice">
        {ui.error ? <div className="feedback bad" role="alert">{ui.error}</div> : null}
        <Setup ui={ui} actions={actions} />
        {ui.phase === 'summary' ? <Summary ui={ui} actions={actions} /> : <QuestionCard ui={ui} actions={actions} />}
        <Analytics ui={ui} />
      </div>
    </SubjectThemeScope>
  );
}
