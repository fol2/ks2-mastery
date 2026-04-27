import test from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import path from 'node:path';

import {
  SPELLING_AUDIO_MODEL,
  buildAudioAssetKey,
} from '../shared/spelling-audio.js';
import { WORDS } from '../src/subjects/spelling/data/word-data.js';
import {
  buildPrecacheEntries,
  commandPrecache,
  commandStatus,
  parsePrecacheArgs,
  selectLanes,
  selectSpeeds,
  statePathFor,
} from '../scripts/precache-spelling-audio.mjs';

const abscess = WORDS.find((word) => word.slug === 'abscess');

test('parsePrecacheArgs supports all-in-one lane, slug, voice, speed, and env-file flags', () => {
  const parsed = parsePrecacheArgs([
    'generate',
    '--lane',
    'word,sentence',
    '--slug',
    'abscess,science',
    '--voice',
    'Iapetus',
    '--speed',
    'standard',
    '--env-file',
    '.env.local',
    '--no-variants',
  ]);
  assert.equal(parsed.command, 'generate');
  assert.deepEqual(parsed.flags.slug, ['abscess', 'science']);
  assert.equal(parsed.flags.voice, 'Iapetus');
  assert.equal(parsed.flags.speed, 'standard');
  assert.equal(parsed.flags.envFile, '.env.local');
  assert.equal(parsed.flags.includeVariants, false);
});

test('selectLanes and selectSpeeds reject unknown values clearly', () => {
  assert.deepEqual(selectLanes('all'), ['word', 'sentence']);
  assert.deepEqual(selectLanes('sentence,word'), ['sentence', 'word']);
  assert.throws(() => selectLanes('image'), /Unknown audio lane/);

  assert.deepEqual(selectSpeeds('standard'), [{ id: 'standard', slow: false }]);
  assert.throws(() => selectSpeeds('turbo'), /Unknown buffered speed/);
});

test('buildPrecacheEntries plans word plus base and variant sentence entries for Extra words', async () => {
  assert.ok(abscess, 'abscess fixture should exist in the Extra spelling pool');
  const entries = await buildPrecacheEntries({
    lanes: ['word', 'sentence'],
    words: [abscess],
    voices: ['Iapetus'],
    speeds: [{ id: 'standard', slow: false }],
  });

  assert.equal(entries.length, 4);
  assert.equal(entries.filter((entry) => entry.kind === 'word').length, 1);
  assert.equal(entries.filter((entry) => entry.kind === 'sentence').length, 3);

  const sentenceEntry = entries.find((entry) => entry.kind === 'sentence' && entry.word === 'abscesses');
  assert.ok(sentenceEntry);
  assert.equal(sentenceEntry.sentenceIndex, 0);
  assert.match(sentenceEntry.promptText, /Generate speech only/);
  assert.equal(sentenceEntry.key, buildAudioAssetKey({
    model: SPELLING_AUDIO_MODEL,
    voice: 'Iapetus',
    speed: 'standard',
    contentKey: sentenceEntry.contentKey,
    slug: 'abscess',
    sentenceIndex: 0,
  }));
});

test('commandPrecache dry-run writes a resumable all-in-one state file', async (t) => {
  const result = await commandPrecache({
    flags: {
      lane: 'all',
      slug: ['abscess'],
      voice: 'Iapetus',
      speed: 'standard',
      dryRun: true,
    },
  });
  t.after(async () => rm(path.dirname(result.statePath), { recursive: true, force: true }));

  assert.equal(result.summary.planned, 4);
  assert.equal(result.summary.pending, 4);
  assert.equal(result.summary.uploaded, 0);
  assert.match(result.statePath, /\.spelling-audio[/\\]precache-runs[/\\].+[/\\]state\.json$/);
});

test('commandPrecache simulated generate uploads word and sentence entries together', async (t) => {
  const result = await commandPrecache({
    flags: {
      lane: 'all',
      slug: ['abscess'],
      voice: 'Iapetus',
      speed: 'standard',
      concurrency: 2,
      maxRetries: 0,
    },
    env: { GEMINI_API_KEY: 'stub-key' },
    dependencies: {
      callGemini: async () => ({
        data: Buffer.from('fake-pcm-data').toString('base64'),
        mimeType: 'audio/L16;rate=24000',
      }),
      upload: async () => {},
      transcode: async () => {},
      writeWav: async () => {},
      processSignals: { on() {}, removeListener() {}, exit() {} },
    },
  });
  t.after(async () => rm(path.dirname(result.statePath), { recursive: true, force: true }));

  assert.equal(result.summary.planned, 4);
  assert.equal(result.summary.uploaded, 4);
  assert.equal(result.summary.failed, 0);

  const status = await commandStatus({ runId: result.runId });
  assert.equal(status.summary.uploaded, 4);
  assert.deepEqual(status.failures, []);
});

test('commandPrecache retries transient Gemini 5xx for all-in-one runs', async (t) => {
  let geminiCalls = 0;
  const result = await commandPrecache({
    flags: {
      lane: 'word',
      slug: ['abscess'],
      voice: 'Iapetus',
      concurrency: 1,
      maxRetries: 2,
    },
    env: { GEMINI_API_KEY: 'stub-key' },
    dependencies: {
      callGemini: async () => {
        geminiCalls += 1;
        if (geminiCalls === 1) {
          const error = new Error('Gemini TTS direct call failed: 500 INTERNAL');
          error.status = 500;
          throw error;
        }
        return {
          data: Buffer.from('fake-pcm-data').toString('base64'),
          mimeType: 'audio/L16;rate=24000',
        };
      },
      upload: async () => {},
      transcode: async () => {},
      writeWav: async () => {},
      processSignals: { on() {}, removeListener() {}, exit() {} },
    },
  });
  t.after(async () => rm(path.dirname(result.statePath), { recursive: true, force: true }));

  assert.equal(geminiCalls, 2);
  assert.equal(result.summary.uploaded, 1);
  assert.equal(result.entries[0].attempts, 2);
});

test('commandPrecache falls back to a simpler sentence prompt after transient retries are spent', async (t) => {
  const prompts = [];
  const result = await commandPrecache({
    flags: {
      lane: 'sentence',
      slug: ['abscess'],
      voice: 'Iapetus',
      speed: 'standard',
      includeVariants: false,
      concurrency: 1,
      maxRetries: 0,
    },
    env: { GEMINI_API_KEY: 'stub-key' },
    dependencies: {
      callGemini: async ({ promptText }) => {
        prompts.push(promptText);
        if (/Generate speech only/.test(promptText)) {
          const error = new Error('Gemini TTS direct call failed: 500 INTERNAL');
          error.status = 500;
          throw error;
        }
        return {
          data: Buffer.from('fake-pcm-data').toString('base64'),
          mimeType: 'audio/L16;rate=24000',
        };
      },
      upload: async () => {},
      transcode: async () => {},
      writeWav: async () => {},
      processSignals: { on() {}, removeListener() {}, exit() {} },
    },
  });
  t.after(async () => rm(path.dirname(result.statePath), { recursive: true, force: true }));

  assert.equal(prompts.length, 2);
  assert.match(prompts[0], /Generate speech only/);
  assert.match(prompts[1], /Read exactly this KS2 spelling dictation/);
  assert.equal(result.summary.uploaded, 1);
  assert.equal(result.entries[0].promptMode, 'fallback-simple');
});

test('statePathFor uses the .spelling-audio/precache-runs layout', () => {
  assert.match(statePathFor('fixture'), /\.spelling-audio[/\\]precache-runs[/\\]fixture[/\\]state\.json$/);
});
