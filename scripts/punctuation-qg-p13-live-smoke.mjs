#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  assertNoForbiddenPunctuationAdultEvidenceKeys,
  assertNoForbiddenPunctuationReadModelKeys,
  assertPunctuationP2RuntimeStats,
  punctuationAnswerFor,
  punctuationSourceFor,
  smokeSpelling,
} from './punctuation-production-smoke.mjs';
import {
  assertOkResponse,
  configuredOrigin,
  createDemoSession,
  getJson,
  loadBootstrap,
  subjectCommand,
} from './lib/production-smoke.mjs';
import {
  expectedPunctuationQGP13LiveManifest,
  PUNCTUATION_QG_P13_LIVE_PHASE,
} from './validate-punctuation-qg-p13-live-evidence.mjs';

function argValue(argv, ...names) {
  for (const name of names) {
    const index = argv.indexOf(name);
    if (index !== -1 && index + 1 < argv.length) return argv[index + 1];
  }
  return '';
}

export function parseArgs(argv) {
  return {
    origin: configuredOrigin(),
    environment: argValue(argv, '--env') || 'production',
    commitSha: argValue(argv, '--commit-sha') || process.env.GITHUB_SHA || process.env.WORKER_COMMIT_SHA || process.env.CF_PAGES_COMMIT_SHA || '',
    workerVersionId: argValue(argv, '--worker-version-id') || process.env.WORKER_VERSION_ID || '',
    deploymentId: argValue(argv, '--deployment-id') || process.env.CLOUDFLARE_DEPLOYMENT_ID || process.env.DEPLOYMENT_ID || '',
    out: argValue(argv, '--out') || '',
    json: argv.includes('--json') || Boolean(argValue(argv, '--out')),
    adminHubCoverage: argv.includes('--admin-hub'),
  };
}

export function assertSupportedP13LiveSmokeOptions({ adminHubCoverage = false } = {}) {
  if (adminHubCoverage) {
    throw new Error('P13 live smoke cannot claim Admin Hub coverage because this smoke uses a demo session and does not fetch Admin Hub evidence.');
  }
}

function itemRecord(readItem) {
  return {
    itemId: readItem?.id || '',
    source: readItem?.source || '',
    mode: readItem?.mode || '',
    skillIds: Array.isArray(readItem?.skillIds) ? readItem.skillIds : [],
  };
}

function immediateRepeatCount(items) {
  let count = 0;
  for (let index = 1; index < items.length; index += 1) {
    if (items[index].itemId === items[index - 1].itemId) count += 1;
  }
  return count;
}

async function runSmartSixSmoke({ origin, cookie, learnerId, revision }) {
  let step = await subjectCommand({
    origin,
    cookie,
    subjectId: 'punctuation',
    learnerId,
    revision,
    command: 'start-session',
    payload: { mode: 'smart', roundLength: '6' },
  });
  revision = step.revision;
  let model = step.payload.subjectReadModel;
  const observedRuntimeStats = assertPunctuationP2RuntimeStats(model, 'p13.smartSix.startModel');
  assert.equal(model?.phase, 'active-item', 'P13 Smart-six smoke did not start in active-item phase.');
  assert.equal(model?.session?.serverAuthority, 'worker', 'P13 Smart-six session was not Worker-owned.');
  assert.equal(model?.session?.length, 6, 'P13 Smart-six live smoke did not start a six-question session.');
  assertNoForbiddenPunctuationReadModelKeys(model, 'p13.smartSix.startModel');

  const surfaced = [];
  let guard = 0;
  while (guard < 30) {
    guard += 1;
    assertPunctuationP2RuntimeStats(model, `p13.smartSix.model.${guard}`);
    assertNoForbiddenPunctuationReadModelKeys(model, `p13.smartSix.model.${guard}`);

    if (model?.phase === 'summary') {
      break;
    }

    if (model?.phase === 'feedback') {
      step = await subjectCommand({
        origin,
        cookie,
        subjectId: 'punctuation',
        learnerId,
        revision,
        command: 'continue-session',
      });
      revision = step.revision;
      model = step.payload.subjectReadModel;
      continue;
    }

    assert.equal(model?.phase, 'active-item', `P13 Smart-six reached unexpected phase ${model?.phase}.`);
    const readItem = model.session?.currentItem;
    const source = punctuationSourceFor(readItem);
    assert.ok(source?.id, `P13 Smart-six source lookup failed for ${readItem?.id}`);
    surfaced.push(itemRecord(readItem));
    const answer = punctuationAnswerFor(readItem);
    step = await subjectCommand({
      origin,
      cookie,
      subjectId: 'punctuation',
      learnerId,
      revision,
      command: 'submit-answer',
      payload: {
        ...answer,
        expectedSessionId: model.session.id,
        expectedItemId: readItem.id,
        expectedAnsweredCount: Number(model.session.answeredCount) || 0,
        expectedReleaseId: model.session.releaseId,
      },
    });
    revision = step.revision;
    model = step.payload.subjectReadModel;
    assert.equal(model?.feedback?.kind, 'success', `P13 Smart-six answer was not accepted for ${readItem?.id}.`);
  }

  assert.equal(model?.phase, 'summary', 'P13 Smart-six did not reach summary.');
  assert.equal(model?.summary?.total, 6, 'P13 Smart-six summary total did not equal six.');
  assert.equal(surfaced.length, 6, 'P13 Smart-six did not surface six answerable items.');
  const uniqueItems = new Set(surfaced.map((item) => item.itemId)).size;
  assert.equal(uniqueItems, 6, 'P13 Smart-six repeated an item inside one six-question live smoke.');

  return {
    revision,
    observedRuntimeStats,
    summaryTotal: model.summary.total,
    uniqueItems,
    immediateRepeats: immediateRepeatCount(surfaced),
    generatedSeen: surfaced.filter((item) => item.source === 'generated').length,
    fixedSeen: surfaced.filter((item) => item.source === 'fixed').length,
    modes: [...new Set(surfaced.map((item) => item.mode))].sort(),
    skillIds: [...new Set(surfaced.flatMap((item) => item.skillIds))].sort(),
    items: surfaced,
  };
}

