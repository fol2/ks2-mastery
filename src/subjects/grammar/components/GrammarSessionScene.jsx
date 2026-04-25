import React from 'react';

function optionLabel(option) {
  if (Array.isArray(option)) return String(option[1] ?? option[0] ?? '');
  return String(option?.label ?? option?.value ?? '');
}

function optionValue(option) {
  if (Array.isArray(option)) return String(option[0] ?? '');
  return String(option?.value ?? '');
}

function ChoiceList({ inputSpec, required = true, response = {} }) {
  const options = Array.isArray(inputSpec?.options) ? inputSpec.options : [];
  const type = inputSpec?.type === 'checkbox_list' ? 'checkbox' : 'radio';
  const name = inputSpec?.type === 'checkbox_list' ? 'selected' : 'answer';
  const selectedValues = new Set(Array.isArray(response.selected) ? response.selected.map(String) : []);
  const selectedAnswer = String(response.answer ?? '');
  return (
    <div className={`grammar-choice-list ${inputSpec?.asTokens ? 'tokens' : ''}`}>
      {options.map((option) => {
        const value = optionValue(option);
        const checked = type === 'checkbox' ? selectedValues.has(value) : selectedAnswer === value;
        return (
          <label className="grammar-choice" key={value}>
            <input type={type} name={name} value={value} required={required && type === 'radio'} defaultChecked={checked} />
            <span>{optionLabel(option)}</span>
          </label>
        );
      })}
    </div>
  );
}

