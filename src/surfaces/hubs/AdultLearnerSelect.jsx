import React from 'react';

function optionLabel(entry) {
  return [
    entry?.learnerName || 'Learner',
    entry?.yearGroup || 'Y5',
    entry?.membershipRoleLabel || 'Viewer',
    entry?.writable ? 'writable' : 'read-only',
  ].join(' · ');
}

export function AdultLearnerSelect({ learners = [], selectedLearnerId = '', label = 'Adult surface learner', disabled = false, onSelect }) {
  if (!Array.isArray(learners) || !learners.length) return null;
  return (
    <label className="field" style={{ minWidth: 280 }}>
      <span>{label}</span>
      <select
        className="select"
        name="adultLearnerId"
        value={selectedLearnerId}
        disabled={disabled}
        onChange={(event) => onSelect?.(event.target.value)}
      >
        {learners.map((entry) => (
          <option value={entry.learnerId} key={entry.learnerId}>{optionLabel(entry)}</option>
        ))}
      </select>
    </label>
  );
}
