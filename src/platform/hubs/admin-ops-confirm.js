// Phase D / U15 pure helpers: confirmation-prompt + save-decision logic
// for the AccountOpsMetadataRow component. Extracted so Node tests can
// exercise the entire decision surface (confirm gate, last-6 matching,
// dispatch-envelope shape) without mounting React or JSDOM. Mirrors the
// pattern established by `admin-metadata-conflict-actions.js`.
//
// Exported helpers:
// - `lastSixOfAccountId(accountId)` — extract the last 6 chars used for
//   the confirmation challenge. Pure string op; `null`/short input yields
//   an empty-or-short string so the confirmation always requires a
//   realistic match.
// - `defaultConfirmOpsStatusChange(accountId, nextStatus)` — the default
//   prompt implementation. Fail-safe when `globalThis.prompt` is missing
//   (ADV-2 Phase D reviewer fix): returns `false` so the non-interactive
//   harness never silently confirms a destructive status change.
// - `decideAccountOpsSave({ draft, account, confirmOpsStatusChange })` —
//   the pure decision closure `handleSave` wraps. Returns
//   `{ shouldDispatch, dispatchArgs }` so the component can dispatch the
//   mutation OR abort without calling React machinery. `shouldDispatch`
//   is `false` when the confirmation is required and the supplied
//   `confirmOpsStatusChange` returns falsy.
//
// References: docs/plans/2026-04-25-005-refactor-admin-ops-console-p1-5-hardening-plan.md §U15

const TAG_MAX_COUNT = 10;

export function lastSixOfAccountId(accountId) {
  const value = typeof accountId === 'string' ? accountId : '';
  return value.slice(-6);
}

/**
 * Phase D / U15 default confirmation prompt.
 *
 * @param {string} accountId
 * @param {string} nextStatus  Target `ops_status` value; `'active'` short-circuits to `true`.
 * @returns {boolean}          `true` only when the admin typed the last-6 chars of `accountId`.
 *
 * ADV-2 fail-safe: missing `globalThis` or `globalThis.prompt` → `false`.
 * Do NOT flip back to `true`; approving a destructive change with no
 * interactive confirmation defeats the guard.
 */
export function defaultConfirmOpsStatusChange(accountId, nextStatus) {
  if (nextStatus === 'active') return true;
  if (typeof globalThis === 'undefined') return false;
  const promptFn = typeof globalThis.prompt === 'function' ? globalThis.prompt : null;
  if (!promptFn) return false;
  const expected = lastSixOfAccountId(accountId);
  const message = `Type the last 6 chars of ${expected} to confirm changing status to ${nextStatus}.`;
  const typed = promptFn(message);
  if (typeof typed !== 'string') return false;
  return typed.trim() === expected;
}

function parseTagsText(tagsText) {
  if (typeof tagsText !== 'string') return [];
  return tagsText
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0)
    .slice(0, TAG_MAX_COUNT);
}

function trimmedOrNull(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Pure decision closure for `AccountOpsMetadataRow.handleSave`.
 *
 * Contract:
 * - Confirmation fires ONLY when the draft's `opsStatus` is non-active
 *   AND differs from the account's current `ops_status`. A fresh row
 *   (existing `ops_status` absent) defaults to `'active'` so switching
 *   to `suspended` or `payment_hold` still triggers the prompt.
 * - When confirmation is required, the result of `confirmOpsStatusChange`
 *   is coerced via `Boolean(...)` — any falsy return aborts the save.
 * - On dispatch, the envelope matches what the production component
 *   already sends: `{ action: 'account-ops-metadata-save', data: {
 *   accountId, patch: { opsStatus, planLabel, tags, internalNotes } } }`.
 *
 * @param {object} options
 * @param {object} options.draft   UI-facing draft values: `{ opsStatus, planLabel, tagsText, internalNotes }`.
 * @param {object} options.account Server-side row: `{ accountId, opsStatus }` (other fields ignored here).
 * @param {(accountId: string, nextStatus: string) => boolean} options.confirmOpsStatusChange
 * @returns {{ shouldDispatch: boolean, dispatchArgs: { action: string, data: object } | null }}
 */
export function decideAccountOpsSave({
  draft,
  account,
  confirmOpsStatusChange,
} = {}) {
  const draftObj = draft && typeof draft === 'object' ? draft : {};
  const accountObj = account && typeof account === 'object' ? account : {};
  const accountId = typeof accountObj.accountId === 'string' ? accountObj.accountId : '';
  const nextOpsStatus = typeof draftObj.opsStatus === 'string' ? draftObj.opsStatus : 'active';
  const currentOpsStatus = typeof accountObj.opsStatus === 'string' && accountObj.opsStatus
    ? accountObj.opsStatus
    : 'active';

  if (nextOpsStatus !== 'active' && nextOpsStatus !== currentOpsStatus) {
    const confirmFn = typeof confirmOpsStatusChange === 'function'
      ? confirmOpsStatusChange
      : defaultConfirmOpsStatusChange;
    const confirmed = Boolean(confirmFn(accountId, nextOpsStatus));
    if (!confirmed) {
      return { shouldDispatch: false, dispatchArgs: null };
    }
  }

  const tags = parseTagsText(draftObj.tagsText);
  const planLabel = trimmedOrNull(draftObj.planLabel);
  // Internal notes preserve interior whitespace — only empty-string (post-
  // `trim()`) collapses to `null`. The production component uses
  // `internalNotes.trim() === '' ? null : internalNotes`; we replicate that
  // exact shape so the dispatched payload matches production byte-for-byte.
  const notesStr = typeof draftObj.internalNotes === 'string' ? draftObj.internalNotes : '';
  const internalNotes = notesStr.trim() === '' ? null : notesStr;

  return {
    shouldDispatch: true,
    dispatchArgs: {
      action: 'account-ops-metadata-save',
      data: {
        accountId,
        patch: {
          opsStatus: nextOpsStatus,
          planLabel,
          tags,
          internalNotes,
        },
      },
    },
  };
}
