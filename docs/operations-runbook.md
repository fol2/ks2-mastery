# Operations Runbook

This runbook defines the minimum operating baseline for the Cloudflare deployment. It covers request tracing, log tailing, health checks, D1 backup and restore, and the first-response incident flow.

## Current baseline

- Every Worker response now carries an `x-request-id` header.
- The Worker emits structured JSON logs for request completion and unhandled failures.
- `/api/health` performs a lightweight D1 ping and checks that the static asset binding is present.
- D1 backup and restore are wrapped in repo scripts so the team has one repeatable path.

## Health check

Use the public health endpoint for uptime monitoring and basic deployment verification:

```text
GET /api/health
```

Healthy response shape:

```json
{
  "ok": true,
  "status": "ok",
  "service": "KS2 Mastery",
  "requestId": "…",
  "timestamp": "2026-04-19T12:34:56.000Z",
  "checks": {
    "database": {
      "ok": true,
      "detail": "D1 responded to a ping query."
    },
    "assets": {
      "ok": true,
      "detail": "Static asset binding is configured."
    },
    "observability": {
      "ok": true,
      "detail": "Request IDs and structured Worker logs are enabled."
    }
  }
}
```

If any check fails, the endpoint returns `503` with `status: "degraded"`.

## Structured logs

Tail production logs with:

```bash
npm run ops:tail
```

Important log events:

- `request.completed`
- `request.failed`
- `schema.initialisation.failed`
- `auth.oauth.callback.failed`

Important fields:

- `requestId`: support and incident correlation key
- `method`, `path`, `status`, `durationMs`
- `rayId`, `colo`, `country`
- `userId`, `sessionId`, `selectedChildId` when a session is resolved

Do not log raw cookies, passwords, OAuth codes, or request bodies.

## Alerting baseline

Cloudflare alert policies are not provisioned from this repo yet, so create them manually in the dashboard and keep them aligned with this baseline:

1. Uptime alert on `GET /api/health` returning a non-2xx response.
2. Worker error-rate alert for sustained `5xx` responses.
3. Latency alert for elevated p95 response time on API routes.
4. D1 storage and query-failure alerting for the production database.

Suggested initial thresholds:

- Health check failing for 2 consecutive minutes.
- Worker error rate above 2% for 5 minutes.
- API p95 above 1500 ms for 10 minutes.
- Any sustained D1 query failures above normal background noise.

## D1 backup

Create a remote production backup:

```bash
npm run ops:d1:backup
```

The dump is written to `backups/d1/` with a timestamped filename and is ignored by Git.

Useful variants:

```bash
npm run ops:d1:backup -- --local
npm run ops:d1:backup -- --schema-only
npm run ops:d1:backup -- --table users --table sessions
```

## D1 restore

Local restore is the default path and should be used first for verification:

```bash
npm run ops:d1:restore -- --file ./backups/d1/<dump>.sql --local
```

Remote restore is intentionally guarded. Only use it after taking a fresh backup and getting explicit approval:

```bash
npm run ops:d1:restore -- --file ./backups/d1/<dump>.sql --remote --yes-really
```

For point-in-time recovery or safer production rollback, prefer Cloudflare D1 Time Travel where available.

## Incident flow

1. Confirm impact with `/api/health` and the latest production logs.
2. Capture at least one `requestId` from a failed request or user report.
3. Tail logs and filter around that `requestId`, route, or time window.
4. Decide whether the issue is Worker runtime, D1, assets, or external auth.
5. Take a fresh D1 backup before any destructive or restorative action.
6. Mitigate first: rollback deployment, disable the faulty path, or restore data.
7. Record the timeline, root cause, and follow-up actions in the incident note.

## Operator checklist

- Verify `npm test` and `npm run check` before deployment.
- Confirm `/api/health` after each production deploy.
- Keep at least one recent remote D1 export before risky changes.
- Use the `requestId` in user-facing support replies when escalating an incident.
