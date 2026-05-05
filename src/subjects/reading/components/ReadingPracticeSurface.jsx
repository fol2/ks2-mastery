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

function QuestionInput({ question, response = {}, disabled = false }) {
  if (!question) return null;
  if (question.type === 'mcq') {
    return (
      <fieldset className="answer-box" disabled={disabled}>
        <legend>Your answer</legend>
        {(question.options || []).map((option, index) => (
          <label key={index} className="option-row">
            <input type="radio" name="answer" value={String(index)} defaultChecked={String(response.answer) === String(index)} />
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
            <input type="checkbox" name="answer" value={String(index)} defaultChecked={selected.has(String(index))} />
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
          <input name="answer" defaultValue={response.answer || ''} disabled={disabled} />
        </label>
        <label className="field">
          <span>Evidence from the text</span>
          <textarea name="evidence" defaultValue={response.evidence || ''} disabled={disabled} />
        </label>
      </div>
    );
  }
  if (question.type === 'open') {
    return (
      <label className="field">
        <span>Your written answer</span>
        <textarea name="answer" defaultValue={response.answer || ''} disabled={disabled} />
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
                <select name={`map_${index}`} defaultValue={response.map?.[index] || ''} disabled={disabled}>
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
                <select name={`order_${index}`} defaultValue={response.order?.[index] || ''} disabled={disabled}>
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
      <input name="answer" defaultValue={response.answer || ''} disabled={disabled} />
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

function QuestionPanel({ ui, actions }) {
  const session = ui.session;
  const question = session?.currentQuestion;
  const result = session?.result;
  if (!session || !question) return null;
  const response = session.response || {};
  const disabled = Boolean(result);
  function submit(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    if (session.delayedFeedback && !result) {
      dispatch(actions, 'reading-save-response', { formData, advance: true });
      return;
    }
    dispatch(actions, 'reading-submit-form', { formData });
  }
  return (
    <section className="card">
      <div className="eyebrow">Question {session.currentQuestionIndex + 1} of {session.questionNav?.length || session.questionCount}</div>
      <div className="chip-row reading-chip-row-before">
        <span className="chip">{question.marks} mark{question.marks === 1 ? '' : 's'}</span>
        <span className="chip">{questionTypeLabel(question.type)}</span>
        {question.skillName ? <span className="chip">{question.skillName}</span> : null}
      </div>
      <form key={question.id} onSubmit={submit}>
        <p className="question-stem">{question.stem}</p>
        <QuestionInput question={question} response={response} disabled={disabled} />
        <div className="actions reading-actions-spaced">
          {!disabled ? <button className="btn primary" type="submit" disabled={Boolean(ui.pendingCommand)}>{session.delayedFeedback ? 'Save and next' : 'Submit answer'}</button> : null}
          <button className="btn ghost" type="button" onClick={() => dispatch(actions, 'reading-move', { delta: -1 })} disabled={Boolean(ui.pendingCommand)}>Previous</button>
          <button className="btn secondary" type="button" onClick={() => dispatch(actions, 'reading-move', { delta: 1 })} disabled={Boolean(ui.pendingCommand)}>Next</button>
          {session.delayedFeedback || session.strict ? <button className="btn warn" type="button" onClick={() => dispatch(actions, session.strict ? 'reading-mark-session' : 'reading-mark-section')} disabled={Boolean(ui.pendingCommand)}>Finish now</button> : null}
          <button className="btn ghost" type="button" onClick={() => dispatch(actions, 'reading-end')} disabled={Boolean(ui.pendingCommand)}>End round</button>
        </div>
      </form>
      <Feedback feedback={ui.feedback || (result ? { result } : null)} />
    </section>
  );
}

function SessionHud({ ui }) {
  const session = ui.session;
  if (!session) return null;
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
            <button key={section.index} className={`chip ${section.current ? 'good' : ''}`} type="button" onClick={() => dispatch(ui.actions, 'reading-move', { sectionIndex: section.index, questionIndex: 0 })}>{section.title}</button>
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
        <QuestionPanel ui={uiWithActions} actions={actions} />
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
