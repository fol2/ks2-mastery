import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';

import { createWorkerRepository } from '../worker/src/repository.js';
import {
  CONTENT_OPERATION_MONSTER_ASSET_MAX_BYTES,
  CONTENT_OPERATION_MONSTER_ASSET_MAX_MULTIPART_BYTES,
  uploadContentOperationMonsterAsset,
} from '../worker/src/content-operations/assets.js';
import {
  serialiseContentOperationRelease,
} from '../worker/src/content-operations/serialisers.js';
import { createWorkerRepositoryServer } from './helpers/worker-server.js';

const BASE_URL = 'https://repo.test';
const ADMIN_ID = 'admin-asset-admin';
const NOW = Date.UTC(2026, 5, 12, 9, 30, 0);

function jsonInit(method, body = {}) {
  return {
    method,
    headers: {
      'content-type': 'application/json',
      'sec-fetch-site': 'same-origin',
    },
    body: JSON.stringify(body),
  };
}

function adminHeaders() {
  return {
    'x-ks2-dev-platform-role': 'admin',
    'sec-fetch-site': 'same-origin',
  };
}

function createMemoryR2Bucket() {
  const objects = new Map();
  return {
    puts: [],
    gets: [],
    deletes: [],
    async get(key) {
      this.gets.push(key);
      const object = objects.get(key);
      if (!object) return null;
      return {
        body: object.bytes,
        httpMetadata: { contentType: object.contentType },
        customMetadata: object.customMetadata,
      };
    },
    async put(key, bytes, options = {}) {
      const storedBytes = bytes instanceof Uint8Array
        ? new Uint8Array(bytes)
        : new Uint8Array(bytes);
      this.puts.push({ key, bytes: storedBytes, options });
      objects.set(key, {
        bytes: storedBytes,
        contentType: options.httpMetadata?.contentType || 'application/octet-stream',
        customMetadata: options.customMetadata || {},
      });
    },
    async delete(key) {
      this.deletes.push(key);
      objects.delete(key);
    },
  };
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

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data = Buffer.alloc(0)) {
  const typeBytes = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBytes, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([length, typeBytes, data, crc]);
}

function validPngBytes(width = 320, height = 320) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const stride = 1 + (width * 4);
  const pixels = Buffer.alloc(stride * height);
  for (let row = 0; row < height; row += 1) {
    pixels[row * stride] = 0;
  }
  return new Uint8Array(Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(pixels)),
    pngChunk('IEND'),
  ]));
}

function pngHeaderBytes(width = 320, height = 320) {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0x00, 0x00, 0x00, 0x0d], 8);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes[24] = 8;
  bytes[25] = 6;
  bytes[26] = 0;
  bytes[27] = 0;
  bytes[28] = 0;
  return bytes;
}

function invalidPngWithValidCrcBytes(width = 320, height = 320) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return new Uint8Array(Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', Buffer.from([0x00])),
    pngChunk('IEND'),
  ]));
}

function jpegHeaderBytes(width = 320, height = 320) {
  const bytes = new Uint8Array(19);
  bytes.set([0xff, 0xd8], 0);
  bytes.set([0xff, 0xc0], 2);
  const view = new DataView(bytes.buffer);
  view.setUint16(4, 15);
  bytes[6] = 8;
  view.setUint16(7, height);
  view.setUint16(9, width);
  bytes[11] = 3;
  return bytes;
}

function jpegSegment(marker, data) {
  const length = Buffer.alloc(2);
  length.writeUInt16BE(data.length + 2, 0);
  return Buffer.concat([Buffer.from([0xff, marker]), length, data]);
}

function fakeJpegWithEmptyScan(width = 320, height = 320) {
  const dqt = Buffer.concat([Buffer.from([0x00]), Buffer.alloc(64, 1)]);
  const dht = Buffer.concat([
    Buffer.from([0x00]),
    Buffer.from([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    Buffer.from([0]),
  ]);
  const sof = Buffer.alloc(9);
  sof[0] = 8;
  sof.writeUInt16BE(height, 1);
  sof.writeUInt16BE(width, 3);
  sof[5] = 1;
  sof[6] = 1;
  sof[7] = 0x11;
  sof[8] = 0;
  const sos = Buffer.from([1, 1, 0, 0, 63, 0]);
  return new Uint8Array(Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    jpegSegment(0xdb, dqt),
    jpegSegment(0xc4, dht),
    jpegSegment(0xc0, sof),
    jpegSegment(0xda, sos),
    Buffer.from([0xff, 0xd9]),
  ]));
}

