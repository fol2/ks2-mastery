import test from 'node:test';
import assert from 'node:assert/strict';

import { renderHubSurfaceFixture } from './helpers/react-render.js';

test('React Parent Hub surface renders readable learner payload and read-only notice', async () => {
  const html = await renderHubSurfaceFixture({ surface: 'parent' });

  assert.match(html, /Parent Hub thin slice/);
  assert.match(html, /Ava/);
  assert.match(html, /Read-only learner/);
  assert.match(html, /viewer memberships/);
  assert.match(html, /Trouble words/);
  assert.match(html, /Grammar secured/);
  assert.match(html, /Grammar: 3\/18 concepts/);
  assert.match(html, /Grammar evidence/);
  assert.match(html, /Adverbials/);
  assert.match(html, /Question-type evidence/);
  assert.match(html, /Recent Grammar activity/);
  assert.match(html, /Parent summary draft/);
  assert.match(html, /Punctuation secured/);
  assert.match(html, /Punctuation: 1\/14 units/);
  assert.match(html, /Punctuation evidence/);
  assert.match(html, /Speech - Insert punctuation/);
  assert.match(html, /Recent Punctuation mistakes/);
  assert.doesNotMatch(html, /Subject: spelling/);
  assert.match(html, /Export current learner/);
  assert.match(html, /disabled=""/);
});

test('React Admin Operations surface renders content, audit, account roles, and diagnostics', async () => {
  const html = await renderHubSurfaceFixture({ surface: 'admin' });

  assert.match(html, /Admin \/ operations skeleton/);
  assert.match(html, /Monster visuals/);
  assert.match(html, /vellhorn-b1-3/);
  assert.match(html, /Save draft/);
  assert.match(html, /Publish/);
  assert.match(html, /Production platform access/);
  assert.match(html, /Published spelling snapshot/);
  assert.match(html, /Mutation receipt stream/);
  assert.match(html, /admin@example.com/);
  assert.match(html, /Readable learners/);
  assert.match(html, /Grammar diagnostics/);
  assert.match(html, /Punctuation diagnostics/);
  assert.match(html, /punctuation-r4-full-14-skill-structure/);
  assert.match(html, /Open Punctuation analytics/);
  assert.match(html, /Choose the correct sentence/);

  // U4: Dashboard KPI panel
  assert.match(html, /Dashboard overview/);
  assert.match(html, /Adult accounts/);
  assert.match(html, /Practice sessions \(7d\)/);

  // U4: Recent operations activity panel
  assert.match(html, /Recent operations activity/);
  assert.match(html, /admin\.account\.role-set/);

  // U4: Account ops metadata panel (read-only)
  assert.match(html, /Account ops metadata/);
  assert.match(html, /ops-meta@example\.com/);
  assert.match(html, /demo notes/);

  // U4: Error log centre panel
  assert.match(html, /Error log centre/);
  assert.match(html, /TypeError/);
  assert.match(html, /x is undefined/);

  // U5: admin-role now sees mutation UI inside the account ops panel
  // (ops_status select, plan_label input, tags input, internal_notes textarea,
  // Save button). Phase D / U15 replaces the R27 non-enforcement callout
  // with the short "Status is enforced" note now that suspended / payment
  // _hold actually block sign-in + mutations.
  const opsMetaStart = html.indexOf('Account ops metadata');
  assert.ok(opsMetaStart >= 0, 'Account ops metadata panel must render');
  const opsMetaEnd = html.indexOf('Error log centre', opsMetaStart);
  assert.ok(opsMetaEnd > opsMetaStart, 'Error log centre panel must render after account ops metadata');
  const opsMetaRegion = html.slice(opsMetaStart, opsMetaEnd);
  assert.match(opsMetaRegion, /<select\b[^>]*name="opsStatus"/);
  assert.match(opsMetaRegion, /<input\b[^>]*name="planLabel"/);
  assert.match(opsMetaRegion, /<textarea\b[^>]*name="internalNotes"/);
  assert.match(opsMetaRegion, /Save/);
  // Phase D / U15: the retired R27 callout must NOT appear any more.
  assert.doesNotMatch(opsMetaRegion, /Status labels are informational only/);
  // Phase D / U15: the new enforcement note ships alongside the selector.
  assert.match(opsMetaRegion, /Status is enforced: suspended accounts cannot sign in, and payment-hold accounts cannot write\./);

  // U5: admin-role also sees a status select inside each error log row.
  const errorLogStart = html.indexOf('Error log centre');
  assert.ok(errorLogStart >= 0);
  const errorLogRegion = html.slice(errorLogStart);
  assert.match(errorLogRegion, /<select\b[^>]*name="errorEventStatus"/);
});

test('U5: ops-role viewer sees read-only rows with the enforcement note but no edit controls', async () => {
  const html = await renderHubSurfaceFixture({ surface: 'admin', platformRole: 'ops' });

  // Ops-role path must still render the same panels.
  assert.match(html, /Account ops metadata/);
  assert.match(html, /Error log centre/);

  // Phase D / U15: the retired R27 callout must NOT appear any more.
  assert.doesNotMatch(html, /Status labels are informational only/);
  // The new enforcement note is visible for ops-role viewers too.
  assert.match(html, /Status is enforced: suspended accounts cannot sign in, and payment-hold accounts cannot write\./);

  // No mutation controls should appear anywhere in the account ops panel for ops-role.
  const opsMetaStart = html.indexOf('Account ops metadata');
  const opsMetaEnd = html.indexOf('Error log centre', opsMetaStart);
  const opsMetaRegion = html.slice(opsMetaStart, opsMetaEnd);
  assert.doesNotMatch(opsMetaRegion, /<select\b[^>]*name="opsStatus"/);
  assert.doesNotMatch(opsMetaRegion, /<input\b[^>]*name="planLabel"/);
  assert.doesNotMatch(opsMetaRegion, /<textarea\b[^>]*name="internalNotes"/);

  // No status select in error log centre either.
  const errorLogStart = html.indexOf('Error log centre');
  const errorLogRegion = html.slice(errorLogStart);
  assert.doesNotMatch(errorLogRegion, /<select\b[^>]*name="errorEventStatus"/);
});
