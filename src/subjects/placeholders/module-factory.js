import { createElement } from 'react';

function PlaceholderPracticeComponent({ subject }) {
  const meta = subject || {};
  const h = createElement;
  return h(
    'div',
    { className: 'three-col' },
    h(
      'section',
      { className: 'card border-top', style: { borderTopColor: meta.accent } },
      h('div', { className: 'eyebrow' }, 'Future subject module'),
      h('h2', { className: 'section-title' }, `${meta.name} foundation`),
      h('p', { className: 'subtitle' }, meta.blurb),
      h(
        'div',
        { className: 'callout', style: { marginTop: 14 } },
        'This rebuild keeps the shell, subject identity, analytics slot, game hooks and API contract ready for ',
        h('strong', null, meta.name),
        ', but leaves the question engine intentionally separate so the next team can build it without touching Spelling.',
      ),
    ),
    h(
      'section',
      { className: 'card' },
      h('div', { className: 'eyebrow' }, 'Extension points already reserved'),
      h(
        'div',
        { className: 'chip-row' },
        h('span', { className: 'chip' }, 'subject module contract'),
        h('span', { className: 'chip' }, 'practice component'),
        h('span', { className: 'chip' }, 'analytics model'),
        h('span', { className: 'chip' }, 'game event adapter'),
        h('span', { className: 'chip' }, 'Cloudflare API route'),
      ),
    ),
    h(
      'section',
      { className: 'card' },
      h('div', { className: 'eyebrow' }, 'Recommended next build slice'),
      h('div', { className: 'code-block' }, '1. Content model\n2. Deterministic engine\n3. Local repository\n4. Subject analytics\n5. Game event mapping\n6. Worker API route'),
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
