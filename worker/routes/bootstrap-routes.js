import { Hono } from "hono";
import { json } from "../lib/http.js";
import { setSessionLogContext } from "../lib/observability.js";
import { clearSessionToken, getSessionToken } from "../lib/session-cookie.js";
import { loadBootstrap } from "../services/bootstrap-service.js";

const bootstrapRoutes = new Hono();

bootstrapRoutes.get("/bootstrap", async (c) => {
  c.header("Cache-Control", "no-store");
  const result = await loadBootstrap(c.env, getSessionToken(c));
  if (result.clearSession) {
    clearSessionToken(c);
  }
  setSessionLogContext(c, result.bundle);
  return json(c, 200, result.payload);
});

export default bootstrapRoutes;
