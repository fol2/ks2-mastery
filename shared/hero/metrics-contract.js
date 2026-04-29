// ── Hero Metrics Contract — shared pure module ───────────────────
// Zero side-effects. No imports from worker/, src/, react, or node: built-ins.
// Canonical metric names, dimensions, and privacy rules for Hero Mode P6.

import {
  PRIVACY_FORBIDDEN_FIELDS,
  validateMetricPrivacyRecursive,
} from './metrics-privacy.js';

// ── Learning Health Metrics ──────────────────────────────────────

export const HERO_LEARNING_HEALTH_METRICS = Object.freeze([
  'hero_learning_independent_first_attempt_rate',
  'hero_learning_support_before_answer_rate',
  'hero_learning_task_completion_rate',
  'hero_learning_task_abandon_rate',
  'hero_learning_retention_after_secure_pass_rate',
  'hero_learning_recent_lapse_repair_rate',
  'hero_learning_due_debt_delta',
  'hero_learning_weak_item_recovery_days',
  'hero_learning_post_mega_lapse_rate',
  'hero_learning_subject_mix_share',
  'hero_learning_subject_easy_preference_score',
  'hero_learning_mastery_inflation_flag',
]);

// ── Engagement Metrics ───────────────────────────────────────────

export const HERO_ENGAGEMENT_METRICS = Object.freeze([
  'hero_engagement_card_rendered',
  'hero_engagement_quest_started',
  'hero_engagement_first_task_started',
  'hero_engagement_task_completed',
  'hero_engagement_daily_completed',
  'hero_engagement_return_next_day',
  'hero_engagement_return_next_7_days',
  'hero_engagement_extra_practice_after_daily_complete',
  'hero_engagement_dropoff_after_task_index',
  'hero_engagement_subject_continue_from_hero',
]);

// ── Economy & Camp Metrics ───────────────────────────────────────

export const HERO_ECONOMY_CAMP_METRICS = Object.freeze([
  'hero_economy_daily_coins_awarded',
  'hero_economy_duplicate_award_prevented',
  'hero_economy_balance_after_award',
  'hero_economy_balance_bucket',
  'hero_economy_ledger_entry_count',
  'hero_camp_opened',
  'hero_camp_first_invite',
  'hero_camp_monster_invited',
  'hero_camp_monster_grown',
  'hero_camp_insufficient_coins',
  'hero_camp_duplicate_spend_prevented',
  'hero_camp_stale_write',
  'hero_camp_idempotency_reuse',
  'hero_camp_balance_after_spend',
  'hero_camp_monster_distribution',
  'hero_camp_fully_grown_count',
  'hero_camp_hoarding_score',
  'hero_camp_rapid_spend_flag',
]);

// ── Technical Safety Metrics ─────────────────────────────────────

export const HERO_TECHNICAL_SAFETY_METRICS = Object.freeze([
  'hero_tech_read_model_latency_ms',
  'hero_tech_read_model_size_bytes',
  'hero_tech_command_latency_ms',
  'hero_tech_state_size_bytes',
  'hero_tech_corrupt_state_repaired',
  'hero_tech_state_migration_applied',
  'hero_tech_asset_load_error',
  'hero_tech_event_log_mirror_failed',
  'hero_tech_revision_stale_write',
  'hero_tech_retry_after_stale_write',
  'hero_tech_two_tab_conflict',
  'hero_tech_flag_misconfiguration',
]);

// ── All Metrics Combined ─────────────────────────────────────────

export const ALL_HERO_METRICS = Object.freeze([
  ...HERO_LEARNING_HEALTH_METRICS,
  ...HERO_ENGAGEMENT_METRICS,
  ...HERO_ECONOMY_CAMP_METRICS,
  ...HERO_TECHNICAL_SAFETY_METRICS,
]);

// ── Dimension Set ────────────────────────────────────────────────

export const HERO_METRIC_DIMENSIONS = Object.freeze([
  'learnerIdHash', 'cohortId', 'subjectId', 'dateKey',
  'heroTaskIntent', 'launcher', 'eligibleSubjectCount',
  'postMegaFlag', 'readySubjectSet',
]);

// ── Privacy Rules ────────────────────────────────────────────────

/** @deprecated Use PRIVACY_FORBIDDEN_FIELDS from metrics-privacy.js directly */
export const FORBIDDEN_FIELDS = PRIVACY_FORBIDDEN_FIELDS;

/**
 * Validates that a metric event payload does not contain PII/child-content fields
 * at any nesting depth. Reports violations with dotted path notation.
 * @param {Record<string, unknown>} eventPayload
 * @returns {{ valid: boolean, violations: string[] }}
 */
export function validateMetricPrivacy(eventPayload) {
  return validateMetricPrivacyRecursive(eventPayload);
}