function webpHeaderBytes(width = 320, height = 320) {
  const bytes = new Uint8Array(30);
  bytes.set(Buffer.from('RIFF', 'ascii'), 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(4, bytes.length - 8, true);
  bytes.set(Buffer.from('WEBP', 'ascii'), 8);
  bytes.set(Buffer.from('VP8X', 'ascii'), 12);
  view.setUint32(16, 10, true);
  const encodedWidth = width - 1;
  const encodedHeight = height - 1;
  bytes[24] = encodedWidth & 0xff;
  bytes[25] = (encodedWidth >> 8) & 0xff;
  bytes[26] = (encodedWidth >> 16) & 0xff;
  bytes[27] = encodedHeight & 0xff;
  bytes[28] = (encodedHeight >> 8) & 0xff;
  bytes[29] = (encodedHeight >> 16) & 0xff;
  return bytes;
}

function webpVp8HeaderOnlyBytes(width = 320, height = 320) {
  const chunk = Buffer.alloc(10);
  chunk[3] = 0x9d;
  chunk[4] = 0x01;
  chunk[5] = 0x2a;
  chunk.writeUInt16LE(width, 6);
  chunk.writeUInt16LE(height, 8);
  const header = Buffer.alloc(20);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(4 + 8 + chunk.length, 4);
  header.write('WEBP', 8, 'ascii');
  header.write('VP8 ', 12, 'ascii');
  header.writeUInt32LE(chunk.length, 16);
  return new Uint8Array(Buffer.concat([header, chunk]));
}

function webpVp8lHeaderOnlyBytes(width = 320, height = 320) {
  const encodedWidth = width - 1;
  const encodedHeight = height - 1;
  const chunk = Buffer.alloc(5);
  chunk[0] = 0x2f;
  chunk[1] = encodedWidth & 0xff;
  chunk[2] = ((encodedWidth >> 8) & 0x3f) | ((encodedHeight & 0x03) << 6);
  chunk[3] = (encodedHeight >> 2) & 0xff;
  chunk[4] = (encodedHeight >> 10) & 0x0f;
  const header = Buffer.alloc(20);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(4 + 8 + chunk.length + 1, 4);
  header.write('WEBP', 8, 'ascii');
  header.write('VP8L', 12, 'ascii');
  header.writeUInt32LE(chunk.length, 16);
  return new Uint8Array(Buffer.concat([header, chunk, Buffer.from([0x00])]));
}

async function createPackage(server, body = {}) {
  const response = await server.fetchAs(
    ADMIN_ID,
    `${BASE_URL}/api/admin/content-operations/subjects/spelling/packages`,
    jsonInit('POST', {
      title: 'Monster asset upload package',
      templateId: 'monster-asset-upload',
      ...body,
    }),
    adminHeaders(),
  );
  assert.equal(response.status, 201);
  const payload = await response.json();
  return payload.package;
}

function monsterAssetForm({
  monsterId = 'inklet',
  branchId = 'b1',
  stageId = '0',
  bytes = validPngBytes(),
  contentType = 'image/png',
  filename = 'inklet-b1-0.png',
} = {}) {
  const form = new FormData();
  form.set('monsterId', monsterId);
  form.set('branchId', branchId);
  form.set('stageId', stageId);
  form.set('asset', new Blob([bytes], { type: contentType }), filename);
  return form;
}

async function uploadMonsterAsset(server, packageId, form) {
  return server.fetchAs(
    ADMIN_ID,
    `${BASE_URL}/api/admin/content-operations/packages/${packageId}/upload-monster-asset`,
    {
      method: 'POST',
      body: form,
      headers: {
        'sec-fetch-site': 'same-origin',
      },
    },
    adminHeaders(),
  );
}

async function validatePackage(server, packageId, body = {}) {
  const response = await server.fetchAs(
    ADMIN_ID,
    `${BASE_URL}/api/admin/content-operations/packages/${packageId}/validate`,
    jsonInit('POST', body),
    adminHeaders(),
  );
  assert.equal(response.status, 200);
  return response.json();
}

async function approvePackage(server, packageId, candidateId) {
  const response = await server.fetchAs(
    ADMIN_ID,
    `${BASE_URL}/api/admin/content-operations/packages/${packageId}/approve`,
    jsonInit('POST', {
      candidateId,
      notes: 'Approved in the monster asset upload validation test.',
    }),
    adminHeaders(),
  );
  return response;
}

async function publishPackage(server, packageId, body = {}) {
  return server.fetchAs(
    ADMIN_ID,
    `${BASE_URL}/api/admin/content-operations/packages/${packageId}/publish`,
    jsonInit('POST', {
      proof: { source: 'monster-asset-upload-validation-test' },
      ...body,
    }),
    adminHeaders(),
  );
}

async function seedFirstRelease(server) {
  const repository = createWorkerRepository({
    env: server.env,
    now: () => NOW,
  });
  await repository.seedFirstContentOperationRelease({
    seededByAccountId: ADMIN_ID,
    proof: { source: 'monster-asset-upload-validation-test' },
  });
}

function rowCount(server, table, whereSql = '', params = []) {
  const row = server.DB.db.prepare(`SELECT COUNT(*) AS count FROM ${table} ${whereSql}`).get(...params);
  return Number(row.count) || 0;
}

test('monster image upload stores a package-scoped R2 draft and returns a safe preview handle', async () => {
  const bucket = createMemoryR2Bucket();
  const server = createWorkerRepositoryServer({
    env: { SPELLING_AUDIO_BUCKET: bucket },
    now: () => NOW,
  });
  try {
    const contentPackage = await createPackage(server);
    const bytes = validPngBytes(640, 640);
    const response = await uploadMonsterAsset(server, contentPackage.packageId, monsterAssetForm({ bytes }));
    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.assetUpload.monsterId, 'inklet');
    assert.equal(payload.assetUpload.branchId, 'b1');
    assert.equal(payload.assetUpload.stageId, '0');
    assert.equal(payload.assetUpload.contentType, 'image/png');
    assert.deepEqual(payload.assetUpload.dimensions, { width: 640, height: 640 });
    assert.match(payload.assetUpload.previewUrl, /^\/api\/admin\/content-operations\/packages\/.+\/monster-assets\/.+\/preview$/);
    assert.equal(payload.assetUpload.validation.ok, true);

    assert.equal(bucket.puts.length, 1);
    const stored = bucket.puts[0];
    assert.match(stored.key, new RegExp(`^content-operations/packages/${contentPackage.packageId}/monster-assets/`));
    assert.equal(stored.options.httpMetadata.contentType, 'image/png');
    assert.equal(stored.options.customMetadata.contentOperationAssetKind, 'monster-image');

    const responseText = JSON.stringify(payload);
    assert.equal(responseText.includes(stored.key), false, 'API payload must not expose private R2 keys');

    const listResponse = await server.fetchAs(
      ADMIN_ID,
      `${BASE_URL}/api/admin/content-operations/packages/${contentPackage.packageId}/monster-assets`,
      {
        method: 'GET',
        headers: { 'sec-fetch-site': 'same-origin' },
      },
      adminHeaders(),
    );
    assert.equal(listResponse.status, 200);
    const listPayload = await listResponse.json();
    assert.equal(listPayload.uploads.length, 1);
    assert.equal(JSON.stringify(listPayload).includes(stored.key), false);

    const previewResponse = await server.fetchAs(
      ADMIN_ID,
      `${BASE_URL}${payload.assetUpload.previewUrl}`,
      {
        method: 'GET',
        headers: { 'sec-fetch-site': 'same-origin' },
      },
      adminHeaders(),
    );
    assert.equal(previewResponse.status, 200);
    assert.equal(previewResponse.headers.get('content-type'), 'image/png');
    assert.equal(previewResponse.headers.get('x-content-type-options'), 'nosniff');
    assert.deepEqual(new Uint8Array(await previewResponse.arrayBuffer()), bytes);
    assert.equal(bucket.gets.length, 1);
  } finally {
    server.close();
  }
});

