import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  buildEvidenceSummary,
  classifyTier,
} from '../scripts/generate-evidence-summary.mjs';
import { EVIDENCE_SCHEMA_VERSION } from '../scripts/lib/capacity-evidence.mjs';
import {
  EVIDENCE_STATES,
  buildEvidencePanelModel,
  classifyEvidenceMetric,
} from '../src/platform/hubs/admin-production-evidence.js';

test('generate-evidence-summary emits schema 3 with the expected source manifest', () => {
  const root = join(import.meta.url.startsWith('file://')
    ? new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/i, '$1')
    : process.cwd());
  const outputPath = join(root, 'reports', 'capacity', 'latest-evidence-summary.json');

  execSync('node scripts/generate-evidence-summary.mjs', {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 10_000,
  });

  const summary = JSON.parse(readFileSync(outputPath, 'utf8'));
  assert.equal(summary.schema, EVIDENCE_SCHEMA_VERSION);
  assert.ok(summary.sources && typeof summary.sources === 'object');
  assert.ok(summary.metrics && typeof summary.metrics === 'object');

  for (const key of [
    'capacity_evidence',
    'admin_smoke',
    'bootstrap_smoke',
    'csp_status',
    'd1_migrations',
    'build_version',
    'kpi_reconcile',
  ]) {
    assert.ok(key in summary.sources, `sources must contain ${key}`);
    assert.equal(typeof summary.sources[key].found, 'boolean');
    assert.equal(typeof summary.sources[key].file, 'string');
  }
});

test('buildEvidencePanelModel consumes schema 3 sources while retaining schema 2 compatibility', () => {
  const now = 1_700_000_000_000;
  const fresh = new Date(now - 60_000).toISOString();

  const schema3 = {
    schema: 3,
    generatedAt: fresh,
    sources: {
      capacity_evidence: { file: 'reports/capacity/evidence/', found: true },
      admin_smoke: { file: 'reports/admin-smoke/latest.json', found: false },
    },
    metrics: {
      certified_30_learner_beta: {
        tier: 'certified_30_learner_beta',
        ok: true,
        certifying: true,
        failures: [],
        finishedAt: fresh,
        commit: 'abc1234',
      },
    },
  };
  const schema3Model = buildEvidencePanelModel(schema3, now);
  assert.equal(schema3Model.overallState, EVIDENCE_STATES.CERTIFIED_30);
  assert.equal(schema3Model.sources.capacity_evidence.found, true);
  assert.equal(schema3Model.sources.admin_smoke.found, false);

  const schema2 = {
    schema: 2,
    generatedAt: fresh,
    metrics: {
      smoke_pass: {
        tier: 'smoke_pass',
        ok: true,
        failures: [],
        finishedAt: fresh,
      },
    },
  };
  const schema2Model = buildEvidencePanelModel(schema2, now);
  assert.equal(schema2Model.overallState, EVIDENCE_STATES.SMOKE_PASS);
  assert.equal(schema2Model.sources, null);
});

test('classifyEvidenceMetric recognises schema 3 smoke source keys', () => {
  const now = 1_700_000_000_000;
  const fresh = new Date(now - 60_000).toISOString();

  assert.equal(
    classifyEvidenceMetric('admin_smoke', { ok: true, failures: [], finishedAt: fresh }, fresh, now),
    EVIDENCE_STATES.SMOKE_PASS,
  );
  assert.equal(
    classifyEvidenceMetric('bootstrap_smoke', { ok: true, failures: [], finishedAt: fresh }, fresh, now),
    EVIDENCE_STATES.SMOKE_PASS,
  );
  assert.equal(
    classifyEvidenceMetric('admin_smoke', { ok: false, failures: ['timeout'], finishedAt: fresh }, fresh, now),
    EVIDENCE_STATES.FAILING,
  );
  assert.equal(classifyEvidenceMetric('bootstrap_smoke', null, fresh, now), EVIDENCE_STATES.NOT_AVAILABLE);
});

