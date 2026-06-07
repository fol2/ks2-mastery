#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  DEFAULT_PRODUCTION_ORIGIN,
  configuredTimeoutMs,
} from './lib/production-smoke.mjs';
import {
  computeWordBankPromptToken,
  lookupSeedWord,
} from './spelling-audio-production-smoke.mjs';
import {
  BUFFERED_GEMINI_VOICE_OPTIONS,
} from '../shared/spelling-audio.js';

const DEFAULT_ASSET_SAMPLES = 3;
const DEFAULT_BOOTSTRAP_SAMPLES = 5;
const DEFAULT_TTS_SAMPLES = 5;
const DEFAULT_WARMUP = 1;
const DEFAULT_WORD_SAMPLE = ['accident', 'knowledge'];
const DEFAULT_VOICES = [BUFFERED_GEMINI_VOICE_OPTIONS[0]?.id || 'Iapetus'];
const DEFAULT_COOKIE_ENV = 'KS2_PRODUCTION_COOKIE';
const TTS_MODE_WORD_LOOKUP = 'word-lookup';
const TTS_MODE_SENTENCE_CACHE = 'sentence-cache';

function readOptionValue(argv, index, optionName) {
  const value = argv[index + 1];
  if (value == null || value.startsWith('--')) throw new Error(`${optionName} requires a value.`);
  return value;
}

function splitCsv(raw) {
  return String(raw || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function nonNegativeInteger(raw, optionName) {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${optionName} must be a non-negative integer.`);
  return parsed;
}

function positiveInteger(raw, optionName) {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${optionName} must be a positive integer.`);
  return parsed;
}

function normaliseOrigin(value) {
  const raw = value || DEFAULT_PRODUCTION_ORIGIN;
  const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  return url.origin;
}

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    origin: DEFAULT_PRODUCTION_ORIGIN,
    assetSamples: DEFAULT_ASSET_SAMPLES,
    bootstrapSamples: DEFAULT_BOOTSTRAP_SAMPLES,
    ttsSamples: DEFAULT_TTS_SAMPLES,
    warmup: DEFAULT_WARMUP,
    wordSample: DEFAULT_WORD_SAMPLE.slice(),
    voices: DEFAULT_VOICES.slice(),
    assetPaths: [],
    cookieEnv: DEFAULT_COOKIE_ENV,
    learnerId: '',
    includeAssets: true,
    includeBootstrap: true,
    includeTts: true,
    includeBrowserTts: false,
    timeoutMs: 0,
    output: '',
    help: false,
  };

  const assigned = new Set();
  const assignOnce = (flag) => {
    if (assigned.has(flag)) {
      throw new Error(`${flag} specified more than once; refusing to let later value silently override the earlier one.`);
    }
    assigned.add(flag);
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--origin' || arg === '--url') {
      assignOnce('--origin');
      options.origin = readOptionValue(argv, index, arg);
      index += 1;
    } else if (arg === '--samples') {
      assignOnce(arg);
      const samples = nonNegativeInteger(readOptionValue(argv, index, arg), arg);
      options.assetSamples = samples;
      options.bootstrapSamples = samples;
      options.ttsSamples = samples;
      index += 1;
    } else if (arg === '--asset-samples') {
      assignOnce(arg);
      options.assetSamples = nonNegativeInteger(readOptionValue(argv, index, arg), arg);
      index += 1;
    } else if (arg === '--bootstrap-samples') {
      assignOnce(arg);
      options.bootstrapSamples = nonNegativeInteger(readOptionValue(argv, index, arg), arg);
      index += 1;
    } else if (arg === '--tts-samples') {
      assignOnce(arg);
      options.ttsSamples = nonNegativeInteger(readOptionValue(argv, index, arg), arg);
      index += 1;
    } else if (arg === '--warmup') {
      assignOnce(arg);
      options.warmup = nonNegativeInteger(readOptionValue(argv, index, arg), arg);
      index += 1;
    } else if (arg === '--word-sample') {
      assignOnce(arg);
      const sample = splitCsv(readOptionValue(argv, index, arg));
      if (!sample.length) throw new Error('--word-sample requires at least one slug.');
      options.wordSample = sample;
      index += 1;
    } else if (arg === '--voices') {
      assignOnce(arg);
      const voices = splitCsv(readOptionValue(argv, index, arg));
      if (!voices.length) throw new Error('--voices requires at least one voice id.');
      options.voices = voices;
      index += 1;
    } else if (arg === '--asset-path') {
      options.assetPaths.push(readOptionValue(argv, index, arg));
      index += 1;
    } else if (arg === '--cookie-env') {
      assignOnce(arg);
      options.cookieEnv = readOptionValue(argv, index, arg);
      index += 1;
    } else if (arg === '--learner-id') {
      assignOnce(arg);
      options.learnerId = readOptionValue(argv, index, arg);
      index += 1;
    } else if (arg === '--timeout-ms') {
      assignOnce(arg);
      options.timeoutMs = positiveInteger(readOptionValue(argv, index, arg), arg);
      index += 1;
    } else if (arg === '--output') {
      assignOnce(arg);
      options.output = readOptionValue(argv, index, arg);
      index += 1;
    } else if (arg === '--no-assets') {
      options.includeAssets = false;
    } else if (arg === '--no-bootstrap') {
      options.includeBootstrap = false;
    } else if (arg === '--no-tts') {
      options.includeTts = false;
    } else if (arg === '--browser-tts') {
      options.includeBrowserTts = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  options.origin = normaliseOrigin(options.origin);
  return options;
}