test('monster image upload rejects non-image content', async () => {
  const server = createWorkerRepositoryServer({
    env: { SPELLING_AUDIO_BUCKET: createMemoryR2Bucket() },
    now: () => NOW,
  });
  try {
    const contentPackage = await createPackage(server);
    const response = await uploadMonsterAsset(
      server,
      contentPackage.packageId,
      monsterAssetForm({
        bytes: new TextEncoder().encode('not an image'),
        contentType: 'text/plain',
        filename: 'payload.txt',
      }),
    );
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.code, 'content_operation_monster_asset_content_type_invalid');
    assert.equal(rowCount(server, 'content_operation_asset_uploads'), 0);
  } finally {
    server.close();
  }
});

test('monster image upload rejects MIME spoofing and truncated image payloads', async () => {
  const bucket = createMemoryR2Bucket();
  const server = createWorkerRepositoryServer({
    env: { SPELLING_AUDIO_BUCKET: bucket },
    now: () => NOW,
  });
  try {
    const contentPackage = await createPackage(server);
    const cases = [
      {
        name: 'image/png text payload',
        bytes: new TextEncoder().encode('not an image'),
      },
      {
        name: 'header-only PNG payload',
        bytes: pngHeaderBytes(640, 640),
        contentType: 'image/png',
        filename: 'header-only.png',
      },
      {
        name: 'valid CRC invalid IDAT PNG payload',
        bytes: invalidPngWithValidCrcBytes(640, 640),
        contentType: 'image/png',
        filename: 'invalid-idat.png',
      },
      {
        name: 'header-only JPEG payload',
        bytes: jpegHeaderBytes(640, 640),
        contentType: 'image/jpeg',
        filename: 'header-only.jpg',
      },
      {
        name: 'empty-scan JPEG payload',
        bytes: fakeJpegWithEmptyScan(640, 640),
        contentType: 'image/jpeg',
        filename: 'empty-scan.jpg',
      },
      {
        name: 'VP8X-only WebP payload',
        bytes: webpHeaderBytes(640, 640),
        contentType: 'image/webp',
        filename: 'header-only.webp',
      },
      {
        name: 'VP8 header-only WebP payload',
        bytes: webpVp8HeaderOnlyBytes(640, 640),
        contentType: 'image/webp',
        filename: 'vp8-header-only.webp',
      },
      {
        name: 'VP8L header-only WebP payload',
        bytes: webpVp8lHeaderOnlyBytes(640, 640),
        contentType: 'image/webp',
        filename: 'vp8l-header-only.webp',
      },
    ];
    for (const entry of cases) {
      const response = await uploadMonsterAsset(
        server,
        contentPackage.packageId,
        monsterAssetForm({
          bytes: entry.bytes,
          contentType: entry.contentType || 'image/png',
          filename: entry.filename || `${entry.name}.png`,
        }),
      );
      assert.equal(response.status, 400, entry.name);
      const payload = await response.json();
      assert.equal(payload.code, 'content_operation_monster_asset_renderer_invalid');
    }
    assert.equal(bucket.puts.length, 0);
    assert.equal(rowCount(server, 'content_operation_asset_uploads'), 0);
  } finally {
    server.close();
  }
});

