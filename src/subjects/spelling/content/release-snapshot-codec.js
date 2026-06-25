const SNAPSHOT_GZIP_BASE64_PREFIX = 'gzip-base64:';
const SNAPSHOT_BROTLI_BASE64_PREFIX = 'brotli-base64:';

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

async function compressBytes(bytes, format) {
  if (typeof CompressionStream !== 'function') {
    throw new Error('CompressionStream is not available in this runtime.');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function tryCompressBytes(bytes, format) {
  try {
    return await compressBytes(bytes, format);
  } catch {
    return null;
  }
}

async function decompressBytes(bytes, format) {
  if (typeof DecompressionStream !== 'function') {
    throw new Error('DecompressionStream is not available in this runtime.');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function encodeContentOperationSnapshot(value) {
  const json = typeof value === 'string' ? value : JSON.stringify(value);
  const bytes = new TextEncoder().encode(json);
  const brotliCompressed = await tryCompressBytes(bytes, 'brotli');
  if (brotliCompressed) {
    return `${SNAPSHOT_BROTLI_BASE64_PREFIX}${bytesToBase64(brotliCompressed)}`;
  }
  const compressed = await compressBytes(bytes, 'gzip');
  return `${SNAPSHOT_GZIP_BASE64_PREFIX}${bytesToBase64(compressed)}`;
}

export async function decodeContentOperationSnapshot(encoded) {
  const value = String(encoded || '');
  const brotli = value.startsWith(SNAPSHOT_BROTLI_BASE64_PREFIX);
  const gzip = value.startsWith(SNAPSHOT_GZIP_BASE64_PREFIX);
  if (!brotli && !gzip) return value;
  const prefix = brotli ? SNAPSHOT_BROTLI_BASE64_PREFIX : SNAPSHOT_GZIP_BASE64_PREFIX;
  const compressed = base64ToBytes(value.slice(prefix.length));
  const decompressed = await decompressBytes(compressed, brotli ? 'brotli' : 'gzip');
  return new TextDecoder().decode(decompressed);
}

export function isEncodedContentOperationSnapshot(value) {
  const text = String(value || '');
  return text.startsWith(SNAPSHOT_BROTLI_BASE64_PREFIX) || text.startsWith(SNAPSHOT_GZIP_BASE64_PREFIX);
}

export function contentOperationSnapshotEncoding(value) {
  const text = String(value || '');
  if (text.startsWith(SNAPSHOT_BROTLI_BASE64_PREFIX)) return 'brotli-base64';
  if (text.startsWith(SNAPSHOT_GZIP_BASE64_PREFIX)) return 'gzip-base64';
  return 'plain';
}