function requestId() {
  return `ks2_req_${randomUUID()}`;
}

function timeoutSignal(timeoutMs) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(timeoutMs);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  return controller.signal;
}

function headerValue(response, name) {
  return response?.headers?.get?.(name) || '';
}

function selectedHeaders(response) {
  return {
    cacheControl: headerValue(response, 'cache-control'),
    cfCacheStatus: headerValue(response, 'cf-cache-status'),
    contentType: headerValue(response, 'content-type'),
    contentLength: headerValue(response, 'content-length'),
    serverTiming: headerValue(response, 'server-timing'),
    xRequestId: headerValue(response, 'x-ks2-request-id'),
    xTtsCache: headerValue(response, 'x-ks2-tts-cache'),
    xTtsCacheSource: headerValue(response, 'x-ks2-tts-cache-source'),
  };
}

async function timedFetch(url, init = {}, {
  label = '',
  timeoutMs = configuredTimeoutMs(),
  readBody = true,
} = {}) {
  const headers = new Headers(init.headers || {});
  if (!headers.has('x-ks2-request-id')) headers.set('x-ks2-request-id', requestId());
  const clientRequestId = headers.get('x-ks2-request-id');
  const startedAt = new Date().toISOString();
  const start = performance.now();
  let response;
  try {
    response = await fetch(url, {
      ...init,
      headers,
      signal: init.signal || timeoutSignal(timeoutMs),
    });
  } catch (error) {
    return {
      ok: false,
      label,
      url: String(url),
      method: init.method || 'GET',
      clientRequestId,
      serverRequestId: '',
      status: 0,
      startedAt,
      finishedAt: new Date().toISOString(),
      headerMs: Math.round(performance.now() - start),
      bodyMs: 0,
      totalMs: Math.round(performance.now() - start),
      bytes: 0,
      error: error?.message || String(error),
      headers: {},
    };
  }
  const responseAt = performance.now();
  let bytes = 0;
  let body = Buffer.alloc(0);
  if (readBody) {
    const arrayBuffer = await response.arrayBuffer().catch(() => new ArrayBuffer(0));
    body = Buffer.from(arrayBuffer);
    bytes = body.byteLength;
  }
  const finished = performance.now();
  return {
    ok: response.ok,
    label,
    url: String(url),
    method: init.method || 'GET',
    clientRequestId,
    serverRequestId: headerValue(response, 'x-ks2-request-id'),
    status: response.status,
    startedAt,
    finishedAt: new Date().toISOString(),
    headerMs: Math.round(responseAt - start),
    bodyMs: Math.round(finished - responseAt),
    totalMs: Math.round(finished - start),
    bytes,
    headers: selectedHeaders(response),
    body,
  };
}

function responseText(sample) {
  return sample?.body ? sample.body.toString('utf8') : '';
}

function parseJsonBody(sample) {
  const text = responseText(sample);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function getSetCookies(responseHeaders) {
  if (typeof responseHeaders?.getSetCookie === 'function') return responseHeaders.getSetCookie();
  return String(responseHeaders?.get?.('set-cookie') || '')
    .split(/,\s*(?=ks2_)/)
    .filter(Boolean);
}

function sessionCookieFromHeaders(headers) {
  return getSetCookies(headers)
    .map((cookie) => String(cookie || '').split(';')[0])
    .find((cookie) => cookie.startsWith('ks2_session=')) || '';
}

function extractScriptSources(html) {
  return Array.from(String(html || '').matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi), (match) => match[1]);
}

