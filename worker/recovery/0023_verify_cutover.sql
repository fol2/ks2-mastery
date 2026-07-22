-- Read-only, content-free release gate for migration 0023.
-- Every row must report ok = 1 before gameplay mutations are resumed.

WITH
  current_patterns(pattern_id) AS (
    VALUES
      ('suffix-tion'), ('suffix-sion'), ('suffix-cian'), ('suffix-ous'),
      ('suffix-ly'), ('suffix-able-ible'), ('silent-letter'), ('i-before-e'),
      ('double-consonant'), ('prefix-un-in-im'), ('prefix-pre-re-de'),
      ('homophone'), ('root-graph-scribe'), ('root-port-spect'),
      ('exception-word')
  ),
  spelling_legacy_source AS MATERIALIZED (
    SELECT
      learner_id,
      CASE WHEN json_valid(data_json) THEN data_json ELSE '{}' END AS data_json
    FROM child_subject_state
    WHERE subject_id = 'spelling'
  ),
  spelling_legacy_progress AS MATERIALIZED (
    SELECT source.learner_id, item.key AS slug, json(item.value) AS value_json
    FROM spelling_legacy_source AS source,
         json_each(source.data_json, '$.progress') AS item
    WHERE item.key <> '' AND json_type(item.value) = 'object'
  ),
  spelling_legacy_guardian AS MATERIALIZED (
    SELECT source.learner_id, item.key AS slug, json(item.value) AS value_json
    FROM spelling_legacy_source AS source,
         json_each(source.data_json, '$.guardian') AS item
    WHERE item.key <> '' AND json_type(item.value) = 'object'
  ),
  spelling_legacy_pattern AS MATERIALIZED (
    SELECT source.learner_id, item.key AS slug, json(item.value) AS value_json
    FROM spelling_legacy_source AS source,
         json_each(source.data_json, '$.pattern.wobbling') AS item
    WHERE item.key <> '' AND json_type(item.value) = 'object'
  ),
  spelling_legacy_item_keys AS MATERIALIZED (
    SELECT learner_id, slug FROM spelling_legacy_progress
    UNION
    SELECT learner_id, slug FROM spelling_legacy_guardian
    UNION
    SELECT learner_id, slug FROM spelling_legacy_pattern
  ),
  spelling_expected_items AS MATERIALIZED (
    SELECT
      keys.learner_id,
      keys.slug,
      progress.value_json AS progress_json,
      guardian.value_json AS guardian_json,
      pattern.value_json AS pattern_json
    FROM spelling_legacy_item_keys AS keys
    LEFT JOIN spelling_legacy_progress AS progress
      ON progress.learner_id = keys.learner_id AND progress.slug = keys.slug
    LEFT JOIN spelling_legacy_guardian AS guardian
      ON guardian.learner_id = keys.learner_id AND guardian.slug = keys.slug
    LEFT JOIN spelling_legacy_pattern AS pattern
      ON pattern.learner_id = keys.learner_id AND pattern.slug = keys.slug
  ),
  spelling_mismatches AS (
    SELECT split.learner_id, split.slug
    FROM spelling_item_state AS split
    LEFT JOIN spelling_expected_items AS expected
      ON expected.learner_id = split.learner_id AND expected.slug = split.slug
    WHERE expected.slug IS NULL
      OR COALESCE(json(split.progress_json), 'null') <> COALESCE(expected.progress_json, 'null')
      OR COALESCE(json(split.guardian_json), 'null') <> COALESCE(expected.guardian_json, 'null')
      OR COALESCE(json(split.pattern_json), 'null') <> COALESCE(expected.pattern_json, 'null')
    UNION ALL
    SELECT expected.learner_id, expected.slug
    FROM spelling_expected_items AS expected
    LEFT JOIN spelling_item_state AS split
      ON split.learner_id = expected.learner_id AND split.slug = expected.slug
    WHERE split.slug IS NULL
  ),
  spelling_legacy_unlocks AS MATERIALIZED (
    SELECT source.learner_id, item.key AS achievement_id, json(item.value) AS record_json
    FROM spelling_legacy_source AS source,
         json_each(source.data_json, '$.achievements') AS item
    WHERE item.key <> ''
      AND item.key NOT IN (
        '_progress:guardian:days',
        '_progress:recovery:slugs',
        '_progress:pattern:completions'
      )
      AND json_type(item.value) = 'object'
  ),
  spelling_achievement_mismatches AS (
    SELECT split.learner_id, split.achievement_id
    FROM spelling_achievement_state AS split
    LEFT JOIN spelling_legacy_unlocks AS legacy
      ON legacy.learner_id = split.learner_id
      AND legacy.achievement_id = split.achievement_id
    WHERE split.achievement_id NOT IN (
        '_progress:guardian:days',
        '_progress:recovery:slugs',
        '_progress:pattern:completions'
      )
      AND (legacy.achievement_id IS NULL OR json(split.record_json) <> legacy.record_json)
    UNION ALL
    SELECT legacy.learner_id, legacy.achievement_id
    FROM spelling_legacy_unlocks AS legacy
    LEFT JOIN spelling_achievement_state AS split
      ON split.learner_id = legacy.learner_id
      AND split.achievement_id = legacy.achievement_id
    WHERE split.achievement_id IS NULL
  ),
  spelling_legacy_progress_achievements AS MATERIALIZED (
    SELECT source.learner_id, item.key AS achievement_id, json(item.value) AS record_json
    FROM spelling_legacy_source AS source,
         json_each(source.data_json, '$.achievements') AS item
    WHERE item.key IN (
        '_progress:guardian:days',
        '_progress:recovery:slugs',
        '_progress:pattern:completions'
      )
      AND json_type(item.value) = 'object'
  ),
  spelling_progress_achievement_row_violations AS (
    SELECT legacy.learner_id, legacy.achievement_id
    FROM spelling_legacy_progress_achievements AS legacy
    LEFT JOIN spelling_achievement_state AS split
      ON split.learner_id = legacy.learner_id
      AND split.achievement_id = legacy.achievement_id
    WHERE split.achievement_id IS NULL
    UNION ALL
    SELECT split.learner_id, split.achievement_id
    FROM spelling_achievement_state AS split
    LEFT JOIN spelling_legacy_progress_achievements AS legacy
      ON legacy.learner_id = split.learner_id
      AND legacy.achievement_id = split.achievement_id
    WHERE split.achievement_id IN (
        '_progress:guardian:days',
        '_progress:recovery:slugs',
        '_progress:pattern:completions'
      )
      AND legacy.achievement_id IS NULL
  ),
  spelling_guardian_progress_violations AS (
    SELECT legacy.learner_id, legacy.achievement_id
    FROM spelling_legacy_progress_achievements AS legacy
    JOIN spelling_achievement_state AS split
      ON split.learner_id = legacy.learner_id
      AND split.achievement_id = legacy.achievement_id
    WHERE legacy.achievement_id = '_progress:guardian:days'
      AND (
        json_type(split.record_json, '$.days') <> 'array'
        OR (SELECT COUNT(*) FROM json_each(split.record_json, '$.days'))
          <> MIN(7, (
            SELECT COUNT(DISTINCT CAST(value AS INTEGER))
            FROM json_each(legacy.record_json, '$.days')
            WHERE type IN ('integer', 'real') AND CAST(value AS INTEGER) >= 0
          ))
        OR EXISTS (
          SELECT 1
          FROM json_each(split.record_json, '$.days') AS projected
          WHERE projected.type NOT IN ('integer', 'real')
            OR CAST(projected.value AS INTEGER) < 0
            OR NOT EXISTS (
              SELECT 1
              FROM json_each(legacy.record_json, '$.days') AS source
              WHERE source.type IN ('integer', 'real')
                AND CAST(source.value AS INTEGER) = CAST(projected.value AS INTEGER)
            )
        )
        OR (SELECT COUNT(*) FROM json_each(split.record_json, '$.days'))
          <> (SELECT COUNT(DISTINCT CAST(value AS INTEGER))
              FROM json_each(split.record_json, '$.days'))
      )
  ),
  spelling_recovery_progress_violations AS (
    SELECT legacy.learner_id, legacy.achievement_id
    FROM spelling_legacy_progress_achievements AS legacy
    JOIN spelling_achievement_state AS split
      ON split.learner_id = legacy.learner_id
      AND split.achievement_id = legacy.achievement_id
    WHERE legacy.achievement_id = '_progress:recovery:slugs'
      AND (
        json_type(split.record_json, '$.slugs') <> 'array'
        OR (SELECT COUNT(*) FROM json_each(split.record_json, '$.slugs'))
          <> MIN(10, (
            SELECT COUNT(DISTINCT CAST(value AS TEXT))
            FROM json_each(legacy.record_json, '$.slugs')
            WHERE type = 'text' AND CAST(value AS TEXT) <> ''
          ))
        OR EXISTS (
          SELECT 1
          FROM json_each(split.record_json, '$.slugs') AS projected
          WHERE projected.type <> 'text'
            OR CAST(projected.value AS TEXT) = ''
            OR NOT EXISTS (
              SELECT 1
              FROM json_each(legacy.record_json, '$.slugs') AS source
              WHERE source.type = 'text'
                AND CAST(source.value AS TEXT) = CAST(projected.value AS TEXT)
            )
        )
        OR (SELECT COUNT(*) FROM json_each(split.record_json, '$.slugs'))
          <> (SELECT COUNT(DISTINCT CAST(value AS TEXT))
              FROM json_each(split.record_json, '$.slugs'))
      )
  ),
  spelling_pattern_expected AS (
    SELECT
      legacy.learner_id,
      current_patterns.pattern_id,
      json(COALESCE((
        SELECT json_group_array(json(value))
        FROM (
          SELECT value
          FROM (
            SELECT CAST(key AS INTEGER) AS completion_index, value
            FROM json_each(
              legacy.record_json,
              '$.completions.' || json_quote(current_patterns.pattern_id)
            )
            ORDER BY completion_index DESC
            LIMIT 3
          ) recent
          ORDER BY completion_index ASC
        ) ordered_recent
      ), '[]')) AS expected_json
    FROM spelling_legacy_progress_achievements AS legacy
    CROSS JOIN current_patterns
    WHERE legacy.achievement_id = '_progress:pattern:completions'
  ),
  spelling_pattern_progress_violations AS (
    SELECT expected.learner_id, expected.pattern_id
    FROM spelling_pattern_expected AS expected
    JOIN spelling_achievement_state AS split
      ON split.learner_id = expected.learner_id
      AND split.achievement_id = '_progress:pattern:completions'
    WHERE COALESCE(
      json_extract(
        split.record_json,
        '$.completions.' || json_quote(expected.pattern_id)
      ),
      json('[]')
    ) <> expected.expected_json
    UNION ALL
    SELECT split.learner_id, projected.key
    FROM spelling_achievement_state AS split,
         json_each(split.record_json, '$.completions') AS projected
    WHERE split.achievement_id = '_progress:pattern:completions'
      AND projected.key NOT IN (SELECT pattern_id FROM current_patterns)
  ),
  spelling_progress_achievement_violations AS (
    SELECT learner_id, achievement_id AS evidence_key
    FROM spelling_progress_achievement_row_violations
    UNION ALL
    SELECT learner_id, achievement_id FROM spelling_guardian_progress_violations
    UNION ALL
    SELECT learner_id, achievement_id FROM spelling_recovery_progress_violations
    UNION ALL
    SELECT learner_id, pattern_id FROM spelling_pattern_progress_violations
  ),
  spelling_progress_stats AS (
    SELECT
      legacy.learner_id,
      COUNT(item.key) AS total,
      SUM(CASE WHEN COALESCE(CAST(json_extract(item.value, '$.stage') AS INTEGER), 0) >= 4 THEN 1 ELSE 0 END) AS secure,
      SUM(CASE
        WHEN COALESCE(CAST(json_extract(item.value, '$.attempts') AS INTEGER), 0) > 0
          AND COALESCE(
            CAST(json_extract(item.value, '$.dueDay') AS INTEGER),
            CAST(marker.ready_at / 86400000 AS INTEGER)
          ) <= CAST(marker.ready_at / 86400000 AS INTEGER)
        THEN 1 ELSE 0 END) AS due,
      SUM(CASE
        WHEN item.key IS NOT NULL
          AND COALESCE(CAST(json_extract(item.value, '$.attempts') AS INTEGER), 0) = 0
        THEN 1 ELSE 0
      END) AS fresh,
      SUM(CASE
        WHEN COALESCE(CAST(json_extract(item.value, '$.wrong') AS INTEGER), 0) > 0
          AND (
            COALESCE(CAST(json_extract(item.value, '$.wrong') AS INTEGER), 0)
              >= COALESCE(CAST(json_extract(item.value, '$.correct') AS INTEGER), 0)
            OR COALESCE(
              CAST(json_extract(item.value, '$.dueDay') AS INTEGER),
              CAST(marker.ready_at / 86400000 AS INTEGER)
            ) <= CAST(marker.ready_at / 86400000 AS INTEGER)
          )
        THEN 1 ELSE 0 END) AS trouble,
      SUM(COALESCE(CAST(json_extract(item.value, '$.attempts') AS INTEGER), 0)) AS attempts,
      SUM(COALESCE(CAST(json_extract(item.value, '$.correct') AS INTEGER), 0)) AS correct
    FROM child_subject_state AS legacy
    JOIN bounded_gameplay_state_migrations AS marker
      ON marker.migration_id = '0023' AND marker.state = 'ready'
    LEFT JOIN json_each(legacy.data_json, '$.progress') AS item ON TRUE
    WHERE legacy.subject_id = 'spelling'
    GROUP BY legacy.learner_id
  ),
  spelling_split_safe AS (
    SELECT
      split.*,
      json_valid(split.ui_json) AS ui_valid,
      json_valid(split.data_json) AS data_valid,
      json_valid(split.stats_json) AS stats_valid,
      CASE WHEN json_valid(split.data_json) THEN split.data_json ELSE '{}' END AS safe_data_json,
      CASE WHEN json_valid(split.stats_json) THEN split.stats_json ELSE '{}' END AS safe_stats_json
    FROM spelling_learner_state AS split
  ),
  spelling_learner_integrity_violations AS (
    SELECT split.learner_id
    FROM spelling_split_safe AS split
    WHERE split.ui_valid <> 1
      OR json_type(split.ui_json) NOT IN ('null', 'object')
      OR split.data_valid <> 1
      OR json_type(split.safe_data_json) <> 'object'
      OR length(split.data_json) > 16384
      OR EXISTS (
        SELECT 1 FROM json_each(split.safe_data_json)
        WHERE key NOT IN ('prefs', 'postMega', 'persistenceWarning')
      )
      OR split.stats_valid <> 1
      OR json_type(split.safe_stats_json) <> 'object'
      OR length(split.stats_json) > 4096
      OR (
        SELECT COUNT(*) FROM json_each(split.safe_stats_json)
        WHERE key IN ('all', 'core', 'y34', 'y56', 'secureExtension', 'extra')
          AND type = 'object'
      ) <> 6
  ),
  spelling_learner_mismatches AS (
    SELECT legacy.learner_id
    FROM child_subject_state AS legacy
    LEFT JOIN spelling_split_safe AS split ON split.learner_id = legacy.learner_id
    LEFT JOIN spelling_progress_stats AS expected ON expected.learner_id = legacy.learner_id
    WHERE legacy.subject_id = 'spelling'
      AND (
        split.learner_id IS NULL
        OR split.ui_json <> legacy.ui_json
        OR split.updated_at <> legacy.updated_at
        OR split.updated_by_account_id IS NOT legacy.updated_by_account_id
        OR split.data_valid <> 1
        OR json_type(split.safe_data_json) <> 'object'
        OR length(split.data_json) > 16384
        OR (SELECT COUNT(*) FROM json_each(split.safe_data_json)) <> 3
        OR EXISTS (
          SELECT 1 FROM json_each(split.safe_data_json)
          WHERE key NOT IN ('prefs', 'postMega', 'persistenceWarning')
        )
        OR COALESCE(json_extract(split.safe_data_json, '$.prefs'), '{}')
          <> CASE
            WHEN json_type(legacy.data_json, '$.prefs') = 'object'
              THEN json_extract(legacy.data_json, '$.prefs')
            ELSE '{}'
          END
        OR COALESCE(json_extract(split.safe_data_json, '$.postMega'), '__null__')
          <> COALESCE(CASE
            WHEN json_type(legacy.data_json, '$.postMega') = 'object'
              THEN json_extract(legacy.data_json, '$.postMega')
            ELSE NULL
          END, '__null__')
        OR COALESCE(json_extract(split.safe_data_json, '$.persistenceWarning'), '__null__')
          <> COALESCE(CASE
            WHEN json_type(legacy.data_json, '$.persistenceWarning') = 'object'
              THEN json_extract(legacy.data_json, '$.persistenceWarning')
            ELSE NULL
          END, '__null__')
        OR split.stats_valid <> 1
        OR json_type(split.safe_stats_json) <> 'object'
        OR length(split.stats_json) > 4096
        OR (SELECT COUNT(*) FROM json_each(split.safe_stats_json)) <> 6
        OR EXISTS (
          SELECT 1 FROM json_each(split.safe_stats_json)
          WHERE key NOT IN ('all', 'core', 'y34', 'y56', 'secureExtension', 'extra')
        )
        OR json_extract(split.safe_stats_json, '$.all.total') IS NOT COALESCE(expected.total, 0)
        OR json_extract(split.safe_stats_json, '$.all.secure') IS NOT COALESCE(expected.secure, 0)
        OR json_extract(split.safe_stats_json, '$.all.due') IS NOT COALESCE(expected.due, 0)
        OR json_extract(split.safe_stats_json, '$.all.fresh') IS NOT COALESCE(expected.fresh, 0)
        OR json_extract(split.safe_stats_json, '$.all.trouble') IS NOT COALESCE(expected.trouble, 0)
        OR json_extract(split.safe_stats_json, '$.all.attempts') IS NOT COALESCE(expected.attempts, 0)
        OR json_extract(split.safe_stats_json, '$.all.correct') IS NOT COALESCE(expected.correct, 0)
        OR json_extract(split.safe_stats_json, '$.all.accuracy') IS NOT CASE
          WHEN COALESCE(expected.attempts, 0) > 0
            THEN CAST(ROUND(expected.correct * 100.0 / expected.attempts) AS INTEGER)
          ELSE NULL
        END
        OR json_extract(split.safe_stats_json, '$.core') IS NOT json_extract(split.safe_stats_json, '$.all')
        OR json_extract(split.safe_stats_json, '$.y34')
          IS NOT json_object('total', 0, 'secure', 0, 'due', 0, 'fresh', 0, 'trouble', 0, 'attempts', 0, 'correct', 0, 'accuracy', NULL)
        OR json_extract(split.safe_stats_json, '$.y56')
          IS NOT json_object('total', 0, 'secure', 0, 'due', 0, 'fresh', 0, 'trouble', 0, 'attempts', 0, 'correct', 0, 'accuracy', NULL)
        OR json_extract(split.safe_stats_json, '$.secureExtension')
          IS NOT json_object('total', 0, 'secure', 0, 'due', 0, 'fresh', 0, 'trouble', 0, 'attempts', 0, 'correct', 0, 'accuracy', NULL)
        OR json_extract(split.safe_stats_json, '$.extra')
          IS NOT json_object('total', 0, 'secure', 0, 'due', 0, 'fresh', 0, 'trouble', 0, 'attempts', 0, 'correct', 0, 'accuracy', NULL)
      )
  ),
  grammar_data_items AS (
    SELECT archive.learner_id, item.key AS item_id, json(item.value) AS value_json
    FROM bounded_gameplay_state_archive AS archive,
         json_each(archive.data_json, '$.mastery.items') AS item
    WHERE archive.migration_id = '0023' AND archive.subject_id = 'grammar'
      AND item.key <> '' AND json_type(item.value) = 'object'
  ),
  grammar_ui_items AS (
    SELECT archive.learner_id, item.key AS item_id, json(item.value) AS value_json
    FROM bounded_gameplay_state_archive AS archive,
         json_each(archive.ui_json, '$.mastery.items') AS item
    WHERE archive.migration_id = '0023' AND archive.subject_id = 'grammar'
      AND item.key <> '' AND json_type(item.value) = 'object'
  ),
  grammar_expected AS (
    SELECT learner_id, item_id, value_json FROM grammar_ui_items
    UNION ALL
    SELECT data.learner_id, data.item_id, data.value_json
    FROM grammar_data_items AS data
    WHERE NOT EXISTS (
      SELECT 1 FROM grammar_ui_items AS ui
      WHERE ui.learner_id = data.learner_id AND ui.item_id = data.item_id
    )
  ),
  grammar_mismatches AS (
    SELECT split.learner_id, split.item_id
    FROM grammar_item_state AS split
    LEFT JOIN grammar_expected AS expected
      ON expected.learner_id = split.learner_id AND expected.item_id = split.item_id
    WHERE expected.item_id IS NULL OR json(split.mastery_json) <> expected.value_json
  ),
  reading_expected AS (
    SELECT archive.learner_id, item.key AS question_id, json(item.value) AS value_json
    FROM bounded_gameplay_state_archive AS archive,
         json_each(archive.data_json, '$.questions') AS item
    WHERE archive.migration_id = '0023' AND archive.subject_id = 'reading'
      AND item.key <> '' AND json_type(item.value) = 'object'
  ),
  reading_mismatches AS (
    SELECT split.learner_id, split.question_id
    FROM reading_question_state AS split
    LEFT JOIN reading_expected AS expected
      ON expected.learner_id = split.learner_id AND expected.question_id = split.question_id
    WHERE expected.question_id IS NULL OR json(split.mastery_json) <> expected.value_json
  ),
  punctuation_expected AS (
    SELECT archive.learner_id, item.key AS item_id, json(item.value) AS value_json
    FROM bounded_gameplay_state_archive AS archive,
         json_each(archive.data_json, '$.progress.items') AS item
    WHERE archive.migration_id = '0023' AND archive.subject_id = 'punctuation'
      AND item.key <> '' AND json_type(item.value) = 'object'
  ),
  punctuation_mismatches AS (
    SELECT split.learner_id, split.item_id
    FROM punctuation_item_state AS split
    LEFT JOIN punctuation_expected AS expected
      ON expected.learner_id = split.learner_id AND expected.item_id = split.item_id
    WHERE expected.item_id IS NULL OR json(split.state_json) <> expected.value_json
  ),
