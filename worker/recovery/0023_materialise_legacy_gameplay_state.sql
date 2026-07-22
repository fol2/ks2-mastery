-- Emergency forward recovery for migration 0023.
--
-- Preconditions:
--   1. GAMEPLAY_MUTATIONS_PAUSED=1 is deployed and confirmed.
--   2. Admitted mutation requests have drained.
--   3. A fresh D1 backup has completed.
--
-- This materialises the CURRENT split authority back into the legacy JSON
-- documents before an old Worker is deployed. It keeps the split tables and
-- archive intact, then marks legacy JSON as authoritative. A future bounded
-- cutover must explicitly replay 0023 so writes made by the old Worker are
-- reconciled back into split state. The operation is idempotent only while the
-- write fence remains active and before the old Worker receives traffic.

-- Spelling keeps learner-wide values in spelling_learner_state and each
-- word's durable history in spelling_item_state.
INSERT INTO child_subject_state (
  learner_id,
  subject_id,
  ui_json,
  data_json,
  updated_at,
  updated_by_account_id
)
SELECT
  learner.learner_id,
  'spelling',
  learner.ui_json,
  json_set(
    CASE WHEN json_valid(learner.data_json) THEN learner.data_json ELSE '{}' END,
    '$.progress', json(COALESCE((
      SELECT json_group_object(item.slug, json(item.progress_json))
      FROM spelling_item_state AS item
      WHERE item.learner_id = learner.learner_id
        AND item.progress_json IS NOT NULL
    ), '{}')),
    '$.guardian', json(COALESCE((
      SELECT json_group_object(item.slug, json(item.guardian_json))
      FROM spelling_item_state AS item
      WHERE item.learner_id = learner.learner_id
        AND item.guardian_json IS NOT NULL
    ), '{}')),
    '$.pattern.wobbling', json(COALESCE((
      SELECT json_group_object(item.slug, json(item.pattern_json))
      FROM spelling_item_state AS item
      WHERE item.learner_id = learner.learner_id
        AND item.pattern_json IS NOT NULL
    ), '{}')),
    '$.achievements', json(COALESCE((
      SELECT json_group_object(achievement.achievement_id, json(achievement.record_json))
      FROM spelling_achievement_state AS achievement
      WHERE achievement.learner_id = learner.learner_id
    ), '{}'))
  ),
  learner.updated_at,
  learner.updated_by_account_id
FROM spelling_learner_state AS learner
WHERE 1
ON CONFLICT(learner_id, subject_id) DO UPDATE SET
  ui_json = excluded.ui_json,
  data_json = excluded.data_json,
  updated_at = excluded.updated_at,
  updated_by_account_id = excluded.updated_by_account_id;

-- Grammar's old engine read generated mastery from both data and UI. The
-- bounded engine keeps both projections identical, so restore the same map to
-- both locations and preserve every other live field.
UPDATE child_subject_state AS subject
SET data_json = json_set(
      CASE WHEN json_valid(subject.data_json) THEN subject.data_json ELSE '{}' END,
      '$.mastery.items', json(COALESCE((
        SELECT json_group_object(item.item_id, json(item.mastery_json))
        FROM grammar_item_state AS item
        WHERE item.learner_id = subject.learner_id
      ), '{}'))
    ),
    ui_json = json_set(
      CASE WHEN json_valid(subject.ui_json) THEN subject.ui_json ELSE '{}' END,
      '$.mastery.items', json(COALESCE((
        SELECT json_group_object(item.item_id, json(item.mastery_json))
        FROM grammar_item_state AS item
        WHERE item.learner_id = subject.learner_id
      ), '{}'))
    )
WHERE subject.subject_id = 'grammar';

UPDATE child_subject_state AS subject
SET data_json = json_set(
      CASE WHEN json_valid(subject.data_json) THEN subject.data_json ELSE '{}' END,
      '$.questions', json(COALESCE((
        SELECT json_group_object(item.question_id, json(item.mastery_json))
        FROM reading_question_state AS item
        WHERE item.learner_id = subject.learner_id
      ), '{}'))
    )
WHERE subject.subject_id = 'reading';

UPDATE child_subject_state AS subject
SET data_json = json_set(
      CASE WHEN json_valid(subject.data_json) THEN subject.data_json ELSE '{}' END,
      '$.progress.items', json(COALESCE((
        SELECT json_group_object(item.item_id, json(item.state_json))
        FROM punctuation_item_state AS item
        WHERE item.learner_id = subject.learner_id
      ), '{}'))
    )
WHERE subject.subject_id = 'punctuation';

-- This is the authority hand-off. Do it last, after every legacy document is
-- materialised. New Worker isolates treat any state other than `ready` as
-- legacy authority, so an accidental code roll-forward cannot serve stale
-- split rows. Positive readiness cached by existing isolates is why the
-- release fence and full drain are mandatory preconditions.
UPDATE bounded_gameplay_state_migrations
SET state = 'legacy-authoritative',
    ready_at = unixepoch() * 1000
WHERE migration_id = '0023';
