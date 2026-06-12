import { uid } from '../../../src/platform/core/utils.js';
import {
  MONSTERS,
  MONSTER_BRANCHES,
} from '../../../src/platform/game/monsters.js';
import {
  CONTENT_OPERATION_PACKAGE_STATES,
  CONTENT_OPERATION_MONSTER_ASSET_REFERENCE_ENTITY_TYPE,
  CONTENT_OPERATION_SUBJECT_ID,
  contentOperationHash,
  contentOperationValueHash,
} from '../../../src/subjects/spelling/content/operations-model.js';
import {
  all,
  batch,
  bindStatement,
  first,
} from '../d1.js';
import {
  BackendUnavailableError,
  BadRequestError,
  ConflictError,
  NotFoundError,
} from '../errors.js';

export const CONTENT_OPERATION_MONSTER_ASSET_KIND = 'monster-image';
export const CONTENT_OPERATION_MONSTER_ASSET_MAX_BYTES = 4 * 1024 * 1024;
export const CONTENT_OPERATION_MONSTER_ASSET_MAX_MULTIPART_BYTES = (
  CONTENT_OPERATION_MONSTER_ASSET_MAX_BYTES + (256 * 1024)
);

const CONTENT_OPERATION_MONSTER_ASSET_PREFIX = 'content-operations/packages';
const MIN_RENDERER_DIMENSION = 96;
const MAX_RENDERER_DIMENSION = 4096;
const MAX_RENDERER_ASPECT_RATIO = 4;
const VALID_STAGE_IDS = new Set(['0', '1', '2', '3', '4']);
const VALID_BRANCH_IDS = new Set(MONSTER_BRANCHES);
const VALID_MONSTER_IDS = new Set(Object.keys(MONSTERS));
const ASSET_REFERENCE_MANIFEST_SCHEMA_VERSION = 1;
const ASSET_REFERENCE_RENDERER_CONTEXTS = Object.freeze([
  'hero-camp',
  'hero-codex',
  'reward-track',
  'subject-setup',
]);
const ASSET_REFERENCE_RESPONSIVE_DERIVATIVE_POLICY = Object.freeze({
  mode: 'source_image_until_runtime_derivatives',
  sourceRequired: true,
  generatedDerivatives: [],
  plannedWidths: [320, 640, 960, 1280],
  owner: 'content-operations',
});
const ASSET_REFERENCE_RETENTION_POLICY = Object.freeze({
  draftRetentionDays: 30,
  publishedRetentionDays: 180,
  rollbackAvailability: 'release-reference-retained',
  cleanupOwner: 'content-operations',
  runtimeCleanupBlockedUntil: 'remote-monster-asset-runtime-reader',
});
const SUPPORTED_IMAGE_TYPES = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
});
const MONSTER_ASSET_BODY_EXCEEDS_CAP = Symbol('monster-asset-body-exceeds-cap');

function parseJson(value, fallback = null) {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normaliseString(value, fallback = '') {
  return typeof value === 'string' ? value.trim() || fallback : fallback;
}

function mutationChangeCount(result) {
  return Math.max(0, Number(result?.meta?.changes ?? result?.meta?.rows_written) || 0);
}

function normaliseStageId(value) {
  const stage = String(value ?? '').trim();
  if (!VALID_STAGE_IDS.has(stage)) return '';
  return stage;
}

function normaliseBranchId(value) {
  const branch = String(value ?? '').trim();
  if (!VALID_BRANCH_IDS.has(branch)) return '';
  return branch;
}

function normaliseMonsterId(value) {
  const monsterId = String(value ?? '').trim();
  if (!VALID_MONSTER_IDS.has(monsterId)) return '';
  return monsterId;
}

function contentOperationAssetBucket(env = {}) {
  const bucket = env.SPELLING_AUDIO_BUCKET;
  return bucket && typeof bucket.get === 'function' && typeof bucket.put === 'function'
    ? bucket
    : null;
}

function assertContentOperationAssetBucket(env = {}) {
  const bucket = contentOperationAssetBucket(env);
  if (!bucket) {
    throw new BackendUnavailableError('Content operation asset storage is not available.', {
      code: 'content_operation_asset_storage_unavailable',
    });
  }
  return bucket;
}

function overflowError() {
  const error = new Error('monster-asset-body-exceeds-cap');
  error.code = MONSTER_ASSET_BODY_EXCEEDS_CAP;
  return error;
}

async function readRequestBodyWithCap(request, cap) {
  const reader = request.body?.getReader?.();
  if (!reader) {
    if (typeof request.arrayBuffer !== 'function') return null;
    const buffer = await request.arrayBuffer();
    if (buffer.byteLength > cap) throw overflowError();
    return new Uint8Array(buffer);
  }

  const chunks = [];
  let read = 0;
  try {
    while (true) {
      // eslint-disable-next-line no-await-in-loop
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      read += value.byteLength;
      if (read > cap) {
        try { reader.cancel(); } catch { /* ignore */ }
        throw overflowError();
      }
      chunks.push(value);
    }
  } finally {
    try { reader.releaseLock(); } catch { /* ignore */ }
  }

  const output = new Uint8Array(read);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

async function readMultipartFormWithCap(request, cap) {
  const bytes = await readRequestBodyWithCap(request, cap);
  if (!bytes) return request.formData().catch(() => null);
  const formRequest = new Request('https://content-operations.local/monster-asset-upload', {
    method: 'POST',
    headers: request.headers,
    body: bytes,
  });
  return formRequest.formData().catch(() => null);
}

function assetUploadRowToRecord(row) {
  if (!row) return null;
  return {
    assetUploadId: row.asset_upload_id,
    packageId: row.package_id,
    monsterId: row.monster_id,
    branchId: row.branch_id,
    stageId: row.stage_id,
    assetKind: row.asset_kind,
    r2Key: row.r2_key,
    contentType: row.content_type,
    byteSize: Number(row.byte_size) || 0,
    width: row.width == null ? null : Number(row.width),
    height: row.height == null ? null : Number(row.height),
    validation: parseJson(row.validation_json, { ok: false, errors: [], warnings: [] }),
    preview: parseJson(row.preview_json, null),
    status: row.status,
    createdByAccountId: row.created_by_account_id,
    createdAt: Number(row.created_at) || 0,
  };
}

async function requirePackage(db, packageId, { allowPublished = false } = {}) {
  const row = await first(db, `
    SELECT *
    FROM content_operation_packages
    WHERE package_id = ?
  `, [packageId]);
  if (!row) {
    throw new NotFoundError('Content operation package was not found.', {
      code: 'content_operation_package_not_found',
      packageId,
    });
  }
  if (!allowPublished && row.state === CONTENT_OPERATION_PACKAGE_STATES.PUBLISHED) {
    throw new BadRequestError('Published content operation packages cannot accept draft asset uploads.', {
      code: 'content_operation_package_published',
      packageId,
    });
  }
  return row;
}

function readUint24LE(bytes, offset) {
  return bytes[offset] + (bytes[offset + 1] << 8) + (bytes[offset + 2] << 16);
}

function readUint16BE(bytes, offset) {
  return (bytes[offset] << 8) + bytes[offset + 1];
}

function readUint16LE(bytes, offset) {
  return bytes[offset] + (bytes[offset + 1] << 8);
}

function readUint32BE(bytes, offset) {
  return (
    (bytes[offset] << 24)
    | (bytes[offset + 1] << 16)
    | (bytes[offset + 2] << 8)
    | bytes[offset + 3]
  ) >>> 0;
}

function readUint32LE(bytes, offset) {
  return (
    bytes[offset]
    | (bytes[offset + 1] << 8)
    | (bytes[offset + 2] << 16)
    | (bytes[offset + 3] << 24)
  ) >>> 0;
}

function asciiAt(bytes, offset, length) {
  let text = '';
  for (let index = 0; index < length; index += 1) {
    text += String.fromCharCode(bytes[offset + index] || 0);
  }
  return text;
}

function buildCrc32Table() {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? ((0xedb88320 ^ (value >>> 1)) >>> 0) : (value >>> 1);
    }
    table[index] = value >>> 0;
  }
  return table;
}

