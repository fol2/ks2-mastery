// U11 (Admin Console P6): visual equivalence test for CSP inline-style cleanup.
//
// Purpose: verify that the CSS class extraction is structurally sound:
//   1. The CSS file contains all expected class definitions.
//   2. Admin JSX files reference the new classes where expected.
//   3. No half-converted patterns remain (style={{ ... }} for values that
//      were supposed to be extracted).
//
// This is NOT a pixel-comparison test. It asserts structural equivalence:
// the same CSS property values are delivered via class selectors rather than
// inline style attributes.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

function read(relPath) {
  return readFileSync(resolve(ROOT, relPath), 'utf8');
}

// ─── 1. CSS file contains all expected class rules ──────────────────────────

describe('admin-panels.css class definitions', () => {
  const css = read('src/surfaces/styles/admin-panels.css');

  const expectedClasses = [
    'admin-card-mb',
    'admin-mt-8',
    'admin-mt-16',
    'admin-mt-12',
    'admin-mb-12',
    'admin-flex-row',
    'admin-cell-pad',
    'admin-th-left',
    'admin-filter-grid',
    'admin-section-title-lg',
    'admin-status-badge',
  ];

  for (const cls of expectedClasses) {
    it(`defines .${cls}`, () => {
      const regex = new RegExp(`\\.${cls}\\s*\\{`);
      assert.ok(regex.test(css), `.${cls} not found in admin-panels.css`);
    });
  }

  it('admin-card-mb sets margin-bottom: 20px', () => {
    assert.ok(css.includes('margin-bottom: 20px'), 'margin-bottom: 20px missing from admin-card-mb');
  });

  it('admin-mt-8 sets margin-top: 8px', () => {
    assert.ok(css.includes('margin-top: 8px'), 'margin-top: 8px missing from admin-mt-8');
  });

  it('admin-flex-row sets display: flex + align-items: center + gap: 8px', () => {
    assert.ok(css.includes('display: flex'), 'display: flex missing');
    assert.ok(css.includes('align-items: center'), 'align-items: center missing');
    assert.ok(css.includes('gap: 8px'), 'gap: 8px missing');
  });

  it('admin-filter-grid sets grid layout with auto-fit minmax', () => {
    assert.ok(css.includes('grid-template-columns: repeat(auto-fit, minmax(140px, 1fr))'), 'grid-template-columns missing');
    assert.ok(css.includes('gap: 8px'), 'gap: 8px missing from filter-grid');
  });

  it('admin-th-left sets text-align: left + padding: 2px 6px', () => {
    assert.ok(css.includes('text-align: left'), 'text-align: left missing');
    assert.ok(css.includes('padding: 2px 6px'), 'padding: 2px 6px missing from admin-th-left');
  });

  it('admin-status-badge sets static badge properties', () => {
    assert.ok(css.includes('font-size: 0.75rem'), 'font-size missing from admin-status-badge');
    assert.ok(css.includes('border-radius: 4px'), 'border-radius missing from admin-status-badge');
    assert.ok(css.includes('font-weight: 600'), 'font-weight missing from admin-status-badge');
  });
});

// ─── 2. Admin JSX files reference the correct class names ───────────────────

describe('Admin JSX files use extracted classes', () => {
  it('AdminErrorTimelinePanel uses admin-mt-12, admin-flex-row, admin-th-left, admin-cell-pad, admin-filter-grid, admin-card-mb, admin-mt-8', () => {
    const src = read('src/surfaces/hubs/AdminErrorTimelinePanel.jsx');
    assert.ok(src.includes('admin-mt-12'), 'admin-mt-12 not found');
    assert.ok(src.includes('admin-flex-row'), 'admin-flex-row not found');
    assert.ok(src.includes('admin-th-left'), 'admin-th-left not found');
    assert.ok(src.includes('admin-cell-pad'), 'admin-cell-pad not found');
    assert.ok(src.includes('admin-filter-grid'), 'admin-filter-grid not found');
    assert.ok(src.includes('admin-card-mb'), 'admin-card-mb not found');
    assert.ok(src.includes('admin-mt-8'), 'admin-mt-8 not found');
  });

  it('AdminRequestDenialsPanel uses admin-filter-grid, admin-card-mb, admin-mt-8', () => {
    const src = read('src/surfaces/hubs/AdminRequestDenialsPanel.jsx');
    assert.ok(src.includes('admin-filter-grid'), 'admin-filter-grid not found');
    assert.ok(src.includes('admin-card-mb'), 'admin-card-mb not found');
    assert.ok(src.includes('admin-mt-8'), 'admin-mt-8 not found');
  });

  it('AdminOverviewSection uses admin-card-mb, admin-mb-12, admin-section-title-lg', () => {
    const src = read('src/surfaces/hubs/AdminOverviewSection.jsx');
    assert.ok(src.includes('admin-card-mb'), 'admin-card-mb not found');
    assert.ok(src.includes('admin-mb-12'), 'admin-mb-12 not found');
    assert.ok(src.includes('admin-section-title-lg'), 'admin-section-title-lg not found');
  });

  it('AdminLearnerSupportPanel uses admin-card-mb, admin-section-title-lg, admin-mt-8, admin-mt-16', () => {
    const src = read('src/surfaces/hubs/AdminLearnerSupportPanel.jsx');
    assert.ok(src.includes('admin-card-mb'), 'admin-card-mb not found');
    assert.ok(src.includes('admin-section-title-lg'), 'admin-section-title-lg not found');
    assert.ok(src.includes('admin-mt-8'), 'admin-mt-8 not found');
    assert.ok(src.includes('admin-mt-16'), 'admin-mt-16 not found');
  });

  it('AdminMarketingSection uses admin-status-badge', () => {
    const src = read('src/surfaces/hubs/AdminMarketingSection.jsx');
    assert.ok(src.includes('admin-status-badge'), 'admin-status-badge not found');
  });
});

