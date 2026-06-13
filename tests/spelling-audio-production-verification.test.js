import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  parseArgs,
  runSpellingAudioProductionVerification,
} from '../scripts/verify-spelling-audio-production.mjs';
import {
  BUFFERED_GEMINI_VOICE_OPTIONS,
  SPELLING_AUDIO_MODEL,
} from '../shared/spelling-audio.js';

function jsonResponse(payload, init = {}) {
  const status = Number(init.status) || 200;
  const headers = Object.fromEntries(
    Object.entries({
      'content-type': 'application/json',
      ...(init.headers || {}),
    }).map(([key, value]) => [key.toLowerCase(), value]),
  );
  const bytes = init.bytes instanceof Uint8Array
    ? init.bytes
    : new TextEncoder().encode(JSON.stringify(payload));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return headers[String(name).toLowerCase()] || null;
      },
      getSetCookie() {
        const value = headers['set-cookie'];
        if (Array.isArray(value)) return value;
        return value ? [value] : [];
      },
    },
    async text() {
      return JSON.stringify(payload);
    },
    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
  };
}

function installAudioFetch() {
  const previousFetch = globalThis.fetch;
  const demoSessions = [
    { accountId: 'account-primary', learnerId: 'learner-primary', cookie: 'ks2_session=primary' },
    { accountId: 'account-a', learnerId: 'learner-a', cookie: 'ks2_session=demoA' },
    { accountId: 'account-b', learnerId: 'learner-b', cookie: 'ks2_session=demoB' },
  ];
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    calls.push({ pathname: url.pathname, body: init.body ? JSON.parse(String(init.body)) : null });
    if (url.pathname === '/api/demo/session') {
      const next = demoSessions.shift() || demoSessions[demoSessions.length - 1] || {
        accountId: 'account-a',
        learnerId: 'learner-a',
        cookie: 'ks2_session=demoA',
      };
      return jsonResponse({
        ok: true,
        session: {
          demo: true,
          accountId: next.accountId,
          learnerId: next.learnerId,
        },
      }, {
        status: 201,
        headers: { 'set-cookie': `${next.cookie}; Path=/; HttpOnly` },
      });
    }
    if (url.pathname === '/api/bootstrap') {
      const cookie = String(init.headers?.cookie || '');
      let learnerId = 'learner-primary';
      let accountId = 'account-primary';
      if (cookie.includes('demoB')) {
        learnerId = 'learner-b';
        accountId = 'account-b';
      } else if (cookie.includes('demoA')) {
        learnerId = 'learner-a';
        accountId = 'account-a';
      }
      return jsonResponse({
        ok: true,
        session: { demo: true, accountId },
        learners: {
          selectedId: learnerId,
          byId: { [learnerId]: { stateRevision: 1 } },
        },
      });
    }
    if (url.pathname === '/api/tts') {
      const body = JSON.parse(String(init.body || '{}'));
      const isDistinct = body.slug === 'thought';
      const isWord = body.wordOnly === true;
      const voice = body.bufferedGeminiVoice || BUFFERED_GEMINI_VOICE_OPTIONS[0].id;
      return jsonResponse({ ok: true }, {
        bytes: new TextEncoder().encode(isDistinct ? 'thought-bytes' : 'accident-bytes'),
        headers: {
          'x-ks2-tts-cache': 'hit',
          'x-ks2-tts-cache-source': isWord ? 'primary' : 'legacy',
          'x-ks2-tts-model': SPELLING_AUDIO_MODEL,
          'x-ks2-tts-voice': voice,
        },
      });
    }
    return jsonResponse({ ok: false, error: `unexpected ${url.pathname}` }, { status: 500 });
  };
  return {
    calls,
    restore() {
      globalThis.fetch = previousFetch;
    },
  };
}

test('parseArgs forwards smoke options and accepts output path', () => {
  const options = parseArgs([
    '--origin', 'https://repo.test',
    '--word-sample', 'accident',
    '--sentence-sample', 'accident',
    '--require-word-hit',
    '--out', 'reports/content-ops/audio.json',
    '--json',
  ]);
  assert.equal(options.origin, 'https://repo.test');
  assert.deepEqual(options.wordSample, ['accident']);
  assert.deepEqual(options.sentenceSample, ['accident']);
  assert.equal(options.requireWordHit, true);
  assert.equal(options.outPath, 'reports/content-ops/audio.json');
  assert.equal(options.json, true);
});

test('runSpellingAudioProductionVerification writes proof-ready Word Bank evidence', async () => {
  const tmp = await mkdtemp(path.join(tmpdir(), 'spelling-audio-proof-'));
  const outputPath = path.join(tmp, 'audio-proof.json');
  const installed = installAudioFetch();
  try {
    const result = await runSpellingAudioProductionVerification({
      origin: 'https://repo.test',
      wordSample: ['accident'],
      sentenceSample: ['accident'],
      requireWordHit: true,
      outPath: outputPath,
      timeoutMs: 1000,
    });
    assert.equal(result.exitCode, 0);
    assert.equal(result.evidence.productionProof.surfaces.wordBank.ok, true);
    assert.equal(result.evidence.productionProof.surfaces.wordBank.probes.word, BUFFERED_GEMINI_VOICE_OPTIONS.length);
    assert.equal(result.evidence.productionProof.surfaces.wordBank.probes.sentence, 1);
    assert.equal(result.evidence.productionProof.surfaces.wordBank.crossAccount.ok, true);
    assert.ok(installed.calls.some((call) => call.pathname === '/api/tts'));
    const written = JSON.parse(await readFile(outputPath, 'utf8'));
    assert.equal(written.proofType, 'spelling-audio-production');
    assert.equal(written.productionProof.surfaces.wordBank.evidencePath, outputPath);
  } finally {
    installed.restore();
    await rm(tmp, { recursive: true, force: true });
  }
});
