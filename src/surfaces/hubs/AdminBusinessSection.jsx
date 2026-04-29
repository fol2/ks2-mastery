import React from 'react';
import { AdminPanelFrame } from './AdminPanelFrame.jsx';
import { buildBusinessKpiModel } from '../../platform/hubs/admin-business-kpi.js';

// P7 Unit 5: Business section — KPI analytics panel with real/demo split,
// activation, retention, conversion, and support friction indicators.
//
// Lazy-loads KPI data on tab activation via fetch. Uses a fetch-generation
// counter to discard stale responses (e.g. if the user triggers multiple
// refreshes in rapid succession, only the latest generation is honoured).
//
// Sub-panels for incidents (U7) are composed below the KPI panel.

const SCOPE_LABELS = { real: 'Real', demo: 'Demo', both: 'Real + Demo' };

function KpiMetricRow({ metric }) {
  const displayValue = metric.value != null
    ? `${metric.value}${metric.suffix || ''}`
    : '—';
  return (
    <div className="skill-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
      <div>
        <strong>{metric.label}</strong>
        <span className="small muted" style={{ marginLeft: 8 }}>({SCOPE_LABELS[metric.scope] || metric.scope})</span>
      </div>
      <div>{displayValue}</div>
    </div>
  );
}

function KpiSectionBlock({ section }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h4 style={{ margin: '0 0 8px', fontSize: '0.9rem', fontWeight: 600 }}>{section.title}</h4>
      <div className="skill-list">
        {section.metrics.map((m) => (
          <KpiMetricRow key={m.label} metric={m} />
        ))}
      </div>
    </div>
  );
}

export function AdminBusinessSection({ actions }) {
  const [kpiData, setKpiData] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [refreshedAt, setRefreshedAt] = React.useState(null);
  const fetchGenRef = React.useRef(0);

  const fetchKpis = React.useCallback(async () => {
    const generation = ++fetchGenRef.current;
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch('/api/admin/ops/business-kpis');
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }
      const json = await resp.json();
      // Discard if a newer generation has been issued
      if (generation !== fetchGenRef.current) return;
      setKpiData(json);
      setRefreshedAt(Date.now());
    } catch (err) {
      if (generation !== fetchGenRef.current) return;
      setError({ message: err.message || 'Error loading' });
    } finally {
      if (generation === fetchGenRef.current) {
        setLoading(false);
      }
    }
  }, []);

  // Lazy-load on mount (tab activation)
  React.useEffect(() => {
    fetchKpis();
  }, [fetchKpis]);

  const model = buildBusinessKpiModel(kpiData);

  return (
    <>
      <AdminPanelFrame
        eyebrow="Business KPI"
        title="Business analytics"
        subtitle="Real/demo split, activation, retention, conversion, and support friction."
        refreshedAt={refreshedAt}
        refreshError={error}
        onRefresh={fetchKpis}
        data={model.hasData ? model.sections : null}
        loading={loading}
        emptyState={<p className="small muted">No data yet</p>}
      >
        {model.sections.map((section) => (
          <KpiSectionBlock key={section.key} section={section} />
        ))}
      </AdminPanelFrame>

      {/* U7 placeholder: Support Incidents panel will be composed here */}
      <section className="card admin-card-spaced" data-panel-frame="Support Incidents">
        <div style={{ padding: 16 }}>
          <div className="eyebrow">Support</div>
          <h3 style={{ margin: '4px 0 8px', fontSize: '1rem' }}>Incidents</h3>
          <p className="small muted">Support incident tracking will be added in a future unit.</p>
        </div>
      </section>
    </>
  );
}