const CRC32_TABLE = buildCrc32Table();

function crc32(bytes, start = 0, end = bytes.length) {
  let crc = 0xffffffff;
  for (let index = start; index < end; index += 1) {
    crc = CRC32_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concatByteArrays(chunks) {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

async function inflateDeflateBytes(bytes) {
  if (typeof DecompressionStream !== 'function') return null;
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

function pngBitsPerPixel(bitDepth, colourType) {
  const samplesByColourType = {
    0: 1,
    2: 3,
    3: 1,
    4: 2,
    6: 4,
  };
  const samples = samplesByColourType[colourType] || 0;
  return samples * bitDepth;
}

function adam7PassSize(size, start, step) {
  return size > start ? Math.floor((size - start + step - 1) / step) : 0;
}

function validatePngInflatedRows(inflated, {
  width,
  height,
  bitDepth,
  colourType,
  interlace,
}) {
  const bitsPerPixel = pngBitsPerPixel(bitDepth, colourType);
  if (!bitsPerPixel || width <= 0 || height <= 0) return false;
  const passes = interlace === 1
    ? [
      [0, 0, 8, 8],
      [4, 0, 8, 8],
      [0, 4, 4, 8],
      [2, 0, 4, 4],
      [0, 2, 2, 4],
      [1, 0, 2, 2],
      [0, 1, 1, 2],
    ]
    : [[0, 0, 1, 1]];

  let offset = 0;
  for (const [startX, startY, stepX, stepY] of passes) {
    const passWidth = adam7PassSize(width, startX, stepX);
    const passHeight = adam7PassSize(height, startY, stepY);
    if (!passWidth || !passHeight) continue;
    const rowBytes = Math.ceil((passWidth * bitsPerPixel) / 8);
    const stride = rowBytes + 1;
    for (let row = 0; row < passHeight; row += 1) {
      if (offset + stride > inflated.length) return false;
      if (inflated[offset] > 4) return false;
      offset += stride;
    }
  }
  return offset === inflated.length;
}

function isValidPngIhdr(bytes, dataOffset) {
  const bitDepth = bytes[dataOffset + 8];
  const colourType = bytes[dataOffset + 9];
  const compression = bytes[dataOffset + 10];
  const filter = bytes[dataOffset + 11];
  const interlace = bytes[dataOffset + 12];
  const allowedBitDepths = {
    0: new Set([1, 2, 4, 8, 16]),
    2: new Set([8, 16]),
    3: new Set([1, 2, 4, 8]),
    4: new Set([8, 16]),
    6: new Set([8, 16]),
  };
  return Boolean(
    allowedBitDepths[colourType]?.has(bitDepth)
      && compression === 0
      && filter === 0
      && (interlace === 0 || interlace === 1),
  );
}

async function parsePngDimensions(bytes) {
  if (bytes.length < 45) return null;
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!signature.every((value, index) => bytes[index] === value)) return null;

  let offset = 8;
  let dimensions = null;
  let bitDepth = 0;
  let colourType = 0;
  let interlace = 0;
  let sawIdat = false;
  let sawIend = false;
  let chunkIndex = 0;
  const idatChunks = [];

  while (offset + 12 <= bytes.length) {
    const chunkLength = readUint32BE(bytes, offset);
    const typeOffset = offset + 4;
    const dataOffset = offset + 8;
    const dataEnd = dataOffset + chunkLength;
    const crcOffset = dataEnd;
    const nextOffset = crcOffset + 4;
    if (dataEnd > bytes.length || nextOffset > bytes.length) return null;

    const chunkType = asciiAt(bytes, typeOffset, 4);
    if (readUint32BE(bytes, crcOffset) !== crc32(bytes, typeOffset, dataEnd)) return null;
    if (chunkIndex === 0 && chunkType !== 'IHDR') return null;

    if (chunkType === 'IHDR') {
      if (chunkIndex !== 0 || chunkLength !== 13 || !isValidPngIhdr(bytes, dataOffset)) return null;
      dimensions = {
        width: readUint32BE(bytes, dataOffset),
        height: readUint32BE(bytes, dataOffset + 4),
      };
      bitDepth = bytes[dataOffset + 8];
      colourType = bytes[dataOffset + 9];
      interlace = bytes[dataOffset + 12];
    } else if (chunkType === 'IDAT') {
      if (!dimensions || chunkLength < 1) return null;
      sawIdat = true;
      idatChunks.push(bytes.slice(dataOffset, dataEnd));
    } else if (chunkType === 'IEND') {
      if (chunkLength !== 0 || !dimensions || !sawIdat) return null;
      sawIend = true;
      if (nextOffset !== bytes.length) return null;
      const inflated = await inflateDeflateBytes(concatByteArrays(idatChunks));
      if (!inflated || !validatePngInflatedRows(inflated, {
        ...dimensions,
        bitDepth,
        colourType,
        interlace,
      })) {
        return null;
      }
      return dimensions;
    }

    offset = nextOffset;
    chunkIndex += 1;
  }

  return sawIend ? dimensions : null;
}

function parseWebpDimensions(bytes) {
  if (bytes.length < 30 || asciiAt(bytes, 0, 4) !== 'RIFF' || asciiAt(bytes, 8, 4) !== 'WEBP') {
    return null;
  }

  const declaredLength = readUint32LE(bytes, 4) + 8;
  if (declaredLength !== bytes.length) return null;

  let offset = 12;
  let containerDimensions = null;
  let imageDimensions = null;
  while (offset + 8 <= bytes.length) {
    const chunk = asciiAt(bytes, offset, 4);
    const chunkLength = readUint32LE(bytes, offset + 4);
    const dataOffset = offset + 8;
    const dataEnd = dataOffset + chunkLength;
    if (dataEnd > bytes.length) return null;

    if (chunk === 'VP8X') {
      if (chunkLength < 10) return null;
      containerDimensions = {
        width: readUint24LE(bytes, dataOffset + 4) + 1,
        height: readUint24LE(bytes, dataOffset + 7) + 1,
      };
    } else if (chunk === 'VP8L') {
      if (chunkLength <= 5 || bytes[dataOffset] !== 0x2f) return null;
      const b1 = bytes[dataOffset + 1];
      const b2 = bytes[dataOffset + 2];
      const b3 = bytes[dataOffset + 3];
      const b4 = bytes[dataOffset + 4];
      imageDimensions = {
        width: 1 + (((b2 & 0x3f) << 8) | b1),
        height: 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6)),
      };
    } else if (chunk === 'VP8 ') {
      if (
        chunkLength <= 10
        || bytes[dataOffset + 3] !== 0x9d
        || bytes[dataOffset + 4] !== 0x01
        || bytes[dataOffset + 5] !== 0x2a
      ) {
        return null;
      }
      imageDimensions = {
        width: readUint16LE(bytes, dataOffset + 6) & 0x3fff,
        height: readUint16LE(bytes, dataOffset + 8) & 0x3fff,
      };
    }

    offset = dataEnd + (chunkLength % 2);
  }

  if (offset !== bytes.length || !imageDimensions) return null;
  if (
    containerDimensions
    && (
      containerDimensions.width !== imageDimensions.width
      || containerDimensions.height !== imageDimensions.height
    )
  ) {
    return null;
  }
  return imageDimensions;
}

function validateJpegQuantisationTables(bytes, offset, length) {
  const end = offset + length;
  let cursor = offset;
  let tableCount = 0;
  while (cursor < end) {
    const tableInfo = bytes[cursor];
    cursor += 1;
    const precision = tableInfo >> 4;
    const tableId = tableInfo & 0x0f;
    if (precision > 1 || tableId > 3) return false;
    const tableBytes = 64 * (precision + 1);
    if (cursor + tableBytes > end) return false;
    cursor += tableBytes;
    tableCount += 1;
  }
  return tableCount > 0 && cursor === end;
}

function validateJpegHuffmanTables(bytes, offset, length) {
  const end = offset + length;
  let cursor = offset;
  let tableCount = 0;
  while (cursor < end) {
    if (cursor + 17 > end) return false;
    const tableInfo = bytes[cursor];
    cursor += 1;
    const tableClass = tableInfo >> 4;
    const tableId = tableInfo & 0x0f;
    if (tableClass > 1 || tableId > 3) return false;
    let symbolCount = 0;
    for (let index = 0; index < 16; index += 1) {
      symbolCount += bytes[cursor + index];
    }
    if (symbolCount > 256) return false;
    cursor += 16;
    if (cursor + symbolCount > end) return false;
    cursor += symbolCount;
    tableCount += 1;
  }
  return tableCount > 0 && cursor === end;
}

function parseJpegStartOfFrame(bytes, offset, length) {
  if (length < 9) return null;
  const precision = bytes[offset];
  const height = readUint16BE(bytes, offset + 1);
  const width = readUint16BE(bytes, offset + 3);
  const componentCount = bytes[offset + 5];
  if (![8, 12].includes(precision)) return null;
  if (width <= 0 || height <= 0) return null;
  if (componentCount < 1 || componentCount > 4) return null;
  if (length !== 6 + (componentCount * 3)) return null;
  const componentIds = new Set();
  for (let index = 0; index < componentCount; index += 1) {
    const componentOffset = offset + 6 + (index * 3);
    const componentId = bytes[componentOffset];
    const samplingFactors = bytes[componentOffset + 1];
    const quantisationTableId = bytes[componentOffset + 2];
    if (!componentId || componentIds.has(componentId)) return null;
    if ((samplingFactors >> 4) === 0 || (samplingFactors & 0x0f) === 0) return null;
    if (quantisationTableId > 3) return null;
    componentIds.add(componentId);
  }
  return { width, height };
}

function validateJpegStartOfScan(bytes, offset, length) {
  if (length < 6) return false;
  const componentCount = bytes[offset];
  if (componentCount < 1 || componentCount > 4) return false;
  if (length !== 4 + (componentCount * 2)) return false;
  const componentIds = new Set();
  for (let index = 0; index < componentCount; index += 1) {
    const componentOffset = offset + 1 + (index * 2);
    const componentId = bytes[componentOffset];
    const tableSelectors = bytes[componentOffset + 1];
    if (!componentId || componentIds.has(componentId)) return false;
    if ((tableSelectors >> 4) > 3 || (tableSelectors & 0x0f) > 3) return false;
    componentIds.add(componentId);
  }
  const spectralStart = bytes[offset + 1 + (componentCount * 2)];
  const spectralEnd = bytes[offset + 2 + (componentCount * 2)];
  if (spectralStart > 63 || spectralEnd > 63 || spectralStart > spectralEnd) return false;
  return true;
}

function validateJpegEntropyScan(bytes, offset) {
  let cursor = offset;
  let entropyBytes = 0;
  while (cursor < bytes.length) {
    if (bytes[cursor] !== 0xff) {
      entropyBytes += 1;
      cursor += 1;
      continue;
    }
    const markerOffset = cursor;
    while (cursor < bytes.length && bytes[cursor] === 0xff) cursor += 1;
    if (cursor >= bytes.length) return { ok: false, eoiOffset: -1 };
    const marker = bytes[cursor];
    cursor += 1;
    if (marker === 0x00) {
      entropyBytes += 1;
      continue;
    }
    if (marker >= 0xd0 && marker <= 0xd7) continue;
    if (marker === 0xd9) {
      return {
        ok: entropyBytes > 0,
        eoiOffset: markerOffset,
        entropyBytes,
      };
    }
    return { ok: false, eoiOffset: -1 };
  }
  return { ok: false, eoiOffset: -1 };
}

function parseJpegDimensions(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  if (bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) return null;
  let offset = 2;
  let dimensions = null;
  let sawScan = false;
  let sawQuantisationTable = false;
  let sawHuffmanTable = false;
  while (offset + 4 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) return null;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0x00) return null;
    if (marker === 0xd9) return null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) return null;
    const segmentLength = readUint16BE(bytes, offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return null;
    const dataOffset = offset + 2;
    const dataLength = segmentLength - 2;
    const isStartOfFrame = (
      (marker >= 0xc0 && marker <= 0xc3)
      || (marker >= 0xc5 && marker <= 0xc7)
      || (marker >= 0xc9 && marker <= 0xcb)
      || (marker >= 0xcd && marker <= 0xcf)
    );

    if (marker === 0xdb) {
      if (!validateJpegQuantisationTables(bytes, dataOffset, dataLength)) return null;
      sawQuantisationTable = true;
    } else if (marker === 0xc4) {
      if (!validateJpegHuffmanTables(bytes, dataOffset, dataLength)) return null;
      sawHuffmanTable = true;
    } else if (isStartOfFrame) {
      const frame = parseJpegStartOfFrame(bytes, dataOffset, dataLength);
      if (!frame) return null;
      dimensions = {
        height: frame.height,
        width: frame.width,
      };
    } else if (marker === 0xda) {
      if (!dimensions || !sawQuantisationTable || !sawHuffmanTable) return null;
      if (!validateJpegStartOfScan(bytes, dataOffset, dataLength)) return null;
      const scan = validateJpegEntropyScan(bytes, offset + segmentLength);
      const minEntropyBytes = dimensions
        ? Math.max(16, Math.ceil((dimensions.width * dimensions.height) / 1024))
        : 16;
      if (!scan.ok || scan.entropyBytes < minEntropyBytes) return null;
      sawScan = true;
      offset = scan.eoiOffset + 2;
      break;
    }
    offset += segmentLength;
  }
  return dimensions && sawScan && offset === bytes.length ? dimensions : null;
}

