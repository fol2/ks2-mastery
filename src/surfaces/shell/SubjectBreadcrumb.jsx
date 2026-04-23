import React from 'react';

export function SubjectBreadcrumb({ subjectName = 'Subject', onDashboard }) {
  return (
    <nav className="subject-breadcrumb" aria-label="Subject breadcrumb">
      <button type="button" className="subject-breadcrumb-link" data-action="navigate-home" onClick={onDashboard}>← Dashboard</button>
      <span className="subject-breadcrumb-sep" aria-hidden="true">/</span>
      <button type="button" className="subject-breadcrumb-current" data-action="navigate-home" onClick={onDashboard}>
        {subjectName}
      </button>
    </nav>
  );
}
