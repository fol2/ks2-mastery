// UI Refactor P3 U1 — Subject Theme Scope.
//
// Thin wrapper that renders a `<div>` with the `.subject-theme` class and a
// `data-subject` attribute set to the provided subject identifier. CSS custom
// properties declared in `styles/app.css` under
// `.subject-theme[data-subject="X"]` cascade into all descendants, giving
// shared primitives (Button, ProgressMeter, Card) the correct accent colour
// without any inline style overrides or JS colour lookups.
//
// Zero runtime cost — no context, no hooks, no memo. If subjectId is falsy
// the wrapper still renders (it just won't match any accent rule and the
// fallback `var(--brand)` applies).

/**
 * @param {{ subjectId: string, children: import('react').ReactNode, className?: string, style?: object }} props
 */
export function SubjectThemeScope({ subjectId, children, className, style }) {
  const classes = className
    ? `subject-theme ${className}`
    : 'subject-theme';
  return (
    <div className={classes} data-subject={subjectId || undefined} style={style}>
      {children}
    </div>
  );
}
