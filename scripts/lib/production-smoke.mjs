import assert from 'node:assert/strict';

export const DEFAULT_PRODUCTION_ORIGIN = 'https://ks2.eugnel.uk';

export function argValue(...names) {
  for (const name of names) {
    const index = process.argv.indexOf(name);
    if (index !== -1 && index + 1 < process.argv.length) return process.argv[index + 1];
  }
  return '';
}

export function configuredOrigin({
  envName = 'KS2_SMOKE_ORIGIN',
  defaultOrigin = DEFAULT_PRODUCTION_ORIGIN,
} = {}) {
  const raw = argValue('--origin', '--url') || process.env[envName] || defaultOrigin;
  const value = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return new URL(value).origin;
}

function getSetCookies(response) {
  const values = response.headers.getSetCookie?.();
  if (Array.isArray(values) && values.length) return values;
  return String(response.headers.get('set-cookie') || '')
    .split(/,\s*(?=ks2_)/)
    .filter(Boolean);
}

function sessionCookieFrom(response) {
  return getSetCookies(response)
    .map((cookie) => String(cookie || '').split(';')[0])
    .find((cookie) => cookie.startsWith('ks2_session=')) || '';
}

async function readJsonResponse(response) {
  const text = await response.text().catch(() => '');
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { rawBody: text };
  }
}

async function fetchJson(url, init = {}) {
  const response = await fetch(url, init);
  const payload = await readJsonResponse(response);
  return { response, payload };
}

function sameOriginHeaders(origin, cookie = '') {
  return {
    accept: 'application/json',
    'content-type': 'application/json',
    origin,
    ...(cookie ? { cookie } : {}),
  };
}

export async function postJson(origin, path, body = {}, { cookie = '' } = {}) {
  return fetchJson(new URL(path, origin), {
    method: 'POST',
    headers: sameOriginHeaders(origin, cookie),
    body: JSON.stringify(body),
  });
}

export async function getJson(origin, path, { cookie = '' } = {}) {
  return fetchJson(new URL(path, origin), {
    method: 'GET',
    headers: {
      accept: 'application/json',
      ...(cookie ? { cookie } : {}),
    },
  });
}

export function assertOkResponse(label, result) {
  assert.ok(result.response.ok, `${label} failed with ${result.response.status}: ${JSON.stringify(result.payload)}`);
  assert.notEqual(result.payload?.ok, false, `${label} returned ok=false: ${JSON.stringify(result.payload)}`);
}

export function assertNoForbiddenObjectKeys(value, forbiddenKeys, path = 'readModel') {
  if (value == null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoForbiddenObjectKeys(entry, forbiddenKeys, `${path}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    assert.equal(forbiddenKeys.has(key), false, `${path}.${key} exposed a server-only field.`);
    assertNoForbiddenObjectKeys(child, forbiddenKeys, `${path}.${key}`);
  }
}

function nextRevisionFrom(commandPayload, previousRevision) {
  const applied = Number(commandPayload?.mutation?.appliedRevision);
  return Number.isFinite(applied) ? applied : previousRevision;
}

export function createRequestId(prefix) {
  createRequestId.sequence = (createRequestId.sequence || 0) + 1;
  return `${prefix}-${Date.now()}-${createRequestId.sequence}`;
}

export async function createDemoSession(origin) {
  const result = await postJson(origin, '/api/demo/session');
  assertOkResponse('Demo session creation', result);
  const cookie = sessionCookieFrom(result.response);
  assert.ok(cookie, 'Demo session did not return a ks2_session cookie.');
  assert.equal(result.payload?.session?.demo, true, 'Demo session payload was not marked as demo.');
  return { cookie, session: result.payload.session };
}

export async function loadBootstrap(origin, cookie) {
  const result = await getJson(origin, '/api/bootstrap', { cookie });
  assertOkResponse('Bootstrap', result);
  const learnerId = result.payload?.learners?.selectedId;
  assert.ok(learnerId, 'Bootstrap did not include a selected learner.');
  return {
    payload: result.payload,
    learnerId,
    revision: Number(result.payload?.learners?.byId?.[learnerId]?.stateRevision) || 0,
  };
}

export async function subjectCommand({
  origin,
  cookie,
  subjectId,
  learnerId,
  revision,
  command,
  payload = {},
}) {
  const requestId = createRequestId(`${subjectId}-${command}`);
  const result = await postJson(origin, `/api/subjects/${encodeURIComponent(subjectId)}/command`, {
    subjectId,
    learnerId,
    command,
    requestId,
    correlationId: requestId,
    expectedLearnerRevision: revision,
    payload,
  }, { cookie });
  assertOkResponse(`${subjectId} ${command}`, result);
  return {
    payload: result.payload,
    revision: nextRevisionFrom(result.payload, revision),
  };
}
