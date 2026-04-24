function joinUrl(baseUrl, path) {
  const base = String(baseUrl || '').replace(/\/$/, '');
  const suffix = String(path || '').startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}

export function createReadModelClient({
  baseUrl = '',
  fetch: fetchFn = (input, init) => globalThis.fetch(input, init),
} = {}) {
  if (typeof fetchFn !== 'function') {
    throw new TypeError('Read-model client requires a fetch implementation.');
  }

  async function readJson(path) {
    const response = await fetchFn(joinUrl(baseUrl, path), {
      method: 'GET',
      headers: { accept: 'application/json' },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) {
      const error = new Error(payload?.message || `Read model request failed (${response.status}).`);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  return { readJson };
}
