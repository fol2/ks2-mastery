import React from 'react';

// SH2-U3: capability-class explainer for read-only learner membership.
//
// S-05 copy rule (capability classes, not feature names — see plan section
// S-05 for the full prohibited-token list): the copy below MUST USE neutral,
// capability-class language such as "Some settings are managed by account
// administrators". It MUST NOT enumerate privileged feature names — the
// adversarial reviewer runs a literal grep against THIS file for the
// prohibited tokens documented in the plan; those tokens are intentionally
// not repeated here so the grep returns zero matches. A viewer-role user
// who reads this card MUST NOT learn the full roster of privileged features
// they cannot reach. The existing copy already speaks in classes
// ("profile changes", "reset/import flows") — the added paragraph below
// extends the explanation without naming any admin-only route.

export function ReadOnlyLearnerNotice({ access, writableLearner }) {
  if (!access || access.writable !== false) return null;
  const writableNote = writableLearner
    ? `${writableLearner.name} remains the writable shell learner.`
    : 'This account has no writable learner in the main shell right now.';
  // SH2-U8: inline style props migrated to `.read-only-learner-notice*` classes
  // (see docs/hardening/csp-inline-style-inventory.md).
  return (
    <div className="callout warn read-only-learner-notice" data-testid="read-only-learner-notice">
      <strong>{access.learnerName || 'This learner'} is read-only in this adult surface.</strong>
      <div className="read-only-learner-notice-detail">
        Practice, learner profile changes, reset/import flows, and current-learner export stay blocked for viewer memberships. {writableNote}
      </div>
      <div className="read-only-learner-notice-detail" data-testid="read-only-learner-notice-capabilities">
        Some settings are managed by account administrators and are not available in this view.
      </div>
    </div>
  );
}
