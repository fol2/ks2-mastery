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

function payloadTooLargeError() {
  const error = new Error('Payload exceeds maximum allowed size.');
  error.code = 'ops_error_payload_too_large';
  error.status = 400;
  return error;
}

// Public-endpoint JSON reader with byte-level size enforcement (R23).
// The content-length header is advisory; the actual stream is capped while it
// is being read so oversized bodies can be rejected before full buffering.
// Throws an object with `code: 'ops_error_payload_too_large'` when oversized
// so callers can surface it as a 400 without a full HttpError subclass.
export async function readJsonBounded(request, maxBytes) {
  const cap = Number.isFinite(Number(maxBytes)) && Number(maxBytes) > 0
    ? Number(maxBytes)
    : 0;
  let bytes;
  try {
    const reader = request.body?.getReader?.();
    if (reader) {
      const chunks = [];
      let total = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
          total += chunk.byteLength;
          if (cap > 0 && total > cap) {
            await reader.cancel().catch(() => {});
            throw payloadTooLargeError();
          }
          chunks.push(chunk);
        }
      } finally {
        reader.releaseLock?.();
      }
      bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
    } else {
      const buffer = await request.arrayBuffer();
      if (cap > 0 && buffer.byteLength > cap) {
        throw payloadTooLargeError();
      }
      bytes = new Uint8Array(buffer);
    }
  } catch (error) {
    if (error?.code === 'ops_error_payload_too_large') throw error;
    return {};
  }
  try {
    const text = new TextDecoder().decode(bytes);
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
