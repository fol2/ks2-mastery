import { Hono } from "hono";
import { json, readJsonBody } from "../lib/http.js";
import { attachRequestId, getRequestId } from "../lib/observability.js";
import { requireSession } from "../middleware/require-session.js";
import { generateSpeechResponse, loadTtsVoices } from "../services/tts-service.js";

const ttsRoutes = new Hono();

ttsRoutes.get("/tts/voices", requireSession, async (c) => {
  const provider = String(c.req.query("provider") || "elevenlabs").trim().toLowerCase();
  const response = await loadTtsVoices(c.env, c.get("sessionHash"), provider);
  return json(c, 200, response);
});

ttsRoutes.post("/tts/speak", requireSession, async (c) => {
  // Audio is returned as a streaming Response, so attach X-Request-Id at
  // construction time rather than relying on the post-next middleware which
  // may race with the stream already flushing headers to the client.
  const response = await generateSpeechResponse(c.env, c.get("sessionHash"), await readJsonBody(c));
  attachRequestId(response, getRequestId(c));
  return response;
});

export default ttsRoutes;
