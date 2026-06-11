const SNAPSHOT_GZIP_BASE64_PREFIX = 'gzip-base64:';

function bytesToBase64(bytes) {
  if (typeof btoa !== 'function') {
    if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
    throw new Error('Base64 encoding is not available in this runtime.');
  }
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(base64) {
  if (typeof atob !== 'function') {
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(base64, 'base64'));
    throw new Error('Base64 decoding is not available in this runtime.');
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function gzipBytes(bytes) {
  if (typeof CompressionStream !== 'function') {
    throw new Error('CompressionStream is not available in this runtime.');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzipBytes(bytes) {
  if (typeof DecompressionStream !== 'function') {
    throw new Error('DecompressionStream is not available in this runtime.');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function encodeContentOperationSnapshot(value) {
  const json = typeof value === 'string' ? value : JSON.stringify(value);
  const bytes = new TextEncoder().encode(json);
  const compressed = await gzipBytes(bytes);
  return `${SNAPSHOT_GZIP_BASE64_PREFIX}${bytesToBase64(compressed)}`;
}

export async function decodeContentOperationSnapshot(encoded) {
  const value = String(encoded || '');
  if (!value.startsWith(SNAPSHOT_GZIP_BASE64_PREFIX)) return value;
  const compressed = base64ToBytes(value.slice(SNAPSHOT_GZIP_BASE64_PREFIX.length));
  const decompressed = await gunzipBytes(compressed);
  return new TextDecoder().decode(decompressed);
}

export function isEncodedContentOperationSnapshot(value) {
  return String(value || '').startsWith(SNAPSHOT_GZIP_BASE64_PREFIX);
}