test('monster image upload rejects oversized multipart requests before form parsing', async () => {
  const server = createWorkerRepositoryServer({
    env: { SPELLING_AUDIO_BUCKET: createMemoryR2Bucket() },
    now: () => NOW,
  });
  try {
    const contentPackage = await createPackage(server);
    const request = {
      headers: new Headers({
        'content-type': 'multipart/form-data; boundary=test',
        'content-length': String(CONTENT_OPERATION_MONSTER_ASSET_MAX_MULTIPART_BYTES + 1),
      }),
      async formData() {
        assert.fail('formData() must not be called for clearly oversized requests');
      },
    };
    await assert.rejects(
      () => uploadContentOperationMonsterAsset({
        db: server.env.DB,
        env: server.env,
        packageId: contentPackage.packageId,
        request,
        actorAccountId: ADMIN_ID,
        now: () => NOW,
      }),
      (error) => {
        assert.equal(error.extra.code, 'content_operation_monster_asset_request_too_large');
        return true;
      },
    );
    assert.equal(rowCount(server, 'content_operation_asset_uploads'), 0);
  } finally {
    server.close();
  }
});

test('monster image upload rejects multipart requests without Content-Length before form parsing', async () => {
  const server = createWorkerRepositoryServer({
    env: { SPELLING_AUDIO_BUCKET: createMemoryR2Bucket() },
    now: () => NOW,
  });
  try {
    const contentPackage = await createPackage(server);
    const request = new Request(`${BASE_URL}/upload`, {
      method: 'POST',
      headers: {
        'content-type': 'multipart/form-data; boundary=test',
      },
      body: new Uint8Array(CONTENT_OPERATION_MONSTER_ASSET_MAX_MULTIPART_BYTES + 1),
    });
    assert.equal(request.headers.get('content-length'), null);
    await assert.rejects(
      () => uploadContentOperationMonsterAsset({
        db: server.env.DB,
        env: server.env,
        packageId: contentPackage.packageId,
        request,
        actorAccountId: ADMIN_ID,
        now: () => NOW,
      }),
      (error) => {
        assert.equal(error.extra.code, 'content_operation_monster_asset_request_too_large');
        return true;
      },
    );
    assert.equal(rowCount(server, 'content_operation_asset_uploads'), 0);
  } finally {
    server.close();
  }
});

test('monster image upload rejects oversized files before storage', async () => {
  const bucket = createMemoryR2Bucket();
  const server = createWorkerRepositoryServer({
    env: { SPELLING_AUDIO_BUCKET: bucket },
    now: () => NOW,
  });
  try {
    const contentPackage = await createPackage(server);
    const oversized = new Uint8Array(CONTENT_OPERATION_MONSTER_ASSET_MAX_BYTES + 1);
    const response = await uploadMonsterAsset(
      server,
      contentPackage.packageId,
      monsterAssetForm({ bytes: oversized }),
    );
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.code, 'content_operation_monster_asset_too_large');
    assert.equal(bucket.puts.length, 0);
    assert.equal(rowCount(server, 'content_operation_asset_uploads'), 0);
  } finally {
    server.close();
  }
});

test('monster image upload removes the R2 object when D1 recording fails', async () => {
  const bucket = createMemoryR2Bucket();
  const server = createWorkerRepositoryServer({
    env: { SPELLING_AUDIO_BUCKET: bucket },
    now: () => NOW,
  });
  try {
    const contentPackage = await createPackage(server);
    const originalDb = server.env.DB;
    server.env.DB = new Proxy(originalDb, {
      get(target, property, receiver) {
        if (property === 'batch') {
          return async () => {
            throw new Error('simulated D1 batch failure');
          };
        }
        return Reflect.get(target, property, receiver);
      },
    });
    const response = await uploadMonsterAsset(server, contentPackage.packageId, monsterAssetForm());
    assert.equal(response.status, 500);
    assert.equal(bucket.puts.length, 1);
    assert.deepEqual(bucket.deletes, [bucket.puts[0].key]);
    assert.equal(rowCount(server, 'content_operation_asset_uploads'), 0);
  } finally {
    server.close();
  }
});

test('monster image upload rejects and cleans up when publish wins the package-state race', async () => {
  const bucket = createMemoryR2Bucket();
  const server = createWorkerRepositoryServer({
    env: { SPELLING_AUDIO_BUCKET: bucket },
    now: () => NOW,
  });
  try {
    const contentPackage = await createPackage(server);
    const originalDb = server.env.DB;
    let raced = false;
    server.env.DB = new Proxy(originalDb, {
      get(target, property, receiver) {
        if (property === 'batch') {
          return async (statements) => {
            if (!raced) {
              raced = true;
              target.db.prepare(`
                UPDATE content_operation_packages
                SET state = 'published',
                    published_at = ?,
                    updated_at = ?
                WHERE package_id = ?
              `).run(NOW + 1, NOW + 1, contentPackage.packageId);
            }
            return target.batch(statements);
          };
        }
        return Reflect.get(target, property, receiver);
      },
    });

    const response = await uploadMonsterAsset(server, contentPackage.packageId, monsterAssetForm());
    assert.equal(response.status, 409);
    const payload = await response.json();
    assert.equal(payload.code, 'content_operation_package_published');
    assert.equal(bucket.puts.length, 1);
    assert.deepEqual(bucket.deletes, [bucket.puts[0].key]);
    assert.equal(rowCount(server, 'content_operation_asset_uploads'), 0);
  } finally {
    server.close();
  }
});

