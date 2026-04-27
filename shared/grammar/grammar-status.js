// Centralised Grammar status/filter semantics — single source of truth for the
// five-label taxonomy's child-facing copy, CSS tone, and Grammar Bank filter id.
//
// Grammar Bank filters, dashboard, and adult diagnostics share this contract so
// child-label/tone mappings cannot drift. Pure shared module: zero imports from
// `src/` or `worker/`.
//
// Note: `schedule-due` is reserved for future use when Worker scheduling signals
// are exposed to the client. It is not part of the active taxonomy today.

export const GRAMMAR_STATUS_TAXONOMY = Object.freeze([
  Object.freeze({
    internalLabel: 'needs-repair',
    childLabel: 'Trouble spot',
    childTone: 'trouble',
    bankFilterId: 'trouble',
    isChildCopy: false,
  }),
  Object.freeze({
    internalLabel: 'building',
    childLabel: 'Learning',
    childTone: 'learning',
    bankFilterId: 'learning',
    isChildCopy: true,
  }),
  Object.freeze({
    internalLabel: 'consolidating',
    childLabel: 'Nearly secure',
    childTone: 'nearly-secure',
    bankFilterId: 'nearly-secure',
    isChildCopy: true,
  }),
  Object.freeze({
    internalLabel: 'secure',
    childLabel: 'Secure',
    childTone: 'secure',
    bankFilterId: 'secure',
    isChildCopy: true,
  }),
  Object.freeze({
    internalLabel: 'emerging',
    childLabel: 'New',
    childTone: 'new',
    bankFilterId: 'new',
    isChildCopy: true,
  }),
]);

export function grammarStatusForLabel(label) {
  if (typeof label !== 'string') return null;
  return GRAMMAR_STATUS_TAXONOMY.find((s) => s.internalLabel === label) || null;
}

export function grammarChildLabelForInternal(label) {
  const entry = grammarStatusForLabel(label);
  return entry ? entry.childLabel : 'Check status';
}

export function grammarChildToneForInternal(label) {
  const entry = grammarStatusForLabel(label);
  return entry ? entry.childTone : 'learning';
}
