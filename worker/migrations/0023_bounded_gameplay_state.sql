-- Normal gameplay must not read or rewrite the learner's lifetime profile.
-- These tables split bounded live state from item-addressed durable history
-- for the subject engines whose generated item sets can grow without bound.
-- The one-off backfill is intentionally allowed to scan the legacy JSON blob;
-- normal gameplay never does.

-- Code is deployed before this migration. Runtime readers switch authority
-- only after the final backfill writes this readiness row; table existence by
-- itself is not a cutover signal because a failed migration may leave partial
-- DDL behind. Production application requires the release write fence and
-- drain documented in docs/operations/bounded-gameplay-state-rollout.md: an
-- already-admitted legacy writer must not cross the final reconciliation.
CREATE TABLE IF NOT EXISTS bounded_gameplay_state_migrations (
  migration_id TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  ready_at INTEGER NOT NULL,
  CHECK (state IN ('ready', 'legacy-authoritative'))
);

-- Grammar, Reading and Punctuation keep their bounded live document in the
-- existing table. Preserve the exact pre-split rows before changing that
-- document so a binary rollback never depends on reconstructing JSON from the
-- new item tables. Spelling already retains its complete legacy row in place.
CREATE TABLE IF NOT EXISTS bounded_gameplay_state_archive (
  migration_id TEXT NOT NULL,
  learner_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  ui_json TEXT NOT NULL,
  data_json TEXT NOT NULL,
  source_updated_at INTEGER NOT NULL,
  source_updated_by_account_id TEXT,
  archived_at INTEGER NOT NULL,
  PRIMARY KEY (migration_id, learner_id, subject_id),
  FOREIGN KEY (learner_id) REFERENCES learner_profiles(id) ON DELETE CASCADE
);

INSERT INTO bounded_gameplay_state_archive (
  migration_id,
  learner_id,
  subject_id,
  ui_json,
  data_json,
  source_updated_at,
  source_updated_by_account_id,
  archived_at
)
SELECT
  '0023',
  learner_id,
  subject_id,
  ui_json,
  data_json,
  updated_at,
  updated_by_account_id,
  unixepoch() * 1000
FROM child_subject_state
WHERE subject_id IN ('grammar', 'reading', 'punctuation')
ON CONFLICT(migration_id, learner_id, subject_id) DO UPDATE SET
  ui_json = excluded.ui_json,
  data_json = excluded.data_json,
  source_updated_at = excluded.source_updated_at,
  source_updated_by_account_id = excluded.source_updated_by_account_id,
  archived_at = excluded.archived_at
WHERE NOT EXISTS (
  SELECT 1 FROM bounded_gameplay_state_migrations
  WHERE migration_id = '0023' AND state = 'ready'
);

CREATE TABLE IF NOT EXISTS spelling_learner_state (
  learner_id TEXT PRIMARY KEY,
  ui_json TEXT NOT NULL DEFAULT 'null',
  data_json TEXT NOT NULL DEFAULT '{}',
  stats_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL,
  updated_by_account_id TEXT,
  FOREIGN KEY (learner_id) REFERENCES learner_profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by_account_id) REFERENCES adult_accounts(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS spelling_item_state (
  learner_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  progress_json TEXT,
  guardian_json TEXT,
  pattern_json TEXT,
  updated_at INTEGER NOT NULL,
  updated_by_account_id TEXT,
  PRIMARY KEY (learner_id, slug),
  FOREIGN KEY (learner_id) REFERENCES learner_profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by_account_id) REFERENCES adult_accounts(id) ON DELETE SET NULL,
  CHECK (slug <> ''),
  CHECK (progress_json IS NOT NULL OR guardian_json IS NOT NULL OR pattern_json IS NOT NULL)
);

-- Achievement unlocks are durable history too. Boss Clean Sweep creates one
-- id per completed session, so the complete map must not live in the compact
-- learner row. Commands point-read the fixed evaluator latches plus a small
-- recent Boss projection from this table.
CREATE TABLE IF NOT EXISTS spelling_achievement_state (
  learner_id TEXT NOT NULL,
  achievement_id TEXT NOT NULL,
  record_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by_account_id TEXT,
  PRIMARY KEY (learner_id, achievement_id),
  FOREIGN KEY (learner_id) REFERENCES learner_profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by_account_id) REFERENCES adult_accounts(id) ON DELETE SET NULL,
  CHECK (achievement_id <> ''),
  CHECK (json_valid(record_json))
);

CREATE INDEX IF NOT EXISTS idx_spelling_achievement_state_recent
  ON spelling_achievement_state (learner_id, updated_at DESC, achievement_id DESC);

