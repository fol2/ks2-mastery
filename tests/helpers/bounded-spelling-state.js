function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function emptyStats() {
  return {
    total: 0,
    secure: 0,
    due: 0,
    fresh: 0,
    trouble: 0,
    attempts: 0,
    correct: 0,
    accuracy: null,
  };
}

function statsFromProgress(progress, now) {
  const today = Math.floor(Number(now) / 86_400_000);
  const stats = Object.values(isObject(progress) ? progress : {}).reduce((output, rawEntry) => {
    const entry = isObject(rawEntry) ? rawEntry : {};
    const stage = Math.max(0, Number(entry.stage) || 0);
    const attempts = Math.max(0, Number(entry.attempts) || 0);
    const correct = Math.max(0, Number(entry.correct) || 0);
    const wrong = Math.max(0, Number(entry.wrong) || 0);
    output.total += 1;
    output.attempts += attempts;
    output.correct += correct;
    if (attempts === 0) output.fresh += 1;
    if (stage >= 4) output.secure += 1;
    if (attempts > 0 && (Number(entry.dueDay) || 0) <= today) output.due += 1;
    if (wrong > 0 && (wrong >= correct || (Number(entry.dueDay) || 0) <= today)) output.trouble += 1;
    return output;
  }, emptyStats());
  stats.accuracy = stats.attempts ? Math.round((stats.correct / stats.attempts) * 100) : null;
  const empty = emptyStats();
  return {
    all: stats,
    core: { ...stats },
    y34: { ...empty },
    y56: { ...empty },
    secureExtension: { ...empty },
    extra: { ...empty },
  };
}

function boundedLearnerData(data) {
  const raw = isObject(data) ? data : {};
  return Object.fromEntries(['prefs', 'postMega', 'persistenceWarning']
    .filter((key) => Object.prototype.hasOwnProperty.call(raw, key))
    .map((key) => [key, raw[key]]));
}

export function upsertBoundedSpellingState(sqlite, {
  learnerId,
  accountId = null,
  ui = {},
  data = {},
  stats = null,
  now = Date.now(),
  replaceItems = true,
} = {}) {
  const rawData = isObject(data) ? data : {};
  const resolvedStats = isObject(stats)
    ? stats
    : isObject(rawData.stats)
      ? rawData.stats
      : statsFromProgress(rawData.progress, now);
  sqlite.prepare(`
    INSERT INTO spelling_learner_state (
      learner_id, ui_json, data_json, stats_json, updated_at, updated_by_account_id
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(learner_id) DO UPDATE SET
      ui_json = excluded.ui_json,
      data_json = excluded.data_json,
      stats_json = excluded.stats_json,
      updated_at = excluded.updated_at,
      updated_by_account_id = excluded.updated_by_account_id
  `).run(
    learnerId,
    typeof ui === 'string' ? ui : JSON.stringify(isObject(ui) ? ui : {}),
    JSON.stringify(boundedLearnerData(rawData)),
    JSON.stringify(resolvedStats),
    now,
    accountId,
  );

  if (replaceItems) {
    sqlite.prepare('DELETE FROM spelling_item_state WHERE learner_id = ?').run(learnerId);
    sqlite.prepare('DELETE FROM spelling_achievement_state WHERE learner_id = ?').run(learnerId);
  }
  const progress = isObject(rawData.progress) ? rawData.progress : {};
  const guardian = isObject(rawData.guardian) ? rawData.guardian : {};
  const pattern = isObject(rawData.pattern?.wobbling) ? rawData.pattern.wobbling : {};
  const slugs = new Set([...Object.keys(progress), ...Object.keys(guardian), ...Object.keys(pattern)]);
  const statement = sqlite.prepare(`
    INSERT INTO spelling_item_state (
      learner_id, slug, progress_json, guardian_json, pattern_json, updated_at, updated_by_account_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(learner_id, slug) DO UPDATE SET
      progress_json = excluded.progress_json,
      guardian_json = excluded.guardian_json,
      pattern_json = excluded.pattern_json,
      updated_at = excluded.updated_at,
      updated_by_account_id = excluded.updated_by_account_id
  `);
  for (const slug of slugs) {
    statement.run(
      learnerId,
      slug,
      isObject(progress[slug]) ? JSON.stringify(progress[slug]) : null,
      isObject(guardian[slug]) ? JSON.stringify(guardian[slug]) : null,
      isObject(pattern[slug]) ? JSON.stringify(pattern[slug]) : null,
      now,
      accountId,
    );
  }

  const achievements = isObject(rawData.achievements) ? rawData.achievements : {};
  const achievementStatement = sqlite.prepare(`
    INSERT INTO spelling_achievement_state (
      learner_id, achievement_id, record_json, updated_at, updated_by_account_id
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(learner_id, achievement_id) DO UPDATE SET
      record_json = excluded.record_json,
      updated_at = excluded.updated_at,
      updated_by_account_id = excluded.updated_by_account_id
  `);
  for (const [achievementId, record] of Object.entries(achievements)) {
    if (!achievementId || !isObject(record)) continue;
    achievementStatement.run(
      learnerId,
      achievementId,
      JSON.stringify(record),
      now,
      accountId,
    );
  }
}

export function updateBoundedSpellingUi(sqlite, learnerId, ui, now = Date.now()) {
  return sqlite.prepare(`
    UPDATE spelling_learner_state
    SET ui_json = ?, updated_at = ?
    WHERE learner_id = ?
  `).run(JSON.stringify(isObject(ui) ? ui : {}), now, learnerId);
}

export function readBoundedSpellingUi(sqlite, learnerId) {
  const row = sqlite.prepare(`
    SELECT ui_json
    FROM spelling_learner_state
    WHERE learner_id = ?
  `).get(learnerId);
  return row ? JSON.parse(row.ui_json) : null;
}
