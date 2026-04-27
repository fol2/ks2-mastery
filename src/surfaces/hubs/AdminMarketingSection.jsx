import React from 'react';

// U4+U5: Marketing section placeholder — no live panels yet.
// The card signals future intent so operators know where announcements,
// campaigns, and event delivery will land.

export function AdminMarketingSection() {
  return (
    <section className="card" style={{ marginBottom: 20 }} data-section="marketing">
      <div className="eyebrow">Marketing &amp; Live Ops</div>
      <h3 className="section-title" style={{ fontSize: '1.2rem' }}>Coming soon</h3>
      <p className="subtitle">
        Announcements, campaigns, and event delivery will live here.
        This section is a placeholder — no panels are wired yet.
      </p>
    </section>
  );
}