-- Legacy authority can delete/reset a learner while a previously interrupted
-- 0023 attempt has already populated split rows. Reconciliation therefore
-- removes split learner rows which no longer have a legacy spelling record.
DELETE FROM spelling_learner_state
WHERE NOT EXISTS (
    SELECT 1 FROM bounded_gameplay_state_migrations
    WHERE migration_id = '0023' AND state = 'ready'
  );

-- While the marker is not ready the legacy document is the sole authority.
-- Rebuild the split history set-wise instead of running one correlated
-- json_each scan per existing row during an emergency re-forward.
DELETE FROM spelling_achievement_state
WHERE NOT EXISTS (
  SELECT 1 FROM bounded_gameplay_state_migrations
  WHERE migration_id = '0023' AND state = 'ready'
);

INSERT INTO spelling_achievement_state (
  learner_id,
  achievement_id,
  record_json,
  updated_at,
  updated_by_account_id
)
SELECT
  source.learner_id,
  item.key,
  json(item.value),
  source.updated_at,
  source.updated_by_account_id
FROM child_subject_state AS source,
     json_each(
       CASE WHEN json_valid(source.data_json) THEN source.data_json ELSE '{}' END,
       '$.achievements'
     ) AS item
WHERE source.subject_id = 'spelling'
  AND item.key <> ''
  AND json_type(item.value) = 'object'
  AND NOT EXISTS (
    SELECT 1 FROM bounded_gameplay_state_migrations
    WHERE migration_id = '0023' AND state = 'ready'
  );

-- Threshold evidence saturates: seven distinct days and ten distinct slugs
-- are sufficient forever once their latch can unlock. Pattern evidence keeps
-- only the current 15 patterns and the last three completions each. This is a
-- bounded evaluator projection, not deletion of achievement unlock history.
UPDATE spelling_achievement_state AS achievement
SET record_json = json_object(
  'days', json(COALESCE((
    SELECT json_group_array(day)
    FROM (
      SELECT DISTINCT CAST(value AS INTEGER) AS day
      FROM json_each(achievement.record_json, '$.days')
      WHERE type IN ('integer', 'real') AND CAST(value AS INTEGER) >= 0
      ORDER BY day DESC
      LIMIT 7
    )
  ), '[]'))
)
WHERE achievement.achievement_id = '_progress:guardian:days'
  AND NOT EXISTS (
    SELECT 1 FROM bounded_gameplay_state_migrations
    WHERE migration_id = '0023' AND state = 'ready'
  );

UPDATE spelling_achievement_state AS achievement
SET record_json = json_object(
  'slugs', json(COALESCE((
    SELECT json_group_array(slug)
    FROM (
      SELECT DISTINCT CAST(value AS TEXT) AS slug
      FROM json_each(achievement.record_json, '$.slugs')
      WHERE type = 'text' AND CAST(value AS TEXT) <> ''
      ORDER BY slug ASC
      LIMIT 10
    )
  ), '[]'))
)
WHERE achievement.achievement_id = '_progress:recovery:slugs'
  AND NOT EXISTS (
    SELECT 1 FROM bounded_gameplay_state_migrations
    WHERE migration_id = '0023' AND state = 'ready'
  );

WITH current_patterns(pattern_id) AS (
  VALUES
    ('suffix-tion'), ('suffix-sion'), ('suffix-cian'), ('suffix-ous'),
    ('suffix-ly'), ('suffix-able-ible'), ('silent-letter'), ('i-before-e'),
    ('double-consonant'), ('prefix-un-in-im'), ('prefix-pre-re-de'),
    ('homophone'), ('root-graph-scribe'), ('root-port-spect'),
    ('exception-word')
)
UPDATE spelling_achievement_state AS achievement
SET record_json = json_object(
  'completions', json(COALESCE((
    SELECT json_group_object(pattern_id, json(completions_json))
    FROM (
      SELECT
        current_patterns.pattern_id,
        (
          SELECT json_group_array(json(value))
          FROM (
            SELECT value
            FROM (
              SELECT CAST(key AS INTEGER) AS completion_index, value
              FROM json_each(
                achievement.record_json,
                '$.completions.' || json_quote(current_patterns.pattern_id)
              )
              ORDER BY completion_index DESC
              LIMIT 3
            ) recent
            ORDER BY completion_index ASC
          ) ordered_recent
        ) AS completions_json
      FROM current_patterns
    ) projected
    WHERE json_array_length(completions_json) > 0
  ), '{}'))
)
WHERE achievement.achievement_id = '_progress:pattern:completions'
  AND NOT EXISTS (
    SELECT 1 FROM bounded_gameplay_state_migrations
    WHERE migration_id = '0023' AND state = 'ready'
  );

