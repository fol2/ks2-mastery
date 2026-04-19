import { HttpError, RateLimitError, ValidationError } from "../lib/http.js";
import { consumeRateLimit } from "../lib/rate-limit.js";
import { listElevenLabsVoices, synthesiseSpeech } from "../lib/tts.js";

// Rate-limit knobs for the authenticated TTS surface. Kept together so the
// policy is auditable in one glance rather than scattered through the file.
const TTS_WINDOW_MS = 10 * 60 * 1000;
const TTS_VOICES_LIMIT = 20;
const TTS_SPEAK_LIMIT = 120;

async function protectAuthenticatedTtsCall(env, sessionHash, bucket, limit, windowMs) {
  // Caller contract: both TTS routes sit behind `requireSession`, which
  // guarantees `sessionHash` is present before this is reached. A missing
  // hash is a programmer error — fail loudly rather than silently skipping
  // the rate-limit, which would disable the protection if a future route
  // forgets the middleware.
  if (!sessionHash) {
    throw new Error("TTS rate-limit requires an authenticated session.");
  }

  const result = await consumeRateLimit(env, {
    bucket,
    identifier: sessionHash,
    limit,
    windowMs,
  });
  if (!result.allowed) {
    throw new RateLimitError(
      "You are generating speech too quickly. Please slow down and try again shortly.",
      result.retryAfterSeconds,
    );
  }
}

export async function loadTtsVoices(env, sessionHash, provider) {
  if (provider !== "elevenlabs") {
    throw new ValidationError("That voice catalogue is not supported.");
  }

  await protectAuthenticatedTtsCall(env, sessionHash, "tts-voices-session", TTS_VOICES_LIMIT, TTS_WINDOW_MS);

  try {
    const voices = await listElevenLabsVoices(env);
    return {
      ok: true,
      voices,
    };
  } catch (error) {
    const status = Number(error?.statusCode);
    const message = error.message || "Could not load the voice catalogue.";
    // Explicit payload — relying on the shorthand path leaves clients
    // staring at a bare `{}` body with no diagnostic message.
    throw new HttpError(
      status >= 400 && status < 500 ? status : 502,
      message,
      { payload: { ok: false, message } },
    );
  }
}

export async function generateSpeechResponse(env, sessionHash, payload) {
  await protectAuthenticatedTtsCall(env, sessionHash, "tts-speak-session", TTS_SPEAK_LIMIT, TTS_WINDOW_MS);

  try {
    const audio = await synthesiseSpeech(env, payload);
    return new Response(audio.body, {
      status: 200,
      headers: {
        "Content-Type": audio.contentType,
        "Cache-Control": "private, no-store",
        Vary: "Cookie",
      },
    });
  } catch (error) {
    const status = Number(error?.statusCode);
    const message = error.message || "Could not generate speech.";
    throw new HttpError(
      status >= 400 && status < 500 ? status : 502,
      message,
      { payload: { ok: false, message } },
    );
  }
}
