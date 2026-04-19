import { Hono } from "hono";
import { json, readJsonBody } from "../lib/http.js";
import { requireSession } from "../middleware/require-session.js";
import { generateSpeechResponse, loadTtsVoices } from "../services/tts-service.js";

const ttsRoutes = new Hono();

ttsRoutes.get("/tts/voices", requireSession, async (c) => {
  const provider = String(c.req.query("provider") || "elevenlabs").trim().toLowerCase();
  const response = await loadTtsVoices(c.env, c.get("sessionHash"), provider);
  return json(c, 200, response);
});

ttsRoutes.post("/tts/speak", requireSession, async (c) => {
  return generateSpeechResponse(c.env, c.get("sessionHash"), await readJsonBody(c));
});

export default ttsRoutes;
