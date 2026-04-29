// P7 U11: Asset preview URL safety — allowlist validation and handler capability registry.
//
// Verifies that dangerous URLs are rejected, safe URLs are allowed, and every
// registered handler declares the required capability metadata fields.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  isAllowedPreviewUrl,
  getSafePreviewUrl,
  getPreviewBlockedReason,
  DEFAULT_ALLOWED_DOMAINS,
} from '../src/platform/hubs/admin-asset-url-allowlist.js';

import {
  buildMonsterVisualRegistryEntry,
  getHandlerCapability,
  listHandlerKeys,
  HANDLER_CAPABILITY_REGISTRY,
} from '../src/platform/hubs/admin-asset-registry.js';

import {
  classifyAction,
  LEVELS,
} from '../src/platform/hubs/admin-action-classification.js';

// ─── isAllowedPreviewUrl — dangerous protocols ────────────────────────────────

describe('isAllowedPreviewUrl — rejects dangerous URLs', () => {
  it('rejects javascript:alert(1)', () => {
    const result = isAllowedPreviewUrl('javascript:alert(1)');
    assert.equal(result.allowed, false);
    assert.ok(result.reason.includes('javascript:'));
  });

  it('rejects JavaScript: with mixed case', () => {
    const result = isAllowedPreviewUrl('JavaScript:void(0)');
    assert.equal(result.allowed, false);
  });

  it('rejects data:text/html,...', () => {
    const result = isAllowedPreviewUrl('data:text/html,<script>alert(1)</script>');
    assert.equal(result.allowed, false);
    assert.ok(result.reason.includes('data:'));
  });

  it('rejects protocol-relative //evil.com/img.png', () => {
    const result = isAllowedPreviewUrl('//evil.com/img.png');
    assert.equal(result.allowed, false);
    assert.ok(result.reason.includes('Protocol-relative'));
  });

  it('rejects http://allowed.com/img.png (non-HTTPS)', () => {
    const result = isAllowedPreviewUrl('http://ks2-mastery.pages.dev/img.png');
    assert.equal(result.allowed, false);
    assert.ok(result.reason.includes('HTTPS'));
  });

  it('rejects HTTPS from unapproved origin', () => {
    const result = isAllowedPreviewUrl('https://evil.com/payload.png');
    assert.equal(result.allowed, false);
    assert.ok(result.reason.includes('not in the allowlist'));
  });
});

// ─── isAllowedPreviewUrl — allowed URLs ───────────────────────────────────────

describe('isAllowedPreviewUrl — allows safe URLs', () => {
  it('allows https://ks2-mastery.pages.dev/preview.png (app domain)', () => {
    const result = isAllowedPreviewUrl('https://ks2-mastery.pages.dev/preview.png');
    assert.equal(result.allowed, true);
    assert.equal(result.reason, undefined);
  });

  it('allows subdomain of an allowed domain', () => {
    const result = isAllowedPreviewUrl('https://assets.ks2-mastery.pages.dev/img.webp');
    assert.equal(result.allowed, true);
  });

  it('allows custom domain via options', () => {
    const result = isAllowedPreviewUrl('https://cdn.example.org/file.png', {
      allowedDomains: ['cdn.example.org'],
    });
    assert.equal(result.allowed, true);
  });
});

// ─── Null/undefined URL handling ──────────────────────────────────────────────

describe('isAllowedPreviewUrl — null/undefined/empty', () => {
  it('rejects null URL gracefully (no crash)', () => {
    const result = isAllowedPreviewUrl(null);
    assert.equal(result.allowed, false);
    assert.ok(result.reason.includes('empty'));
  });

  it('rejects undefined URL gracefully (no crash)', () => {
    const result = isAllowedPreviewUrl(undefined);
    assert.equal(result.allowed, false);
  });

  it('rejects empty string', () => {
    const result = isAllowedPreviewUrl('');
    assert.equal(result.allowed, false);
  });

  it('rejects non-string values', () => {
    const result = isAllowedPreviewUrl(12345);
    assert.equal(result.allowed, false);
    assert.ok(result.reason.includes('not a string'));
  });
});

// ─── getSafePreviewUrl integration ────────────────────────────────────────────

describe('getSafePreviewUrl', () => {
  it('returns the URL when allowed', () => {
    const url = 'https://ks2-mastery.pages.dev/preview.png';
    assert.equal(getSafePreviewUrl(url), url);
  });

  it('returns null when rejected', () => {
    assert.equal(getSafePreviewUrl('javascript:alert(1)'), null);
  });

  it('returns null for null input', () => {
    assert.equal(getSafePreviewUrl(null), null);
  });
});

// ─── getPreviewBlockedReason ──────────────────────────────────────────────────