-- Preserve the compact bootstrap counters before the unbounded progress map is
-- removed from the live learner record. Pool-specific counters are populated
-- exactly as the former compact bootstrap did: all tracked legacy entries are
-- represented in all/core; content-aware commands replace this with the exact
-- current-catalogue projection on their first successful write.
WITH
  source AS (
    SELECT
      learner_id,
      ui_json,
      CASE WHEN json_valid(data_json) THEN data_json ELSE '{}' END AS data_json,
      updated_at,
      updated_by_account_id
    FROM child_subject_state
    WHERE subject_id = 'spelling'
  ),
  progress AS (
    SELECT
      source.learner_id,
      item.key AS slug,
      CASE WHEN json_type(item.value) = 'object' THEN item.value ELSE '{}' END AS value
    FROM source, json_each(source.data_json, '$.progress') AS item
    WHERE item.key <> ''
  ),
  aggregate_stats AS (
    SELECT
      learner_id,
      COUNT(*) AS total,
      SUM(CASE WHEN COALESCE(CAST(json_extract(value, '$.stage') AS INTEGER), 0) >= 4 THEN 1 ELSE 0 END) AS secure,
      SUM(CASE
        WHEN COALESCE(CAST(json_extract(value, '$.attempts') AS INTEGER), 0) > 0
          AND COALESCE(
            CAST(json_extract(value, '$.dueDay') AS INTEGER),
            CAST(unixepoch() / 86400 AS INTEGER)
          ) <= CAST(unixepoch() / 86400 AS INTEGER)
        THEN 1 ELSE 0 END) AS due,
      SUM(CASE WHEN COALESCE(CAST(json_extract(value, '$.attempts') AS INTEGER), 0) = 0 THEN 1 ELSE 0 END) AS fresh,
      SUM(CASE
        WHEN COALESCE(CAST(json_extract(value, '$.wrong') AS INTEGER), 0) > 0
          AND (
            COALESCE(CAST(json_extract(value, '$.wrong') AS INTEGER), 0)
              >= COALESCE(CAST(json_extract(value, '$.correct') AS INTEGER), 0)
            OR COALESCE(
              CAST(json_extract(value, '$.dueDay') AS INTEGER),
              CAST(unixepoch() / 86400 AS INTEGER)
            ) <= CAST(unixepoch() / 86400 AS INTEGER)
          )
        THEN 1 ELSE 0 END) AS trouble,
      SUM(COALESCE(CAST(json_extract(value, '$.attempts') AS INTEGER), 0)) AS attempts,
      SUM(COALESCE(CAST(json_extract(value, '$.correct') AS INTEGER), 0)) AS correct
    FROM progress
    GROUP BY learner_id
  )
INSERT INTO spelling_learner_state (
  learner_id,
  ui_json,
  data_json,
  stats_json,
  updated_at,
  updated_by_account_id
)
SELECT
  source.learner_id,
  source.ui_json,
  json_object(
    'prefs', json(CASE
      WHEN json_type(source.data_json, '$.prefs') = 'object'
        THEN json_extract(source.data_json, '$.prefs')
      ELSE '{}'
    END),
    'postMega', CASE
      WHEN json_type(source.data_json, '$.postMega') = 'object'
        THEN json(json_extract(source.data_json, '$.postMega'))
      ELSE NULL
    END,
    'persistenceWarning', CASE
      WHEN json_type(source.data_json, '$.persistenceWarning') = 'object'
        THEN json(json_extract(source.data_json, '$.persistenceWarning'))
      ELSE NULL
    END
  ),
  json_object(
    'all', json_object(
      'total', COALESCE(aggregate_stats.total, 0),
      'secure', COALESCE(aggregate_stats.secure, 0),
      'due', COALESCE(aggregate_stats.due, 0),
      'fresh', COALESCE(aggregate_stats.fresh, 0),
      'trouble', COALESCE(aggregate_stats.trouble, 0),
      'attempts', COALESCE(aggregate_stats.attempts, 0),
      'correct', COALESCE(aggregate_stats.correct, 0),
      'accuracy', CASE
        WHEN COALESCE(aggregate_stats.attempts, 0) > 0
          THEN CAST(ROUND(aggregate_stats.correct * 100.0 / aggregate_stats.attempts) AS INTEGER)
        ELSE NULL
      END
    ),
    'core', json_object(
      'total', COALESCE(aggregate_stats.total, 0),
      'secure', COALESCE(aggregate_stats.secure, 0),
      'due', COALESCE(aggregate_stats.due, 0),
      'fresh', COALESCE(aggregate_stats.fresh, 0),
      'trouble', COALESCE(aggregate_stats.trouble, 0),
      'attempts', COALESCE(aggregate_stats.attempts, 0),
      'correct', COALESCE(aggregate_stats.correct, 0),
      'accuracy', CASE
        WHEN COALESCE(aggregate_stats.attempts, 0) > 0
          THEN CAST(ROUND(aggregate_stats.correct * 100.0 / aggregate_stats.attempts) AS INTEGER)
        ELSE NULL
      END
    ),
    'y34', json_object('total', 0, 'secure', 0, 'due', 0, 'fresh', 0, 'trouble', 0, 'attempts', 0, 'correct', 0, 'accuracy', NULL),
    'y56', json_object('total', 0, 'secure', 0, 'due', 0, 'fresh', 0, 'trouble', 0, 'attempts', 0, 'correct', 0, 'accuracy', NULL),
    'secureExtension', json_object('total', 0, 'secure', 0, 'due', 0, 'fresh', 0, 'trouble', 0, 'attempts', 0, 'correct', 0, 'accuracy', NULL),
    'extra', json_object('total', 0, 'secure', 0, 'due', 0, 'fresh', 0, 'trouble', 0, 'attempts', 0, 'correct', 0, 'accuracy', NULL)
  ),
  source.updated_at,
  source.updated_by_account_id
