import { Hono } from "hono";
import { handleHttpError } from "./lib/http.js";
import { ensureApiSchema } from "./middleware/ensure-schema.js";
import { instrumentRequest } from "./middleware/request-context.js";
import authRoutes from "./routes/auth-routes.js";
import bootstrapRoutes from "./routes/bootstrap-routes.js";
import childrenRoutes from "./routes/children-routes.js";
import healthRoutes from "./routes/health-routes.js";
import spellingRoutes from "./routes/spelling-routes.js";
import ttsRoutes from "./routes/tts-routes.js";

// Durable Object exports — wrangler.jsonc binds `SPELLING_LOCK` to this class.
// The DO serialises mutations to a child's spelling session + learning state
// (see worker/durable/spelling-lock.js).
export { SpellingLockDO } from "./durable/spelling-lock.js";

const app = new Hono();

app.use("*", instrumentRequest);
app.onError(handleHttpError);
app.use("/api/*", ensureApiSchema);

app.route("/api", healthRoutes);
app.route("/api", bootstrapRoutes);
app.route("/api", authRoutes);
app.route("/api", childrenRoutes);
app.route("/api", spellingRoutes);
app.route("/api", ttsRoutes);

app.get("*", async (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
