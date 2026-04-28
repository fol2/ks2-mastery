// Hero Mode P2 — Quest fingerprint derivation.
//
// Produces a deterministic hex fingerprint for a complete quest snapshot,
// allowing the client to prove its read-model is fresh when issuing a
// launch command.  Uses DJB2 hash (same pattern as seed.js).
//
// Pure module — ZERO Worker, React, D1, or repository imports.

function djb2Hash(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

/**
 * Build the canonical input string for quest fingerprint derivation.
 *
 * @param {Object} input
 * @param {string} input.learnerId
 * @param {string} input.accountId
 * @param {string} input.dateKey
 * @param {string} input.timezone
 * @param {string} input.schedulerVersion
 * @param {string[]} input.eligibleSubjectIds — sorted ascending
 * @param {string[]} input.lockedSubjectIds   — sorted ascending
 * @param {Object}   input.providerSnapshotFingerprints — { [subjectId]: string }
 * @param {Array}    input.taskDigests — [{ taskId, intent, launcher, subjectId }]
 * @returns {string} canonical input string
 */
export function buildHeroQuestFingerprintInput(input) {
  const o = (input && typeof input === 'object') ? input : {};

  const learnerId = String(o.learnerId || '');
  const accountId = String(o.accountId || '');
  const dateKey = String(o.dateKey || '');
  const timezone = String(o.timezone || '');
  const schedulerVersion = String(o.schedulerVersion || '');

  const eligible = Array.isArray(o.eligibleSubjectIds)
    ? [...o.eligibleSubjectIds].sort()
    : [];
  const locked = Array.isArray(o.lockedSubjectIds)
    ? [...o.lockedSubjectIds].sort()
    : [];

  // Per-subject provider snapshot fingerprints — sorted by subjectId for
  // determinism.  When a subject does not provide a content-release
  // fingerprint, the stable marker is used.
  const allSubjectIds = [...new Set([...eligible, ...locked])].sort();
  const snapFingerprints = (o.providerSnapshotFingerprints && typeof o.providerSnapshotFingerprints === 'object')
    ? o.providerSnapshotFingerprints
    : {};
  const snapParts = allSubjectIds.map((sid) => {
    const fp = snapFingerprints[sid];
    return typeof fp === 'string' && fp.length > 0
      ? `subject:${sid}:${fp}`
      : `subject:${sid}:content-release:missing`;
  });

  // Task digests — order matters (scheduler output order).
  const taskParts = Array.isArray(o.taskDigests)
    ? o.taskDigests.map((d) => {
        const t = (d && typeof d === 'object') ? d : {};
        return [
          String(t.taskId || ''),
          String(t.intent || ''),
          String(t.launcher || ''),
          String(t.subjectId || ''),
        ].join('+');
      })
    : [];

  const parts = [
    learnerId,
    accountId,
    dateKey,
    timezone,
    schedulerVersion,
    eligible.join(','),
    locked.join(','),
    snapParts.join(';'),
    taskParts.join(';'),
  ];

  return parts.join('|');
}

/**
 * Derive a hex quest fingerprint from a canonical input object.
 *
 * @param {Object} input — same shape as buildHeroQuestFingerprintInput
 * @returns {string} `hero-qf-{hex12}`
 */
export function deriveHeroQuestFingerprint(input) {
  const canonical = buildHeroQuestFingerprintInput(input);
  const hash = djb2Hash(canonical);
  const hex12 = hash.toString(16).padStart(12, '0').slice(-12);
  return 'hero-qf-' + hex12;
}
