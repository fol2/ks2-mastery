// U8 (P7): Account lifecycle display model tests.
//
// Tests cover:
//   1. buildAccountLifecycleModel transforms API response correctly
//   2. classifyLifecycleField returns correct enforcement labelling
//   3. Edge cases: missing/null lifecycleFields

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAccountLifecycleModel,
  classifyLifecycleField,
} from '../src/platform/hubs/admin-account-lifecycle.js';

// ---------------------------------------------------------------------------
// classifyLifecycleField
// ---------------------------------------------------------------------------

describe('classifyLifecycleField', () => {
  it('paymentHold is classified as enforced', () => {
    assert.equal(classifyLifecycleField('paymentHold'), 'enforced');
  });

  it('suspended is classified as enforced', () => {
    assert.equal(classifyLifecycleField('suspended'), 'enforced');
  });

  it('planLabel is classified as business_notes_only', () => {
    assert.equal(classifyLifecycleField('planLabel'), 'business_notes_only');
  });

  it('conversionSource is classified as business_notes_only', () => {
    assert.equal(classifyLifecycleField('conversionSource'), 'business_notes_only');
  });

  it('cancellationReason is classified as business_notes_only', () => {
    assert.equal(classifyLifecycleField('cancellationReason'), 'business_notes_only');
  });

  it('accountAge is classified as informational', () => {
    assert.equal(classifyLifecycleField('accountAge'), 'informational');
  });

  it('accountType is classified as informational', () => {
    assert.equal(classifyLifecycleField('accountType'), 'informational');
  });

  it('lastActive is classified as informational', () => {
    assert.equal(classifyLifecycleField('lastActive'), 'informational');
  });

  it('unknown field is classified as informational', () => {
    assert.equal(classifyLifecycleField('unknownField'), 'informational');
  });
});

// ---------------------------------------------------------------------------
// buildAccountLifecycleModel
// ---------------------------------------------------------------------------

describe('buildAccountLifecycleModel', () => {
  it('transforms full API response into structured display model', () => {
    const detail = {
      lifecycleFields: {
        planLabel: 'Premium Annual',
        accountType: 'real',
        accountAge: 45,
        lastActive: 1714300000000,
        conversionSource: 'organic_search',
        paymentHold: false,
        suspended: false,
        cancelledAt: null,
        cancellationReason: null,
      },
    };

    const model = buildAccountLifecycleModel(detail);

    assert.equal(model.fields.length, 9);
    assert.equal(model.hasEnforcedFlags, false);
    assert.equal(model.hasCancellation, false);

    const planField = model.fields.find(f => f.key === 'planLabel');
    assert.equal(planField.value, 'Premium Annual');
    assert.equal(planField.classification, 'business_notes_only');

    const ageField = model.fields.find(f => f.key === 'accountAge');
    assert.equal(ageField.value, 45);
    assert.equal(ageField.classification, 'informational');
  });

  it('hasEnforcedFlags is true when paymentHold is active', () => {
    const detail = {
      lifecycleFields: {
        planLabel: null,
        accountType: 'real',
        accountAge: 10,
        lastActive: null,
        conversionSource: null,
        paymentHold: true,
        suspended: false,
        cancelledAt: null,
        cancellationReason: null,
      },
    };

    const model = buildAccountLifecycleModel(detail);
    assert.equal(model.hasEnforcedFlags, true);

    const holdField = model.fields.find(f => f.key === 'paymentHold');
    assert.equal(holdField.value, true);
    assert.equal(holdField.classification, 'enforced');
  });

  it('hasEnforcedFlags is true when suspended is active', () => {
    const detail = {
      lifecycleFields: {
        planLabel: null,
        accountType: 'real',
        accountAge: 10,
        lastActive: null,
        conversionSource: null,
        paymentHold: false,
        suspended: true,
        cancelledAt: null,
        cancellationReason: null,
      },
    };

    const model = buildAccountLifecycleModel(detail);
    assert.equal(model.hasEnforcedFlags, true);

    const suspField = model.fields.find(f => f.key === 'suspended');
    assert.equal(suspField.value, true);
    assert.equal(suspField.classification, 'enforced');
  });

  it('hasCancellation is true when cancelledAt is set', () => {
    const detail = {
      lifecycleFields: {
        planLabel: null,
        accountType: 'real',
        accountAge: 90,
        lastActive: null,
        conversionSource: null,
        paymentHold: false,
        suspended: false,
        cancelledAt: 1714000000000,
        cancellationReason: 'Too expensive',
      },
    };

    const model = buildAccountLifecycleModel(detail);
    assert.equal(model.hasCancellation, true);

    const reasonField = model.fields.find(f => f.key === 'cancellationReason');
    assert.equal(reasonField.value, 'Too expensive');
    assert.equal(reasonField.classification, 'business_notes_only');
  });

  it('handles null detail gracefully', () => {
    const model = buildAccountLifecycleModel(null);
    assert.equal(model.fields.length, 9);
    assert.equal(model.hasEnforcedFlags, false);
    assert.equal(model.hasCancellation, false);

    // All values should be safe defaults
    const typeField = model.fields.find(f => f.key === 'accountType');
    assert.equal(typeField.value, 'real');
  });

  it('handles missing lifecycleFields gracefully', () => {
    const model = buildAccountLifecycleModel({ account: { id: 'test' } });
    assert.equal(model.fields.length, 9);
    assert.equal(model.hasEnforcedFlags, false);
  });

  it('all enforced fields have classification "enforced"', () => {
    const detail = {
      lifecycleFields: {
        planLabel: null,
        accountType: 'real',
        accountAge: 0,
        lastActive: null,
        conversionSource: null,
        paymentHold: true,
        suspended: true,
        cancelledAt: null,
        cancellationReason: null,
      },
    };

    const model = buildAccountLifecycleModel(detail);
    const enforcedFields = model.fields.filter(f => f.classification === 'enforced');
    assert.equal(enforcedFields.length, 2);
    const keys = enforcedFields.map(f => f.key).sort();
    assert.deepEqual(keys, ['paymentHold', 'suspended']);
  });

  it('all business_notes_only fields have correct classification', () => {
    const detail = {
      lifecycleFields: {
        planLabel: 'Free',
        accountType: 'real',
        accountAge: 1,
        lastActive: null,
        conversionSource: 'referral',
        paymentHold: false,
        suspended: false,
        cancelledAt: null,
        cancellationReason: 'reason',
      },
    };

    const model = buildAccountLifecycleModel(detail);
    const businessFields = model.fields.filter(f => f.classification === 'business_notes_only');
    assert.equal(businessFields.length, 3);
    const keys = businessFields.map(f => f.key).sort();
    assert.deepEqual(keys, ['cancellationReason', 'conversionSource', 'planLabel']);
  });
});