async function parseImageDimensions(bytes, contentType) {
  if (contentType === 'image/png') return parsePngDimensions(bytes);
  if (contentType === 'image/webp') return parseWebpDimensions(bytes);
  if (contentType === 'image/jpeg') return parseJpegDimensions(bytes);
  return null;
}

function validateRendererCompatibility(dimensions) {
  const errors = [];
  const warnings = [];
  const width = Number(dimensions?.width) || 0;
  const height = Number(dimensions?.height) || 0;
  const aspectRatio = width && height ? Math.max(width / height, height / width) : 0;
  if (!width || !height) {
    errors.push({
      code: 'content_operation_monster_asset_dimensions_missing',
      message: 'Monster image dimensions could not be read.',
    });
  }
  if (width > 0 && height > 0 && (width < MIN_RENDERER_DIMENSION || height < MIN_RENDERER_DIMENSION)) {
    errors.push({
      code: 'content_operation_monster_asset_dimensions_too_small',
      message: `Monster image assets must be at least ${MIN_RENDERER_DIMENSION}px on both sides.`,
      width,
      height,
    });
  }
  if (width > MAX_RENDERER_DIMENSION || height > MAX_RENDERER_DIMENSION) {
    errors.push({
      code: 'content_operation_monster_asset_dimensions_too_large',
      message: `Monster image assets must be no larger than ${MAX_RENDERER_DIMENSION}px on either side.`,
      width,
      height,
    });
  }
  if (aspectRatio > MAX_RENDERER_ASPECT_RATIO) {
    errors.push({
      code: 'content_operation_monster_asset_aspect_ratio_unsupported',
      message: `Monster image assets must not exceed a ${MAX_RENDERER_ASPECT_RATIO}:1 aspect ratio.`,
      width,
      height,
      aspectRatio,
    });
  }
  if (width > 0 && height > 0 && (width < 320 || height < 320)) {
    warnings.push({
      code: 'content_operation_monster_asset_resolution_low',
      message: 'Monster image assets below 320px may look soft in codex and camp surfaces.',
      width,
      height,
    });
  }
  return {
    ok: errors.length === 0,
    status: errors.length ? 'blocked' : 'passed',
    renderer: {
      minDimension: MIN_RENDERER_DIMENSION,
      maxDimension: MAX_RENDERER_DIMENSION,
      maxAspectRatio: MAX_RENDERER_ASPECT_RATIO,
      contexts: ['hero-camp', 'hero-codex', 'reward-track', 'subject-setup'],
    },
    errors,
    warnings,
  };
}

