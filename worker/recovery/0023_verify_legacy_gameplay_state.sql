-- Read-only proof for 0023_materialise_legacy_gameplay_state.sql.
-- An old Worker may receive traffic only when every returned row has ok = 1.

WITH
  spelling_legacy_source AS MATERIALIZED (
    SELECT
      learner_id,
      CASE WHEN json_valid(data_json) THEN data_json ELSE '{}' END AS data_json
    FROM child_subject_state
    WHERE subject_id = 'spelling'
  ),
  spelling_legacy_progress AS MATERIALIZED (
    SELECT source.learner_id, item.key AS item_id, json(item.value) AS value_json
    FROM spelling_legacy_source AS source,
         json_each(source.data_json, '$.progress') AS item
    WHERE item.key <> '' AND json_type(item.value) = 'object'
  ),
  spelling_legacy_guardian AS MATERIALIZED (
    SELECT source.learner_id, item.key AS item_id, json(item.value) AS value_json
    FROM spelling_legacy_source AS source,
         json_each(source.data_json, '$.guardian') AS item
    WHERE item.key <> '' AND json_type(item.value) = 'object'
  ),
  spelling_legacy_pattern AS MATERIALIZED (
    SELECT source.learner_id, item.key AS item_id, json(item.value) AS value_json
    FROM spelling_legacy_source AS source,
         json_each(source.data_json, '$.pattern.wobbling') AS item
    WHERE item.key <> '' AND json_type(item.value) = 'object'
  ),
  spelling_legacy_keys AS MATERIALIZED (
    SELECT learner_id, item_id FROM spelling_legacy_progress
    UNION
    SELECT learner_id, item_id FROM spelling_legacy_guardian
    UNION
    SELECT learner_id, item_id FROM spelling_legacy_pattern
  ),
  spelling_legacy AS MATERIALIZED (
    SELECT
      keys.learner_id,
      keys.item_id,
      progress.value_json AS progress_json,
      guardian.value_json AS guardian_json,
      pattern.value_json AS pattern_json
    FROM spelling_legacy_keys AS keys
    LEFT JOIN spelling_legacy_progress AS progress
      ON progress.learner_id = keys.learner_id AND progress.item_id = keys.item_id
    LEFT JOIN spelling_legacy_guardian AS guardian
      ON guardian.learner_id = keys.learner_id AND guardian.item_id = keys.item_id
    LEFT JOIN spelling_legacy_pattern AS pattern
      ON pattern.learner_id = keys.learner_id AND pattern.item_id = keys.item_id
  ),
  spelling_item_differences AS (
    SELECT split.learner_id, split.slug AS item_id
    FROM spelling_item_state AS split
    LEFT JOIN spelling_legacy AS legacy
      ON legacy.learner_id = split.learner_id AND legacy.item_id = split.slug
    WHERE legacy.item_id IS NULL
      OR COALESCE(json(split.progress_json), '<sql-null>')
           <> COALESCE(legacy.progress_json, '<sql-null>')
      OR COALESCE(json(split.guardian_json), '<sql-null>')
           <> COALESCE(legacy.guardian_json, '<sql-null>')
      OR COALESCE(json(split.pattern_json), '<sql-null>')
           <> COALESCE(legacy.pattern_json, '<sql-null>')
    UNION ALL
    SELECT legacy.learner_id, legacy.item_id
    FROM spelling_legacy AS legacy
    LEFT JOIN spelling_item_state AS split
      ON split.learner_id = legacy.learner_id AND split.slug = legacy.item_id
    WHERE split.slug IS NULL
  ),
  spelling_legacy_achievements AS MATERIALIZED (
    SELECT source.learner_id, item.key AS achievement_id, json(item.value) AS record_json
    FROM spelling_legacy_source AS source,
         json_each(source.data_json, '$.achievements') AS item
    WHERE 1 = 1
      AND item.key <> ''
      AND json_type(item.value) = 'object'
  ),
  spelling_achievement_differences AS (
    SELECT split.learner_id, split.achievement_id
    FROM spelling_achievement_state AS split
    LEFT JOIN spelling_legacy_achievements AS legacy
      ON legacy.learner_id = split.learner_id
      AND legacy.achievement_id = split.achievement_id
    WHERE legacy.achievement_id IS NULL OR json(split.record_json) <> legacy.record_json
    UNION ALL
    SELECT legacy.learner_id, legacy.achievement_id
    FROM spelling_legacy_achievements AS legacy
    LEFT JOIN spelling_achievement_state AS split
      ON split.learner_id = legacy.learner_id
      AND split.achievement_id = legacy.achievement_id
    WHERE split.achievement_id IS NULL
  ),
  grammar_legacy AS MATERIALIZED (
    SELECT state.learner_id, item.key AS item_id, json(item.value) AS value_json
    FROM child_subject_state AS state, json_each(state.data_json, '$.mastery.items') AS item
    WHERE state.subject_id = 'grammar'
  ),
  grammar_item_differences AS (
    SELECT split.learner_id, split.item_id
    FROM grammar_item_state AS split
    LEFT JOIN grammar_legacy AS legacy
      ON legacy.learner_id = split.learner_id AND legacy.item_id = split.item_id
    WHERE legacy.item_id IS NULL OR json(split.mastery_json) <> legacy.value_json
    UNION ALL
    SELECT legacy.learner_id, legacy.item_id
    FROM grammar_legacy AS legacy
    LEFT JOIN grammar_item_state AS split
      ON split.learner_id = legacy.learner_id AND split.item_id = legacy.item_id
    WHERE split.item_id IS NULL
  ),
  reading_legacy AS MATERIALIZED (
    SELECT state.learner_id, item.key AS item_id, json(item.value) AS value_json
    FROM child_subject_state AS state, json_each(state.data_json, '$.questions') AS item
    WHERE state.subject_id = 'reading'
  ),
  reading_item_differences AS (
    SELECT split.learner_id, split.question_id AS item_id
    FROM reading_question_state AS split
    LEFT JOIN reading_legacy AS legacy
      ON legacy.learner_id = split.learner_id AND legacy.item_id = split.question_id
    WHERE legacy.item_id IS NULL OR json(split.mastery_json) <> legacy.value_json
    UNION ALL
    SELECT legacy.learner_id, legacy.item_id
    FROM reading_legacy AS legacy
    LEFT JOIN reading_question_state AS split
      ON split.learner_id = legacy.learner_id AND split.question_id = legacy.item_id
    WHERE split.question_id IS NULL
  ),
  punctuation_legacy AS MATERIALIZED (
    SELECT state.learner_id, item.key AS item_id, json(item.value) AS value_json
    FROM child_subject_state AS state, json_each(state.data_json, '$.progress.items') AS item
    WHERE state.subject_id = 'punctuation'
  ),
  punctuation_item_differences AS (
    SELECT split.learner_id, split.item_id
    FROM punctuation_item_state AS split
    LEFT JOIN punctuation_legacy AS legacy
      ON legacy.learner_id = split.learner_id AND legacy.item_id = split.item_id
    WHERE legacy.item_id IS NULL OR json(split.state_json) <> legacy.value_json
    UNION ALL
    SELECT legacy.learner_id, legacy.item_id
    FROM punctuation_legacy AS legacy
    LEFT JOIN punctuation_item_state AS split
      ON split.learner_id = legacy.learner_id AND split.item_id = legacy.item_id
    WHERE split.item_id IS NULL
  ),
  spelling_learner_differences AS (
    SELECT split.learner_id
    FROM spelling_learner_state AS split
    LEFT JOIN child_subject_state AS legacy
      ON legacy.learner_id = split.learner_id AND legacy.subject_id = 'spelling'
    WHERE legacy.learner_id IS NULL
    UNION ALL
    SELECT legacy.learner_id
    FROM child_subject_state AS legacy
    LEFT JOIN spelling_learner_state AS split ON split.learner_id = legacy.learner_id
    WHERE legacy.subject_id = 'spelling' AND split.learner_id IS NULL
  ),
  spelling_legacy_data_without_items AS (
    SELECT
      learner_id,
      CASE
        WHEN json_type(without_items, '$.pattern') = 'object'
          AND NOT EXISTS (SELECT 1 FROM json_each(without_items, '$.pattern'))
        THEN json_remove(without_items, '$.pattern')
        ELSE without_items
      END AS data_json
    FROM (
      SELECT
        learner_id,
        json_remove(
          data_json,
          '$.progress',
          '$.guardian',
          '$.pattern.wobbling',
          '$.achievements'
        ) AS without_items
      FROM child_subject_state
      WHERE subject_id = 'spelling'
    )
  ),
  counts AS (
    SELECT
      (SELECT COUNT(*) FROM spelling_item_state) AS spelling_split_items,
      (SELECT COUNT(*) FROM spelling_legacy) AS spelling_legacy_items,
      (SELECT COUNT(*) FROM spelling_item_differences) AS spelling_item_mismatches,
      (SELECT COUNT(*) FROM spelling_achievement_state) AS spelling_split_achievements,
      (SELECT COUNT(*) FROM spelling_legacy_achievements) AS spelling_legacy_achievements,
      (SELECT COUNT(*) FROM spelling_achievement_differences) AS spelling_achievement_mismatches,
      (SELECT COUNT(*) FROM grammar_item_state) AS grammar_split_items,
      (SELECT COUNT(*) FROM grammar_legacy) AS grammar_legacy_items,
      (SELECT COUNT(*) FROM grammar_item_differences) AS grammar_item_mismatches,
      (SELECT COUNT(*) FROM reading_question_state) AS reading_split_items,
      (SELECT COUNT(*) FROM reading_legacy) AS reading_legacy_items,
      (SELECT COUNT(*) FROM reading_item_differences) AS reading_item_mismatches,
      (SELECT COUNT(*) FROM punctuation_item_state) AS punctuation_split_items,
      (SELECT COUNT(*) FROM punctuation_legacy) AS punctuation_legacy_items,
      (SELECT COUNT(*) FROM punctuation_item_differences) AS punctuation_item_mismatches
  ),
  checks AS (
    SELECT
      'migration' AS subject_id,
      0 AS split_items,
      0 AS legacy_items,
      CASE WHEN (SELECT state FROM bounded_gameplay_state_migrations WHERE migration_id = '0023')
        = 'legacy-authoritative' THEN 0 ELSE 1 END AS mismatched_items,
      '0023 marker is legacy-authoritative' AS check_name,
      'legacy-authoritative' AS expected,
      COALESCE((
        SELECT state FROM bounded_gameplay_state_migrations WHERE migration_id = '0023'
      ), '<missing>') AS actual,
      CASE WHEN (SELECT state FROM bounded_gameplay_state_migrations WHERE migration_id = '0023')
        = 'legacy-authoritative' THEN 1 ELSE 0 END AS ok
    UNION ALL
    SELECT 'spelling', spelling_split_items, spelling_legacy_items,
      spelling_item_mismatches, 'spelling item parity', 0,
      spelling_item_mismatches,
      CASE WHEN spelling_split_items = spelling_legacy_items
        AND spelling_item_mismatches = 0 THEN 1 ELSE 0 END
    FROM counts
    UNION ALL
    SELECT 'spelling', spelling_split_achievements, spelling_legacy_achievements,
      spelling_achievement_mismatches, 'spelling achievement parity', 0,
      spelling_achievement_mismatches,
      CASE WHEN spelling_split_achievements = spelling_legacy_achievements
        AND spelling_achievement_mismatches = 0 THEN 1 ELSE 0 END
    FROM counts
    UNION ALL
    SELECT 'grammar', grammar_split_items, grammar_legacy_items,
      grammar_item_mismatches, 'grammar item parity', 0,
      grammar_item_mismatches,
      CASE WHEN grammar_split_items = grammar_legacy_items
        AND grammar_item_mismatches = 0 THEN 1 ELSE 0 END
    FROM counts
    UNION ALL
    SELECT 'reading', reading_split_items, reading_legacy_items,
      reading_item_mismatches, 'reading item parity', 0,
      reading_item_mismatches,
      CASE WHEN reading_split_items = reading_legacy_items
        AND reading_item_mismatches = 0 THEN 1 ELSE 0 END
    FROM counts
    UNION ALL
    SELECT 'punctuation', punctuation_split_items, punctuation_legacy_items,
      punctuation_item_mismatches, 'punctuation item parity', 0,
      punctuation_item_mismatches,
      CASE WHEN punctuation_split_items = punctuation_legacy_items
        AND punctuation_item_mismatches = 0 THEN 1 ELSE 0 END
    FROM counts
    UNION ALL
    SELECT 'spelling',
      (SELECT COUNT(*) FROM spelling_learner_state),
      (SELECT COUNT(*) FROM child_subject_state WHERE subject_id = 'spelling'),
      (SELECT COUNT(*) FROM spelling_learner_differences),
      'spelling learner row parity', 0,
      (SELECT COUNT(*) FROM spelling_learner_differences),
      CASE WHEN NOT EXISTS (SELECT 1 FROM spelling_learner_differences) THEN 1 ELSE 0 END
    UNION ALL
    SELECT 'spelling', NULL, NULL,
      COUNT(*), 'spelling learner ui parity', 0, COUNT(*),
      CASE WHEN COUNT(*) = 0 THEN 1 ELSE 0 END
    FROM spelling_learner_state AS split
    JOIN child_subject_state AS legacy
      ON legacy.learner_id = split.learner_id AND legacy.subject_id = 'spelling'
    WHERE json(split.ui_json) <> json(legacy.ui_json)
    UNION ALL
    SELECT 'spelling', NULL, NULL,
      COUNT(*), 'spelling learner non-item data parity', 0, COUNT(*),
      CASE WHEN COUNT(*) = 0 THEN 1 ELSE 0 END
    FROM spelling_learner_state AS split
    JOIN spelling_legacy_data_without_items AS legacy ON legacy.learner_id = split.learner_id
    WHERE json(split.data_json) <> json(legacy.data_json)
    UNION ALL
    SELECT 'spelling', NULL, NULL,
      COUNT(*), 'spelling learner updated_at parity', 0, COUNT(*),
      CASE WHEN COUNT(*) = 0 THEN 1 ELSE 0 END
    FROM spelling_learner_state AS split
    JOIN child_subject_state AS legacy
      ON legacy.learner_id = split.learner_id AND legacy.subject_id = 'spelling'
    WHERE split.updated_at IS NOT legacy.updated_at
    UNION ALL
    SELECT 'spelling', NULL, NULL,
      COUNT(*), 'spelling learner updated_by_account_id parity', 0, COUNT(*),
      CASE WHEN COUNT(*) = 0 THEN 1 ELSE 0 END
    FROM spelling_learner_state AS split
    JOIN child_subject_state AS legacy
      ON legacy.learner_id = split.learner_id AND legacy.subject_id = 'spelling'
    WHERE split.updated_by_account_id IS NOT legacy.updated_by_account_id
  )
SELECT subject_id, split_items, legacy_items, mismatched_items,
  check_name, expected, actual, ok
FROM checks
ORDER BY subject_id, check_name;