function normaliseAssetPath(path, origin) {
  const value = String(path || '').trim();
  if (!value) return '/';
  const url = new URL(value, origin);
  if (url.origin !== new URL(origin).origin) return null;
  return `${url.pathname}${url.search}`;
}

function unique(values) {
  return Array.from(new Set(values));
}

function percentile(values, p) {
  const finite = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!finite.length) return null;
  const index = Math.min(finite.length - 1, Math.max(0, Math.ceil((p / 100) * finite.length) - 1));
  return finite[index];
}

export function summariseMetric(samples, field) {
  const values = samples
    .map((sample) => Number(sample?.[field]))
    .filter(Number.isFinite);
  if (!values.length) {
    return { count: 0, min: null, p50: null, p95: null, max: null, mean: null };
  }
  const sum = values.reduce((total, value) => total + value, 0);
  return {
    count: values.length,
    min: Math.min(...values),
    p50: percentile(values, 50),
    p95: percentile(values, 95),
    max: Math.max(...values),
    mean: Math.round(sum / values.length),
  };
}

function groupBy(samples, keyFn) {
  const groups = new Map();
  for (const sample of samples) {
    const key = keyFn(sample);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(sample);
  }
  return groups;
}

function summariseSamples(samples, keyFn) {
  return Array.from(groupBy(samples, keyFn).entries()).map(([key, group]) => ({
    key,
    count: group.length,
    statuses: Object.fromEntries(Array.from(groupBy(group, (sample) => String(sample.status || 0)).entries()).map(([status, rows]) => [status, rows.length])),
    headerMs: summariseMetric(group, 'headerMs'),
    bodyMs: summariseMetric(group, 'bodyMs'),
    totalMs: summariseMetric(group, 'totalMs'),
    bytes: summariseMetric(group, 'bytes'),
  }));
}

function bootstrapCapacitySummary(samples) {
  const rows = samples
    .map((sample) => sample.capacity)
    .filter(Boolean);
  return {
    queryCount: summariseMetric(rows, 'queryCount'),
    d1DurationMs: summariseMetric(rows, 'd1DurationMs'),
    d1RowsRead: summariseMetric(rows, 'd1RowsRead'),
    d1RowsWritten: summariseMetric(rows, 'd1RowsWritten'),
    serverWallMs: summariseMetric(rows, 'serverWallMs'),
    responseBytes: summariseMetric(rows, 'responseBytes'),
  };
}

function capacityFromPayload(payload) {
  const raw = payload?.meta?.capacity || null;
  if (!raw || typeof raw !== 'object') return null;
  return {
    requestId: raw.requestId || null,
    queryCount: Number(raw.queryCount),
    d1DurationMs: Number(raw.d1DurationMs),
    d1RowsRead: Number(raw.d1RowsRead),
    d1RowsWritten: Number(raw.d1RowsWritten),
    serverWallMs: Number(raw.wallMs),
    responseBytes: Number(raw.responseBytes),
  };
}

function selectedLearnerIdFromPayload(payload) {
  return payload?.learners?.selectedId
    || payload?.learnerId
    || payload?.session?.learnerId
    || '';
}

export function parseServerTiming(value) {
  const phases = {};
  for (const entry of String(value || '').split(',')) {
    const parts = entry.trim().split(';').map((part) => part.trim()).filter(Boolean);
    const name = parts.shift();
    if (!name || !name.startsWith('ks2_tts_')) continue;
    const durPart = parts.find((part) => /^dur=/i.test(part));
    if (!durPart) continue;
    const duration = Number(durPart.slice(durPart.indexOf('=') + 1).replace(/^"|"$/g, ''));
    if (!Number.isFinite(duration) || duration < 0) continue;
    phases[name.slice('ks2_tts_'.length)] = Math.round(duration);
  }
  return phases;
}

function ttsPhaseSummary(samples) {
  const phaseNames = unique(samples.flatMap((sample) => Object.keys(sample.serverTimingPhases || {})));
  return Object.fromEntries(phaseNames.map((phase) => [
    phase,
    summariseMetric(samples.map((sample) => sample.serverTimingPhases || {}), phase),
  ]));
}