test('monster image upload rejects unknown monster, branch and stage targets', async () => {
  const cases = [
    {
      name: 'unknown monster',
      form: monsterAssetForm({ monsterId: 'unknown-monster' }),
      field: 'monsterId',
    },
    {
      name: 'unknown branch',
      form: monsterAssetForm({ branchId: 'b9' }),
      field: 'branchId',
    },
    {
      name: 'unknown stage',
      form: monsterAssetForm({ stageId: '5' }),
      field: 'stageId',
    },
  ];

  for (const entry of cases) {
    const server = createWorkerRepositoryServer({
      env: { SPELLING_AUDIO_BUCKET: createMemoryR2Bucket() },
      now: () => NOW,
    });
    try {
      const contentPackage = await createPackage(server, { title: `Monster asset ${entry.name}` });
      const response = await uploadMonsterAsset(server, contentPackage.packageId, entry.form);
      assert.equal(response.status, 400, entry.name);
      const payload = await response.json();
      assert.equal(payload.code, 'content_operation_monster_asset_target_invalid');
      assert.equal(payload.errors.some((error) => error.field === entry.field), true);
      assert.equal(rowCount(server, 'content_operation_asset_uploads'), 0);
    } finally {
      server.close();
    }
  }
});

test('monster image uploads are bound to candidate approval and publish proof', async () => {
  const bucket = createMemoryR2Bucket();
  const server = createWorkerRepositoryServer({
    env: { SPELLING_AUDIO_BUCKET: bucket },
    now: () => NOW,
  });
  try {
    await seedFirstRelease(server);
    const contentPackage = await createPackage(server);

    const firstCandidate = await validatePackage(server, contentPackage.packageId);
    assert.equal(firstCandidate.candidate.assetScan.status, 'passed');
    assert.equal(firstCandidate.candidate.assetScan.uploadCount, 0);

    const uploadResponse = await uploadMonsterAsset(server, contentPackage.packageId, monsterAssetForm());
    assert.equal(uploadResponse.status, 201);

    const staleApprovalResponse = await approvePackage(
      server,
      contentPackage.packageId,
      firstCandidate.candidate.candidateId,
    );
    assert.equal(staleApprovalResponse.status, 409);
    const staleApproval = await staleApprovalResponse.json();
    assert.equal(staleApproval.code, 'content_operation_candidate_operations_stale');

    const currentCandidate = await validatePackage(server, contentPackage.packageId, { includeSnapshot: true });
    assert.equal(currentCandidate.candidate.assetScan.uploadCount, 1);
    assert.notEqual(currentCandidate.candidate.assetScan.hash, firstCandidate.candidate.assetScan.hash);
    assert.equal(currentCandidate.candidate.assetScan.assetReferenceManifest.referenceCount, 1);
    assert.equal(currentCandidate.candidate.assetScan.assetReferenceManifest.references[0].assetUploadId, currentCandidate.candidate.assetScan.items[0].assetUploadId);
    assert.match(
      currentCandidate.candidate.assetScan.assetReferenceManifest.references[0].preview.url,
      /^\/api\/admin\/content-operations\/packages\/.+\/monster-assets\/.+\/preview$/,
    );
    assert.equal(
      JSON.stringify(currentCandidate.candidate.assetScan.assetReferenceManifest).includes('r2Key'),
      false,
    );

    const operationRow = server.DB.db.prepare(`
      SELECT entity_type, entity_id, action, payload_json
      FROM content_operation_package_operations
      WHERE package_id = ?
    `).get(contentPackage.packageId);
    assert.equal(operationRow.entity_type, 'spelling.monsterAssetReference');
    assert.equal(operationRow.entity_id, 'inklet:b1:0');
    assert.equal(operationRow.action, 'replace');
    const operationPayload = JSON.parse(operationRow.payload_json);
    assert.equal(operationPayload.assetUploadId, currentCandidate.candidate.assetScan.items[0].assetUploadId);
    assert.equal(operationPayload.preview.url, currentCandidate.candidate.assetScan.assetReferenceManifest.references[0].preview.url);
    assert.equal(JSON.stringify(operationPayload).includes('r2Key'), false);

    const approvalResponse = await approvePackage(
      server,
      contentPackage.packageId,
      currentCandidate.candidate.candidateId,
    );
    assert.equal(approvalResponse.status, 200);
    const approved = await approvalResponse.json();
    assert.equal(approved.approval.assetSummary.hash, currentCandidate.candidate.assetScan.hash);
    assert.equal(approved.approval.assetSummary.uploadCount, 1);

    const publishResponse = await publishPackage(server, contentPackage.packageId);
    assert.equal(publishResponse.status, 200);
    const published = await publishResponse.json();
    assert.equal(published.release.hasCallerProof, true);
    assert.equal(
      published.release.proof.contentOperationsAssets.assetSummary.hash,
      currentCandidate.candidate.assetScan.hash,
    );
    assert.equal(
      published.release.proof.contentOperationsAssets.assetReferenceManifest.referenceCount,
      1,
    );
    assert.equal(
      published.release.proof.contentOperationsAssets.assetReferenceManifest.references[0].assetUploadId,
      operationPayload.assetUploadId,
    );
    assert.equal(JSON.stringify(published.release.proof.contentOperationsAssets.assetReferenceManifest).includes('r2Key'), false);
    assert.equal(published.release.assetSummary.hash, currentCandidate.candidate.assetScan.hash);
    assert.equal(published.release.assetReferenceManifest.referenceCount, 1);
  } finally {
    server.close();
  }
});

