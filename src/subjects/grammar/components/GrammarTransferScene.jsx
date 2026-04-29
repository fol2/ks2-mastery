import { GRAMMAR_CLIENT_CONCEPTS } from '../metadata.js';
import {
  GRAMMAR_CLUSTER_DISPLAY_NAMES,
  grammarMonsterClusterForConcept,
} from './grammar-view-model.js';

// Phase 3 U6b: Writing Try scene. Non-scored writing surface reachable via
// the dashboard's "Writing Try" secondary button (U1). Consumes the Worker
// `transferLane` read model plumbed through by U6a and mirrors the Grammar
// Bank scene's layout conventions (hero + back row + body card + secondary
// sections).
//
// Three modes, chosen by the `ui.transfer.selectedPromptId` slot:
//   1. pick-prompt   — no prompt selected; renders the prompt catalogue.
//   2. write         — a prompt is selected; renders prompt details + a
//                      textarea + self-check checklist + Save button.
//   3. saved-history — rendered below the write surface when the selected
//                      prompt already has `latest` evidence. Shows latest
//                      (with self-assessment ticks) plus up to four
//                      `history` snapshots (history omits self-assessment
//                      by Worker contract asymmetry).
//
// Orphaned evidence (a promptId in `transferLane.evidence` that is absent
// from `transferLane.prompts`) renders in a separate "Retired prompts"
// section as read-only cards — matching the U6a Key Technical Decisions.
//
// Non-scored invariants held at the UI layer: no score card, no retry
// button, no reward toast, no Concordium progress surface, no mastery
// number. The scene only routes `grammar-save-transfer-evidence` plus the
// four transient UI dispatchers registered in `module.js` for U6b.

const WRITING_CAP = 2000;
const HISTORY_LIMIT = 4;

const CONCEPT_NAMES_BY_ID = Object.freeze(Object.fromEntries(
  GRAMMAR_CLIENT_CONCEPTS.map((concept) => [concept.id, concept.name]),
));