// ─── 3. No half-converted inline styles remain ──────────────────────────────

describe('No half-converted patterns remain', () => {
  it('AdminRequestDenialsPanel has zero remaining inline style attributes', () => {
    const src = read('src/surfaces/hubs/AdminRequestDenialsPanel.jsx');
    const matches = src.match(/style=\{\{/g) || [];
    assert.strictEqual(matches.length, 0, `Expected 0 inline styles, found ${matches.length}`);
  });

  it('AdminOverviewSection has zero remaining inline style attributes', () => {
    const src = read('src/surfaces/hubs/AdminOverviewSection.jsx');
    const matches = src.match(/style=\{\{/g) || [];
    assert.strictEqual(matches.length, 0, `Expected 0 inline styles, found ${matches.length}`);
  });

  it('AdminLearnerSupportPanel has zero remaining inline style attributes', () => {
    const src = read('src/surfaces/hubs/AdminLearnerSupportPanel.jsx');
    const matches = src.match(/style=\{\{/g) || [];
    assert.strictEqual(matches.length, 0, `Expected 0 inline styles, found ${matches.length}`);
  });

  it('AdminErrorTimelinePanel has no marginTop: 8 inline styles remaining (all moved to class)', () => {
    const src = read('src/surfaces/hubs/AdminErrorTimelinePanel.jsx');
    // marginTop: 8 should not appear as a standalone style (may appear in composite styles)
    const standaloneMarginTop8 = /style=\{\{\s*marginTop:\s*8\s*\}\}/g;
    const matches = src.match(standaloneMarginTop8) || [];
    assert.strictEqual(matches.length, 0, `Found ${matches.length} standalone marginTop: 8 inline styles`);
  });

  it('AdminErrorTimelinePanel has no textAlign/padding inline styles on th (moved to admin-th-left)', () => {
    const src = read('src/surfaces/hubs/AdminErrorTimelinePanel.jsx');
    const thWithStyle = /<th[^>]*style=\{\{[^}]*textAlign/g;
    const matches = src.match(thWithStyle) || [];
    assert.strictEqual(matches.length, 0, `Found ${matches.length} th elements with inline textAlign`);
  });

  it('AdminMarketingSection StatusBadge no longer has fontSize/padding/borderRadius/fontWeight inline', () => {
    const src = read('src/surfaces/hubs/AdminMarketingSection.jsx');
    // The StatusBadge style should only have background/color (dynamic), not the static props
    const statusBadgeSection = src.slice(
      src.indexOf('function StatusBadge'),
      src.indexOf('function BodyTextPreview'),
    );
    assert.ok(!statusBadgeSection.includes('fontSize'), 'fontSize still inline in StatusBadge');
    assert.ok(!statusBadgeSection.includes('borderRadius'), 'borderRadius still inline in StatusBadge');
    assert.ok(!statusBadgeSection.includes('fontWeight'), 'fontWeight still inline in StatusBadge');
    assert.ok(!statusBadgeSection.includes('textTransform'), 'textTransform still inline in StatusBadge');
    assert.ok(!statusBadgeSection.includes("padding: '2px 8px'"), "padding still inline in StatusBadge");
  });
});

// ─── 4. CSS import present in each modified file ────────────────────────────

describe('CSS import present', () => {
  const files = [
    'src/surfaces/hubs/AdminErrorTimelinePanel.jsx',
    'src/surfaces/hubs/AdminRequestDenialsPanel.jsx',
    'src/surfaces/hubs/AdminOverviewSection.jsx',
    'src/surfaces/hubs/AdminLearnerSupportPanel.jsx',
    'src/surfaces/hubs/AdminMarketingSection.jsx',
  ];

  for (const file of files) {
    it(`${file} imports admin-panels.css`, () => {
      const src = read(file);
      assert.ok(
        src.includes("import '../styles/admin-panels.css'"),
        `CSS import missing from ${file}`,
      );
    });
  }
});
