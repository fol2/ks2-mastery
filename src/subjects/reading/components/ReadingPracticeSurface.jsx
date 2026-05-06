import { ProgressMeter } from '../../../platform/ui/ProgressMeter.jsx';
import {
  READING_DIFFICULTY_OPTIONS,
  READING_GENRE_OPTIONS,
  READING_MODE_OPTIONS,
  READING_SKILL_OPTIONS,
  questionTypeLabel,
} from '../metadata.js';
import { normaliseReadingReadModel } from '../client-read-models.js';

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

function SetupField({ label, name, value, options }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select name={name} defaultValue={value || ''}>
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

function ReadingSetup({ ui, actions }) {
  const prefs = ui.prefs || {};
  function start(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    dispatch(actions, 'reading-start', {
      mode: String(form.get('mode') || 'smart'),
      focusSkillId: String(form.get('focusSkillId') || ''),
      genre: String(form.get('genre') || ''),
      difficulty: String(form.get('difficulty') || ''),
      viewMode: String(form.get('viewMode') || 'one'),
    });
  }
  return (
    <div className="grid two">
      <section className="card border-top reading-accent-card">
        <div className="eyebrow">KS2 Reading</div>
        <h2 className="section-title">Read first. Answer from evidence. Review weak domains later.</h2>
        <p className="subtitle">
          Build evidence-first reading habits with short passages, focused questions and clear review prompts after each answer.
        </p>
        <form onSubmit={start} className="setup-form reading-setup-form">
          <div className="control-grid">
            <SetupField label="Mode" name="mode" value={prefs.mode} options={READING_MODE_OPTIONS} />
            <SetupField label="Reading focus" name="focusSkillId" value={prefs.focusSkillId} options={READING_SKILL_OPTIONS} />
            <SetupField label="Passage type" name="genre" value={prefs.genre} options={READING_GENRE_OPTIONS} />
            <SetupField label="Difficulty" name="difficulty" value={prefs.difficulty} options={READING_DIFFICULTY_OPTIONS} />
            <label className="field">
              <span>Question view</span>
              <select name="viewMode" defaultValue={prefs.viewMode || 'one'}>
                <option value="one">One at a time</option>
                <option value="list">Full question list</option>
              </select>
            </label>
          </div>
          <div className="actions reading-actions-spaced">
            <button className="btn primary" type="submit" disabled={Boolean(ui.pendingCommand)}>Practise</button>
          </div>
        </form>
      </section>
      <section className="card">
        <div className="eyebrow">Current Reading profile</div>
        <div className="stats-row">
          <Stat label="Marked" value={ui.stats?.overview?.totalQuestions || 0} />
          <Stat label="Accuracy" value={`${ui.stats?.overview?.accuracy || 0}%`} />
          <Stat label="Independent" value={`${ui.stats?.overview?.independentAccuracy || 0}%`} />
          <Stat label="Due" value={ui.stats?.overview?.due || 0} />
        </div>
        <div className="callout reading-callout-spaced">{ui.parentSummary}</div>
      </section>
    </div>
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
      <form id={formId} key={question.id} onSubmit={submit} data-reading-active-form="true">
        <p className="question-stem">{question.stem}</p>
        <QuestionInput question={question} response={response} disabled={disabled} />
        <div className="actions reading-actions-spaced">
          {!disabled ? <button className="btn primary" type="submit" disabled={pending}>{session.delayedFeedback ? 'Save and next' : 'Submit answer'}</button> : null}
          <button className="btn ghost" type="button" onClick={(event) => saveAndMove(event, { delta: -1 })} disabled={pending || !canGoPrevious(session)}>Previous</button>
          <button className="btn secondary" type="button" onClick={(event) => saveAndMove(event, { delta: 1 })} disabled={pending || !canGoNext(session)}>{disabled ? 'Next question' : 'Save and next'}</button>
          {session.delayedFeedback || session.strict ? <button className="btn warn" type="button" onClick={finish} disabled={pending}>Finish now</button> : null}
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
          <h2 className="section-title">Answer the full question list</h2>
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
          ? 'SATs-style mode: answer each text, then mark the whole paper when you want feedback.'
          : 'List mode saves the whole visible section together. Feedback stays hidden until you mark the section.'}
      </div>
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
          <button className="btn secondary" type="button" onClick={saveSection} disabled={pending}>Save</button>
          <button className="btn warn" type="submit" disabled={pending}>{session.strict ? 'Mark whole paper' : 'Mark this section'}</button>
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

export function ReadingPracticeSurface({ appState, actions }) {
  const learnerId = appState?.learners?.selectedId || '';
  const ui = normaliseReadingReadModel(appState?.subjectUi?.reading, learnerId);
  if (ui.phase === 'summary') return <ReadingSummary ui={ui} actions={actions} />;
  if (ui.session) return <ReadingSession ui={ui} actions={actions} />;
  return (
    <>
      <ReadingSetup ui={ui} actions={actions} />
      <ReadingAnalytics ui={ui} />
    </>
  );
}
