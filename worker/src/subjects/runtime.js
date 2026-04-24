import { NotFoundError } from '../errors.js';
import { createGrammarCommandHandlers } from './grammar/commands.js';
import { createPunctuationCommandHandlers } from './punctuation/commands.js';
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

export function createWorkerSubjectRuntime(options = {}) {
  return createSubjectRuntime({
    handlers: {
      grammar: createGrammarCommandHandlers(options.grammar || {}),
      punctuation: createPunctuationCommandHandlers(options.punctuation || {}),
      spelling: createSpellingCommandHandlers(options.spelling || {}),
      ...(options.handlers || {}),
    },
  });
}
