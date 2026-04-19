import { HttpError } from "../lib/http.js";
import { logError } from "../lib/observability.js";
import { ensureSchema } from "../lib/store.js";

function isHealthPath(pathname) {
  return pathname.replace(/\/+$/, "") === "/api/health";
}

export async function ensureApiSchema(c, next) {
  // The /api/health endpoint must remain callable when schema init is broken
  // — it is the signal operators rely on to detect the breakage. Normalise
  // trailing slashes so /api/health/ probes are not silently routed through
  // the schema guard.
  if (isHealthPath(new URL(c.req.url).pathname)) {
    return next();
  }

  try {
    await ensureSchema(c.env);
    return next();
  } catch (error) {
    logError(c, "schema.initialisation.failed", error);
    throw new HttpError(500, "Database is not ready.", {
      payload: { ok: false, message: "Database is not ready." },
    });
  }
}
