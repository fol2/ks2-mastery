import { Buffer } from 'node:buffer';
import { pathToFileURL } from 'node:url';

const DEFAULT_URL = 'https://ks2.eugnel.uk';
const DEFAULT_MAX_BYTES = 600_000;

function readOptionValue(argv, index, optionName) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${optionName} requires a value.`);
  }
  return value;
}

function toPositiveInteger(value, optionName) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${optionName} must be a non-negative integer.`);
  }
  return parsed;
}

function normaliseBaseUrl(value) {
  const url = new URL(value || DEFAULT_URL);
  url.pathname = url.pathname.replace(/\/+$/, '');
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

export function parseProbeArgs(argv = process.argv.slice(2)) {
  const options = {
    url: DEFAULT_URL,
    cookie: '',
    bearer: '',
    headers: [],
    maxBytes: DEFAULT_MAX_BYTES,
    maxSessions: null,
    maxEvents: null,
    forbiddenTokens: [],
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--url') {
      options.url = readOptionValue(argv, index, arg);
      index += 1;
    } else if (arg === '--cookie') {
      options.cookie = readOptionValue(argv, index, arg);
      index += 1;
    } else if (arg === '--bearer') {
      options.bearer = readOptionValue(argv, index, arg);
      index += 1;
    } else if (arg === '--header') {
      options.headers.push(readOptionValue(argv, index, arg));
      index += 1;
    } else if (arg === '--max-bytes') {
      options.maxBytes = toPositiveInteger(readOptionValue(argv, index, arg), arg);
      index += 1;
    } else if (arg === '--max-sessions') {
      options.maxSessions = toPositiveInteger(readOptionValue(argv, index, arg), arg);
      index += 1;
    } else if (arg === '--max-events') {
      options.maxEvents = toPositiveInteger(readOptionValue(argv, index, arg), arg);
      index += 1;
    } else if (arg === '--forbidden-token') {
      options.forbiddenTokens.push(readOptionValue(argv, index, arg));
      index += 1;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  options.url = normaliseBaseUrl(options.url);
  return options;
}

export function buildProbeHeaders(options = {}) {
  const headers = {
    accept: 'application/json',
  };

  if (options.cookie) headers.cookie = options.cookie;
  if (options.bearer) headers.authorization = `Bearer ${options.bearer}`;

  for (const header of options.headers || []) {
    const separator = header.indexOf(':');
    if (separator <= 0) throw new Error(`Invalid header "${header}". Use "name: value".`);
    const name = header.slice(0, separator).trim();
    const value = header.slice(separator + 1).trim();
    if (!name) throw new Error(`Invalid header "${header}". Header name is required.`);
    headers[name] = value;
  }

  return headers;
}

function arrayCount(payload, key) {
  return Array.isArray(payload?.[key]) ? payload[key].length : 0;
}

function spellingSubjectEntries(payload) {
  const subjectStates = payload?.subjectStates;
  if (!subjectStates || typeof subjectStates !== 'object' || Array.isArray(subjectStates)) {
    return [];
  }
  return Object.entries(subjectStates)
    .filter(([key]) => key.endsWith('::spelling'))
    .map(([key, record]) => ({ key, record }));
}

function appendSpellingRedactionFailures(failures, payload) {
  const sessions = Array.isArray(payload.practiceSessions) ? payload.practiceSessions : [];
  for (const session of sessions) {
    if (session?.subjectId === 'spelling' && session.sessionState !== null) {
      failures.push(`Spelling practice session ${session.id || '(unknown)'} exposes sessionState.`);
    }
  }

  for (const { key, record } of spellingSubjectEntries(payload)) {
    if (record?.data?.progress !== undefined) {
      failures.push(`Spelling subject state ${key} exposes progress data.`);
    }
    const currentCard = record?.ui?.session?.currentCard;
    if (currentCard?.word !== undefined) {
      failures.push(`Spelling subject state ${key} exposes currentCard.word.`);
    }
    if (currentCard?.prompt?.sentence !== undefined) {
      failures.push(`Spelling subject state ${key} exposes prompt.sentence.`);
    }
  }
}

export function analyseBootstrapPayload(payload, {
  responseBytes = 0,
  maxBytes = DEFAULT_MAX_BYTES,
  maxSessions = null,
  maxEvents = null,
  forbiddenTokens = [],
} = {}) {
  const failures = [];
  const warnings = [];
  const practiceSessionCount = arrayCount(payload, 'practiceSessions');
  const eventCount = arrayCount(payload, 'eventLog');
  const responseSize = Number(responseBytes) || 0;

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      ok: false,
      failures: ['Response body is not a JSON object.'],
      warnings,
      responseBytes: responseSize,
      counts: {
        practiceSessions: 0,
        eventLog: 0,
      },
      capacity: null,
    };
  }

  if (payload.ok !== true) {
    failures.push('Bootstrap payload does not report ok=true.');
  }
  if (responseSize > maxBytes) {
    failures.push(`Bootstrap response is ${responseSize} bytes, above ${maxBytes}.`);
  }
  if (maxSessions != null && practiceSessionCount > maxSessions) {
    failures.push(`Bootstrap returned ${practiceSessionCount} practice sessions, above ${maxSessions}.`);
  }
  if (maxEvents != null && eventCount > maxEvents) {
    failures.push(`Bootstrap returned ${eventCount} events, above ${maxEvents}.`);
  }

  const capacity = payload.bootstrapCapacity || null;
  if (!capacity || typeof capacity !== 'object' || Array.isArray(capacity)) {
    failures.push('Bootstrap payload is missing bootstrapCapacity metadata.');
  } else {
    if (capacity.mode !== 'public-bounded') {
      failures.push(`bootstrapCapacity.mode is ${JSON.stringify(capacity.mode)}, expected "public-bounded".`);
    }
    if (Number(capacity.practiceSessions?.returned) !== practiceSessionCount) {
      failures.push('bootstrapCapacity.practiceSessions.returned does not match practiceSessions length.');
    }
    if (Number(capacity.eventLog?.returned) !== eventCount) {
      failures.push('bootstrapCapacity.eventLog.returned does not match eventLog length.');
    }
    if (capacity.practiceSessions?.bounded !== true || capacity.eventLog?.bounded !== true) {
      failures.push('bootstrapCapacity does not mark practiceSessions and eventLog as bounded.');
    }
  }

  appendSpellingRedactionFailures(failures, payload);

  const bodyText = JSON.stringify(payload);
  for (const token of forbiddenTokens || []) {
    if (token && bodyText.includes(token)) {
      failures.push(`Bootstrap payload contains forbidden token: ${token}`);
    }
  }

  if (!Array.isArray(payload.practiceSessions)) {
    warnings.push('practiceSessions is not an array.');
  }
  if (!Array.isArray(payload.eventLog)) {
    warnings.push('eventLog is not an array.');
  }

  return {
    ok: failures.length === 0,
    failures,
    warnings,
    responseBytes: responseSize,
    counts: {
      practiceSessions: practiceSessionCount,
      eventLog: eventCount,
    },
    capacity,
  };
}

