// UI Refactor P3 U1 — Subject Theme Registry.
//
// Provides a JS-accessible registry of SubjectTheme objects for consumers that
// need accent values in JavaScript (e.g. inline SVG fills, canvas drawing,
// runtime style computation). These values mirror the CSS custom properties
// defined in `styles/app.css` under `.subject-theme[data-subject]`.
//
// Prefer CSS variable consumption where possible — this registry is the escape
// hatch for contexts where CSS variables are not available.

/**
 * @typedef {{
 *   subjectId: string,
 *   accent: string,
 *   accentInk: string,
 *   accentSoft: string,
 *   accentBorder: string,
 * }} SubjectTheme
 */

/** @type {Readonly<Record<string, SubjectTheme>>} */
export const SUBJECT_THEMES = Object.freeze({
  spelling: Object.freeze({
    subjectId: 'spelling',
    accent: '#3E6FA8',
    accentInk: '#274D79',
    accentSoft: '#DCE6F3',
    accentBorder: '#C5D4E8',
  }),
  grammar: Object.freeze({
    subjectId: 'grammar',
    accent: '#7e5bb6',
    accentInk: '#5c4490',
    accentSoft: '#ece1f6',
    accentBorder: '#C9B8DD',
  }),
  punctuation: Object.freeze({
    subjectId: 'punctuation',
    accent: '#B8873F',
    accentInk: '#8C6730',
    accentSoft: '#F5E8D0',
    accentBorder: '#DCC9A4',
  }),
  reading: Object.freeze({
    subjectId: 'reading',
    accent: '#4B7A4A',
    accentInk: '#366836',
    accentSoft: '#E2F0E2',
    accentBorder: '#B3D4B3',
  }),
  reasoning: Object.freeze({
    subjectId: 'reasoning',
    accent: '#8A5A9D',
    accentInk: '#6B3F80',
    accentSoft: '#F0E4F5',
    accentBorder: '#CDAEDD',
  }),
  arithmetic: Object.freeze({
    subjectId: 'arithmetic',
    accent: '#C06B3E',
    accentInk: '#964F2B',
    accentSoft: '#F8E4D6',
    accentBorder: '#DDB49A',
  }),
});

/**
 * Look up a subject theme by id. Returns undefined for unknown subjects
 * (never throws).
 * @param {string} subjectId
 * @returns {SubjectTheme | undefined}
 */
export function getSubjectTheme(subjectId) {
  return SUBJECT_THEMES[subjectId];
}

/**
 * All registered subject ids.
 * @type {readonly string[]}
 */
export const SUBJECT_IDS = Object.freeze(Object.keys(SUBJECT_THEMES));