FROM source
LEFT JOIN aggregate_stats ON aggregate_stats.learner_id = source.learner_id
ON CONFLICT(learner_id) DO UPDATE SET
  ui_json = excluded.ui_json,
  data_json = excluded.data_json,
  stats_json = excluded.stats_json,
  updated_at = excluded.updated_at,
  updated_by_account_id = excluded.updated_by_account_id
WHERE NOT EXISTS (
  SELECT 1 FROM bounded_gameplay_state_migrations
  WHERE migration_id = '0023' AND state = 'ready'
);

-- A learner does not need to have played Spelling before the cutover. Give
-- every existing learner a compact empty authority row so opening the six-
-- subject app never falls back to a legacy profile (or mistakes a legitimate
-- fresh learner for cutover corruption).
INSERT INTO spelling_learner_state (
  learner_id,
  ui_json,
  data_json,
  stats_json,
  updated_at,
  updated_by_account_id
)
SELECT
  learner.id,
  'null',
  json_object('prefs', json('{}'), 'postMega', NULL, 'persistenceWarning', NULL),
  json_object(
    'all', json_object('total', 0, 'secure', 0, 'due', 0, 'fresh', 0, 'trouble', 0, 'attempts', 0, 'correct', 0, 'accuracy', NULL),
    'core', json_object('total', 0, 'secure', 0, 'due', 0, 'fresh', 0, 'trouble', 0, 'attempts', 0, 'correct', 0, 'accuracy', NULL),
    'y34', json_object('total', 0, 'secure', 0, 'due', 0, 'fresh', 0, 'trouble', 0, 'attempts', 0, 'correct', 0, 'accuracy', NULL),
    'y56', json_object('total', 0, 'secure', 0, 'due', 0, 'fresh', 0, 'trouble', 0, 'attempts', 0, 'correct', 0, 'accuracy', NULL),
    'secureExtension', json_object('total', 0, 'secure', 0, 'due', 0, 'fresh', 0, 'trouble', 0, 'attempts', 0, 'correct', 0, 'accuracy', NULL),
    'extra', json_object('total', 0, 'secure', 0, 'due', 0, 'fresh', 0, 'trouble', 0, 'attempts', 0, 'correct', 0, 'accuracy', NULL)
  ),
  learner.updated_at,
  NULL
FROM learner_profiles AS learner
WHERE NOT EXISTS (
    SELECT 1 FROM spelling_learner_state AS state
    WHERE state.learner_id = learner.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM bounded_gameplay_state_migrations
    WHERE migration_id = '0023' AND state = 'ready'
  );

