import { json } from "../lib/http.js";
import { logError } from "../lib/observability.js";
import { ensureSchema } from "../lib/store.js";

export async function ensureApiSchema(c, next) {
  if (new URL(c.req.url).pathname === "/api/health") {
    return next();
  }

  try {
    await ensureSchema(c.env);
    return next();
  } catch (error) {
    logError(c, "schema.initialisation.failed", error);
    return json(c, 500, { ok: false, message: "Database is not ready." });
  }
}