describe('getPreviewBlockedReason', () => {
  it('returns null for allowed URLs', () => {
    assert.equal(getPreviewBlockedReason('https://ks2-mastery.pages.dev/ok.png'), null);
  });

  it('returns reason for rejected URLs', () => {
    const reason = getPreviewBlockedReason('javascript:void(0)');
    assert.ok(reason.includes('javascript:'));
  });

  it('returns null for null/empty URLs (no link to block)', () => {
    assert.equal(getPreviewBlockedReason(null), null);
    assert.equal(getPreviewBlockedReason(''), null);
  });
});

// ─── Registry integration — previewUrl safety ─────────────────────────────────

describe('buildMonsterVisualRegistryEntry — URL safety integration', () => {
  it('rejects unsafe previewUrl in registry entry', () => {
    const config = {
      status: {
        previewUrl: 'javascript:alert(1)',
        validation: { ok: true, errorCount: 0 },
      },
      permissions: { canManageMonsterVisualConfig: true },
      draft: { monsters: [] },
    };
    const entry = buildMonsterVisualRegistryEntry(config);
    assert.equal(entry.previewUrl, null);
    assert.ok(entry.previewBlockedReason.includes('javascript:'));
  });

  it('allows safe previewUrl through the registry', () => {
    const config = {
      status: {
        previewUrl: 'https://ks2-mastery.pages.dev/monster-visual-config',
        validation: { ok: true, errorCount: 0 },
      },
      permissions: { canManageMonsterVisualConfig: true },
      draft: { monsters: [] },
    };
    const entry = buildMonsterVisualRegistryEntry(config);
    assert.equal(entry.previewUrl, 'https://ks2-mastery.pages.dev/monster-visual-config');
    assert.equal(entry.previewBlockedReason, null);
  });

  it('null previewUrl produces no crash and no blocked reason', () => {
    const entry = buildMonsterVisualRegistryEntry(null);
    assert.equal(entry.previewUrl, null);
    assert.equal(entry.previewBlockedReason, null);
  });
});

// ─── Handler capability registry ──────────────────────────────────────────────

const REQUIRED_CAPABILITY_FIELDS = ['roleRequired', 'mutationClass', 'casFields', 'auditBehaviour'];

describe('HANDLER_CAPABILITY_REGISTRY — metadata completeness', () => {
  const keys = listHandlerKeys();

  it('has at least one registered handler', () => {
    assert.ok(keys.length > 0);
  });

  for (const key of keys) {
    it(`handler "${key}" declares all required metadata fields`, () => {
      const cap = getHandlerCapability(key);
      assert.ok(cap !== null, `Handler ${key} not found`);
      for (const field of REQUIRED_CAPABILITY_FIELDS) {
        assert.ok(field in cap, `Handler "${key}" missing field "${field}"`);
      }
    });

    it(`handler "${key}" has a valid mutationClass`, () => {
      const cap = getHandlerCapability(key);
      const valid = ['read', 'draft-write', 'publish', 'delete'];
      assert.ok(valid.includes(cap.mutationClass),
        `Handler "${key}" has invalid mutationClass: "${cap.mutationClass}"`);
    });

    it(`handler "${key}" has a valid auditBehaviour`, () => {
      const cap = getHandlerCapability(key);
      const valid = ['silent', 'log', 'log-and-notify'];
      assert.ok(valid.includes(cap.auditBehaviour),
        `Handler "${key}" has invalid auditBehaviour: "${cap.auditBehaviour}"`);
    });

    it(`handler "${key}" has casFields as an array`, () => {
      const cap = getHandlerCapability(key);
      assert.equal(Array.isArray(cap.casFields), true);
    });
  }

  it('getHandlerCapability returns null for unknown key', () => {
    assert.equal(getHandlerCapability('nonexistent-handler'), null);
  });
});

// ─── Action classification — new asset actions ────────────────────────────────

describe('action classification — new asset actions (P7 U11)', () => {
  it('classifies asset-draft-save at MEDIUM level', () => {
    const result = classifyAction('asset-draft-save');
    assert.equal(result.level, LEVELS.medium);
    assert.equal(result.requiresConfirmation, false);
  });

  it('classifies asset-preview at LOW level', () => {
    const result = classifyAction('asset-preview');
    assert.equal(result.level, LEVELS.low);
    assert.equal(result.requiresConfirmation, false);
  });

  it('classifies asset-read at LOW level', () => {
    const result = classifyAction('asset-read');
    assert.equal(result.level, LEVELS.low);
    assert.equal(result.requiresConfirmation, false);
  });
});

// ─── DEFAULT_ALLOWED_DOMAINS is frozen ────────────────────────────────────────

describe('DEFAULT_ALLOWED_DOMAINS', () => {
  it('is frozen (immutable)', () => {
    assert.equal(Object.isFrozen(DEFAULT_ALLOWED_DOMAINS), true);
  });

  it('contains at least the app domain', () => {
    assert.ok(DEFAULT_ALLOWED_DOMAINS.includes('ks2-mastery.pages.dev'));
  });
});