test('schema 3 missing and malformed sources fail closed without crashing the panel model', () => {
  const now = 1_700_000_000_000;
  const fresh = new Date(now - 60_000).toISOString();
  const summary = {
    schema: 3,
    generatedAt: fresh,
    sources: {
      admin_smoke: { file: 'reports/admin-smoke/latest.json', found: false },
    },
    metrics: {},
  };
  const model = buildEvidencePanelModel(summary, now);
  // U1 (P7): missing sources now produce explicit NOT_AVAILABLE rows.
  const adminSmokeRow = model.metrics.find((metric) => metric.key === 'admin_smoke');
  assert.ok(adminSmokeRow, 'missing source emits a NOT_AVAILABLE row');
  assert.equal(adminSmokeRow.state, EVIDENCE_STATES.NOT_AVAILABLE);
  assert.equal(adminSmokeRow.failureReason, 'source-not-found');
  assert.equal(model.sources.admin_smoke.found, false);
  assert.equal(classifyEvidenceMetric('admin_smoke', undefined, fresh, now), EVIDENCE_STATES.NOT_AVAILABLE);
  assert.equal(classifyEvidenceMetric('kpi_reconcile', 'broken', fresh, now), EVIDENCE_STATES.NOT_AVAILABLE);
  assert.equal(classifyEvidenceMetric('csp_status', 42, fresh, now), EVIDENCE_STATES.NOT_AVAILABLE);
});

test('schema 3 mixed source overall state prioritises capacity truth over auxiliary smoke', () => {
  const now = 1_700_000_000_000;
  const fresh = new Date(now - 60_000).toISOString();
  const certified = buildEvidencePanelModel({
    schema: 3,
    generatedAt: fresh,
    sources: {},
    metrics: {
      certified_30_learner_beta: {
        tier: 'certified_30_learner_beta',
        ok: true,
        certifying: true,
        failures: [],
        finishedAt: fresh,
      },
      admin_smoke: { tier: 'admin_smoke', ok: true, failures: [], finishedAt: fresh },
    },
  }, now);
  assert.equal(certified.overallState, EVIDENCE_STATES.CERTIFIED_30);

  const smokeOnly = buildEvidencePanelModel({
    schema: 3,
    generatedAt: fresh,
    sources: {},
    metrics: {
      admin_smoke: { tier: 'admin_smoke', ok: true, failures: [], finishedAt: fresh },
    },
  }, now);
  assert.equal(smokeOnly.isFresh, false);
  assert.equal(smokeOnly.latestEvidenceAt, null);
  assert.equal(smokeOnly.overallState, EVIDENCE_STATES.NOT_AVAILABLE);
});

test('schema 3 auxiliary source timestamps cannot refresh stale capacity evidence', () => {
  const now = 1_700_000_000_000;
  const fresh = new Date(now - 60_000).toISOString();
  const stale = new Date(now - (25 * 60 * 60 * 1000)).toISOString();
  const model = buildEvidencePanelModel({
    schema: 3,
    generatedAt: fresh,
    sources: {},
    metrics: {
      certified_30_learner_beta: {
        tier: 'certified_30_learner_beta',
        ok: true,
        certifying: true,
        failures: [],
        finishedAt: stale,
      },
      admin_smoke: { tier: 'admin_smoke', ok: true, failures: [], finishedAt: fresh },
      build_version: { tier: 'build_version', ok: true, failures: [], finishedAt: fresh },
    },
  }, now);

  assert.equal(model.latestEvidenceAt, stale);
  assert.equal(model.isFresh, false);
  assert.equal(model.overallState, EVIDENCE_STATES.STALE);
});

test('classifyTier prefers declared tier metadata over filename fallback', () => {
  assert.equal(
    classifyTier('operator-note.json', { tier: { tier: '30-learner-beta-certified' } }),
    'certified_30_learner_beta',
  );
  // U1 (P7): preflight files ALWAYS classify as preflight_only regardless of
  // filename-embedded tier hints — prevents accidental displacement of real
  // certification evidence.
  assert.equal(
    classifyTier('60-learner-stretch-preflight-20260428.json', {}),
    'preflight_only',
  );
});

