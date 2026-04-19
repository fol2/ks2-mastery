import { Hono } from "hono";
import { json } from "../lib/http.js";
import { checkDatabaseHealth, getRequestId } from "../lib/observability.js";

const healthRoutes = new Hono();

healthRoutes.get("/health", async (c) => {
  const database = await checkDatabaseHealth(c.env);
  const assets = {
    ok: Boolean(c.env.ASSETS),
    detail: c.env.ASSETS ? "Static asset binding is configured." : "Static asset binding is missing.",
  };
  const ok = database.ok && assets.ok;

  c.header("Cache-Control", "no-store");
  return json(c, ok ? 200 : 503, {
    ok,
    status: ok ? "ok" : "degraded",
    service: String(c.env.APP_NAME || "KS2 Mastery"),
    requestId: getRequestId(c),
    timestamp: new Date().toISOString(),
    checks: {
      database,
      assets,
      observability: {
        ok: true,
        detail: "Request IDs and structured Worker logs are enabled.",
      },
    },
  });
});

export default healthRoutes;