metrics AS (
  SELECT
    (SELECT COUNT(*) FROM bounded_gameplay_state_migrations
      WHERE migration_id = '0023' AND state = 'ready') AS ready_rows,
    (SELECT COUNT(*) FROM child_subject_state
      WHERE subject_id = 'spelling') AS spelling_legacy_learners,
    (SELECT COUNT(*) FROM learner_profiles) AS all_learners,
    (SELECT COUNT(*) FROM spelling_learner_state) AS spelling_split_learners,
    (SELECT COUNT(*) FROM spelling_item_state) AS spelling_split_items,
    (SELECT COUNT(*) FROM spelling_achievement_state
      WHERE achievement_id NOT IN (
        '_progress:guardian:days',
        '_progress:recovery:slugs',
        '_progress:pattern:completions'
      )) AS spelling_split_achievements,
    (SELECT COUNT(*) FROM spelling_legacy_unlocks) AS spelling_legacy_achievements,
    (SELECT COUNT(*) FROM spelling_expected_items) AS spelling_legacy_items,
    (SELECT COUNT(*) FROM grammar_item_state) AS grammar_split_items,
    (SELECT COUNT(*) FROM (
      SELECT archive.learner_id, item.key AS item_id
      FROM bounded_gameplay_state_archive AS archive,
           json_each(archive.data_json, '$.mastery.items') AS item
      WHERE archive.migration_id = '0023' AND archive.subject_id = 'grammar'
      UNION
      SELECT archive.learner_id, item.key AS item_id
      FROM bounded_gameplay_state_archive AS archive,
           json_each(archive.ui_json, '$.mastery.items') AS item
      WHERE archive.migration_id = '0023' AND archive.subject_id = 'grammar'
    )) AS grammar_archived_items,
    (SELECT COUNT(*) FROM reading_question_state) AS reading_split_items,
    (SELECT COUNT(*)
     FROM bounded_gameplay_state_archive AS archive,
          json_each(archive.data_json, '$.questions') AS item
     WHERE archive.migration_id = '0023' AND archive.subject_id = 'reading') AS reading_archived_items,
    (SELECT COUNT(*) FROM punctuation_item_state) AS punctuation_split_items,
    (SELECT COUNT(*)
     FROM bounded_gameplay_state_archive AS archive,
          json_each(archive.data_json, '$.progress.items') AS item
     WHERE archive.migration_id = '0023' AND archive.subject_id = 'punctuation') AS punctuation_archived_items,
    (SELECT COUNT(*) FROM child_subject_state
      WHERE subject_id = 'grammar'
        AND (json_type(data_json, '$.mastery.items') = 'object'
          OR json_type(ui_json, '$.mastery.items') = 'object')) AS grammar_embedded_maps,
    (SELECT COUNT(*) FROM child_subject_state
      WHERE subject_id = 'reading'
        AND json_type(data_json, '$.questions') = 'object') AS reading_embedded_maps,
    (SELECT COUNT(*) FROM child_subject_state
      WHERE subject_id = 'punctuation'
        AND json_type(data_json, '$.progress.items') = 'object') AS punctuation_embedded_maps,
    (SELECT COUNT(*) FROM spelling_mismatches) AS spelling_value_mismatches,
    (SELECT COUNT(*) FROM spelling_learner_mismatches) AS spelling_learner_value_mismatches,
    (SELECT COUNT(*) FROM spelling_learner_integrity_violations)
      AS spelling_learner_integrity_violations,
    (SELECT COUNT(*) FROM spelling_achievement_mismatches) AS spelling_achievement_value_mismatches,
    (SELECT COUNT(*) FROM spelling_progress_achievement_violations)
      AS spelling_progress_achievement_violations,
    (SELECT COUNT(*) FROM grammar_mismatches) AS grammar_value_mismatches,
    (SELECT COUNT(*) FROM reading_mismatches) AS reading_value_mismatches,
    (SELECT COUNT(*) FROM punctuation_mismatches) AS punctuation_value_mismatches
)
SELECT
  json_extract(check_row.value, '$[0]') AS check_name,
  CAST(json_extract(check_row.value, '$[1]') AS INTEGER) AS expected,
  CAST(json_extract(check_row.value, '$[2]') AS INTEGER) AS actual,
  CAST(json_extract(check_row.value, '$[1]') AS INTEGER)
    = CAST(json_extract(check_row.value, '$[2]') AS INTEGER) AS ok