test('buildEvidenceSummary reports P5 30-learner beta-v2 threshold failure as failed and non-certifying', () => {
  const summary = buildEvidenceSummary([
    {
      name: '30-learner-beta-v2-20260428-p5-warm.json',
      data: {
        ok: false,
        dryRun: false,
        reportMeta: {
          commit: '1c56e069c4bd95828328410bec3fef81564677ca',
          learners: 30,
          bootstrapBurst: 20,
          rounds: 1,
          finishedAt: '2026-04-28T21:33:08.171Z',
          evidenceSchemaVersion: 2,
        },
        summary: {
          endpoints: {
            'GET /api/bootstrap': { p95WallMs: 1167.4 },
          },
        },
        thresholds: {
          maxBootstrapP95Ms: {
            configured: 1000,
            observed: 1167.4,
            passed: false,
          },
          violations: [
            {
              threshold: 'max-bootstrap-p95-ms',
              limit: 1000,
              observed: 1167.4,
              message: 'Bootstrap P95 wall time 1167.4 ms exceeds 1000 ms.',
            },
          ],
        },
        failures: ['maxBootstrapP95Ms'],
        tier: { tier: '30-learner-beta-certified' },
      },
    },
  ], { generatedAt: '2026-04-28T22:00:00.000Z' });

  const metric = summary.metrics.certified_30_learner_beta;
  assert.equal(metric.status, 'failed');
  assert.equal(metric.certifying, false);
  assert.equal(metric.ok, false);
  assert.equal(metric.thresholdsPassed, false);
  assert.equal(metric.failureReason, 'threshold-violations');
  assert.equal(metric.learners, 30);
  assert.equal(metric.fileName, '30-learner-beta-v2-20260428-p5-warm.json');
  assert.deepEqual(metric.thresholdViolations, [
    {
      threshold: 'max-bootstrap-p95-ms',
      limit: 1000,
      observed: 1167.4,
      message: 'Bootstrap P95 wall time 1167.4 ms exceeds 1000 ms.',
    },
  ]);
});

test('buildEvidenceSummary reports 60-learner preflight setup blocker as non-certifying', () => {
  const summary = buildEvidenceSummary([
    {
      name: '60-learner-stretch-preflight-20260428-p5.json',
      data: {
        ok: false,
        decision: 'invalid-with-named-setup-blocker',
        rootCause: 'session-manifest-preparation-rate-limited',
        metrics: null,
        reportMeta: {
          commit: '0f744c3',
          date: '2026-04-28',
          phase: 'P5',
          evidenceSchemaVersion: 2,
        },
      },
    },
  ], { generatedAt: '2026-04-28T22:00:00.000Z' });

  // U1 (P7): preflight filenames always classify under preflight_only tier
  const metric = summary.metrics.preflight_only;
  assert.equal(metric.status, 'non_certifying');
  assert.equal(metric.certifying, false);
  assert.equal(metric.evidenceKind, 'preflight');
  assert.equal(metric.decision, 'invalid-with-named-setup-blocker');
  assert.equal(metric.failureReason, 'session-manifest-preparation-rate-limited');
  assert.equal(metric.learners, 60);
  assert.equal(metric.thresholdsPassed, null);
});

test('buildEvidenceSummary reports preflight that reaches load but violates thresholds as failed', () => {
  const summary = buildEvidenceSummary([
    {
      name: '60-learner-stretch-preflight-20260428-p6.json',
      data: {
        ok: false,
        reportMeta: {
          commit: 'abc123',
          learners: 60,
          bootstrapBurst: 20,
          rounds: 1,
          finishedAt: '2026-04-28T23:38:26.815Z',
          evidenceSchemaVersion: EVIDENCE_SCHEMA_VERSION,
        },
        diagnostics: {
          classification: {
            certificationEligible: false,
            kind: 'diagnostic',
            reasons: ['session-manifest-requires-equivalence-record', 'threshold-violations'],
          },
        },
        thresholds: {
          violations: [
            {
              threshold: 'max-bootstrap-p95-ms',
              limit: 750,
              observed: 854,
              message: 'Bootstrap P95 wall time 854 ms exceeds 750 ms.',
            },
          ],
        },
        failures: ['maxBootstrapP95Ms'],
        tier: { tier: '60-learner-stretch-certified' },
      },
    },
  ], { generatedAt: '2026-04-28T23:40:00.000Z' });

  // U1 (P7): preflight filenames classify under preflight_only tier.
  // Threshold violations still cause 'failed' status (checked before
  // evidenceKind in deriveStatus).
  const metric = summary.metrics.preflight_only;
  assert.equal(metric.status, 'failed');
  assert.equal(metric.certifying, false);
  assert.equal(metric.evidenceKind, 'preflight');
  assert.equal(metric.failureReason, 'threshold-violations');
  assert.equal(metric.thresholdsPassed, false);
});