async function ttsPromptToken({ learnerId, slug, seed }) {
  return await computeWordBankPromptToken({
    learnerId,
    slug,
    word: seed.word,
    sentence: seed.sentence,
  });
}

async function ttsRequestBody({ mode, learnerId, slug, seed, voice }) {
  const promptToken = await ttsPromptToken({ learnerId, slug, seed });
  const base = {
    slug,
    learnerId,
    promptToken,
    bufferedGeminiVoice: voice,
    cacheLookupOnly: true,
  };
  if (mode === TTS_MODE_WORD_LOOKUP) {
    return {
      ...base,
      wordOnly: true,
      scope: 'word-bank',
    };
  }
  return base;
}

export function classifyTtsTimingSample(sample) {
  const phases = sample?.serverTimingPhases || {};
  const total = Number(phases.total);
  if (!Number.isFinite(total) || total <= 0) return 'unclassified-insufficient-timing';

  const headerMs = Number(sample?.headerMs);
  const residualMs = Number.isFinite(headerMs) ? Math.max(0, headerMs - total) : 0;
  if (residualMs > Math.max(250, total * 1.5)) return 'client-network-or-platform-overhead';

  const candidates = [
    ['r2-dominated', Number(phases.r2)],
    ['prompt-validation-dominated', Number(phases.prompt) + Number(phases.body || 0)],
    ['rate-limit-dominated', Number(phases.lookup_limit) + Number(phases.audio_limit || 0)],
  ].map(([name, value]) => [name, Number.isFinite(value) ? value : 0]);
  const [name, value] = candidates.sort((a, b) => b[1] - a[1])[0] || ['mixed', 0];
  if (value >= Math.max(25, total * 0.5)) return name;
  return 'mixed';
}

async function measureAssets(origin, options) {
  const timeoutMs = options.timeoutMs || configuredTimeoutMs();
  const discovery = await timedFetch(new URL('/', origin), {
    headers: { accept: 'text/html,*/*' },
  }, { label: 'GET / discovery', timeoutMs });
  const discoveredScripts = extractScriptSources(responseText(discovery))
    .map((path) => normaliseAssetPath(path, origin))
    .filter(Boolean);
  const paths = options.assetPaths.length
    ? options.assetPaths.map((path) => normaliseAssetPath(path, origin)).filter(Boolean)
    : unique(['/', ...discoveredScripts]);
  const samples = [];
  for (const path of paths) {
    const url = new URL(path, origin);
    for (let index = 0; index < options.warmup + options.assetSamples; index += 1) {
      const sample = await timedFetch(url, {
        headers: {
          accept: path.endsWith('.js') ? 'application/javascript,*/*' : 'text/html,application/javascript,*/*',
        },
      }, { label: `GET ${path}`, timeoutMs });
      if (index >= options.warmup) {
        const { body, ...serialisable } = sample;
        samples.push({
          ...serialisable,
          path,
          cacheControl: sample.headers.cacheControl,
          cfCacheStatus: sample.headers.cfCacheStatus,
          contentType: sample.headers.contentType,
        });
      }
    }
  }
  return {
    discovery: {
      status: discovery.status,
      headerMs: discovery.headerMs,
      totalMs: discovery.totalMs,
      bytes: discovery.bytes,
      discoveredScripts,
    },
    samples,
    summary: summariseSamples(samples, (sample) => sample.path),
    notes: discoveredScripts.some((path) => path.startsWith('/src/bundles/'))
      ? ['Root HTML references /src/bundles/*.js; compare Worker-first routing and immutable static asset coverage before page-load refactors.']
      : [],
  };
}

async function measureBootstrap(origin, cookie, options) {
  const timeoutMs = options.timeoutMs || configuredTimeoutMs();
  const samples = [];
  let selectedLearnerId = '';
  for (let index = 0; index < options.warmup + options.bootstrapSamples; index += 1) {
    const sample = await timedFetch(new URL('/api/bootstrap', origin), {
      headers: {
        accept: 'application/json',
        cookie,
      },
    }, { label: 'GET /api/bootstrap', timeoutMs });
    if (index >= options.warmup) {
      const payload = parseJsonBody(sample);
      if (!selectedLearnerId) selectedLearnerId = selectedLearnerIdFromPayload(payload);
      const { body, ...serialisable } = sample;
      samples.push({
        ...serialisable,
        capacity: capacityFromPayload(payload),
      });
    }
  }
  return {
    samples,
    summary: summariseSamples(samples, () => 'GET /api/bootstrap'),
    capacity: bootstrapCapacitySummary(samples),
    selectedLearnerId,
  };
}

