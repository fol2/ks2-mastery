-- Migration 0014: Marketing lifecycle timestamps.
-- Adds paused_at and archived_at columns to support lifecycle analytics (P7 U9).

ALTER TABLE admin_marketing_messages ADD COLUMN paused_at INTEGER;
ALTER TABLE admin_marketing_messages ADD COLUMN archived_at INTEGER;