test('buildEvidenceSummary fails closed for filename-only passed certification evidence', () => {
  const summary = buildEvidenceSummary([
    {
      name: '30-learner-beta-v2-20260428-p6-strict.json',
      data: {
        ok: true,
        dryRun: false,
        reportMeta: {
          commit: 'abc123',
          learners: 30,
          bootstrapBurst: 20,
          rounds: 1,
          finishedAt: '2026-04-28T23:00:00.000Z',
          evidenceSchemaVersion: EVIDENCE_SCHEMA_VERSION,
        },
        summary: {
          endpoints: {
            'GET /api/bootstrap': { p95WallMs: 900 },
          },
        },
        thresholds: { violations: [] },
        failures: [],
      },
    },
  ], { generatedAt: '2026-04-28T23:05:00.000Z' });

  const metric = summary.metrics.certified_30_learner_beta;
  assert.equal(metric.status, 'non_certifying');
  assert.equal(metric.certifying, false);
  assert.equal(metric.sourceTier, 'certified_30_learner_beta');
  assert.equal(metric.failureReason, 'missing-certification-diagnostics');
  assert.equal(metric.certificationEligible, false);
  assert.deepEqual(metric.certificationReasons, [
    'missing-certification-diagnostics',
    'evidence-not-in-verified-capacity-table',
  ]);
  assert.equal(metric.thresholdsPassed, null);
});

test('buildEvidenceSummary refuses diagnostics-approved evidence until the capacity table verifier also approves it', () => {
  const summary = buildEvidenceSummary([
    {
      name: '30-learner-beta-v2-20260428-p6-strict.json',
      data: {
        ok: true,
        dryRun: false,
        reportMeta: {
          commit: 'abc123',
          origin: 'https://ks2.eugnel.uk',
          learners: 30,
          bootstrapBurst: 20,
          rounds: 1,
          finishedAt: '2026-04-28T23:00:00.000Z',
          evidenceSchemaVersion: EVIDENCE_SCHEMA_VERSION,
        },
        diagnostics: {
          classification: {
            certificationEligible: true,
            kind: 'certification-candidate',
            reasons: [],
          },
        },
        thresholds: { violations: [] },
        failures: [],
        tier: { tier: '30-learner-beta-certified' },
      },
    },
  ], { generatedAt: '2026-04-28T23:05:00.000Z' });

  const metric = summary.metrics.certified_30_learner_beta;
  assert.equal(metric.status, 'non_certifying');
  assert.equal(metric.certifying, false);
  assert.equal(metric.certificationEligible, false);
  assert.deepEqual(metric.certificationReasons, ['evidence-not-in-verified-capacity-table']);
  assert.equal(metric.failureReason, 'evidence-not-in-verified-capacity-table');
  assert.equal(metric.thresholdsPassed, null);
});

