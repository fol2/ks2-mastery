import React from 'react';

export function ReadOnlyLearnerNotice({ access, writableLearner }) {
  if (!access || access.writable !== false) return null;
  const writableNote = writableLearner
    ? `${writableLearner.name} remains the writable shell learner.`
    : 'This account has no writable learner in the main shell right now.';
  return (
    <div className="callout warn" style={{ marginTop: 16 }}>
      <strong>{access.learnerName || 'This learner'} is read-only in this adult surface.</strong>
      <div style={{ marginTop: 8 }}>
        Practice, learner profile changes, reset/import flows, and current-learner export stay blocked for viewer memberships. {writableNote}
      </div>
    </div>
  );
}