async function readParentHubPunctuationEvidence({ origin, cookie, learnerId }) {
  const result = await getJson(origin, `/api/hubs/parent?learnerId=${encodeURIComponent(learnerId)}`, { cookie });
  assertOkResponse('P13 Parent Hub Punctuation evidence', result);
  const parentHub = result.payload?.parentHub;
  assert.ok(parentHub, 'P13 Parent Hub response did not include a parentHub payload.');
  const evidence = parentHub.punctuationEvidence;
  assert.equal(evidence?.hasEvidence, true, 'P13 Parent Hub did not expose Punctuation evidence after Smart-six attempts.');
  assert.ok(
    Number(evidence?.overview?.attempts) >= 6,
    `P13 Parent Hub Punctuation evidence recorded too few attempts: ${evidence?.overview?.attempts}`,
  );
  assert.equal(
    parentHub.progressSnapshots?.some((snapshot) => snapshot?.subjectId === 'punctuation'),
    true,
    'P13 Parent Hub progress snapshots did not include Punctuation.',
  );
  assertNoForbiddenPunctuationAdultEvidenceKeys(evidence, 'parentHub.punctuationEvidence');
  assertNoForbiddenPunctuationAdultEvidenceKeys(parentHub.progressSnapshots, 'parentHub.progressSnapshots');
  assertNoForbiddenPunctuationAdultEvidenceKeys(parentHub.misconceptionPatterns, 'parentHub.misconceptionPatterns');

  return {
    hasEvidence: evidence.hasEvidence === true,
    attempts: Number(evidence.overview.attempts),
    accuracyPercent: evidence.overview.accuracyPercent,
    progressSnapshotsHasPunctuation: parentHub.progressSnapshots?.some((snapshot) => snapshot?.subjectId === 'punctuation') === true,
    redactionChecks: {
      punctuationEvidence: true,
      progressSnapshots: true,
      misconceptionPatterns: true,
    },
    sessionModes: Array.isArray(evidence.bySessionMode) ? evidence.bySessionMode.map((entry) => entry.id) : [],
  };
}

export async function runPunctuationQGP13LiveSmoke(options = {}) {
  const args = { ...parseArgs(process.argv), ...options };
  assertSupportedP13LiveSmokeOptions(args);
  const expected = expectedPunctuationQGP13LiveManifest();
  const demo = await createDemoSession(args.origin);
  const bootstrap = await loadBootstrap(args.origin, demo.cookie, { expectedSession: demo.session });
  assert.equal(
    bootstrap.payload?.subjectExposureGates?.punctuationProduction,
    true,
    'Punctuation production exposure gate is not enabled.',
  );

  const smartSix = await runSmartSixSmoke({
    origin: args.origin,
    cookie: demo.cookie,
    learnerId: bootstrap.learnerId,
    revision: bootstrap.revision,
  });
  const parentHubEvidence = await readParentHubPunctuationEvidence({
    origin: args.origin,
    cookie: demo.cookie,
    learnerId: bootstrap.learnerId,
  });
  const spelling = await smokeSpelling({
    origin: args.origin,
    cookie: demo.cookie,
    learnerId: bootstrap.learnerId,
    revision: smartSix.revision,
  });

  return {
    ok: true,
    origin: args.origin,
    accountId: demo.session.accountId,
    learnerId: bootstrap.learnerId,
    attestation: {
      environment: args.environment,
      releasePhase: PUNCTUATION_QG_P13_LIVE_PHASE,
      releaseId: expected.contentReleaseId,
      runtimeItemCount: expected.runtimeItems,
      generatedDepth: expected.productionDepth,
      workerCommitSha: args.commitSha || null,
      workerVersionId: args.workerVersionId || null,
      deploymentId: args.deploymentId || null,
      timestamp: new Date().toISOString(),
      authenticatedCoverage: true,
      adminHubCoverage: Boolean(args.adminHubCoverage),
    },
    punctuation: {
      productionObserved: {
        releaseId: smartSix.observedRuntimeStats.releaseId,
        runtimeItems: smartSix.observedRuntimeStats.runtimeItems,
        publishedRewardUnits: smartSix.observedRuntimeStats.publishedRewardUnits,
      },
      localReleaseManifestExpectation: {
        fixedItems: expected.fixedItems,
        generatedItems: expected.generatedItems,
        generatedPerFamily: expected.productionDepth,
        runtimeItems: expected.runtimeItems,
        publishedRewardUnits: expected.publishedRewardUnits,
      },
      smartSix,
      parentHubEvidence,
    },
    spelling: {
      progressTotal: spelling.progressTotal,
      hasPromptToken: spelling.hasPromptToken,
      redactionChecks: {
        rawWordHidden: true,
        rawSentenceHidden: true,
        promptTokenReturned: spelling.hasPromptToken === true,
      },
    },
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const output = await runPunctuationQGP13LiveSmoke(args);
  const json = JSON.stringify(output, null, 2);
  if (args.out) {
    mkdirSync(dirname(args.out), { recursive: true });
    writeFileSync(args.out, `${json}\n`);
  }
  if (args.json || !args.out) {
    console.log(json);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[punctuation-qg-p13-live-smoke] ${error?.stack || error?.message || error}`);
    process.exit(1);
  });
}