function validateTarget({ monsterId, branchId, stageId }) {
  const errors = [];
  if (!monsterId) {
    errors.push({
      code: 'content_operation_monster_asset_monster_unknown',
      field: 'monsterId',
      message: 'Monster image uploads must target a known monster.',
    });
  }
  if (!branchId) {
    errors.push({
      code: 'content_operation_monster_asset_branch_unknown',
      field: 'branchId',
      message: 'Monster image uploads must target a known monster branch.',
    });
  }
  if (!stageId) {
    errors.push({
      code: 'content_operation_monster_asset_stage_unknown',
      field: 'stageId',
      message: 'Monster image uploads must target stage 0, 1, 2, 3 or 4.',
    });
  }
  if (errors.length) {
    throw new BadRequestError('Monster image upload target is invalid.', {
      code: 'content_operation_monster_asset_target_invalid',
      errors,
    });
  }
}

function fileFromForm(form) {
  const file = form.get('asset') || form.get('file') || form.get('image');
  return file && typeof file.arrayBuffer === 'function' ? file : null;
}

function filenameForUpload({ monsterId, branchId, stageId, extension }) {
  return `${monsterId}-${branchId}-${stageId}.${extension}`;
}

function previewUrlForUpload({ packageId, assetUploadId }) {
  return `/api/admin/content-operations/packages/${encodeURIComponent(packageId)}/monster-assets/${encodeURIComponent(assetUploadId)}/preview`;
}

export function contentOperationMonsterAssetReferenceEntityId({
  monsterId,
  branchId,
  stageId,
} = {}) {
  return [
    normaliseString(monsterId),
    normaliseString(branchId),
    normaliseString(stageId),
  ].filter(Boolean).join(':');
}

function assetReferenceId(item = {}) {
  return `monster-image:${contentOperationMonsterAssetReferenceEntityId(item)}`;
}

function safePreviewForReference(preview = {}, contentType = '') {
  return {
    kind: normaliseString(preview.kind, 'admin-api-handle'),
    url: normaliseString(preview.url) || null,
    contentType: normaliseString(preview.contentType, contentType),
  };
}

