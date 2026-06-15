import { reasoningContentSummary } from '../../../../shared/reasoning/content.js';
import { buildReasoningReadModelFromEngine } from './engine.js';

function normaliseData(data = {}) {
  return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
}

function normaliseState(state = {}) {
  return state && typeof state === 'object' && !Array.isArray(state) ? state : {};
}

export function buildReasoningReadModel({
  learnerId = '',
  state = {},
  data = {},
  projections = null,
  nowValue = Date.now(),
  includeContent = true,
} = {}) {
  return buildReasoningReadModelFromEngine({
    learnerId,
    state: normaliseState(state),
    data: normaliseData(data),
    projections,
    nowValue,
    includeContent,
  });
}

export function emptyReasoningReadModel(learnerId = '') {
  return buildReasoningReadModel({ learnerId, state: { phase: 'setup' }, data: { content: reasoningContentSummary() } });
}