async function measureTts(origin, cookie, learnerId, options) {
  const timeoutMs = options.timeoutMs || configuredTimeoutMs();
  const samples = [];
  const failures = [];
  for (let index = 0; index < options.warmup + options.ttsSamples; index += 1) {
    for (const slug of options.wordSample) {
      const seed = lookupSeedWord(slug);
      if (!seed?.word) {
        failures.push(`Word sample ${slug} is not present in the spelling seed snapshot.`);
        continue;
      }
      for (const voice of options.voices) {
        for (const mode of [TTS_MODE_WORD_LOOKUP, TTS_MODE_SENTENCE_CACHE]) {
          const sample = await timedFetch(new URL('/api/tts', origin), {
            method: 'POST',
            headers: {
              accept: 'audio/*,application/json;q=0.8',
              'content-type': 'application/json',
              cookie,
              origin,
            },
            body: JSON.stringify(await ttsRequestBody({ mode, learnerId, slug, seed, voice })),
          }, { label: `POST /api/tts ${mode} ${slug}/${voice}`, timeoutMs });
          if (index >= options.warmup) {
            const { body, ...serialisable } = sample;
            const serverTimingPhases = parseServerTiming(sample.headers.serverTiming);
            samples.push({
              ...serialisable,
              mode,
              slug,
              voice,
              cache: sample.headers.xTtsCache || '',
              source: sample.headers.xTtsCacheSource || '',
              contentType: sample.headers.contentType,
              serverTiming: sample.headers.serverTiming || '',
              serverTimingPhases,
              classification: classifyTtsTimingSample({ ...sample, serverTimingPhases }),
            });
          }
        }
      }
    }
  }
  return {
    samples,
    summary: summariseSamples(samples, (sample) => `${sample.mode}/${sample.slug}/${sample.voice}/${sample.cache || 'no-cache'}/${sample.source || 'no-source'}`),
    phaseSummary: ttsPhaseSummary(samples),
    modeSummary: Object.fromEntries(Array.from(groupBy(samples, (sample) => sample.mode || 'unknown').entries()).map(([key, rows]) => [key, summariseSamples(rows, (sample) => `${sample.slug}/${sample.voice}/${sample.cache || 'no-cache'}/${sample.source || 'no-source'}`)])),
    classifications: Object.fromEntries(Array.from(groupBy(samples, (sample) => sample.classification || 'unknown').entries()).map(([key, rows]) => [key, rows.length])),
    failures,
  };
}

function sanitiseBrowserTtsSample(sample = {}) {
  return {
    mode: 'browser-play-start',
    slug: String(sample.slug || ''),
    voice: String(sample.voice || ''),
    status: Number(sample.status) || 0,
    cache: String(sample.cache || ''),
    source: String(sample.source || ''),
    contentType: String(sample.contentType || ''),
    requestId: String(sample.requestId || ''),
    headerMs: Number.isFinite(Number(sample.headerMs)) ? Math.max(0, Math.round(Number(sample.headerMs))) : null,
    blobMs: Number.isFinite(Number(sample.blobMs)) ? Math.max(0, Math.round(Number(sample.blobMs))) : null,
    playStartMs: Number.isFinite(Number(sample.playStartMs)) ? Math.max(0, Math.round(Number(sample.playStartMs))) : null,
    totalMs: Number.isFinite(Number(sample.totalMs)) ? Math.max(0, Math.round(Number(sample.totalMs))) : null,
    bytes: Number.isFinite(Number(sample.bytes)) ? Math.max(0, Math.round(Number(sample.bytes))) : null,
    skipped: Boolean(sample.skipped),
    skipReason: sample.skipReason ? String(sample.skipReason).slice(0, 200) : '',
  };
}