function monsterAssetReferencePayloadFromUpload({
  packageId,
  assetUploadId,
  monsterId,
  branchId,
  stageId,
  contentType,
  byteSize,
  dimensions,
  preview,
  validation,
  createdAt,
}) {
  const target = { monsterId, branchId, stageId };
  const renderer = validation?.renderer && typeof validation.renderer === 'object'
    ? validation.renderer
    : { contexts: ASSET_REFERENCE_RENDERER_CONTEXTS };
  return {
    schemaVersion: ASSET_REFERENCE_MANIFEST_SCHEMA_VERSION,
    referenceId: assetReferenceId(target),
    assetKind: CONTENT_OPERATION_MONSTER_ASSET_KIND,
    assetUploadId,
    packageId,
    target,
    preview: safePreviewForReference(preview, contentType),
    content: {
      contentType,
      byteSize: Number(byteSize) || 0,
      dimensions: {
        width: Number(dimensions?.width) || null,
        height: Number(dimensions?.height) || null,
      },
    },
    validation: {
      status: normaliseString(validation?.status, validation?.ok ? 'passed' : 'blocked'),
      ok: validation?.ok === true,
      warnings: Array.isArray(validation?.warnings) ? validation.warnings : [],
      errors: Array.isArray(validation?.errors) ? validation.errors : [],
    },
    renderer: {
      contexts: Array.isArray(renderer.contexts) && renderer.contexts.length
        ? renderer.contexts
        : ASSET_REFERENCE_RENDERER_CONTEXTS,
      minDimension: Number(renderer.minDimension) || MIN_RENDERER_DIMENSION,
      maxDimension: Number(renderer.maxDimension) || MAX_RENDERER_DIMENSION,
      maxAspectRatio: Number(renderer.maxAspectRatio) || MAX_RENDERER_ASPECT_RATIO,
    },
    policy: {
      responsiveDerivatives: ASSET_REFERENCE_RESPONSIVE_DERIVATIVE_POLICY,
      retention: ASSET_REFERENCE_RETENTION_POLICY,
    },
    createdAt: Number(createdAt) || 0,
  };
}

function assetReferenceFromScanItem(item = {}) {
  return {
    schemaVersion: ASSET_REFERENCE_MANIFEST_SCHEMA_VERSION,
    referenceId: assetReferenceId(item),
    assetKind: item.assetKind || CONTENT_OPERATION_MONSTER_ASSET_KIND,
    assetUploadId: item.assetUploadId,
    packageId: item.packageId || null,
    target: {
      monsterId: item.monsterId,
      branchId: item.branchId,
      stageId: item.stageId,
    },
    preview: safePreviewForReference(item.preview, item.contentType),
    content: {
      contentType: item.contentType || '',
      byteSize: Number(item.byteSize) || 0,
      dimensions: item.dimensions || { width: null, height: null },
    },
    validation: {
      status: item.validationStatus || (item.validationOk ? 'passed' : 'blocked'),
      ok: item.validationOk === true,
      errorCodes: Array.isArray(item.errorCodes) ? item.errorCodes : [],
      warningCodes: Array.isArray(item.warningCodes) ? item.warningCodes : [],
    },
    storage: item.storage || { status: 'not_checked', byteSize: null, contentType: '' },
    renderer: item.renderer || {
      contexts: ASSET_REFERENCE_RENDERER_CONTEXTS,
      minDimension: MIN_RENDERER_DIMENSION,
      maxDimension: MAX_RENDERER_DIMENSION,
      maxAspectRatio: MAX_RENDERER_ASPECT_RATIO,
    },
    policy: {
      responsiveDerivatives: ASSET_REFERENCE_RESPONSIVE_DERIVATIVE_POLICY,
      retention: ASSET_REFERENCE_RETENTION_POLICY,
    },
    createdAt: Number(item.createdAt) || 0,
  };
}

export function buildContentOperationAssetReferenceManifest({
  packageId,
  status = 'not_scanned',
  hash = '',
  items = [],
} = {}) {
  const references = items.map((item) => assetReferenceFromScanItem({
    ...item,
    packageId,
  }));
  return {
    schemaVersion: ASSET_REFERENCE_MANIFEST_SCHEMA_VERSION,
    assetKind: CONTENT_OPERATION_MONSTER_ASSET_KIND,
    packageId: normaliseString(packageId),
    status: normaliseString(status, 'not_scanned'),
    hash: normaliseString(hash),
    referenceCount: references.length,
    references,
    policy: {
      responsiveDerivatives: ASSET_REFERENCE_RESPONSIVE_DERIVATIVE_POLICY,
      retention: ASSET_REFERENCE_RETENTION_POLICY,
      runtimeReadable: false,
      runtimeReadableFromTicket: 'T23',
      bundledManifestWriteBack: false,
    },
  };
}

function assetUploadScanItem(upload, storage = null) {
  const validation = upload.validation && typeof upload.validation === 'object' && !Array.isArray(upload.validation)
    ? upload.validation
    : { ok: false, status: 'blocked', errors: [], warnings: [] };
  const preview = upload.preview && typeof upload.preview === 'object' && !Array.isArray(upload.preview)
    ? upload.preview
    : {};
  const renderer = validation.renderer && typeof validation.renderer === 'object' && !Array.isArray(validation.renderer)
    ? validation.renderer
    : null;
  const storageErrors = Array.isArray(storage?.errors) ? storage.errors : [];
  return {
    assetUploadId: upload.assetUploadId,
    assetKind: upload.assetKind || CONTENT_OPERATION_MONSTER_ASSET_KIND,
    monsterId: upload.monsterId,
    branchId: upload.branchId,
    stageId: upload.stageId,
    status: upload.status || 'draft',
    validationStatus: validation.status || (validation.ok ? 'passed' : 'blocked'),
    validationOk: Boolean(validation.ok),
    errorCodes: (Array.isArray(validation.errors) ? validation.errors : [])
      .map((entry) => normaliseString(entry?.code))
      .filter(Boolean)
      .concat(storageErrors.map((entry) => normaliseString(entry?.code)).filter(Boolean)),
    warningCodes: (Array.isArray(validation.warnings) ? validation.warnings : [])
      .map((entry) => normaliseString(entry?.code))
      .filter(Boolean),
    contentType: upload.contentType || '',
    byteSize: Number(upload.byteSize) || 0,
    dimensions: {
      width: upload.width == null ? null : Number(upload.width),
      height: upload.height == null ? null : Number(upload.height),
    },
    preview: safePreviewForReference(preview, upload.contentType),
    renderer: renderer ? {
      contexts: Array.isArray(renderer.contexts) ? renderer.contexts : ASSET_REFERENCE_RENDERER_CONTEXTS,
      minDimension: Number(renderer.minDimension) || MIN_RENDERER_DIMENSION,
      maxDimension: Number(renderer.maxDimension) || MAX_RENDERER_DIMENSION,
      maxAspectRatio: Number(renderer.maxAspectRatio) || MAX_RENDERER_ASPECT_RATIO,
    } : {
      contexts: ASSET_REFERENCE_RENDERER_CONTEXTS,
      minDimension: MIN_RENDERER_DIMENSION,
      maxDimension: MAX_RENDERER_DIMENSION,
      maxAspectRatio: MAX_RENDERER_ASPECT_RATIO,
    },
    createdAt: Number(upload.createdAt) || 0,
    storage: storage ? {
      status: storage.status,
      byteSize: storage.byteSize,
      contentType: storage.contentType,
    } : {
      status: 'not_checked',
      byteSize: null,
      contentType: '',
    },
  };
}

