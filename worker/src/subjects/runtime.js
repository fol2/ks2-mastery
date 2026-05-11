import { NotFoundError } from '../errors.js';
import { createArithmeticCommandHandlers } from './arithmetic/commands.js';
import { createGrammarCommandHandlers } from './grammar/commands.js';
import { createReadingCommandHandlers } from './reading/commands.js';
import { createReasoningCommandHandlers } from './reasoning/commands.js';
import { createSpellingCommandHandlers } from './spelling/commands.js';

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

function createLazyCommandHandlers(loadHandlers, options = {}) {
  let handlersPromise = null;
  return async (command, context) => {
    if (!handlersPromise) {
      handlersPromise = loadHandlers().then((createHandlers) => createHandlers(options));
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

function createPunctuationLazyCommandHandlers(options = {}) {
  return createLazyCommandHandlers(
    () => import('./punctuation/commands.js').then((module) => module.createPunctuationCommandHandlers),
    options,
  );
}

export function createWorkerSubjectRuntime(options = {}) {
  return createSubjectRuntime({
    handlers: {
      arithmetic: createArithmeticCommandHandlers(options.arithmetic || {}),
      grammar: createGrammarCommandHandlers(options.grammar || {}),
      punctuation: createPunctuationLazyCommandHandlers(options.punctuation || {}),
      reading: createReadingCommandHandlers(options.reading || {}),
      reasoning: createReasoningCommandHandlers(options.reasoning || {}),
      spelling: createSpellingCommandHandlers(options.spelling || {}),
      ...(options.handlers || {}),
    },
  });
}
