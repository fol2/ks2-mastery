export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  });
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

// Public-endpoint JSON reader with byte-level size enforcement (R23).
// Reading the body as ArrayBuffer first means a crafted client cannot bypass
// the cap by omitting or lying on `content-length` — the header is advisory.
// Throws an object with `code: 'ops_error_payload_too_large'` when oversized
// so callers can surface it as a 400 without a full HttpError subclass.
export async function readJsonBounded(request, maxBytes) {
  const cap = Number.isFinite(Number(maxBytes)) && Number(maxBytes) > 0
    ? Number(maxBytes)
    : 0;
  let buffer;
  try {
    buffer = await request.arrayBuffer();
  } catch {
    return {};
  }
  if (cap > 0 && buffer.byteLength > cap) {
    const error = new Error('Payload exceeds maximum allowed size.');
    error.code = 'ops_error_payload_too_large';
    error.status = 400;
    throw error;
  }
  try {
    const text = new TextDecoder().decode(buffer);
    if (!text) return {};
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export async function readForm(request) {
  const form = await request.formData().catch(() => null);
  if (!form) return {};
  return Object.fromEntries(form.entries());
}