function sanitiseBrowserTtsReport(report = {}) {
  const samples = Array.isArray(report.samples)
    ? report.samples.map(sanitiseBrowserTtsSample)
    : [];
  const measuredSamples = samples.filter((sample) => !sample.skipped);
  return {
    ok: report.ok !== false,
    skipped: Boolean(report.skipped),
    skipReason: report.skipReason ? String(report.skipReason).slice(0, 200) : '',
    samples,
    summary: summariseSamples(measuredSamples, (sample) => `${sample.slug}/${sample.voice}/${sample.cache || 'no-cache'}/${sample.source || 'no-source'}`),
    playStartMs: summariseMetric(measuredSamples, 'playStartMs'),
  };
}

function firstCookiePair(cookie = '') {
  const pairs = String(cookie || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);
  const pair = pairs.find((part) => part.startsWith('ks2_session=')) || pairs[0] || '';
  const separator = pair.indexOf('=');
  if (separator <= 0) return null;
  return {
    name: pair.slice(0, separator),
    value: pair.slice(separator + 1),
  };
}

async function runPlaywrightBrowserTts(origin, cookie, learnerId, options) {
  const seed = lookupSeedWord(options.wordSample[0]);
  const voice = options.voices[0];
  if (!seed?.word || !voice) {
    return { skipped: true, skipReason: 'missing word sample or voice', samples: [] };
  }
  const cookiePair = firstCookiePair(cookie);
  if (!cookiePair) return { skipped: true, skipReason: 'missing session cookie', samples: [] };
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch (error) {
    return { skipped: true, skipReason: `playwright import failed: ${error?.message || error}`, samples: [] };
  }
  const promptToken = await ttsPromptToken({ learnerId, slug: seed.slug, seed });
  const requestBody = {
    slug: seed.slug,
    learnerId,
    promptToken,
    bufferedGeminiVoice: voice,
    cacheLookupOnly: true,
  };
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    await context.addCookies([{
      name: cookiePair.name,
      value: cookiePair.value,
      url: origin,
      path: '/',
    }]);
    const page = await context.newPage();
    await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs || configuredTimeoutMs() });
    const sample = await page.evaluate(async ({ body }) => {
      const startedAt = performance.now();
      const response = await fetch('/api/tts', {
        method: 'POST',
        credentials: 'include',
        headers: {
          accept: 'audio/*,application/json;q=0.8',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const responseAt = performance.now();
      if (!response.ok) {
        return {
          status: response.status,
          cache: response.headers.get('x-ks2-tts-cache') || '',
          source: response.headers.get('x-ks2-tts-cache-source') || '',
          contentType: response.headers.get('content-type') || '',
          requestId: response.headers.get('x-ks2-request-id') || '',
          headerMs: responseAt - startedAt,
          totalMs: performance.now() - startedAt,
          skipped: true,
          skipReason: `HTTP ${response.status}`,
        };
      }
      const blob = await response.blob();
      const blobAt = performance.now();
      let playStartAt = null;
      let skipReason = '';
      try {
        const objectUrl = URL.createObjectURL(blob);
        const audio = new Audio(objectUrl);
        audio.preload = 'auto';
        const playing = new Promise((resolve) => {
          const done = (value) => resolve(value);
          audio.addEventListener('playing', () => done(performance.now()), { once: true });
          audio.addEventListener('error', () => done(null), { once: true });
          setTimeout(() => done(null), 3000);
        });
        await audio.play().catch((error) => {
          skipReason = error?.message || String(error);
        });
        playStartAt = await playing;
        URL.revokeObjectURL(objectUrl);
      } catch (error) {
        skipReason = error?.message || String(error);
      }
      return {
        status: response.status,
        cache: response.headers.get('x-ks2-tts-cache') || '',
        source: response.headers.get('x-ks2-tts-cache-source') || '',
        contentType: response.headers.get('content-type') || '',
        requestId: response.headers.get('x-ks2-request-id') || '',
        headerMs: responseAt - startedAt,
        blobMs: blobAt - responseAt,
        playStartMs: playStartAt == null ? null : playStartAt - startedAt,
        totalMs: performance.now() - startedAt,
        bytes: blob.size,
        skipped: playStartAt == null,
        skipReason: playStartAt == null ? (skipReason || 'audio did not reach playing state') : '',
      };
    }, { body: requestBody });
    return {
      ok: !sample.skipped,
      skipped: Boolean(sample.skipped),
      skipReason: sample.skipReason || '',
      samples: [{ ...sample, slug: seed.slug, voice }],
    };
  } catch (error) {
    return { skipped: true, skipReason: `browser timing failed: ${error?.message || error}`, samples: [] };
  } finally {
    await browser?.close?.().catch(() => {});
  }
}

async function measureBrowserTts(origin, cookie, learnerId, options) {
  if (typeof options.browserTtsRunner === 'function') {
    return sanitiseBrowserTtsReport(await options.browserTtsRunner({ origin, cookie, learnerId, options }));
  }
  if (!options.includeBrowserTts) return null;
  return sanitiseBrowserTtsReport(await runPlaywrightBrowserTts(origin, cookie, learnerId, options));
}

async function createProbeDemoSession(origin, options) {
  const timeoutMs = options.timeoutMs || configuredTimeoutMs();
  const url = new URL('/api/demo/session', origin);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      origin,
      'x-ks2-request-id': requestId(),
    },
    body: '{}',
    signal: timeoutSignal(timeoutMs),
  });
  const cookie = sessionCookieFromHeaders(response.headers);
  const text = await response.text().catch(() => '');
  const payload = text ? JSON.parse(text) : {};
  return {
    ok: response.ok && Boolean(cookie),
    status: response.status,
    cookie,
    payload,
    learnerId: payload?.session?.learnerId || '',
    accountId: payload?.session?.accountId || '',
    serverRequestId: headerValue(response, 'x-ks2-request-id'),
  };
}