test('published monster image assets are runtime-readable with draft isolation and rollback retention', async () => {
  const bucket = createMemoryR2Bucket();
  const server = createWorkerRepositoryServer({
    env: { SPELLING_AUDIO_BUCKET: bucket },
    now: () => NOW,
  });
  try {
    await seedFirstRelease(server);
    const contentPackage = await createPackage(server);
    const uploadResponse = await uploadMonsterAsset(server, contentPackage.packageId, monsterAssetForm());
    assert.equal(uploadResponse.status, 201);

    const draftBootstrapResponse = await server.fetchAs(
      ADMIN_ID,
      `${BASE_URL}/api/bootstrap`,
      { headers: { 'x-ks2-public-read-models': '1' } },
      adminHeaders(),
    );
    assert.equal(draftBootstrapResponse.status, 200);
    const draftBootstrap = await draftBootstrapResponse.json();
    assert.equal(draftBootstrap.monsterVisualConfig.runtimeAssetReferences, undefined);

    const candidate = await validatePackage(server, contentPackage.packageId);
    const approvalResponse = await approvePackage(server, contentPackage.packageId, candidate.candidate.candidateId);
    assert.equal(approvalResponse.status, 200);
    const publishResponse = await publishPackage(server, contentPackage.packageId);
    assert.equal(publishResponse.status, 200);
    const published = await publishResponse.json();
    const reference = published.release.assetReferenceManifest.references[0];

    const bootstrapResponse = await server.fetchAs(
      ADMIN_ID,
      `${BASE_URL}/api/bootstrap`,
      { headers: { 'x-ks2-public-read-models': '1' } },
      adminHeaders(),
    );
    assert.equal(bootstrapResponse.status, 200);
    const bootstrap = await bootstrapResponse.json();
    const runtimeReferences = bootstrap.monsterVisualConfig.runtimeAssetReferences;
    assert.equal(bootstrap.monsterVisualConfig.compact, true);
    assert.equal(runtimeReferences.releaseId, published.release.releaseId);
    assert.equal(runtimeReferences.hash, published.release.assetReferenceManifest.hash);
    assert.equal(runtimeReferences.byAssetKey['inklet-b1-0'].assetUploadId, reference.assetUploadId);
    assert.match(
      runtimeReferences.byAssetKey['inklet-b1-0'].src,
      new RegExp(`^/api/content-operations/assets/monster-image/${published.release.releaseId}/monster-image%3Ainklet%3Ab1%3A0$`),
    );
    assert.equal(
      runtimeReferences.byAssetKey['inklet-b1-0'].src.includes('/api/admin/content-operations/'),
      false,
    );
    assert.equal(JSON.stringify(runtimeReferences).includes('r2Key'), false);

    const imageResponse = await server.fetchAs(
      ADMIN_ID,
      `${BASE_URL}${runtimeReferences.byAssetKey['inklet-b1-0'].src}`,
      {},
      adminHeaders(),
    );
    assert.equal(imageResponse.status, 200);
    assert.equal(imageResponse.headers.get('content-type'), 'image/png');
    assert.equal(imageResponse.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(imageResponse.headers.get('cache-control'), 'public, max-age=3600');
    assert.equal((await imageResponse.arrayBuffer()).byteLength, validPngBytes().byteLength);

    const repository = createWorkerRepository({
      env: server.env,
      now: () => NOW + 1000,
    });
    const rollback = await repository.rollbackContentOperationRelease('spelling', published.release.releaseId, {
      rolledBackByAccountId: ADMIN_ID,
      reason: 'Restore the published monster image release for rollback retention coverage.',
      proof: { source: 'monster-asset-upload-validation-test' },
    });
    assert.equal(rollback.assetReferenceManifest.referenceCount, 1);
    assert.equal(rollback.assetReferenceManifest.references[0].assetUploadId, reference.assetUploadId);

    const rollbackBootstrapResponse = await server.fetchAs(
      ADMIN_ID,
      `${BASE_URL}/api/bootstrap`,
      { headers: { 'x-ks2-public-read-models': '1' } },
      adminHeaders(),
    );
    assert.equal(rollbackBootstrapResponse.status, 200);
    const rollbackBootstrap = await rollbackBootstrapResponse.json();
    const rollbackReferences = rollbackBootstrap.monsterVisualConfig.runtimeAssetReferences;
    assert.equal(rollbackReferences.releaseId, rollback.releaseId);
    assert.equal(rollbackReferences.byAssetKey['inklet-b1-0'].assetUploadId, reference.assetUploadId);

    const rollbackImageResponse = await server.fetchAs(
      ADMIN_ID,
      `${BASE_URL}${rollbackReferences.byAssetKey['inklet-b1-0'].src}`,
      {},
      adminHeaders(),
    );
    assert.equal(rollbackImageResponse.status, 200);

    await bucket.delete(bucket.puts[0].key);
    const missingImageResponse = await server.fetchAs(
      ADMIN_ID,
      `${BASE_URL}${rollbackReferences.byAssetKey['inklet-b1-0'].src}`,
      {},
      adminHeaders(),
    );
    assert.equal(missingImageResponse.status, 404);
  } finally {
    server.close();
  }
});

test('monster image release serialisation distinguishes caller proof from server proof metadata', () => {
  const release = serialiseContentOperationRelease({
    releaseId: 'rel-server-asset-proof',
    subjectId: 'spelling',
    status: 'published',
    proof: {
      contentOperationsAssets: {
        assetSummary: {
          status: 'passed',
          hash: 'asset-scan-hash-1',
          uploadCount: 1,
        },
        assetReferenceManifest: {
          schemaVersion: 1,
          assetKind: 'monster-image',
          packageId: 'pkg-asset',
          status: 'passed',
          hash: 'asset-scan-hash-1',
          referenceCount: 1,
          references: [{
            referenceId: 'monster-image:inklet:b1:0',
            assetUploadId: 'coasset-1',
            target: { monsterId: 'inklet', branchId: 'b1', stageId: '0' },
            preview: { kind: 'admin-api-handle', url: '/api/admin/content-operations/packages/pkg-asset/monster-assets/coasset-1/preview' },
          }],
        },
      },
      productionProof: {
        releaseId: 'rel-server-asset-proof',
        capturedAt: NOW + 1,
        capturedByAccountId: ADMIN_ID,
        surfaces: ['monsterRendering'],
      },
    },
  });

  assert.equal(release.hasCallerProof, false);
  assert.equal(release.assetSummary.hash, 'asset-scan-hash-1');
  assert.equal(release.assetSummary.uploadCount, 1);
  assert.equal(release.assetReferenceManifest.referenceCount, 1);
  assert.equal(release.assetReferenceManifest.references[0].assetUploadId, 'coasset-1');
});

test('content operation approval rejects caller-supplied monster asset summaries', async () => {
  const server = createWorkerRepositoryServer({
    env: { SPELLING_AUDIO_BUCKET: createMemoryR2Bucket() },
    now: () => NOW,
  });
  try {
    await seedFirstRelease(server);
    const contentPackage = await createPackage(server);
    const validated = await validatePackage(server, contentPackage.packageId);
    const response = await server.fetchAs(
      ADMIN_ID,
      `${BASE_URL}/api/admin/content-operations/packages/${contentPackage.packageId}/approve`,
      jsonInit('POST', {
        candidateId: validated.candidate.candidateId,
        notes: 'Attempt to pass caller asset summary.',
        assetSummary: { hash: 'caller-controlled' },
      }),
      adminHeaders(),
    );
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.code, 'content_operation_approval_asset_summary_readonly');
    assert.equal(rowCount(server, 'content_operation_package_approvals', 'WHERE package_id = ?', [contentPackage.packageId]), 0);
  } finally {
    server.close();
  }
});