-- Keep the same invariant for learners created after cutover. The trigger is
-- dormant while an old Worker owns state (`legacy-authoritative`); replaying
-- this migration then initialises any such learner before authority changes
-- back to `ready`. This database invariant covers normal, admin and Demo
-- creation paths without adding a read or write to gameplay requests.
CREATE TRIGGER IF NOT EXISTS trg_learner_profiles_seed_spelling_learner_state
AFTER INSERT ON learner_profiles
WHEN EXISTS (
  SELECT 1 FROM bounded_gameplay_state_migrations
  WHERE migration_id = '0023' AND state = 'ready'
)
BEGIN
  INSERT INTO spelling_learner_state (
    learner_id,
    ui_json,
    data_json,
    stats_json,
    updated_at,
    updated_by_account_id
  ) VALUES (
    NEW.id,
    'null',
    json_object('prefs', json('{}'), 'postMega', NULL, 'persistenceWarning', NULL),
    json_object(
      'all', json_object('total', 0, 'secure', 0, 'due', 0, 'fresh', 0, 'trouble', 0, 'attempts', 0, 'correct', 0, 'accuracy', NULL),
      'core', json_object('total', 0, 'secure', 0, 'due', 0, 'fresh', 0, 'trouble', 0, 'attempts', 0, 'correct', 0, 'accuracy', NULL),
      'y34', json_object('total', 0, 'secure', 0, 'due', 0, 'fresh', 0, 'trouble', 0, 'attempts', 0, 'correct', 0, 'accuracy', NULL),
      'y56', json_object('total', 0, 'secure', 0, 'due', 0, 'fresh', 0, 'trouble', 0, 'attempts', 0, 'correct', 0, 'accuracy', NULL),
      'secureExtension', json_object('total', 0, 'secure', 0, 'due', 0, 'fresh', 0, 'trouble', 0, 'attempts', 0, 'correct', 0, 'accuracy', NULL),
      'extra', json_object('total', 0, 'secure', 0, 'due', 0, 'fresh', 0, 'trouble', 0, 'attempts', 0, 'correct', 0, 'accuracy', NULL)
    ),
    NEW.updated_at,
    NULL
  )
  ON CONFLICT(learner_id) DO NOTHING;
END;

-- Every lifetime item remains durable, including retired/orphaned slugs. The
-- hot reader later asks only for slugs in the current command working set.
DELETE FROM spelling_item_state
WHERE NOT EXISTS (
    SELECT 1 FROM bounded_gameplay_state_migrations
    WHERE migration_id = '0023' AND state = 'ready'
  );

WITH
  source AS (
    SELECT
      learner_id,
      CASE WHEN json_valid(data_json) THEN data_json ELSE '{}' END AS data_json,
      updated_at,
      updated_by_account_id
    FROM child_subject_state
    WHERE subject_id = 'spelling'
  ),
  progress AS (
    SELECT source.learner_id, item.key AS slug, item.value AS value
    FROM source, json_each(source.data_json, '$.progress') AS item
    WHERE item.key <> '' AND json_type(item.value) = 'object'
  ),
  guardian AS (
    SELECT source.learner_id, item.key AS slug, item.value AS value
    FROM source, json_each(source.data_json, '$.guardian') AS item
    WHERE item.key <> '' AND json_type(item.value) = 'object'
  ),
  pattern AS (
    SELECT source.learner_id, item.key AS slug, item.value AS value
    FROM source, json_each(source.data_json, '$.pattern.wobbling') AS item
    WHERE item.key <> '' AND json_type(item.value) = 'object'
  ),
  item_keys AS (
    SELECT learner_id, slug FROM progress
    UNION
    SELECT learner_id, slug FROM guardian
    UNION
    SELECT learner_id, slug FROM pattern
  )
INSERT INTO spelling_item_state (
  learner_id,
  slug,
  progress_json,
  guardian_json,
  pattern_json,
  updated_at,
  updated_by_account_id
)
SELECT
  item_keys.learner_id,
  item_keys.slug,
  CASE WHEN progress.value IS NOT NULL THEN json(progress.value) ELSE NULL END,
  CASE WHEN guardian.value IS NOT NULL THEN json(guardian.value) ELSE NULL END,
  CASE WHEN pattern.value IS NOT NULL THEN json(pattern.value) ELSE NULL END,
  source.updated_at,
  source.updated_by_account_id
FROM item_keys
JOIN source ON source.learner_id = item_keys.learner_id
LEFT JOIN progress
  ON progress.learner_id = item_keys.learner_id AND progress.slug = item_keys.slug
LEFT JOIN guardian
  ON guardian.learner_id = item_keys.learner_id AND guardian.slug = item_keys.slug
LEFT JOIN pattern
  ON pattern.learner_id = item_keys.learner_id AND pattern.slug = item_keys.slug
ON CONFLICT(learner_id, slug) DO UPDATE SET
  progress_json = excluded.progress_json,
  guardian_json = excluded.guardian_json,
  pattern_json = excluded.pattern_json,
  updated_at = excluded.updated_at,
  updated_by_account_id = excluded.updated_by_account_id
WHERE NOT EXISTS (
  SELECT 1 FROM bounded_gameplay_state_migrations
  WHERE migration_id = '0023' AND state = 'ready'
);

