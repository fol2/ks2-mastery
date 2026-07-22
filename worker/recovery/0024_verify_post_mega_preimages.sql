-- Read-only, content-free release gate for migration 0024.
-- Every row must report ok = 1 before gameplay mutations are resumed.

WITH index_columns AS (
  SELECT indexes.name AS index_name,
         indexes.[unique] AS is_unique,
         columns.seqno AS column_order,
         columns.name AS column_name
  FROM pragma_index_list('spelling_seed_preimages') AS indexes
  JOIN pragma_index_info(indexes.name) AS columns
),
ordered_unique_indexes AS (
  SELECT index_name, group_concat(column_name, ',') AS columns
  FROM (
    SELECT index_name, column_name
    FROM index_columns
    WHERE is_unique = 1
    ORDER BY index_name, column_order
  )
  GROUP BY index_name
),
checks AS (
  SELECT
    (SELECT COUNT(*) FROM sqlite_master
      WHERE type = 'table' AND name = 'spelling_seed_preimages') AS metadata_table,
    (SELECT COUNT(*) FROM sqlite_master
      WHERE type = 'table' AND name = 'spelling_seed_preimage_items') AS item_table,
    (SELECT COUNT(*) FROM sqlite_master
      WHERE type = 'table' AND name = 'spelling_seed_preimage_achievements') AS achievement_table,
    (SELECT COUNT(*) FROM sqlite_master
      WHERE type = 'index'
        AND name = 'idx_spelling_seed_preimages_learner_created') AS lookup_index,
    (SELECT COUNT(*) FROM pragma_table_info('spelling_seed_preimages')
      WHERE name IN (
        'preimage_id', 'learner_id', 'actor_account_id', 'seed_request_id',
        'ui_json', 'data_json', 'stats_json', 'source_updated_at',
        'source_updated_by_account_id', 'item_count', 'achievement_count', 'created_at',
        'last_restored_at', 'last_restored_by_account_id'
      )) AS metadata_columns,
    (SELECT COUNT(*) FROM pragma_table_info('spelling_seed_preimage_items')
      WHERE name IN (
        'preimage_id', 'slug', 'progress_json', 'guardian_json', 'pattern_json',
        'source_updated_at', 'source_updated_by_account_id'
      )) AS item_columns,
    (SELECT group_concat(name, ',') FROM (
      SELECT name
      FROM pragma_table_info('spelling_seed_preimage_items')
      WHERE pk > 0
      ORDER BY pk
    )) AS item_primary_key,
    (SELECT COUNT(*) FROM pragma_table_info('spelling_seed_preimage_achievements')
      WHERE name IN (
        'preimage_id', 'achievement_id', 'record_json',
        'source_updated_at', 'source_updated_by_account_id'
      )) AS achievement_columns,
    (SELECT group_concat(name, ',') FROM (
      SELECT name
      FROM pragma_table_info('spelling_seed_preimage_achievements')
      WHERE pk > 0
      ORDER BY pk
    )) AS achievement_primary_key,
    (SELECT COUNT(*) FROM ordered_unique_indexes
      WHERE columns = 'actor_account_id,seed_request_id') AS metadata_idempotency_key,
    (SELECT COUNT(*) FROM pragma_foreign_key_list('spelling_seed_preimage_items')
      WHERE [table] = 'spelling_seed_preimages'
        AND [from] = 'preimage_id'
        AND [to] = 'preimage_id'
        AND upper(on_delete) = 'CASCADE') AS item_archive_foreign_key,
    (SELECT COUNT(*) FROM pragma_foreign_key_list('spelling_seed_preimage_achievements')
      WHERE [table] = 'spelling_seed_preimages'
        AND [from] = 'preimage_id'
        AND [to] = 'preimage_id'
        AND upper(on_delete) = 'CASCADE') AS achievement_archive_foreign_key,
    (SELECT COUNT(*)
      FROM spelling_seed_preimages archive
      WHERE archive.item_count <> (
        SELECT COUNT(*)
        FROM spelling_seed_preimage_items item
        WHERE item.preimage_id = archive.preimage_id
      )) AS item_count_mismatches,
    (SELECT COUNT(*)
      FROM spelling_seed_preimages archive
      WHERE archive.achievement_count <> (
        SELECT COUNT(*)
        FROM spelling_seed_preimage_achievements achievement
        WHERE achievement.preimage_id = archive.preimage_id
      )) AS achievement_count_mismatches,
    (SELECT COUNT(*)
      FROM spelling_seed_preimage_items item
      LEFT JOIN spelling_seed_preimages archive
        ON archive.preimage_id = item.preimage_id
      WHERE archive.preimage_id IS NULL) AS orphan_items,
    (SELECT COUNT(*)
      FROM spelling_seed_preimage_achievements achievement
      LEFT JOIN spelling_seed_preimages archive
        ON archive.preimage_id = achievement.preimage_id
      WHERE archive.preimage_id IS NULL) AS orphan_achievements
)
SELECT
  json_extract(check_row.value, '$[0]') AS check_name,
  json_extract(check_row.value, '$[1]') AS expected,
  json_extract(check_row.value, '$[2]') AS actual,
  json_extract(check_row.value, '$[1]')
    = json_extract(check_row.value, '$[2]') AS ok
FROM checks,
     json_each(json_array(
       json_array('metadata table', 1, metadata_table),
       json_array('item table', 1, item_table),
       json_array('achievement table', 1, achievement_table),
       json_array('lookup index', 1, lookup_index),
       json_array('metadata columns', 14, metadata_columns),
       json_array('item columns', 7, item_columns),
       json_array('item primary key', 'preimage_id,slug', item_primary_key),
       json_array('achievement columns', 5, achievement_columns),
       json_array(
         'achievement primary key',
         'preimage_id,achievement_id',
         achievement_primary_key
       ),
       json_array('metadata idempotency key', 1, metadata_idempotency_key),
       json_array('item archive foreign key', 1, item_archive_foreign_key),
       json_array(
         'achievement archive foreign key',
         1,
         achievement_archive_foreign_key
       ),
       json_array('item count integrity', 0, item_count_mismatches),
       json_array('achievement count integrity', 0, achievement_count_mismatches),
       json_array('orphan archive items', 0, orphan_items),
       json_array('orphan archive achievements', 0, orphan_achievements)
     )) AS check_row
ORDER BY check_name;
