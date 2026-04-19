import { Hono } from "hono";
import {
  parseCreateSpellingSessionPayload,
  parseSpellingPrefsPayload,
  parseSpellingSessionIdParam,
  parseSpellingSubmissionPayload,
} from "../contracts/spelling-contract.js";
import { json, readJsonBody } from "../lib/http.js";
import { requireSession } from "../middleware/require-session.js";
import {
  advanceSpellingSession,
  getSpellingDashboard,
  persistSpellingPrefs,
  skipSpellingSession,
  startSpellingSession,
  submitSpellingAnswer,
} from "../services/spelling-service.js";

const spellingRoutes = new Hono();

spellingRoutes.put("/spelling/prefs", requireSession, async (c) => {
  const prefs = parseSpellingPrefsPayload(await readJsonBody(c));
  const response = await persistSpellingPrefs(
    c.env,
    c.get("sessionBundle"),
    c.get("sessionHash"),
    prefs,
  );
  return json(c, 200, response);
});

spellingRoutes.post("/spelling/sessions", requireSession, async (c) => {
  const payload = parseCreateSpellingSessionPayload(await readJsonBody(c));
  const response = await startSpellingSession(c.env, c.get("sessionBundle"), payload);
  return json(c, 201, response);
});

spellingRoutes.post("/spelling/sessions/:sessionId/submit", requireSession, async (c) => {
  const sessionId = parseSpellingSessionIdParam(c.req.param("sessionId"));
  const payload = parseSpellingSubmissionPayload(await readJsonBody(c));
  const response = await submitSpellingAnswer(c.env, c.get("sessionBundle"), sessionId, payload);
  return json(c, 200, response);
});

spellingRoutes.post("/spelling/sessions/:sessionId/skip", requireSession, async (c) => {
  const sessionId = parseSpellingSessionIdParam(c.req.param("sessionId"));
  const response = await skipSpellingSession(c.env, c.get("sessionBundle"), sessionId);
  return json(c, 200, response);
});

spellingRoutes.post("/spelling/sessions/:sessionId/advance", requireSession, async (c) => {
  const sessionId = parseSpellingSessionIdParam(c.req.param("sessionId"));
  const response = await advanceSpellingSession(c.env, c.get("sessionBundle"), sessionId);
  return json(c, 200, response);
});

spellingRoutes.get("/spelling/dashboard", requireSession, async (c) => {
  const response = getSpellingDashboard(c.get("sessionBundle"));
  return json(c, 200, response);
});

export default spellingRoutes;
