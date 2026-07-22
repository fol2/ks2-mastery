-- Bootstrap reads bounded, command-produced public projections instead of
-- rebuilding every subject engine from growing source documents. Co-locating
-- the projection keeps the source write and its public view atomic without an
-- extra D1 row write. A timestamp mismatch is treated as a missing projection.
ALTER TABLE child_subject_state
ADD COLUMN public_ui_json TEXT;

ALTER TABLE child_subject_state
ADD COLUMN public_ui_updated_at INTEGER;

ALTER TABLE spelling_learner_state
ADD COLUMN public_ui_json TEXT;

ALTER TABLE spelling_learner_state
ADD COLUMN public_ui_updated_at INTEGER;
