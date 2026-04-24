const DEFAULT_AUDIO_EXTENSION = 'mp3';

export const SUPPORTED_BUFFERED_AUDIO_FORMATS = Object.freeze(['mp3', 'wav']);
export const SPELLING_AUDIO_VERSION = 'v1';
export const SPELLING_AUDIO_MODEL = 'gemini-3.1-flash-tts-preview';
export const SPELLING_AUDIO_ROOT_PREFIX = `spelling-audio/${SPELLING_AUDIO_VERSION}`;
export const SPELLING_AUDIO_MANIFEST_KEY = `${SPELLING_AUDIO_ROOT_PREFIX}/manifest.json`;

export const BUFFERED_GEMINI_VOICE_OPTIONS = Object.freeze([
  Object.freeze({
    id: 'Iapetus',
    role: 'male',
    label: 'Pre-cached UK male',
    blurb: 'Clear',
  }),
  Object.freeze({
    id: 'Sulafat',
    role: 'female',
    label: 'Pre-cached UK female',
    blurb: 'Warm',
  }),
]);

export const BUFFERED_AUDIO_SPEED_OPTIONS = Object.freeze([
  Object.freeze({
    id: 'standard',
    label: 'Standard',
    slow: false,
  }),
  Object.freeze({
    id: 'slow',
    label: 'Slow',
    slow: true,
  }),
]);

export const DEFAULT_BUFFERED_GEMINI_VOICE = BUFFERED_GEMINI_VOICE_OPTIONS[0].id;

function slugifySentenceFragment(sentence) {
  return String(sentence || '')
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '');
}

export function bufferedVoiceById(voiceId) {
  return BUFFERED_GEMINI_VOICE_OPTIONS.find((voice) => voice.id === voiceId) || null;
}

export function normaliseBufferedGeminiVoice(value, fallback = DEFAULT_BUFFERED_GEMINI_VOICE) {
  const voiceId = String(value || '').trim();
  if (bufferedVoiceById(voiceId)) return voiceId;
  return bufferedVoiceById(fallback) ? fallback : DEFAULT_BUFFERED_GEMINI_VOICE;
}

export function bufferedSpeedById(speedId) {
  return BUFFERED_AUDIO_SPEED_OPTIONS.find((speed) => speed.id === speedId) || null;
}

export function speedIdForSlow(slow = false) {
  return slow ? 'slow' : 'standard';
}

export function listWordSentences(word) {
  if (!word) return [];
  if (Array.isArray(word.sentences) && word.sentences.length) return word.sentences.slice();
  if (word.sentence) return [word.sentence];
  return [];
}

export function resolveSentenceIndex(word, sentence) {
  const sentences = listWordSentences(word);
  if (!sentences.length) return -1;
  const target = String(sentence || '');
  const matchIndex = sentences.findIndex((item) => item === target);
  return matchIndex >= 0 ? matchIndex : 0;
}

export function buildBufferedDictationTranscript(wordText, sentence) {
  const cleanWord = String(wordText || '').trim();
  const cleanSentence = String(sentence || '').trim();
  if (!cleanWord) return cleanSentence;
  return cleanSentence
    ? `The word is ${cleanWord}. ${cleanSentence} The word is ${cleanWord}.`
    : `The word is ${cleanWord}. The word is ${cleanWord}.`;
}

export function buildBufferedSpeechPrompt({ wordText, sentence, slow }) {
  const transcript = buildBufferedDictationTranscript(wordText, sentence);
  const paceDirection = slow
    ? 'Speak slowly but crisply, with light spacing between phrases.'
    : 'Speak clearly at a brisk classroom dictation pace.';

  return [
    'Generate speech only.',
    'Do not speak any instructions, headings, or labels.',
    'Use formal UK English for a KS2 spelling dictation.',
    'Use a clear, neutral southern British classroom accent with precise enunciation.',
    'Sound like a careful primary teacher giving a spelling test.',
    'Avoid casual delivery and avoid American pronunciation.',
    paceDirection,
    'TRANSCRIPT:',
    transcript,
  ].join('\n');
}

export function buildAudioAssetKey({
  voice,
  speed,
  contentKey,
  slug,
  sentenceIndex,
  extension = DEFAULT_AUDIO_EXTENSION,
}) {
  const safeVoice = encodeURIComponent(String(voice || '').trim());
  const safeSpeed = encodeURIComponent(String(speed || '').trim());
  const safeContentKey = encodeURIComponent(String(contentKey || '').trim());
  const safeSlug = encodeURIComponent(String(slug || '').trim());
  const safeSentenceIndex = Number(sentenceIndex);
  const safeExtension = String(extension || DEFAULT_AUDIO_EXTENSION).replace(/^\./, '');

  if (
    !safeVoice
    || !safeSpeed
    || !safeContentKey
    || !safeSlug
    || !Number.isInteger(safeSentenceIndex)
    || safeSentenceIndex < 0
  ) {
    throw new Error('A valid voice, speed, content key, slug, and sentence index are required.');
  }

  return `${SPELLING_AUDIO_ROOT_PREFIX}/${SPELLING_AUDIO_MODEL}/${safeVoice}/${safeSpeed}/${safeContentKey}/${safeSlug}/${safeSentenceIndex}.${safeExtension}`;
}

export function buildIndexedAudioFilename({
  sentenceIndex,
  sentence,
  extension = DEFAULT_AUDIO_EXTENSION,
}) {
  const safeSentenceIndex = Number(sentenceIndex);
  const safeExtension = String(extension || DEFAULT_AUDIO_EXTENSION).replace(/^\./, '');

  if (!Number.isInteger(safeSentenceIndex) || safeSentenceIndex < 0) {
    throw new Error('Sentence index must be a non-negative integer.');
  }

  const prefix = String(safeSentenceIndex).padStart(2, '0');
  const sentenceSlug = slugifySentenceFragment(sentence);
  return sentenceSlug
    ? `${prefix}-${sentenceSlug}.${safeExtension}`
    : `${prefix}.${safeExtension}`;
}

export function buildStaticSpellingAudioManifest() {
  return {
    version: SPELLING_AUDIO_VERSION,
    model: SPELLING_AUDIO_MODEL,
    manifestKey: SPELLING_AUDIO_MANIFEST_KEY,
    defaultFormat: DEFAULT_AUDIO_EXTENSION,
    supportedFormats: SUPPORTED_BUFFERED_AUDIO_FORMATS.slice(),
    voices: BUFFERED_GEMINI_VOICE_OPTIONS.map((voice) => ({
      id: voice.id,
      role: voice.role,
      label: voice.label,
      blurb: voice.blurb,
    })),
    speeds: BUFFERED_AUDIO_SPEED_OPTIONS.map((speed) => ({
      id: speed.id,
      label: speed.label,
      slow: speed.slow,
    })),
  };
}