test('buildEvidenceSummary certifies only diagnostics-approved production gate evidence verified by the capacity table', () => {
  const fileName = '30-learner-beta-v2-20260428-p6-strict.json';
  const summary = buildEvidenceSummary([
    {
      name: fileName,
      data: {
        ok: true,
        dryRun: false,
        reportMeta: {
          commit: 'abc123',
          origin: 'https://ks2.eugnel.uk',
          learners: 30,
          bootstrapBurst: 20,
          rounds: 1,
          finishedAt: '2026-04-28T23:00:00.000Z',
          evidenceSchemaVersion: EVIDENCE_SCHEMA_VERSION,
        },
        diagnostics: {
          classification: {
            certificationEligible: true,
            kind: 'certification-candidate',
            reasons: [],
          },
        },
        thresholds: { violations: [] },
        failures: [],
        tier: { tier: '30-learner-beta-certified' },
      },
    },
  ], {
    generatedAt: '2026-04-28T23:05:00.000Z',
    verifiedCertificationEvidence: new Map([
      [fileName, { decision: '30-learner-beta-certified' }],
    ]),
  });

  const metric = summary.metrics.certified_30_learner_beta;
  assert.equal(metric.status, 'passed');
  assert.equal(metric.certifying, true);
  assert.equal(metric.certificationEligible, true);
  assert.deepEqual(metric.certificationReasons, []);
  assert.equal(metric.thresholdsPassed, true);
});

test('buildEvidenceSummary keeps diagnostics-only certification-shaped runs non-certifying', () => {
  const cases = [
    ['off-origin', 'origin-preview'],
    ['manifest', 'session-manifest-requires-equivalence-record'],
    ['shared-auth', 'session-source-not-isolated-demo'],
    ['wrong-shape', 'non-p6-30-learner-gate-shape'],
  ];

  for (const [label, reason] of cases) {
    const summary = buildEvidenceSummary([
      {
        name: `30-learner-beta-v2-20260428-p6-${label}.json`,
        data: {
          ok: true,
          dryRun: false,
          reportMeta: {
            commit: 'abc123',
            origin: label === 'off-origin' ? 'https://preview.example.test' : 'https://ks2.eugnel.uk',
            learners: label === 'wrong-shape' ? 20 : 30,
            bootstrapBurst: label === 'wrong-shape' ? 10 : 20,
            rounds: 1,
            finishedAt: '2026-04-28T23:00:00.000Z',
            evidenceSchemaVersion: EVIDENCE_SCHEMA_VERSION,
          },
          diagnostics: {
            classification: {
              certificationEligible: false,
              kind: 'diagnostic',
              reasons: [reason],
            },
          },
          thresholds: { violations: [] },
          failures: [],
          tier: { tier: '30-learner-beta-certified' },
        },
      },
    ], { generatedAt: '2026-04-28T23:05:00.000Z' });

    const metric = summary.metrics.certified_30_learner_beta;
    assert.equal(metric.status, 'non_certifying', label);
    assert.equal(metric.certifying, false, label);
    assert.equal(metric.failureReason, `not-certification-eligible: ${reason}`, label);
    assert.deepEqual(metric.certificationReasons, [reason, 'evidence-not-in-verified-capacity-table'], label);
  }
});

test('buildEvidenceSummary keeps the latest same-day phase evidence per tier', () => {
  const summary = buildEvidenceSummary([
    {
      name: '60-learner-stretch-preflight-20260428.json',
      data: {
        ok: false,
        decision: 'fail',
        rootCause: 'demo-session-create-ip-rate-limit',
        shape: { learners: 60 },
        reportMeta: { abortedAt: '2026-04-28T10:05:00.000Z' },
      },
    },
    {
      name: '60-learner-stretch-preflight-20260428-p5.json',
      data: {
        ok: false,
        decision: 'invalid-with-named-setup-blocker',
        rootCause: 'session-manifest-preparation-rate-limited',
        metrics: null,
        shape: { learners: 60 },
        reportMeta: {
          date: '2026-04-28',
          phase: 'P5',
        },
      },
    },
  ], { generatedAt: '2026-04-28T22:00:00.000Z' });

  // U1 (P7): preflight filenames classify under preflight_only tier;
  // the P5 file wins as newer (higher phaseRank).
  const metric = summary.metrics.preflight_only;
  assert.equal(metric.fileName, '60-learner-stretch-preflight-20260428-p5.json');
  assert.equal(metric.failureReason, 'session-manifest-preparation-rate-limited');
});