export async function probeProductionBootstrap(options = {}) {
  const url = new URL('/api/bootstrap', options.url || DEFAULT_URL);
  const response = await fetch(url, {
    method: 'GET',
    headers: buildProbeHeaders(options),
  });
  const text = await response.text();
  const responseBytes = Buffer.byteLength(text, 'utf8');
  let payload = null;
  let parseError = null;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch (error) {
    parseError = error;
  }

  const analysis = analyseBootstrapPayload(payload, {
    responseBytes,
    maxBytes: options.maxBytes,
    maxSessions: options.maxSessions,
    maxEvents: options.maxEvents,
    forbiddenTokens: options.forbiddenTokens,
  });

  if (!response.ok) {
    analysis.failures.unshift(`Bootstrap returned HTTP ${response.status}.`);
  }
  if (parseError) {
    analysis.failures.unshift(`Bootstrap response is not valid JSON: ${parseError.message}`);
  }

  return {
    ok: analysis.failures.length === 0,
    url: url.toString(),
    status: response.status,
    ...analysis,
  };
}

export function usage() {
  return [
    'Usage: node ./scripts/probe-production-bootstrap.mjs [options]',
    '',
    'Options:',
    '  --url <url>                Site origin, default https://ks2.eugnel.uk',
    '  --cookie <cookie>          Cookie header value from a logged-in browser session',
    '  --bearer <token>           Bearer token for Authorization',
    '  --header "name: value"     Extra request header, repeatable',
    '  --max-bytes <number>       Maximum allowed response bytes',
    '  --max-sessions <number>    Maximum allowed practiceSessions length',
    '  --max-events <number>      Maximum allowed eventLog length',
    '  --forbidden-token <text>   Token that must not appear in the JSON payload, repeatable',
  ].join('\n');
}

export async function runProbe(argv = process.argv.slice(2)) {
  const options = parseProbeArgs(argv);
  if (options.help) {
    console.log(usage());
    return 0;
  }

  const summary = await probeProductionBootstrap(options);
  console.log(JSON.stringify(summary, null, 2));
  return summary.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runProbe().then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      error: error.message,
    }, null, 2));
    process.exitCode = 2;
  });
}
