import React from 'react';

function PlaceholderPracticeComponent({ subject }) {
  const meta = subject || {};
  return React.createElement(
    'div',
    { className: 'three-col' },
    React.createElement(
      'section',
      { className: 'card border-top', style: { borderTopColor: meta.accent } },
      React.createElement('div', { className: 'eyebrow' }, 'Future subject module'),
      React.createElement('h2', { className: 'section-title' }, `${meta.name} foundation`),
      React.createElement('p', { className: 'subtitle' }, meta.blurb),
      React.createElement(
        'div',
        { className: 'callout', style: { marginTop: 14 } },
        'This rebuild keeps the shell, subject identity, analytics slot, game hooks and API contract ready for ',
        React.createElement('strong', null, meta.name),
        ', but leaves the question engine intentionally separate so the next team can build it without touching Spelling.',
      ),
    ),
    React.createElement(
      'section',
      { className: 'card' },
      React.createElement('div', { className: 'eyebrow' }, 'Extension points already reserved'),
      React.createElement(
        'div',
        { className: 'chip-row' },
        React.createElement('span', { className: 'chip' }, 'subject module contract'),
        React.createElement('span', { className: 'chip' }, 'practice component'),
        React.createElement('span', { className: 'chip' }, 'analytics model'),
        React.createElement('span', { className: 'chip' }, 'game event adapter'),
        React.createElement('span', { className: 'chip' }, 'Cloudflare API route'),
      ),
    ),
    React.createElement(
      'section',
      { className: 'card' },
      React.createElement('div', { className: 'eyebrow' }, 'Recommended next build slice'),
      React.createElement('div', { className: 'code-block' }, '1. Content model\n2. Deterministic engine\n3. Local repository\n4. Subject analytics\n5. Game event mapping\n6. Worker API route'),
    ),
  );
}

export function createPlaceholderSubject(meta) {
  return {
    ...meta,
    available: false,
    initState() {
      return {
        placeholder: true,
      };
    },
    getDashboardStats() {
      return {
        pct: 0,
        due: 0,
        streak: 0,
        nextUp: 'Planned in the rebuild',
      };
    },
    PracticeComponent: PlaceholderPracticeComponent,
    handleAction() {
      return false;
    },
  };
}