-- Grammar concept/template mastery is bounded by the published catalogue, but
-- generated item ids include a seed and therefore grow once per new question.
-- Keep every generated item durable while removing that map from the document
-- read and rewrite performed by an ordinary Grammar command.
CREATE TABLE IF NOT EXISTS grammar_item_state (
  learner_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  mastery_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by_account_id TEXT,
  PRIMARY KEY (learner_id, item_id),
  FOREIGN KEY (learner_id) REFERENCES learner_profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by_account_id) REFERENCES adult_accounts(id) ON DELETE SET NULL,
  CHECK (item_id <> ''),
  CHECK (json_valid(mastery_json))
);

DELETE FROM grammar_item_state
WHERE NOT EXISTS (
    SELECT 1 FROM bounded_gameplay_state_migrations
    WHERE migration_id = '0023' AND state = 'ready'
  );

WITH
  source AS (
    SELECT
      learner_id,
      CASE WHEN json_valid(data_json) THEN data_json ELSE '{}' END AS data_json,
      CASE WHEN json_valid(ui_json) THEN ui_json ELSE '{}' END AS ui_json,
      updated_at,
      updated_by_account_id
    FROM child_subject_state
    WHERE subject_id = 'grammar'
  ),
  data_items AS (
    SELECT source.learner_id, item.key AS item_id, item.value AS mastery
    FROM source, json_each(source.data_json, '$.mastery.items') AS item
    WHERE item.key <> '' AND json_type(item.value) = 'object'
  ),
  ui_items AS (
    SELECT source.learner_id, item.key AS item_id, item.value AS mastery
    FROM source, json_each(source.ui_json, '$.mastery.items') AS item
    WHERE item.key <> '' AND json_type(item.value) = 'object'
  ),
  items AS (
    SELECT learner_id, item_id, mastery FROM ui_items
    UNION ALL
    SELECT data_items.learner_id, data_items.item_id, data_items.mastery
    FROM data_items
    WHERE NOT EXISTS (
      SELECT 1 FROM ui_items
      WHERE ui_items.learner_id = data_items.learner_id
        AND ui_items.item_id = data_items.item_id
    )
  )
INSERT INTO grammar_item_state (
  learner_id,
  item_id,
  mastery_json,
  updated_at,
  updated_by_account_id
)
SELECT
  items.learner_id,
  items.item_id,
  json(items.mastery),
  source.updated_at,
  source.updated_by_account_id
FROM items
JOIN source ON source.learner_id = items.learner_id
ON CONFLICT(learner_id, item_id) DO UPDATE SET
  mastery_json = excluded.mastery_json,
  updated_at = excluded.updated_at,
  updated_by_account_id = excluded.updated_by_account_id
WHERE NOT EXISTS (
  SELECT 1 FROM bounded_gameplay_state_migrations
  WHERE migration_id = '0023' AND state = 'ready'
);

-- Reading has a fixed published catalogue, but its per-question mastery map
-- still grows with the number of questions encountered. Start planning uses
-- compact passage/skill/type aggregates, then fetches only the selected
-- passage's questions; active sessions and explicit retry candidates form the
-- remaining bounded working set. Retain every question node here and keep
-- aggregate skill/passage state in the live row.
CREATE TABLE IF NOT EXISTS reading_question_state (
  learner_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  mastery_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by_account_id TEXT,
  PRIMARY KEY (learner_id, question_id),
  FOREIGN KEY (learner_id) REFERENCES learner_profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by_account_id) REFERENCES adult_accounts(id) ON DELETE SET NULL,
  CHECK (question_id <> ''),
  CHECK (json_valid(mastery_json))
);

DELETE FROM reading_question_state
WHERE NOT EXISTS (
    SELECT 1 FROM bounded_gameplay_state_migrations
    WHERE migration_id = '0023' AND state = 'ready'
  );

WITH
  source AS (
    SELECT
      learner_id,
      CASE WHEN json_valid(data_json) THEN data_json ELSE '{}' END AS data_json,
      updated_at,
      updated_by_account_id
    FROM child_subject_state
    WHERE subject_id = 'reading'
  ),
  questions AS (
    SELECT source.learner_id, item.key AS question_id, item.value AS mastery
    FROM source, json_each(source.data_json, '$.questions') AS item
    WHERE item.key <> '' AND json_type(item.value) = 'object'
  )
INSERT INTO reading_question_state (
  learner_id,
  question_id,
  mastery_json,
  updated_at,
  updated_by_account_id
)
SELECT
  questions.learner_id,
  questions.question_id,
  json(questions.mastery),
  source.updated_at,
  source.updated_by_account_id