test('monster image approval blocks when the uploaded R2 object is missing', async () => {
  const bucket = createMemoryR2Bucket();
  const server = createWorkerRepositoryServer({
    env: { SPELLING_AUDIO_BUCKET: bucket },
    now: () => NOW,
  });
  try {
    await seedFirstRelease(server);
    const contentPackage = await createPackage(server);
    const uploadResponse = await uploadMonsterAsset(server, contentPackage.packageId, monsterAssetForm());
    assert.equal(uploadResponse.status, 201);
    const candidate = await validatePackage(server, contentPackage.packageId);
    assert.equal(candidate.candidate.assetScan.status, 'passed');
    await bucket.delete(bucket.puts[0].key);

    const approvalResponse = await approvePackage(
      server,
      contentPackage.packageId,
      candidate.candidate.candidateId,
    );
    assert.equal(approvalResponse.status, 409);
    const payload = await approvalResponse.json();
    assert.equal(payload.code, 'content_operation_candidate_assets_stale');
    assert.equal(payload.assetScan.status, 'blocked');
    assert.equal(
      payload.assetScan.blockers.some((entry) => (
        entry.errorCodes.includes('content_operation_asset_object_missing')
      )),
      true,
    );
    assert.equal(rowCount(server, 'content_operation_package_approvals', 'WHERE package_id = ?', [contentPackage.packageId]), 0);
  } finally {
    server.close();
  }
});

