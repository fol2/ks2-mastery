import React from 'react';

// U4+U5: Horizontal tab bar for the admin console section navigation.
//
// Tab keys map 1:1 to the section components rendered by AdminHubSurface.
// The active tab receives a bold label + bottom-border visual indicator
// using inline styles derived from the existing `.card` / `.chip` palette.
//
// The `onTabChange` callback receives the new section key ONLY after the
// dirty-row guard in AdminHubSurface has cleared. The guard itself lives
// in the parent so the tab component stays presentation-only.

export const ADMIN_SECTION_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'accounts', label: 'Accounts' },
  { key: 'debug', label: 'Debugging & Logs' },
  { key: 'content', label: 'Content' },
  { key: 'marketing', label: 'Marketing', comingSoon: true },
];

export function AdminSectionTabs({ activeSection = 'overview', onTabChange }) {
  return (
    <nav
      className="admin-section-tabs"
      role="tablist"
      aria-label="Admin console sections"
      style={{
        display: 'flex',
        gap: 0,
        borderBottom: '2px solid var(--border, #e2e2e2)',
        marginBottom: 20,
        overflowX: 'auto',
      }}
    >
      {ADMIN_SECTION_TABS.map((tab) => {
        const isActive = activeSection === tab.key;
        return (
          <button
            key={tab.key}
            role="tab"
            type="button"
            aria-selected={isActive ? 'true' : 'false'}
            data-section={tab.key}
            className="admin-section-tab"
            onClick={() => onTabChange(tab.key)}
            style={{
              padding: '10px 20px',
              border: 'none',
              borderBottom: isActive ? '3px solid #8A4FFF' : '3px solid transparent',
              background: 'none',
              cursor: 'pointer',
              fontWeight: isActive ? 700 : 400,
              color: isActive ? '#8A4FFF' : 'var(--text-muted, #666)',
              fontSize: '0.95rem',
              whiteSpace: 'nowrap',
              transition: 'color 0.15s, border-color 0.15s',
              position: 'relative',
              marginBottom: '-2px',
            }}
          >
            {tab.label}
            {tab.comingSoon ? (
              <span
                className="chip"
                style={{
                  marginLeft: 8,
                  fontSize: '0.7rem',
                  padding: '1px 6px',
                  verticalAlign: 'middle',
                  opacity: 0.7,
                }}
              >
                Soon
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
