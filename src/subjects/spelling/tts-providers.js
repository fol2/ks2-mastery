import {
  BUFFERED_GEMINI_VOICE_OPTIONS,
  DEFAULT_BUFFERED_GEMINI_VOICE,
  normaliseBufferedGeminiVoice,
} from '../../../shared/spelling-audio.js';

export const DEFAULT_TTS_PROVIDER = 'openai';

export const TTS_PROVIDER_IDS = Object.freeze([
  'openai',
  'gemini',
  'browser',
]);

export function normaliseTtsProvider(value, fallback = DEFAULT_TTS_PROVIDER) {
  const provider = String(value || '').trim().toLowerCase();
  if (TTS_PROVIDER_IDS.includes(provider)) return provider;
  return TTS_PROVIDER_IDS.includes(fallback) ? fallback : DEFAULT_TTS_PROVIDER;
}

export {
  BUFFERED_GEMINI_VOICE_OPTIONS,
  DEFAULT_BUFFERED_GEMINI_VOICE,
  normaliseBufferedGeminiVoice,
};
