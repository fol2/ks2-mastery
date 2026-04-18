import { randomToken, safeEmail, safeJsonParse } from "./security.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const SESSION_TTL_MS = 30 * DAY_MS;

let schemaReadyPromise;

function now() {
  return Date.now();
}

function requiredDb(env) {
  if (!env.DB) throw new Error("D1 binding `DB` is not configured.");
  return env.DB;
}

export async function ensureSchema(env) {
  if (!schemaReadyPromise) {
    const db = requiredDb(env);
    const statements = [
      `
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT,
          password_salt TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `,
      `
        CREATE TABLE IF NOT EXISTS user_identities (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          provider TEXT NOT NULL,
          provider_subject TEXT NOT NULL,
          email TEXT,
          created_at INTEGER NOT NULL,
          UNIQUE(provider, provider_subject)
        )
      `,
      `
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          session_hash TEXT NOT NULL UNIQUE,
          selected_child_id TEXT,
          created_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL
        )
      `,
      `
        CREATE TABLE IF NOT EXISTS children (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          year_group TEXT NOT NULL,
          avatar_color TEXT NOT NULL,
          goal TEXT NOT NULL,
          daily_minutes INTEGER NOT NULL,
          weak_subjects_json TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `,
      `
        CREATE TABLE IF NOT EXISTS child_state (
          child_id TEXT PRIMARY KEY,
          spelling_progress_json TEXT NOT NULL DEFAULT '{}',
          monster_state_json TEXT NOT NULL DEFAULT '{}',
          spelling_prefs_json TEXT NOT NULL DEFAULT '{}',
          updated_at INTEGER NOT NULL
        )
      `,
      `
        CREATE TABLE IF NOT EXISTS spelling_sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          child_id TEXT NOT NULL,
          state_json TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `,
      `
        CREATE TABLE IF NOT EXISTS subscriptions (
          user_id TEXT PRIMARY KEY,
          plan_code TEXT NOT NULL,
          status TEXT NOT NULL,
          paywall_enabled INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `,
      `CREATE INDEX IF NOT EXISTS idx_children_user_id ON children (user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_user_identities_user_id ON user_identities (user_id)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_user_identities_user_provider ON user_identities (user_id, provider)`,
      `CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_spelling_sessions_child_id ON spelling_sessions (child_id)`,
    ];
    schemaReadyPromise = db.batch(statements.map((statement) => db.prepare(statement).bind()));
    schemaReadyPromise.catch(() => {
      schemaReadyPromise = undefined;
    });
  }
  await schemaReadyPromise;
}