async function bytesFromR2Object(object) {
  if (!object) return null;
  if (object.body instanceof Uint8Array) return object.body;
  if (object.body && typeof object.body.getReader === 'function') {
    return new Uint8Array(await new Response(object.body).arrayBuffer());
  }
  if (typeof object.arrayBuffer === 'function') {
    return new Uint8Array(await object.arrayBuffer());
  }
  return null;
}

async function verifyStoredAssetUpload(bucket, upload) {
  const object = await bucket.get(upload.r2Key).catch(() => null);
  if (!object) {
    return {
      status: 'missing',
      byteSize: null,
      contentType: '',
      errors: [{
        code: 'content_operation_asset_object_missing',
        message: 'Monster image upload is missing from asset storage.',
      }],
    };
  }

  const bytes = await bytesFromR2Object(object);
  const byteSize = bytes ? bytes.byteLength : Number(object.size) || null;
  const contentType = normaliseString(object.httpMetadata?.contentType).toLowerCase();
  const errors = [];
  if (byteSize !== Number(upload.byteSize)) {
    errors.push({
      code: 'content_operation_asset_object_size_mismatch',
      expected: Number(upload.byteSize),
      actual: byteSize,
    });
  }
  if (contentType && contentType !== upload.contentType) {
    errors.push({
      code: 'content_operation_asset_object_content_type_mismatch',
      expected: upload.contentType,
      actual: contentType,
    });
  }
  if (!bytes) {
    errors.push({
      code: 'content_operation_asset_object_unreadable',
      message: 'Monster image upload could not be read from asset storage.',
    });
  } else {
    const dimensions = await parseImageDimensions(bytes, upload.contentType);
    if (
      !dimensions
      || dimensions.width !== Number(upload.width)
      || dimensions.height !== Number(upload.height)
    ) {
      errors.push({
        code: 'content_operation_asset_object_image_mismatch',
        expected: {
          width: Number(upload.width) || null,
          height: Number(upload.height) || null,
        },
        actual: dimensions,
      });
    }
  }

  return {
    status: errors.length ? 'mismatch' : 'present',
    byteSize,
    contentType,
    errors,
  };
}

export async function buildContentOperationAssetScan(db, {
  packageId,
  env = null,
  verifyStorage = false,
} = {}) {
  const safePackageId = normaliseString(packageId);
  if (!safePackageId) {
    throw new BadRequestError('Package id is required for content operation asset scan.', {
      code: 'content_operation_package_id_required',
    });
  }
  await requirePackage(db, safePackageId, { allowPublished: true });
  const rows = await all(db, `
    SELECT *
    FROM content_operation_asset_uploads
    WHERE package_id = ?
    ORDER BY created_at ASC, asset_upload_id ASC
  `, [safePackageId]);
  const uploads = rows.map(assetUploadRowToRecord);
  const bucket = verifyStorage && uploads.length ? contentOperationAssetBucket(env || {}) : null;
  const storageByUploadId = new Map();
  if (verifyStorage && uploads.length && !bucket) {
    for (const upload of uploads) {
      storageByUploadId.set(upload.assetUploadId, {
        status: 'unavailable',
        byteSize: null,
        contentType: '',
        errors: [{
          code: 'content_operation_asset_storage_unavailable',
          message: 'Content operation asset storage is not available for readiness verification.',
        }],
      });
    }
  } else if (verifyStorage && bucket) {
    for (const upload of uploads) {
      // eslint-disable-next-line no-await-in-loop
      storageByUploadId.set(upload.assetUploadId, await verifyStoredAssetUpload(bucket, upload));
    }
  }
  const items = uploads.map((upload) => assetUploadScanItem(
    upload,
    storageByUploadId.get(upload.assetUploadId) || null,
  ));
  const blockers = [];
  const warnings = [];
  const targetCounts = new Map();

  for (const item of items) {
    if (
      !item.validationOk
      || item.validationStatus === 'blocked'
      || ['missing', 'mismatch', 'unavailable'].includes(item.storage?.status)
    ) {
      blockers.push({
        code: 'content_operation_asset_upload_invalid',
        assetUploadId: item.assetUploadId,
        target: {
          monsterId: item.monsterId,
          branchId: item.branchId,
          stageId: item.stageId,
        },
        errorCodes: item.errorCodes,
      });
    }
    for (const warningCode of item.warningCodes) {
      warnings.push({
        code: warningCode,
        assetUploadId: item.assetUploadId,
      });
    }
    const targetKey = `${item.monsterId}:${item.branchId}:${item.stageId}`;
    targetCounts.set(targetKey, (targetCounts.get(targetKey) || 0) + 1);
  }

  for (const [targetKey, count] of targetCounts.entries()) {
    if (count <= 1) continue;
    const [monsterId, branchId, stageId] = targetKey.split(':');
    blockers.push({
      code: 'content_operation_asset_target_has_multiple_uploads',
      count,
      target: { monsterId, branchId, stageId },
    });
  }

  const fingerprint = {
    assetKind: CONTENT_OPERATION_MONSTER_ASSET_KIND,
    packageId: safePackageId,
    items,
  };
  const status = blockers.length ? 'blocked' : (warnings.length ? 'warning' : 'passed');
  const hash = contentOperationHash(fingerprint, 'coassets');
  return {
    status,
    hash,
    blockers,
    warnings,
    uploadCount: items.length,
    itemCount: items.length,
    targetCount: targetCounts.size,
    items,
    assetReferenceManifest: buildContentOperationAssetReferenceManifest({
      packageId: safePackageId,
      status,
      hash,
      items,
    }),
  };
}

