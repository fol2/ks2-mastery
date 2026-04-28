export const CANONICAL_ROOT = 'https://ks2.eugnel.uk/';

export const PRACTICE_SEO_PAGES = Object.freeze([
  Object.freeze({
    slug: 'ks2-spelling-practice',
    title: 'KS2 Spelling Practice Online | KS2 Mastery',
    description: 'Practise KS2 spelling online with focused word work for confidence, accuracy and independent English practice.',
    eyebrow: 'KS2 spelling practice',
    heading: 'KS2 spelling practice online',
    intro: 'Build word confidence with short, focused KS2 spelling practice. KS2 Mastery helps learners practise words online and move into a demo or signed-in session when they are ready.',
    points: [
      'Practise KS2 spelling words with focused online sessions',
      'Strengthen accuracy, recall and independent word confidence',
      'Try the demo before signing in to save learner progress',
    ],
    relatedLinks: [
      Object.freeze({ href: '/year-5-spelling-practice/', label: 'Year 5 spelling practice online' }),
    ],
  }),
  Object.freeze({
    slug: 'ks2-grammar-practice',
    title: 'KS2 Grammar Practice Online | KS2 Mastery',
    description: 'Practise KS2 grammar online with focused sentence-level work for clearer, more accurate English.',
    eyebrow: 'KS2 grammar practice',
    heading: 'KS2 grammar practice online',
    intro: 'KS2 Mastery supports grammar practice through focused online sessions that help learners work on sentence accuracy and understand how English fits together.',
    points: [
      'Practise KS2 grammar through short online activities',
      'Build sentence-level accuracy and language confidence',
      'Use the demo path to try the practice flow before signing in',
    ],
    relatedLinks: [
      Object.freeze({ href: '/help-child-ks2-grammar-at-home/', label: 'Help your child with KS2 grammar at home' }),
    ],
  }),
  Object.freeze({
    slug: 'ks2-punctuation-practice',
    title: 'KS2 Punctuation Practice Online | KS2 Mastery',
    description: 'Practise KS2 punctuation online with focused activities for clearer written English.',
    eyebrow: 'KS2 punctuation practice',
    heading: 'KS2 punctuation practice online',
    intro: 'KS2 Mastery helps learners practise punctuation online so they can build clearer written English through focused, repeatable practice.',
    points: [
      'Practise KS2 punctuation in focused online sessions',
      'Work on clearer sentence meaning and written accuracy',
      'Start with the demo, then sign in when you want saved progress',
    ],
    relatedLinks: [
      Object.freeze({ href: '/ks2-apostrophes-practice/', label: 'KS2 apostrophes practice online' }),
    ],
  }),
]);

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderPoint(point) {
  return `          <li>${escapeHtml(point)}</li>`;
}

function renderRelatedLink(link) {
  return `        <a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`;
}

export function canonicalPracticePageUrl(page) {
  return `${CANONICAL_ROOT}${page.slug}/`;
}

export function renderPracticeSeoPage(page) {
  const canonicalUrl = canonicalPracticePageUrl(page);
  const escapedTitle = escapeHtml(page.title);
  const escapedDescription = escapeHtml(page.description);
  const escapedHeading = escapeHtml(page.heading);
  const escapedEyebrow = escapeHtml(page.eyebrow);
  const escapedIntro = escapeHtml(page.intro);
  return `<!DOCTYPE html>
<html lang="en-GB">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <meta name="application-name" content="KS2 Mastery" />
  <meta name="description" content="${escapedDescription}" />
  <meta name="color-scheme" content="light dark" />
  <meta name="theme-color" content="#F6F5F1" media="(prefers-color-scheme: light)" />
  <meta name="theme-color" content="#0F1620" media="(prefers-color-scheme: dark)" />
  <meta property="og:site_name" content="KS2 Mastery" />
  <meta property="og:title" content="${escapedTitle}" />
  <meta property="og:description" content="${escapedDescription}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${canonicalUrl}" />
  <meta property="og:locale" content="en_GB" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${escapedTitle}" />
  <meta name="twitter:description" content="${escapedDescription}" />
  <title>${escapedTitle}</title>
  <link rel="canonical" href="${canonicalUrl}" />
  <link rel="manifest" href="/manifest.webmanifest" />
  <link rel="icon" href="/favicon.ico" sizes="any" />
  <link rel="icon" type="image/png" sizes="32x32" href="/assets/app-icons/favicon-32.png" />
  <link rel="icon" type="image/png" sizes="16x16" href="/assets/app-icons/favicon-16.png" />
  <link rel="apple-touch-icon" sizes="180x180" href="/assets/app-icons/apple-touch-icon.png" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600;700&display=swap" />
  <link rel="stylesheet" href="/styles/app.css" />
</head>
<body class="practice-public-page">
  <header class="practice-public-nav" aria-label="Site">
    <a href="/">KS2 Mastery</a>
    <a href="/about/">About</a>
  </header>
  <main class="practice-public-shell">
    <section class="practice-public-panel">
      <p class="eyebrow">${escapedEyebrow}</p>
      <h1>${escapedHeading}</h1>
      <p class="practice-public-intro">${escapedIntro}</p>
      <ul class="practice-public-list" aria-label="${escapedEyebrow} benefits">
${page.points.map(renderPoint).join('\n')}
      </ul>
      <nav class="seo-practice-links practice-public-related" aria-label="Related KS2 Mastery pages">
${(page.relatedLinks || []).map(renderRelatedLink).join('\n')}
        <a href="/about/">About KS2 Mastery</a>
      </nav>
      <div class="actions practice-public-actions">
        <a class="btn primary lg" href="/demo">Try demo</a>
        <a class="btn secondary lg" href="/">KS2 Mastery home</a>
        <a class="btn secondary lg" href="/about/">About KS2 Mastery</a>
      </div>
    </section>
  </main>
</body>
</html>
`;
}
