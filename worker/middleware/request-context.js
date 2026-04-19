import {
  attachRequestId,
  createRequestId,
  logRequestCompletion,
} from "../lib/observability.js";

function shouldLogRequest(c, response) {
  const pathname = new URL(c.req.url).pathname;
  return pathname.startsWith("/api/") || Number(response?.status || 0) >= 500;
}

export async function instrumentRequest(c, next) {
  const requestId = createRequestId(c.req.raw);
  const startedAt = Date.now();

  c.set("requestId", requestId);
  c.set("requestStartedAt", startedAt);

  await next();

  attachRequestId(c.res, requestId);
  if (!c.get("requestLogged") && shouldLogRequest(c, c.res)) {
    logRequestCompletion(c, c.res, startedAt);
    c.set("requestLogged", true);
  }
}