FROM questions
JOIN source ON source.learner_id = questions.learner_id
ON CONFLICT(learner_id, question_id) DO UPDATE SET
  mastery_json = excluded.mastery_json,
  updated_at = excluded.updated_at,
  updated_by_account_id = excluded.updated_by_account_id
WHERE NOT EXISTS (
  SELECT 1 FROM bounded_gameplay_state_migrations
  WHERE migration_id = '0023' AND state = 'ready'
);

-- Punctuation has a large generated catalogue. Per-item memory is durable
-- history, not the scheduler authority: the bounded facet aggregates and
-- trailing attempt window choose a learning lane, then gameplay point-reads
-- only that lane's candidate item rows.
CREATE TABLE IF NOT EXISTS punctuation_item_state (
  learner_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  state_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by_account_id TEXT,
  PRIMARY KEY (learner_id, item_id),
  FOREIGN KEY (learner_id) REFERENCES learner_profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by_account_id) REFERENCES adult_accounts(id) ON DELETE SET NULL,
  CHECK (item_id <> ''),
  CHECK (json_valid(state_json))
);

DELETE FROM punctuation_item_state
WHERE NOT EXISTS (
    SELECT 1 FROM bounded_gameplay_state_migrations
    WHERE migration_id = '0023' AND state = 'ready'
  );

WITH
  source AS (
    SELECT
      learner_id,
      CASE WHEN json_valid(data_json) THEN data_json ELSE '{}' END AS data_json,
      updated_at,
      updated_by_account_id
    FROM child_subject_state
    WHERE subject_id = 'punctuation'
  ),
  items AS (
    SELECT source.learner_id, item.key AS item_id, item.value AS state
    FROM source, json_each(source.data_json, '$.progress.items') AS item
    WHERE item.key <> '' AND json_type(item.value) = 'object'
  )
INSERT INTO punctuation_item_state (
  learner_id,
  item_id,
  state_json,
  updated_at,
  updated_by_account_id
)
SELECT
  items.learner_id,
  items.item_id,
  json(items.state),
  source.updated_at,
  source.updated_by_account_id
FROM items
JOIN source ON source.learner_id = items.learner_id
ON CONFLICT(learner_id, item_id) DO UPDATE SET
  state_json = excluded.state_json,
  updated_at = excluded.updated_at,
  updated_by_account_id = excluded.updated_by_account_id
WHERE NOT EXISTS (
  SELECT 1 FROM bounded_gameplay_state_migrations
  WHERE migration_id = '0023' AND state = 'ready'
);

-- Materialise only clock-stable item totals while the complete map is still
-- available. Live due-review signals come from the bounded facet lanes: a due
-- counter would otherwise become stale merely because time passed.
WITH
  item_values AS (
    SELECT
      source.learner_id,
      item.key AS item_id,
      item.value AS state,
      MAX(0, COALESCE(CAST(json_extract(item.value, '$.attempts') AS REAL), 0)) AS attempts,
      MAX(0, COALESCE(CAST(json_extract(item.value, '$.correct') AS REAL), 0)) AS correct,
      MAX(0, COALESCE(CAST(json_extract(item.value, '$.streak') AS INTEGER), 0)) AS streak,
      MAX(0, COALESCE(CAST(json_extract(item.value, '$.lapses') AS INTEGER), 0)) AS lapses,
      MAX(0, COALESCE(CAST(json_extract(item.value, '$.firstCorrectAt') AS INTEGER), 0)) AS first_correct_at,
      MAX(0, COALESCE(CAST(json_extract(item.value, '$.lastCorrectAt') AS INTEGER), 0)) AS last_correct_at
    FROM child_subject_state AS source,
         json_each(
           CASE WHEN json_valid(source.data_json) THEN source.data_json ELSE '{}' END,
           '$.progress.items'
         ) AS item
    WHERE source.subject_id = 'punctuation'
      AND item.key <> ''
      AND json_type(item.value) = 'object'
  ),
  item_buckets AS (
    SELECT
      learner_id,
      item_id,
      CASE
        WHEN attempts <= 0 THEN 'new'
        WHEN (correct / attempts) < 0.65 OR (lapses >= 2 AND streak = 0) THEN 'weak'
        WHEN streak >= 3
          AND (correct / attempts) >= 0.8
          AND first_correct_at > 0
          AND last_correct_at >= first_correct_at
          AND CAST((last_correct_at - first_correct_at) / 86400000 AS INTEGER) >= 7
          THEN 'secure'
        ELSE 'learning'
      END AS bucket
    FROM item_values
  ),
  ordered_attempt_items AS (
    SELECT
      source.learner_id,
      json_extract(attempt.value, '$.itemId') AS item_id,
      ROW_NUMBER() OVER (
        PARTITION BY source.learner_id
        ORDER BY CAST(attempt.key AS INTEGER) DESC
      ) AS recency_rank
    FROM child_subject_state AS source,
         json_each(
           CASE WHEN json_valid(source.data_json) THEN source.data_json ELSE '{}' END,
           '$.progress.attempts'
         ) AS attempt
    WHERE source.subject_id = 'punctuation'
      AND json_type(attempt.value) = 'object'
      AND json_type(attempt.value, '$.itemId') = 'text'
      AND json_extract(attempt.value, '$.itemId') <> ''
  ),
  recent_attempt_items AS (
    SELECT DISTINCT learner_id, item_id
    FROM ordered_attempt_items
    WHERE recency_rank <= 1000
  ),
  secure_evidence AS (
    SELECT
      item_buckets.learner_id,
      json_group_array(item_buckets.item_id) AS secure_item_ids
    FROM item_buckets
    INNER JOIN recent_attempt_items
      ON recent_attempt_items.learner_id = item_buckets.learner_id
      AND recent_attempt_items.item_id = item_buckets.item_id
    WHERE item_buckets.bucket = 'secure'
    GROUP BY item_buckets.learner_id
  ),
  item_stats AS (
    SELECT
      learner_id,
      COUNT(*) AS tracked,
      SUM(CASE WHEN bucket = 'new' THEN 1 ELSE 0 END) AS new_count,
      SUM(CASE WHEN bucket = 'secure' THEN 1 ELSE 0 END) AS secure,
      SUM(CASE WHEN bucket = 'weak' THEN 1 ELSE 0 END) AS weak
    FROM item_buckets
    GROUP BY learner_id
  )
