import { HttpError, RateLimitError, ValidationError } from "../lib/http.js";
import { consumeRateLimit } from "../lib/rate-limit.js";
import { listElevenLabsVoices, synthesiseSpeech } from "../lib/tts.js";

async function protectAuthenticatedTtsCall(env, sessionHash, bucket, limit, windowMs) {
  if (!sessionHash) return;

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

  await protectAuthenticatedTtsCall(env, sessionHash, "tts-voices-session", 20, 10 * 60 * 1000);

  try {
    const voices = await listElevenLabsVoices(env);
    return {
      ok: true,
      voices,
    };
  } catch (error) {
    const status = Number(error?.statusCode);
    throw new HttpError(
      status >= 400 && status < 500 ? status : 502,
      error.message || "Could not load the voice catalogue.",
    );
  }
}

export async function generateSpeechResponse(env, sessionHash, payload) {
  await protectAuthenticatedTtsCall(env, sessionHash, "tts-speak-session", 120, 10 * 60 * 1000);

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
    throw new HttpError(
      status >= 400 && status < 500 ? status : 502,
      error.message || "Could not generate speech.",
    );
  }
}
