import workerModule from '../../worker/src/index.js';
import { createStaticHeaderRepositoryAuthSession } from '../../src/platform/core/repositories/auth-session.js';
import { createMigratedSqliteD1Database } from './sqlite-d1.js';

function mergeHeaders(base = {}, next = {}) {
  return {
    ...base,
    ...next,
  };
}

export function createWorkerRepositoryServer({
  env: envOverrides = {},
  defaultAccountId = 'adult-a',
  defaultHeaders = {},
  // SH2-U11 (sys-hardening p2): allow a caller (e.g. the isolated
  // Playwright subset) to inject a pre-existing migrated DB instance
  // so the server uses a per-test SQLite fixture instead of the
  // default shared one. When `db` is not provided, behaviour is
  // unchanged — the server creates its own `createMigratedSqliteD1Database()`.
  // When `db` IS provided, the server does NOT own the lifecycle:
  // `close()` on the server skips closing the injected DB so the
  // test harness that created it can still reuse / teardown via
  // `playwright-isolated-db.js::close()`.
  db = null,
} = {}) {
  const ownsDb = db === null;
  const DB = ownsDb ? createMigratedSqliteD1Database() : db;
  const env = {
    DB,
    ENVIRONMENT: 'test',
    AUTH_MODE: 'development-stub',
    ...envOverrides,
  };

  async function fetchWithHeaders(input, init = {}, headers = {}) {
    const request = new Request(typeof input === 'string' ? input : input.url, {
      ...init,
      headers: mergeHeaders(headers, init.headers || {}),
    });
    return workerModule.fetch(request, env, {});
  }

  return {
    env,
    DB,
    close() {
      // SH2-U11: only close the DB we own. An injected per-test DB
      // is owned by the caller (tests/helpers/playwright-isolated-db.js)
      // and MUST NOT be closed here or the caller's `afterEach` teardown
      // would double-close a sqlite handle.
      if (ownsDb) {
        DB.close();
      }
    },
    async fetchRaw(input, init = {}) {
      return fetchWithHeaders(input, init, defaultHeaders);
    },
    async fetch(input, init = {}) {
      return fetchWithHeaders(input, init, mergeHeaders(defaultHeaders, {
        'x-ks2-dev-account-id': defaultAccountId,
      }));
    },
    async fetchAs(accountId, input, init = {}, extraHeaders = {}) {
      return fetchWithHeaders(input, init, mergeHeaders(defaultHeaders, {
        'x-ks2-dev-account-id': accountId,
        ...extraHeaders,
      }));
    },
    authSessionFor(accountId = defaultAccountId, { platformRole = null } = {}) {
      return createStaticHeaderRepositoryAuthSession({
        cacheScopeKey: `account:${accountId}:${platformRole || 'parent'}`,
        headers: {
          'x-ks2-dev-account-id': accountId,
          ...(platformRole ? { 'x-ks2-dev-platform-role': platformRole } : {}),
        },
      });
    },
  };
}