UPDATE child_subject_state AS state
SET data_json = json_set(
      CASE WHEN json_valid(state.data_json) THEN state.data_json ELSE '{}' END,
      '$.progress.itemTotals',
      json(COALESCE(
        (
          SELECT json_object(
            'version', 1,
            'tracked', item_stats.tracked,
            'new', item_stats.new_count,
            'secure', item_stats.secure,
            'weak', item_stats.weak
          )
          FROM item_stats
          WHERE item_stats.learner_id = state.learner_id
        ),
        json_object(
          'version', 1,
          'tracked', 0,
          'new', 0,
          'secure', 0,
          'weak', 0
        )
      )),
      '$.progress.starEvidence',
      json(json_object(
        'version', 1,
        'releaseId', 'punctuation-qg-p24-15072-2026-05-13',
        'secureItemIds', json(COALESCE(
          (
            SELECT secure_evidence.secure_item_ids
            FROM secure_evidence
            WHERE secure_evidence.learner_id = state.learner_id
          ),
          '[]'
        ))
      ))
    )
WHERE state.subject_id = 'punctuation'
  AND NOT EXISTS (
    SELECT 1
    FROM bounded_gameplay_state_migrations
    WHERE migration_id = '0023' AND state = 'ready'
  )
  AND json_type(
    CASE WHEN json_valid(state.data_json) THEN state.data_json ELSE '{}' END,
    '$.progress.items'
  ) = 'object';

-- All bounded rows and Punctuation aggregates now exist.
-- Contract the live documents while the marker still names legacy authority.
UPDATE child_subject_state
SET data_json = json_remove(
      CASE WHEN json_valid(data_json) THEN data_json ELSE '{}' END,
      '$.mastery.items'
    ),
    ui_json = json_remove(
      CASE WHEN json_valid(ui_json) THEN ui_json ELSE '{}' END,
      '$.mastery.items'
    )
WHERE subject_id = 'grammar';

UPDATE child_subject_state
SET data_json = json_remove(
      CASE WHEN json_valid(data_json) THEN data_json ELSE '{}' END,
      '$.questions'
    )
WHERE subject_id = 'reading';

UPDATE child_subject_state
SET data_json = json_remove(
      CASE WHEN json_valid(data_json) THEN data_json ELSE '{}' END,
      '$.progress.items'
    )
WHERE subject_id = 'punctuation';

-- Authority changes last, after every split row, compact projection and live
-- document cleanup is complete. The release fence prevents a legacy writer
-- crossing this hand-off.
INSERT INTO bounded_gameplay_state_migrations (migration_id, state, ready_at)
VALUES ('0023', 'ready', unixepoch() * 1000)
ON CONFLICT(migration_id) DO UPDATE SET
  state = excluded.state,
  ready_at = excluded.ready_at
WHERE bounded_gameplay_state_migrations.state <> 'ready';
