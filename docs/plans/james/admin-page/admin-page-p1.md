I reviewed the repo and prepared a starter implementation you can drop in:

[Download the KS2 admin starter pack](sandbox:/mnt/data/ks2-admin-starter.zip)

The important repo finding is this: you already have the right foundation. The app is a React shell with Worker/D1-backed production auth, repositories, subject commands, Parent Hub, and Admin / Operations surfaces, rather than a pure browser-only prototype now. The README says the Worker already handles sessions, account-scoped content, learner ownership checks, subject commands, role-aware Parent/Admin hub routes, and admin account role management. ([GitHub][1]) The Worker docs also show existing hub routes for `GET /api/hubs/parent`, `GET /api/hubs/admin`, plus admin account and monster-visual config routes. ([GitHub][2])

So my recommendation is: **do not create a separate admin app yet**. Extend the existing `AdminHubSurface` into a proper business-owner console.

I built the starter pack around that.

What the starter pack adds:

1. **Admin dashboard overview**
   Accounts, learners, recent sessions, event-log volume, active demos, open errors, active delivery events.

2. **Account / GM panel**
   Search accounts, edit admin-facing account status, plan label, tags, and internal notes. This is intentionally separate from core auth at first, so you can safely test it before enforcing suspension/payment hold.

3. **Learner diagnostics**
   Search learners and see linked account count, session count, event count, and last activity.

4. **Error log centre**
   New `ops_error_events` table, client error capture API, de-duplication by fingerprint, open/investigating/resolved/ignored states.

5. **Realtime-ish operations panel**
   Polls D1 for recent `event_log` and `practice_sessions` every 15 seconds. This is not true realtime yet, but it gives you a live operations feel without adding Durable Objects/WebSockets too early.

6. **Event delivery system**
   Draft, schedule, publish, pause, and archive events such as announcements, maintenance banners, XP boosts, content unlocks, reward grants, seasonal events, and experiments.

7. **Feature flags**
   A small admin-managed flag/config table for rollout gates and live ops switches.

8. **Integration guide**
   The zip includes `docs/INTEGRATION_PATCH.md` with the exact places to wire the Worker route dispatcher and React console.

The files inside are:

```text
ks2-admin-starter/
  README.md
  docs/
    INTEGRATION_PATCH.md
    admin-system-roadmap.md
  worker/
    migrations/
      0010_admin_ops_console.sql
    src/admin/
      admin-ops-repository.js
      admin-ops-routes.js
  src/
    platform/hubs/
      admin-ops-api.js
    surfaces/hubs/
      AdminOpsConsole.jsx
      admin-ops-panel.css
```

The key integration steps are:

```js
// worker/src/app.js
import { handleAdminOpsRoute } from './admin/admin-ops-routes.js';
```

Then after your existing session/account resolution:

```js
const repository = createWorkerRepository({ env, now });
const session = await auth.requireSession(request);
const account = await repository.ensureAccount(session);

const adminOpsResponse = await handleAdminOpsRoute({ request, env, session, now });
if (adminOpsResponse) return adminOpsResponse;
```

And inside `src/surfaces/hubs/AdminHubSurface.jsx`:

```js
import { AdminOpsConsole } from './AdminOpsConsole.jsx';
```

Then render:

```jsx
<AdminOpsConsole />
```

A blunt but important point: even though “it’s only you” right now, don’t make admin endpoints public or protected only by hidden UI. The current system already has `platform_role` values like `parent`, `admin`, and `ops`, and the Worker docs say Admin / Operations requires admin or ops role while role-management mutations are admin-only. ([GitHub][2]) Keep using that existing small gate. You do not need a complex authority layer, but you do need authenticated owner/admin protection.

Also, your earlier product brief already points toward the right analytics model: tracking skill/template/item-level state and misconceptions, not just raw scores. That should feed the admin analytics later, especially for support/debugging and curriculum-quality decisions. 

Suggested build order:

First, wire the starter pack and get the console loading for your admin account. Then test overview, account status saves, delivery event creation, and error capture locally. After that, add the auth enforcement patch for `suspended` accounts. Only after that would I add billing, subscriptions, or advanced support tools.

I did not run your repo’s full `npm test`/`npm run check` against these files here, so treat this as a clean starter patch rather than a verified PR. Your repo’s documented deployment flow still expects `npm test`, `npm run check`, D1 migration, and deploy steps before production. ([GitHub][1])

[1]: https://github.com/fol2/ks2-mastery "GitHub - fol2/ks2-mastery: KS2 Unified — browser-side React prototype of a KS2 (UK Year 5/6) study app · GitHub"
[2]: https://github.com/fol2/ks2-mastery/tree/main/worker "ks2-mastery/worker at main · fol2/ks2-mastery · GitHub"
