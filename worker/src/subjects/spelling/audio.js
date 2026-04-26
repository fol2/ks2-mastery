import { sha256 } from '../../auth.js';
import { BadRequestError } from '../../errors.js';
import { resolveRuntimeSnapshot } from '../../../../src/subjects/spelling/content/model.js';
import { SEEDED_SPELLING_CONTENT_BUNDLE } from '../../../../src/subjects/spelling/data/content-data.js';
import { resolveSentenceIndex } from '../../../../shared/spelling-audio.js';

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function shouldResolveSessionSentenceCanonically(state = null) {
  const session = state?.phase === 'session' ? state.session : null;
  const card = session?.currentCard || null;
  const word = card?.word || null;
  const prompt = card?.prompt || null;
  const sentence = cleanText(card?.prompt?.sentence);
  if (!word || !sentence) return false;
  const promptWord = cleanText(prompt?.word);
  const promptAccepted = Array.isArray(prompt?.accepted)
    ? prompt.accepted.map((item) => cleanText(item)).filter(Boolean)
    : [];
  const wordValue = cleanText(word.word);
  const promptOverridesWord = Boolean(promptWord && wordValue && promptWord !== wordValue);
  const promptOverridesAccepted = promptAccepted.length > 0;
  const rawSentences = Array.isArray(word.sentences) ? word.sentences : [];
  const sentences = rawSentences.map((item) => cleanText(item)).filter(Boolean);
  if (sentences.length <= 1) return promptOverridesWord || promptOverridesAccepted;
  return !sentences.includes(sentence);
}

function currentPromptParts({ learnerId, state, snapshot = null } = {}) {
  const session = state?.phase === 'session' ? state.session : null;
  const card = session?.currentCard || null;
  const word = card?.word || null;
  const sentence = cleanText(card?.prompt?.sentence);
  if (!session?.id || !word?.word || !sentence) return null;
  const safeSlug = cleanText(word.slug || card.slug).toLowerCase();
  const canonicalWord = safeSlug ? snapshot?.wordBySlug?.[safeSlug] : null;
  const sentenceWord = canonicalWord || word;
  return {
    learnerId,
    sessionId: session.id,
    slug: word.slug || card.slug || '',
    word: cleanText(word.word),
    sentence,
    sentenceIndex: resolveSentenceIndex(sentenceWord, sentence),
  };
}

async function readRuntimeSnapshot({ repository, accountId } = {}) {
  if (!repository) return null;
  try {
    const contentResult = typeof repository.readSpellingRuntimeContent === 'function'
      ? await repository.readSpellingRuntimeContent(accountId, 'spelling')
      : await repository.readSubjectContent(accountId, 'spelling');
    return contentResult.snapshot || resolveRuntimeSnapshot(contentResult.content, {
      referenceBundle: SEEDED_SPELLING_CONTENT_BUNDLE,
    });
  } catch {
    return null;
  }
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
  if (!parts.learnerId || !parts.slug || !parts.word) return null;
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
  const sentence = cleanText(parts.sentence);
  return sentence
    ? `The word is ${parts.word}. ${sentence} The word is ${parts.word}.`
    : `The word is ${parts.word}. The word is ${parts.word}.`;
}

async function wordBankPromptParts({ repository, accountId, learnerId, slug } = {}) {
  const safeSlug = cleanText(slug).toLowerCase();
  if (!safeSlug) return null;
  const contentResult = typeof repository.readSpellingRuntimeContent === 'function'
    ? await repository.readSpellingRuntimeContent(accountId, 'spelling')
    : await repository.readSubjectContent(accountId, 'spelling');
  const snapshot = contentResult.snapshot || resolveRuntimeSnapshot(contentResult.content, {
    referenceBundle: SEEDED_SPELLING_CONTENT_BUNDLE,
  });
  const word = snapshot?.wordBySlug?.[safeSlug];
  if (!word) return null;
  const sentence = cleanText(word.sentence);
  if (!word.word) return null;
  return {
    learnerId,
    slug: word.slug,
    word: cleanText(word.word),
    sentence,
    sentenceIndex: resolveSentenceIndex(word, sentence),
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
  let parts = currentPromptParts({ learnerId, state });
  if (parts && shouldResolveSessionSentenceCanonically(state)) {
    const snapshot = await readRuntimeSnapshot({ repository, accountId });
    parts = currentPromptParts({ learnerId, state, snapshot });
  }
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
        word: wordBankParts.word,
        sentence: wordBankParts.sentence,
        sentenceIndex: wordBankParts.sentenceIndex,
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
        word: wordBankParts.word,
        sentence: wordBankParts.sentence,
        sentenceIndex: wordBankParts.sentenceIndex,
      };
    }
    throw new BadRequestError('The spelling prompt token is no longer valid.', {
      code: 'tts_prompt_stale',
    });
  }

  if (body.wordOnly === true) {
    throw new BadRequestError('Word-only audio is only available for vocabulary practice.', {
      code: 'tts_word_only_scope_invalid',
    });
  }
  return {
    transcript: transcriptFor(parts),
    slow: Boolean(body.slow),
    wordOnly: false,
    promptToken: suppliedToken,
    learnerId,
    sessionId: parts.sessionId,
    scope: 'session',
    slug: parts.slug,
    word: parts.word,
    sentence: parts.sentence,
    sentenceIndex: parts.sentenceIndex,
  };
}
