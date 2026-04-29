// U8 (P7): Account lifecycle display model.
//
// Transforms the API response `lifecycleFields` into a structured display
// model with enforcement vs business-notes labelling.

// ---------------------------------------------------------------------------
// Field classification
// ---------------------------------------------------------------------------

const ENFORCED_FIELDS = new Set(['paymentHold', 'suspended']);
const BUSINESS_NOTES_FIELDS = new Set(['planLabel', 'conversionSource', 'cancellationReason']);

/**
 * Classify a lifecycle field as enforced or business_notes_only.
 * @param {string} fieldName
 * @returns {'enforced' | 'business_notes_only' | 'informational'}
 */
export function classifyLifecycleField(fieldName) {
  if (ENFORCED_FIELDS.has(fieldName)) return 'enforced';
  if (BUSINESS_NOTES_FIELDS.has(fieldName)) return 'business_notes_only';
  return 'informational';
}

// ---------------------------------------------------------------------------
// Display model builder
// ---------------------------------------------------------------------------

/**
 * Build a structured display model from the API lifecycle fields.
 *
 * @param {object} detail — The full API detail response (contains lifecycleFields)
 * @returns {object} Display model with labelled fields
 */
export function buildAccountLifecycleModel(detail) {
  const lifecycle = detail?.lifecycleFields || {};

  const fields = [
    {
      key: 'accountType',
      label: 'Account type',
      value: lifecycle.accountType || 'real',
      classification: classifyLifecycleField('accountType'),
    },
    {
      key: 'accountAge',
      label: 'Account age (days)',
      value: typeof lifecycle.accountAge === 'number' ? lifecycle.accountAge : 0,
      classification: classifyLifecycleField('accountAge'),
    },
    {
      key: 'planLabel',
      label: 'Plan',
      value: lifecycle.planLabel || null,
      classification: classifyLifecycleField('planLabel'),
    },
    {
      key: 'conversionSource',
      label: 'Conversion source',
      value: lifecycle.conversionSource || null,
      classification: classifyLifecycleField('conversionSource'),
    },
    {
      key: 'lastActive',
      label: 'Last active',
      value: lifecycle.lastActive || null,
      classification: classifyLifecycleField('lastActive'),
    },
    {
      key: 'paymentHold',
      label: 'Payment hold',
      value: Boolean(lifecycle.paymentHold),
      classification: classifyLifecycleField('paymentHold'),
    },
    {
      key: 'suspended',
      label: 'Suspended',
      value: Boolean(lifecycle.suspended),
      classification: classifyLifecycleField('suspended'),
    },
    {
      key: 'cancelledAt',
      label: 'Cancelled at',
      value: lifecycle.cancelledAt || null,
      classification: classifyLifecycleField('cancelledAt'),
    },
    {
      key: 'cancellationReason',
      label: 'Cancellation reason',
      value: lifecycle.cancellationReason || null,
      classification: classifyLifecycleField('cancellationReason'),
    },
  ];

  return {
    fields,
    hasEnforcedFlags: Boolean(lifecycle.paymentHold || lifecycle.suspended),
    hasCancellation: lifecycle.cancelledAt != null,
  };
}
