import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  HERO_LEARNING_HEALTH_METRICS,
  HERO_ENGAGEMENT_METRICS,
  HERO_ECONOMY_CAMP_METRICS,
  HERO_TECHNICAL_SAFETY_METRICS,
  ALL_HERO_METRICS,
  HERO_METRIC_DIMENSIONS,
  validateMetricPrivacy,
} from '../shared/hero/metrics-contract.js';

const METRIC_NAME_REGEX = /^hero_[a-z]+_[a-z0-9_]+$/;

describe('Hero P6 Metrics Contract', () => {
  describe('metric name format', () => {
    it('all metric names match hero_<category>_<name> format', () => {
      for (const name of ALL_HERO_METRICS) {
        assert.match(name, METRIC_NAME_REGEX, `Metric "${name}" does not match expected format`);
      }
    });
  });

  describe('category counts', () => {
    it('learning health has 12 metrics', () => {
      assert.equal(HERO_LEARNING_HEALTH_METRICS.length, 12);
    });

    it('engagement has 10 metrics', () => {
      assert.equal(HERO_ENGAGEMENT_METRICS.length, 10);
    });

    it('economy/camp has 18 metrics', () => {
      assert.equal(HERO_ECONOMY_CAMP_METRICS.length, 18);
    });

    it('technical safety has 12 metrics', () => {
      assert.equal(HERO_TECHNICAL_SAFETY_METRICS.length, 12);
    });

    it('ALL_HERO_METRICS has 52 total', () => {
      assert.equal(ALL_HERO_METRICS.length, 52);
    });
  });

  describe('uniqueness', () => {
    it('no duplicates in ALL_HERO_METRICS', () => {
      const unique = new Set(ALL_HERO_METRICS);
      assert.equal(unique.size, ALL_HERO_METRICS.length, 'Duplicate metric names found');
    });
  });

  describe('privacy validator', () => {
    it('rejects event with rawAnswer field', () => {
      const result = validateMetricPrivacy({ metricName: 'hero_tech_command_latency_ms', rawAnswer: 'cat' });
      assert.equal(result.valid, false);
      assert.ok(result.violations.includes('rawAnswer'));
    });

    it('rejects event with rawPrompt field', () => {
      const result = validateMetricPrivacy({ metricName: 'hero_engagement_quest_started', rawPrompt: 'spell cat' });
      assert.equal(result.valid, false);
      assert.ok(result.violations.includes('rawPrompt'));
    });

    it('rejects event with childFreeText field', () => {
      const result = validateMetricPrivacy({ metricName: 'hero_learning_task_completion_rate', childFreeText: 'hello' });
      assert.equal(result.valid, false);
      assert.ok(result.violations.includes('childFreeText'));
    });

    it('accepts clean event payload', () => {
      const result = validateMetricPrivacy({
        metricName: 'hero_engagement_card_rendered',
        learnerIdHash: 'abc123',
        subjectId: 'spelling',
        dateKey: '2026-04-29',
        value: 1,
      });
      assert.equal(result.valid, true);
      assert.deepEqual(result.violations, []);
    });
  });

  describe('dimensions', () => {
    it('HERO_METRIC_DIMENSIONS has 9 dimensions', () => {
      assert.equal(HERO_METRIC_DIMENSIONS.length, 9);
    });
  });
});
