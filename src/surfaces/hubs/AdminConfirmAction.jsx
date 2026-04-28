// Admin Console P5 / U3: Shared confirmation component for high/critical actions.
//
// Renders a confirmation dialog appropriate to the action's classification level:
//   - high:     Confirm/Cancel buttons with danger copy and target display.
//   - critical: Typed confirmation — user must type a target identifier to
//               enable the confirm button.
//
// Props:
//   level           — 'high' | 'critical'
//   dangerCopy      — descriptive warning text
//   targetDisplay   — human-readable target (e.g. account ID fragment, message title)
//   typedConfirmValue — the exact string the user must type for critical actions
//   onConfirm       — async callback fired on confirm
//   onCancel        — callback fired on cancel
//
// Uses `useSubmitLock` to prevent double-click on the confirm button.

import React, { useState } from 'react';
import { useSubmitLock } from '../../platform/react/use-submit-lock.js';

export function AdminConfirmAction({
  level,
  dangerCopy,
  targetDisplay,
  typedConfirmValue,
  onConfirm,
  onCancel,
}) {
  const [typedInput, setTypedInput] = useState('');
  const { locked, run } = useSubmitLock();

  const isCritical = level === 'critical';
  const typedMatch = isCritical
    ? (typedConfirmValue && typedInput.trim() === String(typedConfirmValue).trim())
    : true;
  const confirmDisabled = locked || (isCritical && !typedMatch);

  function handleConfirm() {
    if (confirmDisabled) return;
    run(async () => {
      if (typeof onConfirm === 'function') await onConfirm();
    });
  }

  return (
    <div
      className="admin-confirm-action"
      role="alertdialog"
      aria-labelledby="admin-confirm-title"
      aria-describedby={dangerCopy ? 'admin-confirm-desc' : undefined}
      data-level={level}
    >
      <h3 id="admin-confirm-title" className="admin-confirm-action__title">
        {isCritical ? 'Destructive operation' : 'Confirm action'}
      </h3>

      {dangerCopy && (
        <p id="admin-confirm-desc" className="admin-confirm-action__danger">
          {dangerCopy}
        </p>
      )}

      {targetDisplay && (
        <p className="admin-confirm-action__target">
          Target: <strong>{targetDisplay}</strong>
        </p>
      )}

      {isCritical && (
        <div className="admin-confirm-action__typed-section">
          <label
            htmlFor="admin-confirm-typed-input"
            className="admin-confirm-action__typed-label"
          >
            Type <code>{typedConfirmValue}</code> to confirm:
          </label>
          <input
            id="admin-confirm-typed-input"
            className="admin-confirm-action__typed-input"
            type="text"
            autoComplete="off"
            value={typedInput}
            onChange={(e) => setTypedInput(e.target.value)}
            disabled={locked}
          />
        </div>
      )}

      <div className="admin-confirm-action__buttons">
        <button
          type="button"
          className="admin-confirm-action__cancel"
          onClick={typeof onCancel === 'function' ? onCancel : undefined}
          disabled={locked}
        >
          Cancel
        </button>
        <button
          type="button"
          className="admin-confirm-action__confirm"
          onClick={handleConfirm}
          disabled={confirmDisabled}
          aria-busy={locked}
        >
          {locked ? 'Processing...' : 'Confirm'}
        </button>
      </div>
    </div>
  );
}
