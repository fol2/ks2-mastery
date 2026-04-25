import React from 'react';

function optionLabel(option) {
  if (Array.isArray(option)) return String(option[1] ?? option[0] ?? '');
  return String(option?.label ?? option?.value ?? '');
}

function optionValue(option) {
  if (Array.isArray(option)) return String(option[0] ?? '');
  return String(option?.value ?? '');
}

function ChoiceList({ inputSpec }) {
  const options = Array.isArray(inputSpec?.options) ? inputSpec.options : [];
  const type = inputSpec?.type === 'checkbox_list' ? 'checkbox' : 'radio';
  const name = inputSpec?.type === 'checkbox_list' ? 'selected' : 'answer';
  return (
    <div className={`grammar-choice-list ${inputSpec?.asTokens ? 'tokens' : ''}`}>
      {options.map((option) => {
        const value = optionValue(option);
        return (
          <label className="grammar-choice" key={value}>
            <input type={type} name={name} value={value} required={type === 'radio'} />
            <span>{optionLabel(option)}</span>
          </label>
        );
      })}
    </div>
  );
}

function TableChoice({ inputSpec }) {
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
                  <input type="radio" name={row.key} value={column} aria-label={`${row.label}: ${column}`} required />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MultiField({ field }) {
  const options = Array.isArray(field?.options) ? field.options : [];
  if (field?.kind === 'select') {
    return (
      <label className="field grammar-field" key={field.key}>
        <span>{field.label}</span>
        <select className="input" name={field.key}>
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
              <input type="radio" name={field.key} value={optionValue(option)} required />
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
      <input className="input" name={field.key} autoComplete="off" required />
    </label>
  );
}

function GrammarInput({ inputSpec }) {
  if (inputSpec?.type === 'single_choice' || inputSpec?.type === 'checkbox_list') {
    return <ChoiceList inputSpec={inputSpec} />;
  }
  if (inputSpec?.type === 'table_choice') {
    return <TableChoice inputSpec={inputSpec} />;
  }
  if (inputSpec?.type === 'multi') {
    const fields = Array.isArray(inputSpec?.fields) ? inputSpec.fields : [];
    return <div className="grammar-multi-fields">{fields.map((field) => <MultiField field={field} key={field.key} />)}</div>;
  }
  if (inputSpec?.type === 'textarea') {
    return (
      <label className="field">
        <span>{inputSpec.label || 'Your answer'}</span>
        <textarea className="input grammar-textarea" name="answer" placeholder={inputSpec.placeholder || ''} data-autofocus="true" required />
      </label>
    );
  }
  return (
    <label className="field">
      <span>{inputSpec?.label || 'Your answer'}</span>
      <input className="input" name="answer" placeholder={inputSpec?.placeholder || ''} data-autofocus="true" autoComplete="off" required />
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

export function GrammarSessionScene({ grammar, actions, runtimeReadOnly }) {
  const session = grammar.session || {};
  const item = session.currentItem || {};
  const progressDone = Math.min(Number(session.answered) || 0, Number(session.targetCount) || 0);
  const progressTotal = Math.max(1, Number(session.targetCount) || 1);
  const isFeedback = grammar.phase === 'feedback' || grammar.awaitingAdvance;
  const pending = Boolean(grammar.pendingCommand);
  const submitDisabled = runtimeReadOnly || pending || isFeedback;

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
          {item.domain ? <span className="chip">{item.domain}</span> : null}
          {item.questionType ? <span className="chip">{item.questionType}</span> : null}
          {session.serverAuthority ? <span className="chip good">Worker authority</span> : null}
        </div>
        <p className="grammar-prompt">{item.promptText || 'Loading the next Grammar item...'}</p>
        {item.checkLine ? <p className="grammar-check-line">{item.checkLine}</p> : null}
        <GuidancePanel support={session.supportGuidance} />
        <AiEnrichmentPanel enrichment={grammar.aiEnrichment} />

        <form
          className="grammar-answer-form"
          onSubmit={(event) => {
            event.preventDefault();
            actions.dispatch('grammar-submit-form', { formData: new FormData(event.currentTarget) });
          }}
        >
          <GrammarInput inputSpec={item.inputSpec || { type: 'text' }} />
          <FeedbackPanel feedback={grammar.feedback} />
          {grammar.error ? (
            <div className="feedback bad" role="alert">
              <strong>Grammar command failed</strong>
              <div>{grammar.error}</div>
            </div>
          ) : null}
          <div className="actions">
            <button className="btn primary" type="submit" disabled={submitDisabled}>
              {pending && grammar.pendingCommand === 'submit-answer' ? 'Checking...' : 'Submit answer'}
            </button>
            {isFeedback ? (
              <button
                className="btn secondary"
                type="button"
                disabled={runtimeReadOnly || pending}
                onClick={() => actions.dispatch('grammar-continue')}
              >
                {progressDone >= progressTotal ? 'Finish round' : 'Next question'}
              </button>
            ) : null}
            <button
              className="btn ghost"
              type="button"
              disabled={pending}
              onClick={() => actions.dispatch('grammar-end-early')}
            >
              End round
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
