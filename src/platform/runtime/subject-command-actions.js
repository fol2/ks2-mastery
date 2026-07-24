function defaultDedupeKey({ command, learnerId, subjectId, state }) {
  if (!['start-session', 'submit-answer', 'continue-session', 'skip-item', 'end-session'].includes(command)) return '';
  const sessionId = state?.subjectUi?.[subjectId]?.session?.id || '';
  return [subjectId, command, learnerId || 'default', sessionId || 'no-session'].join(':');
}

function errorMessage(error, fallback) {
  return error?.payload?.message || error?.message || fallback;
}

/**
 * Silent minimum gap after a paced gameplay command response before the next
 * may start (Workers Free input dedupe). UI pending clears as soon as the
 * response lands; only this lock remains during the gap.
 */
export const SUBJECT_COMMAND_MIN_GAP_MS = 100;

const PACED_COMMANDS = new Set([
  'start-session',
  'submit-answer',
  'continue-session',
  'skip-item',
  'end-session',
]);

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function pacedLockKey(subjectId, learnerId) {
  return `${subjectId}:paced:${learnerId || 'default'}`;
}

export function createSubjectCommandActionHandler({
  subjectId,
  actions = {},
  subjectCommands,
  getState,
  isReadOnly = () => false,
  setSubjectError = () => {},
  pendingKeys = new Set(),
  readOnlyMessage = 'Practice is read-only while sync is degraded. Retry sync before continuing.',
  onBeforeCommand = () => {},
  onCommandResult = () => {},
  onCommandSettled = () => {},
  onCommandError = null,
  pacedCommandMinGapMs = SUBJECT_COMMAND_MIN_GAP_MS,
} = {}) {
  if (!subjectId || typeof subjectId !== 'string') {
    throw new TypeError('Subject command action handler requires a subject id.');
  }
  if (!subjectCommands || typeof subjectCommands.send !== 'function') {
    throw new TypeError('Subject command action handler requires a subject command client.');
  }
  if (typeof getState !== 'function') {
    throw new TypeError('Subject command action handler requires getState().');
  }

  const minGapMs = Math.max(0, Number(pacedCommandMinGapMs) || 0);

  function handle(actionName, data = {}) {
    const config = actions[actionName];
    if (!config) return false;

    const state = getState();
    const learnerId = state?.learners?.selectedId || '';
    if (!learnerId) return true;

    if (config.mutates !== false && isReadOnly()) {
      setSubjectError(readOnlyMessage);
      return true;
    }

    const command = typeof config.command === 'function'
      ? config.command({ action: actionName, data, state, learnerId })
      : config.command;
    if (!command) return true;
    const payload = typeof config.payload === 'function'
      ? config.payload({ action: actionName, data, state, learnerId })
      : (config.payload || {});
    const dedupeKey = typeof config.dedupeKey === 'function'
      ? config.dedupeKey({ action: actionName, data, state, learnerId, subjectId, command, payload })
      : (config.dedupeKey === false ? '' : defaultDedupeKey({ command, learnerId, subjectId, state }));

    const isPaced = PACED_COMMANDS.has(command) && minGapMs > 0;
    const paceKey = isPaced ? pacedLockKey(subjectId, learnerId) : '';

    if (paceKey && pendingKeys.has(paceKey)) return true;
    if (dedupeKey && pendingKeys.has(dedupeKey)) return true;
    if (dedupeKey) pendingKeys.add(dedupeKey);
    if (paceKey) pendingKeys.add(paceKey);
    onBeforeCommand({ action: actionName, data, state, learnerId, subjectId, command, payload });

    subjectCommands.send({
      subjectId,
      learnerId,
      command,
      payload,
    }).then((response) => {
      onCommandResult(response, { action: actionName, data, learnerId, subjectId, command, payload });
    }).catch((error) => {
      if (typeof onCommandError === 'function') {
        onCommandError(error, { action: actionName, data, learnerId, subjectId, command, payload });
        return;
      }
      setSubjectError(errorMessage(error, `${subjectId} command could not be completed.`));
    }).finally(() => {
      // Unlock the UI immediately when the response settles. Keep only the
      // silent pace lock so dense Free-tier retries cannot stack.
      if (dedupeKey) pendingKeys.delete(dedupeKey);
      onCommandSettled({ action: actionName, data, learnerId, subjectId, command, payload });
      if (paceKey && isPaced && minGapMs > 0) {
        delay(minGapMs).then(() => {
          pendingKeys.delete(paceKey);
        });
        return;
      }
      if (paceKey) pendingKeys.delete(paceKey);
    });

    return true;
  }

  return { handle };
}
