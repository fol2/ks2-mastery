// Pure read-only telemetry probe for Hero Mode pA1 operational verification.
// Returns last-N events from the event_log D1 table (system_id='hero-mode')
// with privacy re-validation. No writes, no state mutations.

/**
 * Privacy-sensitive fields that must be stripped before returning event data
 * to Ring 2–4 operators. Superset of the metrics-contract FORBIDDEN_FIELDS
 * plus additional child-content fields that may appear in event_json.
 */
const PRIVACY_STRIP_FIELDS = Object.freeze([
  'rawAnswer',
  'rawPrompt',
  'childFreeText',
  'childInput',
  'answerText',
  'rawText',
  'childContent',
]);

/**
 * Recursively strip privacy-sensitive fields from an object.
 * Returns a new object — never mutates the input.
 * @param {unknown} obj
 * @returns {unknown}
 */
function stripPrivacyFields(obj) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(stripPrivacyFields);
  if (typeof obj !== 'object') return obj;

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (PRIVACY_STRIP_FIELDS.includes(key)) continue;
    result[key] = stripPrivacyFields(value);
  }
  return result;
}

/**
 * Probe hero telemetry events from the D1 event_log table.
 *
 * @param {Object} params
 * @param {Object} params.db — D1 database binding (env.DB)
 * @param {number} [params.limit=20] — max events to return (capped at 100)
 * @returns {Promise<{ events: Array, count: number, probedAt: string }>}
 */
export async function probeHeroTelemetry({ db, limit = 20 } = {}) {
  const probedAt = new Date().toISOString();
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100));

  if (!db) {
    return { events: [], count: 0, probedAt };
  }

  let rows;
  try {
    const result = await db.prepare(`
      SELECT id, learner_id, subject_id, system_id, event_type, event_json, created_at
      FROM event_log
      WHERE system_id = 'hero-mode'
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `).bind(safeLimit).all();
    rows = result?.results || [];
  } catch {
    // Table may not exist on pre-migration deploys — return empty gracefully
    return { events: [], count: 0, probedAt };
  }

  const events = rows.map((row) => {
    let parsedData = null;
    try {
      parsedData = row.event_json ? JSON.parse(row.event_json) : null;
    } catch {
      parsedData = null;
    }

    const event = {
      id: row.id,
      learnerId: row.learner_id,
      subjectId: row.subject_id,
      systemId: row.system_id,
      eventType: row.event_type,
      data: parsedData,
      createdAt: row.created_at,
    };

    return stripPrivacyFields(event);
  });

  return { events, count: events.length, probedAt };
}

export { PRIVACY_STRIP_FIELDS, stripPrivacyFields };
