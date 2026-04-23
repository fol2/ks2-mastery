import { sha256 } from '../../auth.js';
import { BadRequestError } from '../../errors.js';

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function currentPromptParts({ learnerId, state } = {}) {
  const session = state?.phase === 'session' ? state.session : null;
  const card = session?.currentCard || null;
  const word = card?.word || null;
  const sentence = cleanText(card?.prompt?.sentence);
  if (!session?.id || !word?.word || !sentence) return null;
  return {
    learnerId,
    sessionId: session.id,
    slug: word.slug || card.slug || '',
    word: cleanText(word.word),
    sentence,
  };
}

async function promptToken(parts) {
  return sha256([
    'spelling-prompt-v1',
    parts.learnerId,
    parts.sessionId,
    parts.slug,
    parts.word,
    parts.sentence,
  ].join('|'));
}

export async function buildSpellingAudioCue({ learnerId, state, audio = null } = {}) {
  const parts = currentPromptParts({ learnerId, state });
  if (!parts) return null;
  return {
    subjectId: 'spelling',
    learnerId,
    sessionId: parts.sessionId,
    promptToken: await promptToken(parts),
    slow: Boolean(audio?.slow),
    wordOnly: false,
  };
}

function transcriptFor(parts, { wordOnly = false } = {}) {
  if (wordOnly) return parts.word;
  return `The word is ${parts.word}. ${parts.sentence} The word is ${parts.word}.`;
}

export async function resolveSpellingAudioRequest({
  repository,
  accountId,
  body = {},
} = {}) {
  const learnerId = cleanText(body.learnerId);
  const suppliedToken = cleanText(body.promptToken);
  if (!learnerId) {
    throw new BadRequestError('Learner id is required for dictation audio.', { code: 'learner_id_required' });
  }
  if (!suppliedToken) {
    throw new BadRequestError('A server prompt token is required for dictation audio.', {
      code: 'tts_prompt_token_required',
    });
  }

  const runtime = await repository.readSubjectRuntime(accountId, learnerId, 'spelling');
  const state = runtime.subjectRecord?.ui || null;
  const parts = currentPromptParts({ learnerId, state });
  if (!parts) {
    throw new BadRequestError('The spelling prompt is no longer active.', {
      code: 'tts_prompt_stale',
    });
  }

  const expectedToken = await promptToken(parts);
  if (suppliedToken !== expectedToken) {
    throw new BadRequestError('The spelling prompt token is no longer valid.', {
      code: 'tts_prompt_stale',
    });
  }

  const wordOnly = body.wordOnly === true;
  return {
    transcript: transcriptFor(parts, { wordOnly }),
    slow: Boolean(body.slow),
    wordOnly,
    promptToken: suppliedToken,
    learnerId,
    sessionId: parts.sessionId,
  };
}
