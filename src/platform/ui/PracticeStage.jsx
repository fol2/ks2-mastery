// UI Refactor P3 U4 — Practice Stage shell.
//
// Decorative background wrapper for practice scenes. Renders a subject-themed
// solid-colour backdrop with optional CSS-only motion (transforms/opacity).
// Content (children) never shifts position — no layout-affecting animation.
//
// Mandatory reduced-motion support: when the user prefers reduced motion the
// motion class is suppressed and only the static colour renders. Missing
// backdrop assets degrade to the subject accent colour (never a broken image).

import { getSubjectTheme } from './subject-themes.js';

const BACKDROP_CLASSES = Object.freeze({
  meadow: 'ps-backdrop-meadow',
  library: 'ps-backdrop-library',
  'punctuation-map': 'ps-backdrop-punctuation-map',
  'subject-default': 'ps-backdrop-default',
});

const MOTION_CLASSES = Object.freeze({
  calm: 'ps-motion-calm',
  active: 'ps-motion-active',
  celebration: 'ps-motion-celebration',
  none: '',
});

/**
 * @param {{
 *   subjectId: string,
 *   scene?: 'setup' | 'session' | 'summary',
 *   backdrop?: 'meadow' | 'library' | 'punctuation-map' | 'subject-default',
 *   motion?: 'calm' | 'active' | 'celebration' | 'none',
 *   reducedMotionFallback?: boolean,
 *   children: import('react').ReactNode,
 * }} props
 */
export function PracticeStage({
  subjectId,
  scene = 'session',
  backdrop = 'subject-default',
  motion = 'none',
  reducedMotionFallback = true,
  children,
}) {
  const theme = getSubjectTheme(subjectId);
  const accentColour = theme ? theme.accentSoft : 'var(--panel-soft)';
  const classes = ['practice-stage', `ps-scene-${scene}`];
  classes.push(BACKDROP_CLASSES[backdrop] || 'ps-backdrop-default');
  if (motion !== 'none') classes.push(MOTION_CLASSES[motion] || '');
  if (reducedMotionFallback) classes.push('ps-reduced-motion-safe');
  return (
    <div
      className={classes.filter(Boolean).join(' ')}
      data-practice-stage={subjectId}
      aria-hidden="false"
      style={{ '--ps-accent': accentColour }}
    >
      {children}
    </div>
  );
}