function TableChoice({ inputSpec, required = true, response = {} }) {
  const rows = Array.isArray(inputSpec?.rows) ? inputSpec.rows : [];
  const columns = Array.isArray(inputSpec?.columns) ? inputSpec.columns : [];
  return (
    <div className="grammar-table-wrap">
      <table className="grammar-table-choice">
        <thead>
          <tr>
            <th>Sentence</th>
            {columns.map((column) => <th key={column}>{column}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td>{row.label}</td>
              {columns.map((column) => (
                <td key={`${row.key}-${column}`}>
                  <input
                    type="radio"
                    name={row.key}
                    value={column}
                    aria-label={`${row.label}: ${column}`}
                    required={required}
                    defaultChecked={String(response[row.key] ?? '') === String(column)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MultiField({ field, required = true, response = {} }) {
  const options = Array.isArray(field?.options) ? field.options : [];
  const value = String(response[field?.key] ?? '');
  if (field?.kind === 'select') {
    return (
      <label className="field grammar-field" key={field.key}>
        <span>{field.label}</span>
        <select className="input" name={field.key} defaultValue={value}>
          {options.map((option) => <option value={optionValue(option)} key={optionValue(option)}>{optionLabel(option)}</option>)}
        </select>
      </label>
    );
  }
  if (field?.kind === 'radio') {
    return (
      <fieldset className="grammar-fieldset" key={field.key}>
        <legend>{field.label}</legend>
        <div className="grammar-choice-list compact">
          {options.map((option) => (
            <label className="grammar-choice" key={optionValue(option)}>
              <input
                type="radio"
                name={field.key}
                value={optionValue(option)}
                required={required}
                defaultChecked={value === optionValue(option)}
              />
              <span>{optionLabel(option)}</span>
            </label>
          ))}
        </div>
      </fieldset>
    );
  }
  return (
    <label className="field grammar-field" key={field.key}>
      <span>{field.label}</span>
      <input className="input" name={field.key} autoComplete="off" required={required} defaultValue={value} />
    </label>
  );
}

function GrammarInput({ inputSpec, required = true, response = {} }) {
  if (inputSpec?.type === 'single_choice' || inputSpec?.type === 'checkbox_list') {
    return <ChoiceList inputSpec={inputSpec} required={required} response={response} />;
  }
  if (inputSpec?.type === 'table_choice') {
    return <TableChoice inputSpec={inputSpec} required={required} response={response} />;
  }
  if (inputSpec?.type === 'multi') {
    const fields = Array.isArray(inputSpec?.fields) ? inputSpec.fields : [];
    return <div className="grammar-multi-fields">{fields.map((field) => <MultiField field={field} required={required} response={response} key={field.key} />)}</div>;
  }
  if (inputSpec?.type === 'textarea') {
    return (
      <label className="field">
        <span>{inputSpec.label || 'Your answer'}</span>
        <textarea
          className="input grammar-textarea"
          name="answer"
          placeholder={inputSpec.placeholder || ''}
          data-autofocus="true"
          required={required}
          defaultValue={String(response.answer ?? '')}
        />
      </label>
    );
  }
  return (
    <label className="field">
      <span>{inputSpec?.label || 'Your answer'}</span>
      <input
        className="input"
        name="answer"
        placeholder={inputSpec?.placeholder || ''}
        data-autofocus="true"
        autoComplete="off"
        required={required}
        defaultValue={String(response.answer ?? '')}
      />
    </label>
  );
}

function FeedbackPanel({ feedback }) {
  if (!feedback?.result) return null;
  const result = feedback.result;
  return (
    <div className={`feedback ${result.correct ? 'good' : 'warn'}`} role="status" aria-live="polite">
      <strong>{result.feedbackShort || (result.correct ? 'Correct.' : 'Not quite.')}</strong>
      <div>{result.feedbackLong || result.minimalHint || ''}</div>
      {result.answerText ? <div className="small muted">Answer: {result.answerText}</div> : null}
    </div>
  );
}

function WorkedSolutionPanel({ solution }) {
  if (!solution) return null;
  return (
    <aside className="grammar-worked-solution" aria-label="Worked solution">
      <div className="grammar-guidance-head">
        <span className="chip good">Worked solution</span>
      </div>
      {solution.answerText ? <p><span>Answer</span>{solution.answerText}</p> : null}
      {solution.explanation ? <p><span>Why</span>{solution.explanation}</p> : null}
      {solution.check ? <p><span>Check</span>{solution.check}</p> : null}
    </aside>
  );
}

function GuidancePanel({ support }) {
  if (!support) return null;
  const worked = support.kind === 'worked';
  const concepts = Array.isArray(support.concepts) ? support.concepts : [];
  const notices = Array.isArray(support.notices) ? support.notices.filter(Boolean) : [];
  const example = support.workedExample || {};
  const contrast = support.contrast || {};

  return (
    <aside className={`grammar-guidance ${worked ? 'worked' : 'faded'}`} aria-label={support.title || 'Grammar guidance'}>
      <div className="grammar-guidance-head">
        <span className="chip good">{support.title || (worked ? 'Worked example' : 'Faded guidance')}</span>
        {concepts[0]?.name ? <strong>{concepts[0].name}</strong> : null}
      </div>

      {worked && (example.prompt || example.exampleResponse || example.why) ? (
        <div className="grammar-guidance-example">
          {example.prompt ? <p><span>Prompt</span>{example.prompt}</p> : null}
          {example.exampleResponse ? <p><span>Model</span>{example.exampleResponse}</p> : null}
          {example.why ? <p><span>Why</span>{example.why}</p> : null}
        </div>
      ) : null}

      {!worked && support.summary ? <p className="grammar-guidance-summary">{support.summary}</p> : null}

      {!worked && (contrast.secureExample || contrast.nearMiss || contrast.why) ? (
        <div className="grammar-guidance-contrast">
          {contrast.secureExample ? <p><span>Secure</span>{contrast.secureExample}</p> : null}
          {contrast.nearMiss ? <p><span>Near miss</span>{contrast.nearMiss}</p> : null}
          {contrast.why ? <p><span>Check</span>{contrast.why}</p> : null}
        </div>
      ) : null}

      {notices.length ? (
        <ul className="grammar-guidance-notices">
          {notices.map((notice) => <li key={notice}>{notice}</li>)}
        </ul>
      ) : null}
    </aside>
  );
}

function AiEnrichmentPanel({ enrichment }) {
  if (!enrichment) return null;
  const ready = enrichment.status === 'ready';
  const explanation = enrichment.explanation || {};
  const cards = Array.isArray(enrichment.revisionCards) ? enrichment.revisionCards : [];
  const drills = Array.isArray(enrichment.revisionDrills) ? enrichment.revisionDrills : [];
  const notices = Array.isArray(enrichment.notices) ? enrichment.notices.filter(Boolean) : [];

  return (
    <aside className={`grammar-ai-enrichment ${ready ? 'ready' : 'failed'}`} aria-label="Grammar enrichment">
      <div className="grammar-ai-head">
        <span className="chip good">Non-scored</span>
        <strong>{ready ? (explanation.title || 'Grammar explanation') : 'Enrichment unavailable'}</strong>
      </div>

      {ready && explanation.body ? <p>{explanation.body}</p> : null}
      {!ready && enrichment.error?.message ? <p>{enrichment.error.message}</p> : null}

      {ready && Array.isArray(explanation.keyPoints) && explanation.keyPoints.length ? (
        <ul className="grammar-ai-points">
          {explanation.keyPoints.map((point) => <li key={point}>{point}</li>)}
        </ul>
      ) : null}

      {cards.length ? (
        <div className="grammar-ai-cards">
          {cards.map((card, index) => (
            <div className="grammar-ai-card" key={`${card.front || card.back}-${index}`}>
              {card.title ? <span>{card.title}</span> : null}
              {card.front ? <strong>{card.front}</strong> : null}
              {card.back ? <p>{card.back}</p> : null}
            </div>
          ))}
        </div>
      ) : null}

      {drills.length ? (
        <div className="grammar-ai-drills">
          {drills.map((drill) => (
            <span className="chip" key={drill.templateId}>{drill.label || drill.templateId}</span>
          ))}
        </div>
      ) : null}

      {notices.length ? (
        <ul className="grammar-ai-notices">
          {notices.map((notice) => <li key={notice}>{notice}</li>)}
        </ul>
      ) : null}
    </aside>
  );
}

function formatMiniTestTime(ms) {
  const safeMs = Math.max(0, Number(ms) || 0);
  const totalSeconds = Math.ceil(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function useMiniTestRemaining(miniTest) {
  const expiresAt = Number(miniTest?.expiresAt) || 0;
  const seededRemaining = Number(miniTest?.remainingMs);
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    if (!expiresAt || miniTest?.finished) return undefined;
    const timer = globalThis.setInterval?.(() => setNow(Date.now()), 1000);
    return () => {
      if (timer) globalThis.clearInterval?.(timer);
    };
  }, [expiresAt, miniTest?.finished]);

  if (!expiresAt && Number.isFinite(seededRemaining)) return Math.max(0, seededRemaining);
  return Math.max(0, expiresAt - now);
}

function MiniTestStatus({ miniTest, pending, runtimeReadOnly }) {
  if (!miniTest) return null;
  const questions = Array.isArray(miniTest.questions) ? miniTest.questions : [];
  const currentIndex = Number(miniTest.currentIndex) || 0;
  const answered = questions.filter((question) => question.answered).length;
  const remainingMs = useMiniTestRemaining(miniTest);

  return (
    <div className="grammar-mini-test-panel" aria-label="Mini-test status">
      <div className="grammar-mini-test-meta">
        <span className="chip good">Timed test</span>
        <span className="chip">Question {currentIndex + 1} of {Math.max(1, questions.length)}</span>
        <span className="chip">{answered} saved</span>
        <span className={`chip ${remainingMs <= 60_000 ? 'warn' : ''}`}>Time left {formatMiniTestTime(remainingMs)}</span>
      </div>
      <div className="grammar-mini-test-nav" aria-label="Mini-test questions">
        {questions.map((question, index) => (
          <button
            className={`grammar-mini-test-nav-button${question.current ? ' current' : ''}${question.answered ? ' answered' : ''}`}
            type="submit"
            name="_action"
            value="move"
            data-index={index}
            disabled={runtimeReadOnly || pending || question.current}
            aria-current={question.current ? 'step' : undefined}
            key={`${question.itemId || question.templateId}-${index}`}
          >
            <span>{index + 1}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SessionGoalChip({ goal }) {
  if (!goal?.type) return null;
  if (goal.type === 'questions') {
    return <span className="chip">Goal {Number(goal?.targetCount) || 0} questions</span>;
  }
  if (goal.type === 'timed') {
    return <span className="chip">Ten minutes · {formatMiniTestTime(goal.remainingMs)} left</span>;
  }
  if (goal.type === 'due') {
    return <span className="chip">Clear due items</span>;
  }
  return null;
}

function RepairActions({ isMiniTest, isFeedback, session, pending, runtimeReadOnly, actions }) {
  if (isMiniTest) return null;
  const disabled = runtimeReadOnly || pending;
  if (isFeedback) {
    return (
      <div className="grammar-repair-actions" aria-label="Grammar repair actions">
        <button className="btn secondary" type="button" disabled={disabled} onClick={() => actions.dispatch('grammar-retry-current-question')}>
          Retry
        </button>
        <button className="btn secondary" type="button" disabled={disabled} onClick={() => actions.dispatch('grammar-show-worked-solution')}>
          Worked solution
        </button>
        <button className="btn secondary" type="button" disabled={disabled} onClick={() => actions.dispatch('grammar-start-similar-problem')}>
          Similar problem
        </button>
      </div>
    );
  }
  if ((Number(session?.supportLevel) || 0) > 0) return null;
  return (
    <div className="grammar-repair-actions" aria-label="Grammar support actions">
      <button className="btn secondary" type="button" disabled={disabled} onClick={() => actions.dispatch('grammar-use-faded-support')}>
        Faded support
      </button>
      <button className="btn secondary" type="button" disabled={disabled} onClick={() => actions.dispatch('grammar-start-similar-problem')}>
        Similar problem
      </button>
    </div>
  );
}

function AiEnrichmentActions({ isMiniTest, pending, runtimeReadOnly, actions }) {
  if (isMiniTest) return null;
  const disabled = runtimeReadOnly || pending;
  return (
    <div className="grammar-ai-actions" aria-label="Grammar enrichment actions">
      <button
        className="btn secondary"
        type="button"
        disabled={disabled}
        onClick={() => actions.dispatch('grammar-request-ai-enrichment', { kind: 'explanation' })}
      >
        Explain this
      </button>
      <button
        className="btn secondary"
        type="button"
        disabled={disabled}
        onClick={() => actions.dispatch('grammar-request-ai-enrichment', { kind: 'revision-card' })}
      >
        Revision cards
      </button>
    </div>
  );
}

export function GrammarSessionScene({ grammar, actions, runtimeReadOnly }) {
  const session = grammar.session || {};
  const miniTest = session.type === 'mini-set' ? session.miniTest : null;
  const miniTestQuestions = Array.isArray(miniTest?.questions) ? miniTest.questions : [];
  const miniTestCurrent = miniTestQuestions.find((question) => question.current)
    || miniTestQuestions[Number(miniTest?.currentIndex) || 0]
    || null;
  const item = session.currentItem || {};
  const isMiniTest = Boolean(miniTest);
  const progressDone = isMiniTest
    ? miniTestQuestions.filter((question) => question.answered).length
    : Math.min(Number(session.answered) || 0, Number(session.targetCount) || 0);
  const progressTotal = isMiniTest
    ? Math.max(1, Number(miniTest?.setSize) || miniTestQuestions.length || 1)
    : Math.max(1, Number(session.targetCount) || 1);
  const isFeedback = grammar.phase === 'feedback' || grammar.awaitingAdvance;
  const pending = Boolean(grammar.pendingCommand);
  const submitDisabled = runtimeReadOnly || pending || (!isMiniTest && isFeedback);
  const currentResponse = isMiniTest ? (miniTestCurrent?.response || {}) : {};
  const showDomainChip = item.domain && (grammar.prefs?.showDomainBeforeAnswer !== false || isFeedback);

  return (
    <section className="grammar-session" aria-labelledby="grammar-session-title">
      <div className="grammar-session-head">
        <div>
          <div className="eyebrow">Grammar practice</div>
          <h2 id="grammar-session-title">{item.templateLabel || 'Worker-marked question'}</h2>
        </div>
        <div className="grammar-progress" aria-label="Round progress">
          <span>{progressDone}</span>
          <small>of {progressTotal}</small>
        </div>
      </div>

      <div className="grammar-prompt-card">
        <div className="chip-row">
          {isMiniTest ? <span className="chip good">KS2-style mini-test</span> : null}
          {!isMiniTest ? <SessionGoalChip goal={session.goal} /> : null}
          {showDomainChip ? <span className="chip">{item.domain}</span> : null}
          {item.questionType ? <span className="chip">{item.questionType}</span> : null}
          {session.serverAuthority ? <span className="chip good">Worker authority</span> : null}
        </div>
        {isMiniTest ? (
          <MiniTestStatus
            miniTest={miniTest}
            pending={pending}
            runtimeReadOnly={runtimeReadOnly}
          />
        ) : null}
        <p className="grammar-prompt">{item.promptText || 'Loading the next Grammar item...'}</p>
        {item.checkLine ? <p className="grammar-check-line">{item.checkLine}</p> : null}
        {!isMiniTest ? <GuidancePanel support={session.supportGuidance} /> : null}
        <AiEnrichmentActions
          isMiniTest={isMiniTest}
          pending={pending}
          runtimeReadOnly={runtimeReadOnly}
          actions={actions}
        />
        {!isMiniTest ? <AiEnrichmentPanel enrichment={grammar.aiEnrichment} /> : null}

        <form
          className="grammar-answer-form"
          key={`${session.id || 'grammar'}-${session.currentIndex || 0}`}
          onSubmit={(event) => {
            event.preventDefault();
            const submitter = event.nativeEvent?.submitter;
            const submitAction = submitter?.value || 'save';
            const formData = new FormData(event.currentTarget);
            if (isMiniTest) {
              if (submitAction === 'finish') {
                actions.dispatch('grammar-finish-mini-test', { formData });
                return;
              }
              const payload = {
                formData,
                advance: submitAction === 'save-next',
              };
              if (submitAction === 'move') payload.index = submitter?.dataset?.index;
              actions.dispatch('grammar-save-mini-test-response', payload);
              return;
            }
            actions.dispatch('grammar-submit-form', { formData });
          }}
        >
          <GrammarInput inputSpec={item.inputSpec || { type: 'text' }} required={!isMiniTest} response={currentResponse} />
          {!isMiniTest ? <FeedbackPanel feedback={grammar.feedback} /> : null}
          {!isMiniTest ? <WorkedSolutionPanel solution={grammar.feedback?.workedSolution} /> : null}
          <RepairActions
            isMiniTest={isMiniTest}
            isFeedback={isFeedback}
            session={session}
            pending={pending}
            runtimeReadOnly={runtimeReadOnly}
            actions={actions}
          />
          {grammar.error ? (
            <div className="feedback bad" role="alert">
              <strong>Grammar command failed</strong>
              <div>{grammar.error}</div>
            </div>
          ) : null}
          <div className="actions">
            {isMiniTest ? (
              <>
                <button className="btn primary" type="submit" name="_action" value="save" disabled={submitDisabled}>
                  {pending && grammar.pendingCommand === 'save-mini-test-response' ? 'Saving...' : 'Save response'}
                </button>
                <button className="btn secondary" type="submit" name="_action" value="save-next" disabled={submitDisabled}>
                  Save and next
                </button>
                <button className="btn ghost" type="submit" name="_action" value="finish" disabled={runtimeReadOnly || pending}>
                  {pending && grammar.pendingCommand === 'finish-mini-test' ? 'Finishing...' : 'Finish mini-set'}
                </button>
              </>
            ) : (
              <button className="btn primary" type="submit" disabled={submitDisabled}>
                {pending && grammar.pendingCommand === 'submit-answer' ? 'Checking...' : 'Submit answer'}
              </button>
            )}
            {!isMiniTest && isFeedback ? (
              <button
                className="btn secondary"
                type="button"
                disabled={runtimeReadOnly || pending}
                onClick={() => actions.dispatch('grammar-continue')}
              >
                {progressDone >= progressTotal ? 'Finish round' : 'Next question'}
              </button>
            ) : null}
            {!isMiniTest ? (
              <button
                className="btn ghost"
                type="button"
                disabled={pending}
                onClick={() => actions.dispatch('grammar-end-early')}
              >
                End round
              </button>
            ) : null}
          </div>
        </form>
      </div>
    </section>
  );
}