FROM metrics,
     json_each(json_array(
       json_array('readiness', 1, ready_rows),
       json_array('spelling learners', all_learners, spelling_split_learners),
       json_array('spelling items', spelling_legacy_items, spelling_split_items),
       json_array(
         'spelling achievements',
         spelling_legacy_achievements,
         spelling_split_achievements
       ),
       json_array('grammar items', grammar_archived_items, grammar_split_items),
       json_array('reading items', reading_archived_items, reading_split_items),
       json_array('punctuation items', punctuation_archived_items, punctuation_split_items),
       json_array('grammar embedded maps', 0, grammar_embedded_maps),
       json_array('reading embedded maps', 0, reading_embedded_maps),
       json_array('punctuation embedded maps', 0, punctuation_embedded_maps),
       json_array('spelling value mismatches', 0, spelling_value_mismatches),
       json_array(
         'spelling learner value mismatches',
         0,
         spelling_learner_value_mismatches
       ),
       json_array(
         'spelling learner integrity violations',
         0,
         spelling_learner_integrity_violations
       ),
       json_array(
         'spelling achievement value mismatches',
         0,
         spelling_achievement_value_mismatches
       ),
       json_array(
         'spelling progress achievement violations',
         0,
         spelling_progress_achievement_violations
       ),
       json_array('grammar value mismatches', 0, grammar_value_mismatches),
       json_array('reading value mismatches', 0, reading_value_mismatches),
       json_array('punctuation value mismatches', 0, punctuation_value_mismatches)
     )) AS check_row
ORDER BY check_name;
