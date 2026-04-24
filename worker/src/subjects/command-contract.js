import { BadRequestError } from '../errors.js';

function cleanText(value) {
  return String(value || '').trim();
}

function cleanCommandType(value) {
  return cleanText(value).toLowerCase().replace(/[\s_]+/g, '-');
}

export function normaliseSubjectCommandRequest({
  routeSubjectId,
  body = {},
  request,
} = {}) {
  const subjectId = cleanText(routeSubjectId || body.subjectId);
  const command = cleanCommandType(body.command || body.type || body.action);
  const learnerId = cleanText(body.learnerId);
  const requestId = cleanText(body.requestId || body.mutation?.requestId || request?.headers?.get('x-ks2-request-id'));
  const correlationId = cleanText(
    body.correlationId
    || body.mutation?.correlationId
    || request?.headers?.get('x-ks2-correlation-id')
    || requestId,
  );
  const expectedLearnerRevision = Number(body.expectedLearnerRevision ?? body.mutation?.expectedLearnerRevision);

  if (!subjectId) {
    throw new BadRequestError('Subject id is required for subject commands.', {
      code: 'subject_id_required',
    });
  }
  if (!command) {
    throw new BadRequestError('Command type is required for subject commands.', {
      code: 'subject_command_required',
      subjectId,
    });
  }
  if (!learnerId) {
    throw new BadRequestError('Learner id is required for subject commands.', {
      code: 'learner_id_required',
      subjectId,
      command,
    });
  }
  if (!requestId) {
    throw new BadRequestError('Command requestId is required for subject commands.', {
      code: 'command_request_id_required',
      subjectId,
      command,
    });
  }
  if (!Number.isFinite(expectedLearnerRevision)) {
    throw new BadRequestError('Command expectedLearnerRevision is required for subject commands.', {
      code: 'command_revision_required',
      subjectId,
      command,
    });
  }

  return {
    subjectId,
    command,
    learnerId,
    requestId,
    correlationId,
    expectedLearnerRevision,
    payload: body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload)
      ? body.payload
      : {},
  };
}
