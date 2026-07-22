import { NotFoundError } from '../errors.js';

function handlerFor(handlers, subjectId, command) {
  const subjectHandlers = handlers?.[subjectId];
  if (!subjectHandlers) return null;
  if (typeof subjectHandlers === 'function') return subjectHandlers;
  return subjectHandlers[command] || subjectHandlers['*'] || null;
}

export function createSubjectRuntime({ handlers = {} } = {}) {
  return {
    async dispatch(command, context = {}) {
      const handler = handlerFor(handlers, command.subjectId, command.command);
      if (!handler) {
        throw new NotFoundError('Subject command is not available.', {
          code: 'subject_command_not_found',
          subjectId: command.subjectId,
          command: command.command,
        });
      }
      const result = await handler(command, context);
      return {
        subjectId: command.subjectId,
        command: command.command,
        ...(result && typeof result === 'object' && !Array.isArray(result) ? result : {}),
      };
    },
  };
}

function createLazyCommandHandlers(subjectId, loadHandlers, options = {}) {
  let handlersPromise = null;
  return async (command, context) => {
    if (!handlersPromise) {
      const startedAt = performance.now();
      // Temporary production observation. Remove after the cold module graph
      // has been measured on the deployed Worker.
      // eslint-disable-next-line no-console
      console.info('[ks2-observe]', JSON.stringify({
        event: 'subject_handler_load_started',
        subjectId,
        command: command.command,
        requestId: command.requestId,
      }));
      handlersPromise = loadHandlers()
        .then((createHandlers) => createHandlers(options))
        .then((loadedHandlers) => {
          // eslint-disable-next-line no-console
          console.info('[ks2-observe]', JSON.stringify({
            event: 'subject_handler_load_completed',
            subjectId,
            command: command.command,
            requestId: command.requestId,
            durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
          }));
          return loadedHandlers;
        });
    }
    const handlers = await handlersPromise;
    const handler = typeof handlers === 'function'
      ? handlers
      : handlers?.[command.command] || handlers?.['*'] || null;
    if (!handler) {
      throw new NotFoundError('Subject command is not available.', {
        code: 'subject_command_not_found',
        subjectId: command.subjectId,
        command: command.command,
      });
    }
    return handler(command, context);
  };
}

const SUBJECT_HANDLER_LOADERS = Object.freeze({
  arithmetic: () => import('./arithmetic/commands.js').then((module) => module.createArithmeticCommandHandlers),
  grammar: () => import('./grammar/commands.js').then((module) => module.createGrammarCommandHandlers),
  punctuation: () => import('./punctuation/commands.js').then((module) => module.createPunctuationCommandHandlers),
  reading: () => import('./reading/commands.js').then((module) => module.createReadingCommandHandlers),
  reasoning: () => import('./reasoning/commands.js').then((module) => module.createReasoningCommandHandlers),
  spelling: () => import('./spelling/commands.js').then((module) => module.createSpellingCommandHandlers),
});

function createSubjectLazyCommandHandlers(subjectId, options = {}) {
  return createLazyCommandHandlers(subjectId, SUBJECT_HANDLER_LOADERS[subjectId], options);
}

export function createWorkerSubjectRuntime(options = {}) {
  return createSubjectRuntime({
    handlers: {
      arithmetic: createSubjectLazyCommandHandlers('arithmetic', options.arithmetic || {}),
      grammar: createSubjectLazyCommandHandlers('grammar', options.grammar || {}),
      punctuation: createSubjectLazyCommandHandlers('punctuation', options.punctuation || {}),
      reading: createSubjectLazyCommandHandlers('reading', options.reading || {}),
      reasoning: createSubjectLazyCommandHandlers('reasoning', options.reasoning || {}),
      spelling: createSubjectLazyCommandHandlers('spelling', options.spelling || {}),
      ...(options.handlers || {}),
    },
  });
}
