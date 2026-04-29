import { heroWelcomeLine } from './hero-copy.js';

/* Subject-agnostic "Hi {name} — ready for a short round?" hero welcome line.
 *
 * Currently used by Grammar (`GrammarSetupScene`) and Punctuation
 * (`PunctuationSetupScene`) — both previously rendered the same line
 * inline. The component centralises the conditional render contract so
 * every consumer gets the same rules:
 *
 *   - Non-empty trimmed name → renders `<p>Hi {name} — ready for a short round?</p>`.
 *   - Empty / whitespace-only / null / undefined name → renders `null`
 *     (the line collapses entirely; no orphan "Hi  — ready for a short
 *     round?" and no "Hi friend" fallback — an anonymous session simply
 *     omits the welcome).
 *
 * `className` is optional — callers pass their subject-namespaced class
 * (`grammar-hero-welcome` / `punctuation-hero-welcome`) so the existing
 * CSS selectors and Playwright locators stay anchored to the same class
 * string. When no className is supplied the rendered `<p>` carries no
 * class attribute at all (rather than an empty `class=""`), matching
 * React's convention for unset props.
 *
 * The string itself lives in `./hero-copy.js` as a pure function so
 * unit tests can assert on the text without a React tree.
 */
export function HeroWelcome({ name, className = '' }) {
  const line = heroWelcomeLine(name);
  if (!line) return null;
  return <p className={className || undefined}>{line}</p>;
}
