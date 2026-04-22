import React from 'react';
import { escapeHtml } from '../../platform/core/utils.js';

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
    renderPractice() {
      return `
        <div class="three-col">
          <section class="card border-top" style="border-top-color:${meta.accent};">
            <div class="eyebrow">Future subject module</div>
            <h2 class="section-title">${escapeHtml(meta.name)} foundation</h2>
            <p class="subtitle">${escapeHtml(meta.blurb)}</p>
            <div class="callout" style="margin-top:14px;">
              This rebuild keeps the shell, subject identity, analytics slot, game hooks and API contract ready for <strong>${escapeHtml(meta.name)}</strong>, but leaves the question engine intentionally separate so the next team can build it without touching Spelling.
            </div>
          </section>
          <section class="card">
            <div class="eyebrow">Extension points already reserved</div>
            <div class="chip-row">
              <span class="chip">subject module contract</span>
              <span class="chip">practice renderer</span>
              <span class="chip">analytics renderer</span>
              <span class="chip">game event adapter</span>
              <span class="chip">Cloudflare API route</span>
            </div>
          </section>
          <section class="card">
            <div class="eyebrow">Recommended next build slice</div>
            <div class="code-block">1. Content model\n2. Deterministic engine\n3. Local repository\n4. Subject analytics\n5. Game event mapping\n6. Worker API route</div>
          </section>
        </div>
      `;
    },
    handleAction() {
      return false;
    },
  };
}