test('monster image publish blocks when an approved R2 object disappears', async () => {
  const bucket = createMemoryR2Bucket();
  const server = createWorkerRepositoryServer({
    env: { SPELLING_AUDIO_BUCKET: bucket },
    now: () => NOW,
  });
  try {
    await seedFirstRelease(server);
    const contentPackage = await createPackage(server);
    const uploadResponse = await uploadMonsterAsset(server, contentPackage.packageId, monsterAssetForm());
    assert.equal(uploadResponse.status, 201);
    const candidate = await validatePackage(server, contentPackage.packageId);
    const approvalResponse = await approvePackage(
      server,
      contentPackage.packageId,
      candidate.candidate.candidateId,
    );
    assert.equal(approvalResponse.status, 200);
    await bucket.delete(bucket.puts[0].key);

    const publishResponse = await publishPackage(server, contentPackage.packageId);
    assert.equal(publishResponse.status, 409);
    const payload = await publishResponse.json();
    assert.equal(payload.code, 'content_operation_candidate_assets_stale');
    assert.equal(payload.assetScan.status, 'blocked');
    assert.equal(rowCount(server, 'content_operation_releases', 'WHERE package_id = ?', [contentPackage.packageId]), 0);
  } finally {
    server.close();
  }
});

test('duplicate monster image target uploads replace the previous draft target', async () => {
  const bucket = createMemoryR2Bucket();
  const server = createWorkerRepositoryServer({
    env: { SPELLING_AUDIO_BUCKET: bucket },
    now: () => NOW,
  });
  try {
    await seedFirstRelease(server);
    const contentPackage = await createPackage(server);

    const firstUpload = await uploadMonsterAsset(server, contentPackage.packageId, monsterAssetForm({
      bytes: validPngBytes(640, 640),
      filename: 'inklet-b1-0-a.png',
    }));
    assert.equal(firstUpload.status, 201);
    const secondUpload = await uploadMonsterAsset(server, contentPackage.packageId, monsterAssetForm({
      bytes: validPngBytes(640, 640),
      filename: 'inklet-b1-0-b.png',
    }));
    assert.equal(secondUpload.status, 201);
    assert.equal(rowCount(server, 'content_operation_asset_uploads', 'WHERE package_id = ?', [contentPackage.packageId]), 1);
    assert.equal(bucket.puts.length, 2);
    assert.deepEqual(bucket.deletes, [bucket.puts[0].key]);

    const validated = await validatePackage(server, contentPackage.packageId);
    assert.equal(validated.candidate.assetScan.status, 'passed');
    assert.equal(validated.candidate.assetScan.uploadCount, 1);
    assert.equal(validated.candidate.assetScan.blockers.length, 0);
    assert.equal(rowCount(server, 'content_operation_package_operations', 'WHERE package_id = ?', [contentPackage.packageId]), 1);
    const operationPayload = JSON.parse(server.DB.db.prepare(`
      SELECT payload_json
      FROM content_operation_package_operations
      WHERE package_id = ?
    `).get(contentPackage.packageId).payload_json);
    assert.equal(operationPayload.assetUploadId, (await secondUpload.json()).assetUpload.assetUploadId);

    const approvalResponse = await approvePackage(
      server,
      contentPackage.packageId,
      validated.candidate.candidateId,
    );
    assert.equal(approvalResponse.status, 200);

    const publishResponse = await publishPackage(server, contentPackage.packageId);
    assert.equal(publishResponse.status, 200);
    assert.equal(rowCount(server, 'content_operation_releases', 'WHERE package_id = ?', [contentPackage.packageId]), 1);
  } finally {
    server.close();
  }
});

test('monster image draft upload creates a package reference operation but no release', async () => {
  const server = createWorkerRepositoryServer({
    env: { SPELLING_AUDIO_BUCKET: createMemoryR2Bucket() },
    now: () => NOW,
  });
  try {
    const contentPackage = await createPackage(server);
    const response = await uploadMonsterAsset(server, contentPackage.packageId, monsterAssetForm());
    assert.equal(response.status, 201);
    assert.equal(rowCount(server, 'content_operation_asset_uploads', 'WHERE package_id = ?', [contentPackage.packageId]), 1);
    assert.equal(rowCount(server, 'content_operation_package_operations', 'WHERE package_id = ?', [contentPackage.packageId]), 1);
    assert.equal(rowCount(server, 'content_operation_releases', 'WHERE package_id = ?', [contentPackage.packageId]), 0);
    const operationRow = server.DB.db.prepare(`
      SELECT entity_type, entity_id, payload_json
      FROM content_operation_package_operations
      WHERE package_id = ?
    `).get(contentPackage.packageId);
    assert.equal(operationRow.entity_type, 'spelling.monsterAssetReference');
    assert.equal(operationRow.entity_id, 'inklet:b1:0');
    assert.match(JSON.parse(operationRow.payload_json).preview.url, /\/monster-assets\/.+\/preview$/);
    const packageRow = server.DB.db.prepare(`
      SELECT state, published_at
      FROM content_operation_packages
      WHERE package_id = ?
    `).get(contentPackage.packageId);
    assert.equal(packageRow.state, 'draft');
    assert.equal(packageRow.published_at, null);
  } finally {
    server.close();
  }
});