export async function uploadContentOperationMonsterAsset({
  db,
  env,
  packageId,
  request,
  actorAccountId,
  now = Date.now,
}) {
  const packageRow = await requirePackage(db, packageId);
  const actor = normaliseString(actorAccountId);
  if (!actor) {
    throw new BadRequestError('Monster image uploads require an actor account id.', {
      code: 'content_operation_monster_asset_actor_required',
      packageId,
    });
  }

  const bucket = assertContentOperationAssetBucket(env);
  const contentTypeHeader = request.headers.get('content-type') || '';
  if (!contentTypeHeader.toLowerCase().includes('multipart/form-data')) {
    throw new BadRequestError('Monster image uploads require multipart form data.', {
      code: 'content_operation_monster_asset_multipart_required',
      packageId,
    });
  }
  const declaredContentLength = Number(request.headers.get('content-length'));
  if (
    Number.isFinite(declaredContentLength)
    && declaredContentLength > CONTENT_OPERATION_MONSTER_ASSET_MAX_MULTIPART_BYTES
  ) {
    throw new BadRequestError('Monster image upload request exceeds the maximum multipart size.', {
      code: 'content_operation_monster_asset_request_too_large',
      byteSize: declaredContentLength,
      maxBytes: CONTENT_OPERATION_MONSTER_ASSET_MAX_MULTIPART_BYTES,
    });
  }

  let form;
  try {
    form = await readMultipartFormWithCap(request, CONTENT_OPERATION_MONSTER_ASSET_MAX_MULTIPART_BYTES);
  } catch (error) {
    if (error?.code === MONSTER_ASSET_BODY_EXCEEDS_CAP) {
      throw new BadRequestError('Monster image upload request exceeds the maximum multipart size.', {
        code: 'content_operation_monster_asset_request_too_large',
        maxBytes: CONTENT_OPERATION_MONSTER_ASSET_MAX_MULTIPART_BYTES,
      });
    }
    throw error;
  }
  if (!form) {
    throw new BadRequestError('Monster image upload form data could not be read.', {
      code: 'content_operation_monster_asset_form_invalid',
      packageId,
    });
  }

  const monsterId = normaliseMonsterId(form.get('monsterId') || form.get('monster_id'));
  const branchId = normaliseBranchId(form.get('branchId') || form.get('branch_id') || form.get('branch'));
  const stageId = normaliseStageId(form.get('stageId') || form.get('stage_id') || form.get('stage'));
  validateTarget({ monsterId, branchId, stageId });

  const file = fileFromForm(form);
  if (!file) {
    throw new BadRequestError('Monster image upload requires an image file.', {
      code: 'content_operation_monster_asset_file_required',
      packageId,
    });
  }

  const contentType = normaliseString(file.type).toLowerCase();
  const extension = SUPPORTED_IMAGE_TYPES[contentType] || '';
  if (!extension) {
    throw new BadRequestError('Monster image upload content type is not supported.', {
      code: 'content_operation_monster_asset_content_type_invalid',
      contentType,
      supportedContentTypes: Object.keys(SUPPORTED_IMAGE_TYPES),
    });
  }

  const byteSize = Number(file.size) || 0;
  if (byteSize <= 0) {
    throw new BadRequestError('Monster image upload must not be empty.', {
      code: 'content_operation_monster_asset_empty',
      contentType,
    });
  }
  if (byteSize > CONTENT_OPERATION_MONSTER_ASSET_MAX_BYTES) {
    throw new BadRequestError('Monster image upload exceeds the maximum size.', {
      code: 'content_operation_monster_asset_too_large',
      byteSize,
      maxBytes: CONTENT_OPERATION_MONSTER_ASSET_MAX_BYTES,
    });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const dimensions = await parseImageDimensions(bytes, contentType);
  const rendererValidation = validateRendererCompatibility(dimensions);
  if (!rendererValidation.ok) {
    throw new BadRequestError('Monster image upload is not compatible with the renderer.', {
      code: 'content_operation_monster_asset_renderer_invalid',
      validation: rendererValidation,
    });
  }

  const replacedUploads = await all(db, `
    SELECT *
    FROM content_operation_asset_uploads
    WHERE package_id = ?
      AND asset_kind = ?
      AND monster_id = ?
      AND branch_id = ?
      AND stage_id = ?
  `, [
    packageRow.package_id,
    CONTENT_OPERATION_MONSTER_ASSET_KIND,
    monsterId,
    branchId,
    stageId,
  ]).then((rows) => rows.map(assetUploadRowToRecord));

  const assetUploadId = uid('coasset');
  const filename = filenameForUpload({ monsterId, branchId, stageId, extension });
  const r2Key = `${CONTENT_OPERATION_MONSTER_ASSET_PREFIX}/${packageRow.package_id}/monster-assets/${assetUploadId}/${filename}`;
  const previewUrl = previewUrlForUpload({ packageId: packageRow.package_id, assetUploadId });
  const nowTs = Number(now());
  const validation = {
    ok: true,
    status: 'passed',
    errors: [],
    warnings: rendererValidation.warnings,
    target: {
      monsterId,
      branchId,
      stageId,
    },
    dimensions,
    renderer: rendererValidation.renderer,
  };
  const preview = {
    kind: 'admin-api-handle',
    url: previewUrl,
    contentType,
  };
  const assetReferencePayload = monsterAssetReferencePayloadFromUpload({
    packageId: packageRow.package_id,
    assetUploadId,
    monsterId,
    branchId,
    stageId,
    contentType,
    byteSize,
    dimensions,
    preview,
    validation,
    createdAt: nowTs,
  });
  const assetReferenceOperationId = uid('coop');
  const assetReferenceEntityId = contentOperationMonsterAssetReferenceEntityId({ monsterId, branchId, stageId });

  let r2Written = false;
  try {
    await bucket.put(r2Key, bytes, {
      httpMetadata: { contentType },
      customMetadata: {
        contentOperationAssetUploadId: assetUploadId,
        contentOperationPackageId: packageRow.package_id,
        contentOperationAssetKind: CONTENT_OPERATION_MONSTER_ASSET_KIND,
        monsterId,
        branchId,
        stageId,
      },
    });
    r2Written = true;

    const writeResults = await batch(db, [
      bindStatement(db, `
        INSERT INTO content_operation_asset_uploads (
          asset_upload_id, package_id, monster_id, branch_id, stage_id,
          asset_kind, r2_key, content_type, byte_size, width, height,
          validation_json, preview_json, status, created_by_account_id, created_at
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE EXISTS (
          SELECT 1
          FROM content_operation_packages
          WHERE package_id = ? AND state <> ?
        )
      `, [
        assetUploadId,
        packageRow.package_id,
        monsterId,
        branchId,
        stageId,
        CONTENT_OPERATION_MONSTER_ASSET_KIND,
        r2Key,
        contentType,
        byteSize,
        dimensions.width,
        dimensions.height,
        JSON.stringify(validation),
        JSON.stringify(preview),
        'draft',
        actor,
        nowTs,
        packageRow.package_id,
        CONTENT_OPERATION_PACKAGE_STATES.PUBLISHED,
      ]),
      bindStatement(db, `
        DELETE FROM content_operation_asset_uploads
        WHERE package_id = ?
          AND asset_kind = ?
          AND monster_id = ?
          AND branch_id = ?
          AND stage_id = ?
          AND asset_upload_id <> ?
          AND EXISTS (
            SELECT 1
            FROM content_operation_asset_uploads
            WHERE asset_upload_id = ?
          )
      `, [
        packageRow.package_id,
        CONTENT_OPERATION_MONSTER_ASSET_KIND,
        monsterId,
        branchId,
        stageId,
        assetUploadId,
        assetUploadId,
      ]),
      bindStatement(db, `
        DELETE FROM content_operation_package_operations
        WHERE package_id = ?
          AND entity_type = ?
          AND entity_id = ?
          AND EXISTS (
            SELECT 1
            FROM content_operation_asset_uploads
            WHERE asset_upload_id = ?
          )
      `, [
        packageRow.package_id,
        CONTENT_OPERATION_MONSTER_ASSET_REFERENCE_ENTITY_TYPE,
        assetReferenceEntityId,
        assetUploadId,
      ]),
      bindStatement(db, `
        INSERT INTO content_operation_package_operations (
          operation_id, package_id, operation_order, entity_type, entity_id,
          field_path, action, before_hash, after_hash, payload_json,
          created_by_account_id, created_at
        )
        SELECT ?, ?, (
          SELECT COALESCE(MAX(operation_order), 0) + 1
          FROM content_operation_package_operations
          WHERE package_id = ?
        ), ?, ?, '', ?, NULL, ?, ?, ?, ?
        WHERE EXISTS (
          SELECT 1
          FROM content_operation_asset_uploads
          WHERE asset_upload_id = ?
        )
      `, [
        assetReferenceOperationId,
        packageRow.package_id,
        packageRow.package_id,
        CONTENT_OPERATION_MONSTER_ASSET_REFERENCE_ENTITY_TYPE,
        assetReferenceEntityId,
        'replace',
        contentOperationValueHash(assetReferencePayload),
        JSON.stringify(assetReferencePayload),
        actor,
        nowTs,
        assetUploadId,
      ]),
      bindStatement(db, `
        DELETE FROM content_operation_package_approvals
        WHERE package_id = ?
          AND EXISTS (
            SELECT 1
            FROM content_operation_asset_uploads
            WHERE asset_upload_id = ?
          )
      `, [packageRow.package_id, assetUploadId]),
      bindStatement(db, `
        UPDATE content_operation_packages
        SET state = CASE WHEN state <> ? THEN ? ELSE state END,
            approved_at = NULL,
            updated_by_account_id = ?,
            updated_at = ?
        WHERE package_id = ?
          AND state <> ?
          AND EXISTS (
            SELECT 1
            FROM content_operation_asset_uploads
            WHERE asset_upload_id = ?
          )
      `, [
        CONTENT_OPERATION_PACKAGE_STATES.DRAFT,
        CONTENT_OPERATION_PACKAGE_STATES.DRAFT,
        actor,
        nowTs,
        packageRow.package_id,
        CONTENT_OPERATION_PACKAGE_STATES.PUBLISHED,
        assetUploadId,
      ]),
      bindStatement(db, `
        INSERT INTO content_operation_events (
          event_id, package_id, release_id, subject_id, event_type,
          actor_account_id, event_json, created_at
        )
        SELECT ?, ?, NULL, ?, ?, ?, ?, ?
        WHERE EXISTS (
          SELECT 1
          FROM content_operation_asset_uploads
          WHERE asset_upload_id = ?
        )
      `, [
        uid('coevt'),
        packageRow.package_id,
        packageRow.subject_id || CONTENT_OPERATION_SUBJECT_ID,
        'asset.monster_image_uploaded',
        actor,
        JSON.stringify({
          assetUploadId,
          assetKind: CONTENT_OPERATION_MONSTER_ASSET_KIND,
          operationId: assetReferenceOperationId,
          entityType: CONTENT_OPERATION_MONSTER_ASSET_REFERENCE_ENTITY_TYPE,
          entityId: assetReferenceEntityId,
          monsterId,
          branchId,
          stageId,
          contentType,
          byteSize,
          dimensions,
          preview: { kind: preview.kind, url: preview.url },
        }),
        nowTs,
        assetUploadId,
      ]),
    ]);
    if (mutationChangeCount(writeResults[0]) < 1) {
      throw new ConflictError('Published content operation packages cannot accept draft asset uploads.', {
        code: 'content_operation_package_published',
        packageId: packageRow.package_id,
      });
    }
    if (typeof bucket.delete === 'function') {
      for (const replaced of replacedUploads) {
        if (!replaced?.r2Key || replaced.r2Key === r2Key) continue;
        // eslint-disable-next-line no-await-in-loop
        await bucket.delete(replaced.r2Key).catch(() => {});
      }
    }
  } catch (error) {
    if (r2Written && typeof bucket.delete === 'function') {
      await bucket.delete(r2Key).catch(() => {});
    }
    throw error;
  }

  const row = await first(db, `
    SELECT *
    FROM content_operation_asset_uploads
    WHERE asset_upload_id = ?
  `, [assetUploadId]);
  return assetUploadRowToRecord(row);
}

export async function listContentOperationMonsterAssetUploads(db, {
  packageId,
  status = null,
  limit = 100,
} = {}) {
  const safePackageId = normaliseString(packageId);
  if (!safePackageId) {
    throw new BadRequestError('Package id is required for monster image upload listing.', {
      code: 'content_operation_package_id_required',
    });
  }
  await requirePackage(db, safePackageId, { allowPublished: true });
  const clauses = ['package_id = ?'];
  const params = [safePackageId];
  const safeStatus = normaliseString(status);
  if (safeStatus && safeStatus !== 'all') {
    clauses.push('status = ?');
    params.push(safeStatus);
  }
  params.push(Math.min(250, Math.max(1, Math.floor(Number(limit) || 100))));
  const rows = await all(db, `
    SELECT *
    FROM content_operation_asset_uploads
    WHERE ${clauses.join(' AND ')}
    ORDER BY created_at DESC, asset_upload_id DESC
    LIMIT ?
  `, params);
  return rows.map(assetUploadRowToRecord);
}

export async function readContentOperationMonsterAssetObject({
  db,
  env,
  packageId,
  assetUploadId,
}) {
  const safePackageId = normaliseString(packageId);
  const safeAssetUploadId = normaliseString(assetUploadId);
  if (!safePackageId || !safeAssetUploadId) {
    throw new BadRequestError('Monster image preview requires a package id and asset upload id.', {
      code: 'content_operation_monster_asset_preview_target_required',
    });
  }
  const row = await first(db, `
    SELECT *
    FROM content_operation_asset_uploads
    WHERE package_id = ? AND asset_upload_id = ?
    LIMIT 1
  `, [safePackageId, safeAssetUploadId]);
  const upload = assetUploadRowToRecord(row);
  if (!upload) {
    throw new NotFoundError('Monster image upload was not found.', {
      code: 'content_operation_monster_asset_not_found',
      packageId: safePackageId,
      assetUploadId: safeAssetUploadId,
    });
  }
  const object = await assertContentOperationAssetBucket(env).get(upload.r2Key);
  if (!object) {
    throw new NotFoundError('Monster image upload object was not found.', {
      code: 'content_operation_monster_asset_object_not_found',
      packageId: safePackageId,
      assetUploadId: safeAssetUploadId,
    });
  }
  return { upload, object };
}