function operatorSessionFromEnv(options) {
  const envName = String(options.cookieEnv || '').trim();
  const cookie = envName ? process.env[envName] : '';
  if (!cookie) return null;
  return {
    ok: true,
    status: 0,
    source: 'operator-cookie',
    cookie,
    learnerId: options.learnerId || '',
    accountId: '',
    serverRequestId: '',
  };
}

function withoutSensitiveSession(report) {
  const redacted = { ...report };
  if (report?.session) {
    redacted.session = {
      ok: report.session.ok,
      status: report.session.status,
      source: report.session.source || 'demo',
      learnerIdPresent: Boolean(report.session.learnerId),
      accountIdPresent: Boolean(report.session.accountId),
      serverRequestId: report.session.serverRequestId,
    };
  }
  if (report?.bootstrap) {
    const { selectedLearnerId, ...bootstrap } = report.bootstrap;
    redacted.bootstrap = {
      ...bootstrap,
      selectedLearnerIdPresent: Boolean(selectedLearnerId),
    };
  }
  return redacted;
}

function sessionForReport(session) {
  if (!session) return null;
  return {
    ok: session.ok,
    status: session.status,
    source: session.source || 'demo',
    cookie: session.cookie,
    learnerId: session.learnerId,
    accountId: session.accountId,
    serverRequestId: session.serverRequestId,
  };
}

