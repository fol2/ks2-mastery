import React from 'react';

export function SubjectBreadcrumb({ subjectName = 'Subject', onDashboard }) {
  return (
    <nav className="subject-breadcrumb" aria-label="Subject breadcrumb">
      <button type="button" className="subject-breadcrumb-link" onClick={onDashboard}>← Dashboard</button>
      <span className="subject-breadcrumb-sep" aria-hidden="true">/</span>
      <span className="subject-breadcrumb-current">{subjectName}</span>
    </nav>
  );
}