function conceptLabel(conceptId) {
  if (typeof conceptId !== 'string' || !conceptId) return '';
  const name = CONCEPT_NAMES_BY_ID[conceptId];
  if (name) return name;
  // Fall back to a humanised id so an unexpected Worker target does not
  // leak a raw snake_case id into child copy.
  return conceptId
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function clusterLabelFor(conceptId) {
  const clusterId = grammarMonsterClusterForConcept(conceptId);
  return GRAMMAR_CLUSTER_DISPLAY_NAMES[clusterId] || '';
}

function relativeSavedAt(savedAt, nowMs = Date.now()) {
  const timestamp = Number(savedAt);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 'Just now';
  const now = Number.isFinite(nowMs) ? nowMs : Date.now();
  const deltaSeconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (deltaSeconds < 60) return 'Just now';
  if (deltaSeconds < 60 * 60) {
    const mins = Math.floor(deltaSeconds / 60);
    return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  }
  if (deltaSeconds < 60 * 60 * 24) {
    const hours = Math.floor(deltaSeconds / (60 * 60));
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  const days = Math.floor(deltaSeconds / (60 * 60 * 24));
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

function truncate(value, limit = 240) {
  const text = String(value || '');
  if (text.length <= limit) return text;
  return `${text.slice(0, limit).trimEnd()}...`;
}

function evidenceCountForPrompt(evidence, promptId) {
  if (!promptId) return 0;
  const entry = evidence.find((candidate) => candidate.promptId === promptId);
  if (!entry) return 0;
  const latestCount = entry.latest ? 1 : 0;
  const historyCount = Array.isArray(entry.history) ? entry.history.length : 0;
  return latestCount + historyCount;
}

function PromptCard({ prompt, savedCount, onStart }) {
  return (
    <article
      className="grammar-transfer-prompt-card"
      data-prompt-id={prompt.id}
    >
      <header className="grammar-transfer-prompt-head">
        <h3 className="grammar-transfer-prompt-title">{prompt.title}</h3>
        {savedCount > 0 ? (
          <span className="grammar-transfer-prompt-saved-chip" aria-label={`${savedCount} saved writing${savedCount === 1 ? '' : 's'}`}>
            {savedCount} saved
          </span>
        ) : null}
      </header>
      <p className="grammar-transfer-prompt-brief">{prompt.brief}</p>
      {prompt.grammarTargets.length ? (
        <ul className="grammar-transfer-prompt-targets" aria-label="Grammar focus">
          {prompt.grammarTargets.map((target) => (
            <li className="grammar-transfer-prompt-target" key={target} data-concept-id={target}>
              {conceptLabel(target)}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="grammar-transfer-prompt-actions">
        <button
          type="button"
          className="btn primary sm"
          data-action="grammar-select-transfer-prompt"
          data-prompt-id={prompt.id}
          onClick={() => onStart(prompt.id)}
        >
          Start writing
        </button>
      </div>
    </article>
  );
}

function PickPromptMode({ prompts, evidence, onStart }) {
  if (!prompts.length) {
    return (
      <div className="grammar-transfer-empty" role="status">
        No writing prompts available right now. Check back after you finish a round.
      </div>
    );
  }
  return (
    <div className="grammar-transfer-prompt-grid">
      {prompts.map((prompt) => (
        <PromptCard
          prompt={prompt}
          savedCount={evidenceCountForPrompt(evidence, prompt.id)}
          onStart={onStart}
          key={prompt.id}
        />
      ))}
    </div>
  );
}

function ChecklistField({ items, ticks, disabled, onToggle }) {
  if (!items.length) return null;
  return (
    <fieldset className="grammar-transfer-checklist" disabled={disabled}>
      <legend className="grammar-transfer-checklist-legend">Self-check</legend>
      <p className="grammar-transfer-checklist-hint">
        Tick what you tried — it is just a reminder for you. Nothing is marked.
      </p>
      <ul className="grammar-transfer-checklist-list">
        {items.map((item, index) => {
          const key = `check-${index}`;
          const checked = Boolean(ticks[key]);
          return (
            <li className="grammar-transfer-checklist-item" key={key}>
              <label className="grammar-transfer-checklist-label">
                <input
                  type="checkbox"
                  className="grammar-transfer-checklist-input"
                  data-action="grammar-toggle-transfer-check"
                  data-check-key={key}
                  checked={checked}
                  disabled={disabled}
                  onChange={(event) => onToggle(key, event.currentTarget.checked)}
                />
                <span className="grammar-transfer-checklist-copy">{item}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}

function WriteMode({
  prompt,
  draft,
  ticks,
  writingCap,
  saveDisabled,
  saveLabel,
  overCap,
  pending,
  onDraftChange,
  onToggle,
  onSave,
  onChangePrompt,
}) {
  const remaining = Math.max(0, writingCap - draft.length);
  const counterClass = overCap
    ? 'grammar-transfer-counter grammar-transfer-counter--warn'
    : 'grammar-transfer-counter';
  const counterLabel = overCap
    ? `${draft.length} of ${writingCap} — too long`
    : `${draft.length} / ${writingCap}`;
  return (
    <section className="grammar-transfer-write" aria-labelledby="grammar-transfer-write-title">
      <header className="grammar-transfer-write-head">
        <h3 id="grammar-transfer-write-title" className="grammar-transfer-write-title">{prompt.title}</h3>
        <p className="grammar-transfer-write-brief">{prompt.brief}</p>
        {prompt.grammarTargets.length ? (
          <ul className="grammar-transfer-write-targets" aria-label="Grammar focus">
            {prompt.grammarTargets.map((target) => (
              <li className="grammar-transfer-write-target" key={target} data-concept-id={target}>
                <span className="grammar-transfer-write-target-name">{conceptLabel(target)}</span>
                <span className="grammar-transfer-write-target-cluster">{clusterLabelFor(target)}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </header>

      <label className="grammar-transfer-textarea-field">
        <span className="grammar-transfer-textarea-label">Your writing</span>
        <textarea
          className="grammar-transfer-textarea"
          name="grammarTransferDraft"
          data-action="grammar-update-transfer-draft"
          data-autofocus="true"
          aria-describedby="grammar-transfer-counter"
          placeholder="Write 3-5 sentences here. Nothing you write is scored."
          value={draft}
          disabled={pending}
          onChange={(event) => onDraftChange(event.currentTarget.value)}
        />
      </label>
      <div
        id="grammar-transfer-counter"
        className={counterClass}
        role={overCap ? 'alert' : 'status'}
        aria-live={overCap ? 'assertive' : 'polite'}
      >
        {counterLabel}
      </div>
      {overCap ? (
        <p className="grammar-transfer-counter-warn-copy">That is longer than we can save. Please shorten it.</p>
      ) : null}

      <ChecklistField
        items={prompt.checklist}
        ticks={ticks}
        disabled={pending}
        onToggle={onToggle}
      />

      <div className="grammar-transfer-write-actions">
        <button
          type="button"
          className="btn primary"
          data-action="grammar-save-transfer-evidence"
          data-prompt-id={prompt.id}
          disabled={saveDisabled}
          onClick={onSave}
        >
          {saveLabel}
        </button>
        <button
          type="button"
          className="btn ghost"
          data-action="grammar-select-transfer-prompt"
          data-prompt-id=""
          disabled={pending}
          onClick={onChangePrompt}
        >
          Change prompt
        </button>
      </div>
    </section>
  );
}

function labelForTick(tick, checklist) {
  const key = typeof tick?.key === 'string' ? tick.key : '';
  const match = /^check-(\d+)$/.exec(key);
  if (!match) return key;
  const index = Number(match[1]);
  const items = Array.isArray(checklist) ? checklist : [];
  if (Number.isInteger(index) && index >= 0 && typeof items[index] === 'string' && items[index]) {
    return items[index];
  }
  return Number.isInteger(index) && index >= 0 ? `Check ${index + 1}` : key;
}

function SavedHistory({ evidence, checklist }) {
  if (!evidence) return null;
  const latest = evidence.latest;
  const history = Array.isArray(evidence.history)
    ? evidence.history.slice(0, HISTORY_LIMIT)
    : [];
  if (!latest && !history.length) return null;
  return (
    <section className="grammar-transfer-saved" aria-labelledby="grammar-transfer-saved-title">
      <h3 id="grammar-transfer-saved-title" className="grammar-transfer-saved-title">My saved writing</h3>
      {latest ? (
        <article className="grammar-transfer-saved-entry grammar-transfer-saved-entry--latest" data-saved-kind="latest">
          <header className="grammar-transfer-saved-entry-head">
            <strong className="grammar-transfer-saved-entry-label">Latest</strong>
            <span className="grammar-transfer-saved-entry-time">{relativeSavedAt(latest.savedAt)}</span>
          </header>
          <p className="grammar-transfer-saved-entry-writing">{truncate(latest.writing)}</p>
          {Array.isArray(latest.selfAssessment) && latest.selfAssessment.length ? (
            <ul className="grammar-transfer-saved-ticks" aria-label="Self-check ticks">
              {latest.selfAssessment.map((tick, index) => (
                <li
                  className={`grammar-transfer-saved-tick${tick.checked ? ' is-checked' : ''}`}
                  data-check-key={tick.key}
                  data-checked={tick.checked ? 'true' : 'false'}
                  key={tick.key || `tick-${index}`}
                >
                  <span className="grammar-transfer-saved-tick-icon" aria-hidden="true">{tick.checked ? '[x]' : '[ ]'}</span>
                  <span className="grammar-transfer-saved-tick-label">{labelForTick(tick, checklist)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </article>
      ) : null}
      {history.length ? (
        <ol className="grammar-transfer-saved-history">
          {history.map((entry, index) => (
            <li className="grammar-transfer-saved-entry grammar-transfer-saved-entry--history" data-saved-kind="history" key={`history-${index}`}>
              <header className="grammar-transfer-saved-entry-head">
                <strong className="grammar-transfer-saved-entry-label">Earlier</strong>
                <span className="grammar-transfer-saved-entry-time">{relativeSavedAt(entry.savedAt)}</span>
              </header>
              <p className="grammar-transfer-saved-entry-writing">{truncate(entry.writing)}</p>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

// U10 follower (HIGH 2): collapsed list of orphans that the child has
// hidden. The details/summary element renders the count in the header
// so the child can always see how many are tucked away. Each row has
// its own "Show again" control, so unhiding is independent per entry —
// a child is never forced to unhide everything at once. UK English
// copy; KS2-friendly wording ("Show again", "Hidden from list"). Same
// `data-action` attribute as the hide control so test-mode dispatchers
// observe identical wiring.
function HiddenOrphans({ entries, onShow }) {
  if (!entries.length) return null;
  return (
    <section
      className="grammar-transfer-orphaned grammar-transfer-orphaned-hidden"
      aria-labelledby="grammar-transfer-orphaned-hidden-title"
      data-section-id="hidden-retired-prompts"
    >
      <details>
        <summary id="grammar-transfer-orphaned-hidden-title" className="grammar-transfer-orphaned-hidden-summary">
          {`Hidden from list (${entries.length})`}
        </summary>
        <p className="grammar-transfer-orphaned-hint">
          These retired prompts are hidden from your list. Your writing is still saved. Tap &quot;Show again&quot; to move a prompt back.
        </p>
        <ul className="grammar-transfer-orphaned-list">
          {entries.map((entry) => (
            <li
              className="grammar-transfer-orphaned-entry"
              data-prompt-id={entry.promptId}
              data-hidden="true"
              key={entry.promptId}
            >
              <header className="grammar-transfer-orphaned-head">
                <strong className="grammar-transfer-orphaned-label">Hidden writing</strong>
                <span className="grammar-transfer-orphaned-time">{relativeSavedAt(entry.latest?.savedAt || entry.updatedAt)}</span>
              </header>
              <p className="grammar-transfer-orphaned-writing">{truncate(entry.latest?.writing || '')}</p>
              <div className="grammar-transfer-orphaned-actions">
                <button
                  type="button"
                  className="btn ghost sm"
                  data-action="grammar-toggle-transfer-hidden"
                  data-prompt-id={entry.promptId}
                  data-hidden-next="false"
                  onClick={() => onShow(entry.promptId)}
                >
                  Show again
                </button>
              </div>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

function OrphanedEvidence({ entries, onHide }) {
  if (!entries.length) return null;
  return (
    <section
      className="grammar-transfer-orphaned"
      aria-labelledby="grammar-transfer-orphaned-title"
      data-section-id="retired-prompts"
    >
      <h3 id="grammar-transfer-orphaned-title" className="grammar-transfer-orphaned-title">Retired prompts</h3>
      <p className="grammar-transfer-orphaned-hint">
        These writings were saved for writing prompts that are no longer on the list. They are kept so a grown-up can still read them. You can hide any of them from your list — your writing is still saved.
      </p>
      <ul className="grammar-transfer-orphaned-list">
        {entries.map((entry) => (
          <li
            className="grammar-transfer-orphaned-entry"
            data-prompt-id={entry.promptId}
            key={entry.promptId}
          >
            <header className="grammar-transfer-orphaned-head">
              <strong className="grammar-transfer-orphaned-label">Saved for a retired writing prompt</strong>
              <span className="grammar-transfer-orphaned-time">{relativeSavedAt(entry.latest?.savedAt || entry.updatedAt)}</span>
            </header>
            <p className="grammar-transfer-orphaned-writing">{truncate(entry.latest?.writing || '')}</p>
            <div className="grammar-transfer-orphaned-actions">
              <button
                type="button"
                className="btn ghost sm"
                data-action="grammar-toggle-transfer-hidden"
                data-prompt-id={entry.promptId}
                onClick={() => onHide(entry.promptId)}
              >
                Hide from my list
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function GrammarTransferScene({ grammar, actions }) {
  const transferLane = grammar?.transferLane || { prompts: [], evidence: [], limits: { writingCapChars: WRITING_CAP } };
  const prompts = Array.isArray(transferLane.prompts) ? transferLane.prompts : [];
  const evidence = Array.isArray(transferLane.evidence) ? transferLane.evidence : [];
  const writingCap = Number(transferLane.limits?.writingCapChars) > 0
    ? Number(transferLane.limits.writingCapChars)
    : WRITING_CAP;

  const transferUi = grammar?.ui?.transfer || { selectedPromptId: '', draft: '', ticks: {} };
  const selectedPromptId = transferUi.selectedPromptId || '';
  const draft = typeof transferUi.draft === 'string' ? transferUi.draft : '';
  const ticks = transferUi.ticks && typeof transferUi.ticks === 'object' && !Array.isArray(transferUi.ticks)
    ? transferUi.ticks
    : {};

  const activePrompt = selectedPromptId
    ? prompts.find((prompt) => prompt.id === selectedPromptId) || null
    : null;

  const selectedEvidence = activePrompt
    ? evidence.find((entry) => entry.promptId === activePrompt.id) || null
    : null;

  const promptIdSet = new Set(prompts.map((prompt) => prompt.id));
  // U10: child-side "Hide from my list" filter. The pref is lazy-
  // initialised empty; when the learner toggles Hide, the promptId is
  // added to `prefs.transferHiddenPromptIds` via `save-prefs`. The
  // filter applies ONLY to the orphan surface — evidence is otherwise
  // untouched on the server, so a grown-up still sees every entry in
  // the Admin Hub.
  //
  // U10 follower (HIGH 2): a child who hides an orphan still needs to
  // be able to reverse that choice. `hiddenOrphanedEvidence` carries
  // the evidence entries that are BOTH orphaned (absent from the live
  // prompt catalogue) AND present in `prefs.transferHiddenPromptIds`.
  // The section renders collapsed by default and exposes one "Show
  // again" control per row — KS2-friendly copy, no destructive action.
  const hiddenPromptIds = Array.isArray(grammar?.prefs?.transferHiddenPromptIds)
    ? grammar.prefs.transferHiddenPromptIds
    : [];
  const hiddenSet = new Set(hiddenPromptIds);
  const orphanedEvidence = evidence.filter(
    (entry) => entry.promptId && !promptIdSet.has(entry.promptId) && !hiddenSet.has(entry.promptId),
  );
  // U10 follower (HIGH 2): entries that the child has hidden — kept in
  // a collapsed section so they can tap "Show again" to reverse the
  // hide. Admin-managed evidence on the server is untouched either way.
  const hiddenOrphanedEvidence = evidence.filter(
    (entry) => entry.promptId && !promptIdSet.has(entry.promptId) && hiddenSet.has(entry.promptId),
  );

  const pendingSave = grammar?.pendingCommand === 'save-transfer-evidence';
  const overCap = draft.length > writingCap;
  const emptyDraft = draft.trim().length === 0;
  const saveDisabled = pendingSave || overCap || emptyDraft;
  const saveLabel = pendingSave ? 'Saving...' : 'Save writing';

  const handleBack = () => {
    actions?.dispatch?.('grammar-close-transfer');
  };
  const handleStart = (promptId) => {
    actions?.dispatch?.('grammar-select-transfer-prompt', { promptId });
  };
  const handleChangePrompt = () => {
    actions?.dispatch?.('grammar-select-transfer-prompt', { promptId: '' });
  };
  const handleDraftChange = (value) => {
    actions?.dispatch?.('grammar-update-transfer-draft', { writing: value });
  };
  const handleToggle = (key, checked) => {
    actions?.dispatch?.('grammar-toggle-transfer-check', { key, checked });
  };
  const handleHideOrphan = (promptId) => {
    if (typeof promptId !== 'string' || !promptId) return;
    actions?.dispatch?.('grammar-toggle-transfer-hidden', { promptId, hidden: true });
  };
  // U10 follower (HIGH 2): reverse-toggle. The `module.js:713` handler
  // already supports `hidden: false`; this wire-up unlocks a "Show again"
  // control on the collapsed Hidden section so a child can reverse their
  // own hide without an admin intervention.
  const handleShowOrphan = (promptId) => {
    if (typeof promptId !== 'string' || !promptId) return;
    actions?.dispatch?.('grammar-toggle-transfer-hidden', { promptId, hidden: false });
  };
  const handleSave = () => {
    if (!activePrompt) return;
    if (saveDisabled) return;
    const checklist = Array.isArray(activePrompt.checklist) ? activePrompt.checklist : [];
    const selfAssessment = checklist.map((_item, index) => {
      const key = `check-${index}`;
      return { key, checked: Boolean(ticks[key]) };
    });
    actions?.dispatch?.('grammar-save-transfer-evidence', {
      payload: {
        promptId: activePrompt.id,
        writing: draft,
        selfAssessment,
      },
    });
  };

  const errorMessage = typeof grammar?.error === 'string' ? grammar.error : '';

  return (
    <section
      className="grammar-transfer-scene"
      aria-labelledby="grammar-transfer-title"
      data-grammar-phase-root="transfer"
    >
      <header className="grammar-transfer-topbar">
        <button
          type="button"
          className="btn ghost sm"
          data-action="grammar-close-transfer"
          aria-label="Back to Grammar Garden dashboard"
          onClick={handleBack}
        >
          &larr; Back to Grammar Garden
        </button>
        <div className="grammar-transfer-topbar-copy">
          <h2 id="grammar-transfer-title" className="grammar-transfer-title">Writing Try</h2>
          <p className="grammar-transfer-subtitle">
            Pick a prompt and write a short paragraph. Nothing you write here is scored.
          </p>
        </div>
      </header>

      {errorMessage ? (
        <div className="grammar-transfer-error feedback bad" role="alert">
          <strong>Something went wrong</strong>
          <div>{errorMessage}</div>
        </div>
      ) : null}

      {activePrompt ? (
        <>
          <WriteMode
            prompt={activePrompt}
            draft={draft}
            ticks={ticks}
            writingCap={writingCap}
            saveDisabled={saveDisabled}
            saveLabel={saveLabel}
            overCap={overCap}
            pending={pendingSave}
            onDraftChange={handleDraftChange}
            onToggle={handleToggle}
            onSave={handleSave}
            onChangePrompt={handleChangePrompt}
          />
          <SavedHistory evidence={selectedEvidence} checklist={activePrompt?.checklist} />
        </>
      ) : (
        <PickPromptMode
          prompts={prompts}
          evidence={evidence}
          onStart={handleStart}
        />
      )}

      <OrphanedEvidence entries={orphanedEvidence} onHide={handleHideOrphan} />
      <HiddenOrphans entries={hiddenOrphanedEvidence} onShow={handleShowOrphan} />
    </section>
  );
}