export async function runPerformanceProbe(rawOptions = {}) {
  const options = {
    ...parseArgs([]),
    ...rawOptions,
  };
  options.origin = normaliseOrigin(options.origin);
  const startedAt = new Date().toISOString();
  const report = {
    ok: true,
    origin: options.origin,
    startedAt,
    finishedAt: '',
    config: {
      assetSamples: options.assetSamples,
      bootstrapSamples: options.bootstrapSamples,
      ttsSamples: options.ttsSamples,
      warmup: options.warmup,
      wordSample: options.wordSample,
      voices: options.voices,
      cookieEnv: options.cookieEnv,
      learnerIdProvided: Boolean(options.learnerId),
      includeAssets: options.includeAssets,
      includeBootstrap: options.includeBootstrap,
      includeTts: options.includeTts,
      includeBrowserTts: options.includeBrowserTts,
    },
    session: null,
    assets: null,
    bootstrap: null,
    tts: null,
    browserTts: null,
    failures: [],
  };

  if (options.includeAssets && options.assetSamples > 0) {
    report.assets = await measureAssets(options.origin, options);
    for (const sample of report.assets.samples) {
      if (sample.status < 200 || sample.status >= 400) {
        report.failures.push(`Asset ${sample.path} returned HTTP ${sample.status}.`);
      }
    }
  }

  if (
    (options.includeBootstrap && options.bootstrapSamples > 0)
    || (options.includeTts && options.ttsSamples > 0)
    || options.includeBrowserTts
    || typeof options.browserTtsRunner === 'function'
  ) {
    report.session = sessionForReport(operatorSessionFromEnv(options) || await createProbeDemoSession(options.origin, options));
    if (!report.session.ok) {
      report.failures.push(`Demo session setup failed with HTTP ${report.session.status}.`);
    }
  }

  if (report.session?.ok && options.includeBootstrap && options.bootstrapSamples > 0) {
    report.bootstrap = await measureBootstrap(options.origin, report.session.cookie, options);
    if (!report.session.learnerId && report.bootstrap.selectedLearnerId) {
      report.session.learnerId = report.bootstrap.selectedLearnerId;
    }
    for (const sample of report.bootstrap.samples) {
      if (sample.status < 200 || sample.status >= 400) {
        report.failures.push(`Bootstrap sample returned HTTP ${sample.status}.`);
      }
    }
  }

  if (report.session?.ok && options.includeTts && options.ttsSamples > 0) {
    if (!report.session.learnerId) {
      report.failures.push('TTS samples skipped because no learner id was available; provide --learner-id or enable /api/bootstrap sampling.');
    } else {
      report.tts = await measureTts(options.origin, report.session.cookie, report.session.learnerId, options);
      report.failures.push(...report.tts.failures);
      for (const sample of report.tts.samples) {
        if (sample.mode === TTS_MODE_SENTENCE_CACHE && sample.status !== 200) {
          report.failures.push(`TTS sentence cache ${sample.slug}/${sample.voice} returned HTTP ${sample.status}.`);
        } else if (sample.mode === TTS_MODE_WORD_LOOKUP && sample.status !== 200 && sample.status !== 204) {
          report.failures.push(`TTS word lookup ${sample.slug}/${sample.voice} returned HTTP ${sample.status}.`);
        }
      }
    }
  }

  if (report.session?.ok && (options.includeBrowserTts || typeof options.browserTtsRunner === 'function')) {
    if (!report.session.learnerId) {
      report.failures.push('Browser TTS sample skipped because no learner id was available; provide --learner-id or enable /api/bootstrap sampling.');
    } else {
      report.browserTts = await measureBrowserTts(options.origin, report.session.cookie, report.session.learnerId, options);
      if (report.browserTts && !report.browserTts.skipped && report.browserTts.ok === false) {
        report.failures.push('Browser TTS play-start measurement failed.');
      }
    }
  }

  report.ok = report.failures.length === 0;
  report.finishedAt = new Date().toISOString();
  return withoutSensitiveSession(report);
}

export function usage() {
  return [
    'Usage: node ./scripts/production-performance-probe.mjs [options]',
    '',
    'Measures production page asset, bootstrap, word-only TTS lookup, and sentence cached-audio timing.',
    'The probe creates one demo session when bootstrap, TTS, or browser TTS samples are enabled.',
    '',
    'Options:',
    '  --origin, --url <url>       Origin to probe (default https://ks2.eugnel.uk).',
    '  --samples <n>               Set asset/bootstrap/TTS samples together.',
    '  --asset-samples <n>         Asset samples per discovered path (default 3).',
    '  --bootstrap-samples <n>     /api/bootstrap samples (default 5).',
    '  --tts-samples <n>           TTS samples per mode × word × voice (default 5).',
    '  --warmup <n>                Warm-up requests per route before recording (default 1).',
    '  --word-sample <csv>         TTS word slugs (default accident,knowledge).',
    '  --voices <csv>              Buffered Gemini voices (default first configured voice).',
    '  --asset-path <path>         Override asset paths; repeatable.',
    `  --cookie-env <name>         Use a real session cookie from this env var when set (default ${DEFAULT_COOKIE_ENV}).`,
    '  --learner-id <id>           Learner id for real-cookie TTS probes when bootstrap is skipped.',
    '  --timeout-ms <ms>           Per-request timeout.',
    '  --output <path>             Persist JSON report.',
    '  --no-assets                 Skip public page/bundle timing.',
    '  --no-bootstrap              Skip /api/bootstrap timing.',
    '  --no-tts                    Skip /api/tts timing.',
    '  --browser-tts               Best-effort browser-side cached audio play-start timing.',
    '  --help, -h                  Show this banner.',
  ].join('\n');
}

export async function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return 0;
  }
  const report = await runPerformanceProbe(options);
  const json = JSON.stringify(report, null, 2);
  if (options.output) {
    mkdirSync(dirname(options.output), { recursive: true });
    writeFileSync(options.output, `${json}\n`);
  }
  console.log(json);
  return report.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      error: error?.message || String(error),
    }, null, 2));
    process.exitCode = 2;
  });
}