function normaliseChild(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    yearGroup: row.year_group,
    avatarColor: row.avatar_color,
    goal: row.goal,
    dailyMinutes: row.daily_minutes,
    weakSubjects: safeJsonParse(row.weak_subjects_json, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normaliseChildState(row) {
  return {
    spellingProgress: safeJsonParse(row?.spelling_progress_json, {}),
    monsterState: safeJsonParse(row?.monster_state_json, {}),
    spellingPrefs: safeJsonParse(row?.spelling_prefs_json, {}),
    updatedAt: row?.updated_at || now(),
  };
}

function placeholderEmail(provider) {
  return `${String(provider || "user").toLowerCase()}-${randomToken(10).toLowerCase()}@users.ks2.invalid`;
}

export async function getUserByEmail(env, email) {
  await ensureSchema(env);
  const db = requiredDb(env);
  return db
    .prepare(`SELECT * FROM users WHERE email = ?1 LIMIT 1`)
    .bind(safeEmail(email))
    .first();
}

export async function getUserById(env, userId) {
  await ensureSchema(env);
  const db = requiredDb(env);
  return db
    .prepare(`SELECT * FROM users WHERE id = ?1 LIMIT 1`)
    .bind(userId)
    .first();
}

export async function createEmailUser(env, { email, passwordHash, passwordSalt }) {
  await ensureSchema(env);
  const db = requiredDb(env);
  const timestamp = now();
  const userId = randomToken(18);
  await db
    .prepare(`
      INSERT INTO users (id, email, password_hash, password_salt, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6)
    `)
    .bind(userId, safeEmail(email), passwordHash, passwordSalt, timestamp, timestamp)
    .run();
  await ensureSubscription(env, userId);
  return db.prepare(`SELECT * FROM users WHERE id = ?1 LIMIT 1`).bind(userId).first();
}

async function updateUserEmail(env, userId, email) {
  const nextEmail = safeEmail(email);
  if (!nextEmail) return null;
  await ensureSchema(env);
  const db = requiredDb(env);
  await db
    .prepare(`
      UPDATE users
      SET email = ?1,
          updated_at = ?2
      WHERE id = ?3
    `)
    .bind(nextEmail, now(), userId)
    .run();
  return getUserById(env, userId);
}

export async function getUserByProviderIdentity(env, provider, providerSubject) {
  await ensureSchema(env);
  const db = requiredDb(env);
  return db
    .prepare(`
      SELECT users.*
      FROM user_identities
      JOIN users ON users.id = user_identities.user_id
      WHERE user_identities.provider = ?1 AND user_identities.provider_subject = ?2
      LIMIT 1
    `)
    .bind(String(provider || "").trim().toLowerCase(), String(providerSubject || "").trim())
    .first();
}

export async function linkIdentityToUser(env, userId, payload) {
  await ensureSchema(env);
  const db = requiredDb(env);
  const provider = String(payload?.provider || "").trim().toLowerCase();
  const providerSubject = String(payload?.providerSubject || "").trim();
  const email = safeEmail(payload?.email);

  if (!provider || !providerSubject) {
    throw new Error("A valid identity provider payload is required.");
  }

  const existing = await db
    .prepare(`
      SELECT *
      FROM user_identities
      WHERE provider = ?1 AND provider_subject = ?2
      LIMIT 1
    `)
    .bind(provider, providerSubject)
    .first();

  if (existing && existing.user_id !== userId) {
    throw new Error("That sign-in is already linked to another account.");
  }

  const timestamp = now();

  if (existing) {
    await db
      .prepare(`
        UPDATE user_identities
        SET email = COALESCE(?1, email)
        WHERE id = ?2
      `)
      .bind(email || null, existing.id)
      .run();
  } else {
    await db
      .prepare(`
        INSERT INTO user_identities (
          id,
          user_id,
          provider,
          provider_subject,
          email,
          created_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6)
      `)
      .bind(randomToken(18), userId, provider, providerSubject, email || null, timestamp)
      .run();
  }

  if (!email) return getUserById(env, userId);

  const user = await getUserById(env, userId);
  if (!user) return null;

  if (String(user.email || "").endsWith("@users.ks2.invalid")) {
    const emailOwner = await getUserByEmail(env, email);
    if (!emailOwner || emailOwner.id === userId) {
      return updateUserEmail(env, userId, email);
    }
  }

  return user;
}

export async function createSocialUser(env, { email, provider, providerSubject }) {
  await ensureSchema(env);
  const db = requiredDb(env);
  const timestamp = now();
  const userId = randomToken(18);
  const resolvedEmail = safeEmail(email) || placeholderEmail(provider);

  await db
    .prepare(`
      INSERT INTO users (id, email, password_hash, password_salt, created_at, updated_at)
      VALUES (?1, ?2, NULL, NULL, ?3, ?3)
    `)
    .bind(userId, resolvedEmail, timestamp)
    .run();

  await ensureSubscription(env, userId);
  await linkIdentityToUser(env, userId, {
    provider,
    providerSubject,
    email: resolvedEmail.endsWith("@users.ks2.invalid") ? "" : resolvedEmail,
  });

  return getUserById(env, userId);
}

export async function findOrCreateUserFromIdentity(env, payload) {
  const provider = String(payload?.provider || "").trim().toLowerCase();
  const providerSubject = String(payload?.providerSubject || "").trim();
  const email = safeEmail(payload?.email);

  if (!provider || !providerSubject) {
    throw new Error("A valid identity provider payload is required.");
  }

  const identityUser = await getUserByProviderIdentity(env, provider, providerSubject);
  if (identityUser) {
    await linkIdentityToUser(env, identityUser.id, { provider, providerSubject, email });
    return getUserById(env, identityUser.id);
  }

  const emailUser = email ? await getUserByEmail(env, email) : null;
  if (emailUser) {
    await linkIdentityToUser(env, emailUser.id, { provider, providerSubject, email });
    return getUserById(env, emailUser.id);
  }

  // Concurrent callbacks for the same provider subject race the create path.
  // UNIQUE(provider, provider_subject) protects data integrity; on collision
  // the other request already created the user, so re-fetch and return that.
  try {
    return await createSocialUser(env, { email, provider, providerSubject });
  } catch (error) {
    const raced = await getUserByProviderIdentity(env, provider, providerSubject);
    if (raced) return raced;
    throw error;
  }
}

export async function ensureSubscription(env, userId) {
  await ensureSchema(env);
  const db = requiredDb(env);
  const timestamp = now();
  await db
    .prepare(`
      INSERT INTO subscriptions (user_id, plan_code, status, paywall_enabled, created_at, updated_at)
      VALUES (?1, 'free', 'active', 0, ?2, ?2)
      ON CONFLICT(user_id) DO NOTHING
    `)
    .bind(userId, timestamp)
    .run();
}

export async function getSubscription(env, userId) {
  await ensureSchema(env);
  const db = requiredDb(env);
  return db
    .prepare(`SELECT * FROM subscriptions WHERE user_id = ?1 LIMIT 1`)
    .bind(userId)
    .first();
}

export async function createSession(env, userId, sessionHash) {
  await ensureSchema(env);
  const db = requiredDb(env);
  const timestamp = now();
  const sessionId = randomToken(18);
  await db
    .prepare(`
      INSERT INTO sessions (id, user_id, session_hash, selected_child_id, created_at, expires_at)
      VALUES (?1, ?2, ?3, NULL, ?4, ?5)
    `)
    .bind(sessionId, userId, sessionHash, timestamp, timestamp + SESSION_TTL_MS)
    .run();
  return db.prepare(`SELECT * FROM sessions WHERE id = ?1 LIMIT 1`).bind(sessionId).first();
}

export async function deleteSessionByHash(env, sessionHash) {
  await ensureSchema(env);
  const db = requiredDb(env);
  await db
    .prepare(`DELETE FROM sessions WHERE session_hash = ?1`)
    .bind(sessionHash)
    .run();
}

export async function getSessionBundleByHash(env, sessionHash) {
  await ensureSchema(env);
  const db = requiredDb(env);
  const timestamp = now();
  const session = await db
    .prepare(`
      SELECT sessions.*, users.email
      FROM sessions
      JOIN users ON users.id = sessions.user_id
      WHERE sessions.session_hash = ?1 AND sessions.expires_at > ?2
      LIMIT 1
    `)
    .bind(sessionHash, timestamp)
    .first();

  if (!session) return null;

  const childrenRows = await db
    .prepare(`SELECT * FROM children WHERE user_id = ?1 ORDER BY created_at ASC`)
    .bind(session.user_id)
    .all();

  const children = (childrenRows.results || []).map(normaliseChild);
  const selectedChild =
    children.find((child) => child.id === session.selected_child_id)
    || children[0]
    || null;

  if (selectedChild && session.selected_child_id !== selectedChild.id) {
    await setSelectedChild(env, session.id, selectedChild.id);
    session.selected_child_id = selectedChild.id;
  }

  const childState = selectedChild
    ? await getChildState(env, selectedChild.id)
    : normaliseChildState(null);
  const subscription = await getSubscription(env, session.user_id);

  return {
    session,
    user: {
      id: session.user_id,
      email: session.email,
    },
    children,
    selectedChild,
    childState,
    subscription,
  };
}

export async function setSelectedChild(env, sessionId, childId) {
  await ensureSchema(env);
  const db = requiredDb(env);
  await db
    .prepare(`UPDATE sessions SET selected_child_id = ?1 WHERE id = ?2`)
    .bind(childId, sessionId)
    .run();
}

export async function createChild(env, userId, payload) {
  await ensureSchema(env);
  const db = requiredDb(env);
  const existing = await db
    .prepare(`SELECT COUNT(*) AS count FROM children WHERE user_id = ?1`)
    .bind(userId)
    .first();

  if ((existing?.count || 0) >= 4) {
    throw new Error("Each account can only hold four child profiles.");
  }

  const timestamp = now();
  const childId = randomToken(18);
  await db
    .prepare(`
      INSERT INTO children (
        id, user_id, name, year_group, avatar_color, goal, daily_minutes,
        weak_subjects_json, created_at, updated_at
      )
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)
    `)
    .bind(
      childId,
      userId,
      payload.name,
      payload.yearGroup,
      payload.avatarColor,
      payload.goal,
      payload.dailyMinutes,
      JSON.stringify(payload.weakSubjects || []),
      timestamp,
    )
    .run();

  await db
    .prepare(`
      INSERT INTO child_state (child_id, spelling_progress_json, monster_state_json, spelling_prefs_json, updated_at)
      VALUES (?1, '{}', '{}', '{}', ?2)
    `)
    .bind(childId, timestamp)
    .run();

  const childRow = await db.prepare(`SELECT * FROM children WHERE id = ?1 LIMIT 1`).bind(childId).first();
  return normaliseChild(childRow);
}

export async function updateChild(env, userId, childId, payload) {
  await ensureSchema(env);
  const db = requiredDb(env);
  const timestamp = now();
  await db
    .prepare(`
      UPDATE children
      SET name = ?1,
          year_group = ?2,
          avatar_color = ?3,
          goal = ?4,
          daily_minutes = ?5,
          weak_subjects_json = ?6,
          updated_at = ?7
      WHERE id = ?8 AND user_id = ?9
    `)
    .bind(
      payload.name,
      payload.yearGroup,
      payload.avatarColor,
      payload.goal,
      payload.dailyMinutes,
      JSON.stringify(payload.weakSubjects || []),
      timestamp,
      childId,
      userId,
    )
    .run();
  const childRow = await db
    .prepare(`SELECT * FROM children WHERE id = ?1 AND user_id = ?2 LIMIT 1`)
    .bind(childId, userId)
    .first();
  return normaliseChild(childRow);
}

export async function listChildren(env, userId) {
  await ensureSchema(env);
  const db = requiredDb(env);
  const rows = await db
    .prepare(`SELECT * FROM children WHERE user_id = ?1 ORDER BY created_at ASC`)
    .bind(userId)
    .all();
  return (rows.results || []).map(normaliseChild);
}

export async function getChild(env, userId, childId) {
  await ensureSchema(env);
  const db = requiredDb(env);
  const row = await db
    .prepare(`SELECT * FROM children WHERE id = ?1 AND user_id = ?2 LIMIT 1`)
    .bind(childId, userId)
    .first();
  return normaliseChild(row);
}

export async function getChildState(env, childId) {
  await ensureSchema(env);
  const db = requiredDb(env);
  const row = await db
    .prepare(`SELECT * FROM child_state WHERE child_id = ?1 LIMIT 1`)
    .bind(childId)
    .first();
  return normaliseChildState(row);
}

export async function saveChildState(env, childId, payload) {
  await ensureSchema(env);
  const db = requiredDb(env);
  const timestamp = now();
  await db
    .prepare(`
      INSERT INTO child_state (child_id, spelling_progress_json, monster_state_json, spelling_prefs_json, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5)
      ON CONFLICT(child_id) DO UPDATE SET
        spelling_progress_json = excluded.spelling_progress_json,
        monster_state_json = excluded.monster_state_json,
        spelling_prefs_json = excluded.spelling_prefs_json,
        updated_at = excluded.updated_at
    `)
    .bind(
      childId,
      JSON.stringify(payload.spellingProgress || {}),
      JSON.stringify(payload.monsterState || {}),
      JSON.stringify(payload.spellingPrefs || {}),
      timestamp,
    )
    .run();
}

export async function saveSpellingSession(env, userId, childId, sessionId, state) {
  await ensureSchema(env);
  const db = requiredDb(env);
  const timestamp = now();
  await db
    .prepare(`
      INSERT INTO spelling_sessions (id, user_id, child_id, state_json, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?5)
      ON CONFLICT(id) DO UPDATE SET
        state_json = excluded.state_json,
        updated_at = excluded.updated_at
    `)
    .bind(sessionId, userId, childId, JSON.stringify(state), timestamp)
    .run();
}

export async function getSpellingSession(env, userId, childId, sessionId) {
  await ensureSchema(env);
  const db = requiredDb(env);
  const row = await db
    .prepare(`
      SELECT * FROM spelling_sessions
      WHERE id = ?1 AND user_id = ?2 AND child_id = ?3
      LIMIT 1
    `)
    .bind(sessionId, userId, childId)
    .first();
  if (!row) return null;
  return safeJsonParse(row.state_json, null);
}

export async function deleteSpellingSession(env, userId, childId, sessionId) {
  await ensureSchema(env);
  const db = requiredDb(env);
  await db
    .prepare(`
      DELETE FROM spelling_sessions
      WHERE id = ?1 AND user_id = ?2 AND child_id = ?3
    `)
    .bind(sessionId, userId, childId)
    .run();
}

export function serialiseSubscription(row) {
  return {
    planCode: row?.plan_code || "free",
    status: row?.status || "active",
    paywallEnabled: Boolean(row?.paywall_enabled),
  };
}
