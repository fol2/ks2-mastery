import { sha256 } from '../../auth.js';
import { BadRequestError } from '../../errors.js';
import { resolveRuntimeSnapshot } from '../../../../src/subjects/spelling/content/model.js';
import { SEEDED_SPELLING_CONTENT_BUNDLE } from '../../../../src/subjects/spelling/data/content-data.js';

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

async function sessionPromptToken(parts) {
  return sha256([
    'spelling-prompt-v1',
    parts.learnerId,
    parts.sessionId,
    parts.slug,
    parts.word,
    parts.sentence,
  ].join('|'));
}

async function wordBankPromptToken(parts) {
  return sha256([
    'spelling-word-bank-prompt-v1',
    parts.learnerId,
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
    promptToken: await sessionPromptToken(parts),
    slow: Boolean(audio?.slow),
    wordOnly: false,
  };
}

export async function buildSpellingWordBankAudioCue({ learnerId, word, wordOnly = false } = {}) {
  const parts = {
    learnerId: cleanText(learnerId),
    slug: cleanText(word?.slug),
    word: cleanText(word?.word),
    sentence: cleanText(word?.sentence),
  };
  if (!parts.learnerId || !parts.slug || !parts.word || !parts.sentence) return null;
  return {
    subjectId: 'spelling',
    learnerId: parts.learnerId,
    slug: parts.slug,
    scope: 'word-bank',
    promptToken: await wordBankPromptToken(parts),
    wordOnly: Boolean(wordOnly),
  };
}

function transcriptFor(parts, { wordOnly = false } = {}) {
  if (wordOnly) return parts.word;
  return `The word is ${parts.word}. ${parts.sentence} The word is ${parts.word}.`;
}

async function wordBankPromptParts({ repository, accountId, learnerId, slug } = {}) {
  const safeSlug = cleanText(slug).toLowerCase();
  if (!safeSlug) return null;
  const contentResult = await repository.readSubjectContent(accountId, 'spelling');
  const snapshot = resolveRuntimeSnapshot(contentResult.content, {
    referenceBundle: SEEDED_SPELLING_CONTENT_BUNDLE,
  });
  const word = snapshot?.wordBySlug?.[safeSlug];
  if (!word) return null;
  const sentence = cleanText(word.sentence);
  if (!word.word || !sentence) return null;
  return {
    learnerId,
    slug: word.slug,
    word: cleanText(word.word),
    sentence,
  };
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
    const wordBankParts = await wordBankPromptParts({
      repository,
      accountId,
      learnerId,
      slug: body.slug,
    });
    const expectedWordBankToken = wordBankParts ? await wordBankPromptToken(wordBankParts) : '';
    if (wordBankParts && suppliedToken === expectedWordBankToken) {
      const wordOnly = body.wordOnly === true;
      return {
        transcript: transcriptFor(wordBankParts, { wordOnly }),
        slow: Boolean(body.slow),
        wordOnly,
        promptToken: suppliedToken,
        learnerId,
        sessionId: null,
        scope: 'word-bank',
        slug: wordBankParts.slug,
      };
    }
    throw new BadRequestError('The spelling prompt is no longer active.', {
      code: 'tts_prompt_stale',
    });
  }

  const expectedToken = await sessionPromptToken(parts);
  if (suppliedToken !== expectedToken) {
    const wordBankParts = await wordBankPromptParts({
      repository,
      accountId,
      learnerId,
      slug: body.slug,
    });
    const expectedWordBankToken = wordBankParts ? await wordBankPromptToken(wordBankParts) : '';
    if (wordBankParts && suppliedToken === expectedWordBankToken) {
      const wordOnly = body.wordOnly === true;
      return {
        transcript: transcriptFor(wordBankParts, { wordOnly }),
        slow: Boolean(body.slow),
        wordOnly,
        promptToken: suppliedToken,
        learnerId,
        sessionId: null,
        scope: 'word-bank',
        slug: wordBankParts.slug,
      };
    }
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
