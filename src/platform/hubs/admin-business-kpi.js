// P7 Unit 5: Business KPI display model builder.
//
// Transforms the raw Worker API response into a structured display model
// consumed by AdminBusinessSection. Each metric explicitly states whether
// it covers real accounts, demo accounts, or both.

/**
 * Build a structured KPI display model from the raw API response.
 *
 * @param {object|null} data — raw response from /api/admin/ops/business-kpis
 * @returns {object} Structured display model with labelled sections
 */
export function buildBusinessKpiModel(data) {
  if (!data || typeof data !== 'object') {
    return { sections: [], refreshedAt: null, hasData: false };
  }

  const sections = [];

  // --- Accounts ---
  const accounts = data.accounts;
  if (accounts !== null && accounts !== undefined) {
    sections.push({
      key: 'accounts',
      title: 'Accounts',
      metrics: [
        { label: 'Real accounts', value: accounts.real, scope: 'real' },
        { label: 'Demo accounts', value: accounts.demo, scope: 'demo' },
        { label: 'Total accounts', value: accounts.total, scope: 'both' },
      ],
    });
  }

  // --- Activation ---
  const activation = data.activation;
  if (activation !== null && activation !== undefined) {
    sections.push({
      key: 'activation',
      title: 'Activation (real accounts only)',
      metrics: [
        { label: 'Day-1 active', value: activation.day1, scope: 'real' },
        { label: 'Day-7 active', value: activation.day7, scope: 'real' },
        { label: 'Day-30 active', value: activation.day30, scope: 'real' },
      ],
    });
  }

  // --- Retention ---
  const retention = data.retention;
  if (retention !== null && retention !== undefined) {
    sections.push({
      key: 'retention',
      title: 'Retention (real accounts only)',
      metrics: [
        { label: 'New this week', value: retention.newThisWeek, scope: 'real' },
        { label: 'Returned in 7 days', value: retention.returnedIn7d, scope: 'real' },
        { label: 'Returned in 30 days', value: retention.returnedIn30d, scope: 'real' },
      ],
    });
  }

  // --- Conversion ---
  const conversion = data.conversion;
  if (conversion !== null && conversion !== undefined) {
    sections.push({
      key: 'conversion',
      title: 'Conversion (demo to real)',
      metrics: [
        { label: 'Demo starts', value: conversion.demoStarts, scope: 'demo' },
        { label: 'Demo resets', value: conversion.resets, scope: 'demo' },
        { label: 'Conversions', value: conversion.conversions, scope: 'both' },
        { label: 'Conversion rate (7d)', value: conversion.rate7d, scope: 'both', suffix: '%' },
        { label: 'Conversion rate (30d)', value: conversion.rate30d, scope: 'both', suffix: '%' },
      ],
    });
  }

  // --- Subject Engagement ---
  const engagement = data.subjectEngagement;
  if (engagement !== null && engagement !== undefined) {
    const metrics = [];
    if (engagement.spelling != null) metrics.push({ label: 'Spelling sessions (7d)', value: engagement.spelling, scope: 'real' });
    if (engagement.grammar != null) metrics.push({ label: 'Grammar sessions (7d)', value: engagement.grammar, scope: 'real' });
    if (engagement.punctuation != null) metrics.push({ label: 'Punctuation sessions (7d)', value: engagement.punctuation, scope: 'real' });
    if (metrics.length > 0) {
      sections.push({
        key: 'subjectEngagement',
        title: 'Subject Engagement (real accounts, 7d)',
        metrics,
      });
    }
  }

  // --- Support Friction ---
  const friction = data.supportFriction;
  if (friction !== null && friction !== undefined) {
    sections.push({
      key: 'supportFriction',
      title: 'Support Friction Indicators',
      metrics: [
        { label: 'Repeated errors (3+ in 7d)', value: friction.repeatedErrors, scope: 'both' },
        { label: 'Repeated denials (3+ in 7d)', value: friction.denials, scope: 'both' },
        { label: 'Payment holds', value: friction.paymentHolds, scope: 'real' },
        { label: 'Suspended accounts', value: friction.suspendedAccounts, scope: 'real' },
        { label: 'Unresolved incidents', value: friction.unresolvedIncidents, scope: 'both' },
      ],
    });
  }

  return {
    sections,
    refreshedAt: data.refreshedAt || null,
    hasData: sections.length > 0,
  };
}
