import { CANONICAL_ROOT, escapeHtml } from './seo-practice-pages.mjs';

export const IDENTITY_SEO_PAGES = Object.freeze([
  Object.freeze({
    slug: 'about',
    title: 'About KS2 Mastery | KS2 Spelling, Grammar and Punctuation Practice',
    description: 'Learn what KS2 Mastery is, who it helps, and how learners can practise KS2 spelling, grammar and punctuation online.',
    eyebrow: 'About KS2 Mastery',
    heading: 'About KS2 Mastery',
    intro: 'KS2 Mastery is an online KS2 spelling, grammar and punctuation practice product for learners and supporting adults.',
    sections: [
      Object.freeze({
        heading: 'What KS2 Mastery helps with',
        body: 'The public practice pages explain the current subject areas: spelling for word confidence, grammar for sentence-level accuracy, and punctuation for clearer written English.',
        points: [
          'KS2 spelling, grammar and punctuation practice in focused online sessions',
          'Plain practice routes that can be understood before a learner signs in',
          'A demo path for trying the product before saving learner progress',
        ],
      }),
      Object.freeze({
        heading: 'Demo and saved progress',
        body: 'Learners can try a demo before signing in. Signing in saves learner profiles and progress so practice can continue across sessions.',
        points: [
          'The demo is a public way to try the practice flow',
          'Signed-in accounts can save learner profiles and progress',
          'The public pages introduce the product without exposing learner records',
        ],
      }),
      Object.freeze({
        heading: 'Public and private content',
        body: 'Private learner progress, admin tools and generated content stores are not public SEO content. Public pages describe the product only at a high level.',
        points: [
          'Search and AI systems should use the root, about page and practice pages for public product identity',
          'Private app data, account state and operator tools stay behind the app boundary',
          'KS2 Mastery does not promise search placement, AI recommendations or fixed learning results',
        ],
      }),
    ],
  }),
]);

function renderPoint(point) {
  return `              <li>${escapeHtml(point)}</li>`;
}

function renderSection(section) {
  return `        <section class="practice-public-section">
          <h2>${escapeHtml(section.heading)}</h2>
          <p>${escapeHtml(section.body)}</p>
          <ul class="practice-public-list">
${section.points.map(renderPoint).join('\n')}
          </ul>
        </section>`;
}

export function canonicalIdentityPageUrl(page) {
  return `${CANONICAL_ROOT}${page.slug}/`;
}

export function renderIdentitySeoPage(page) {
  const canonicalUrl = canonicalIdentityPageUrl(page);
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
<body class="practice-public-page identity-public-page">
  <header class="practice-public-nav" aria-label="Site">
    <a href="/">KS2 Mastery</a>
    <a href="/about/">About</a>
  </header>
  <main class="practice-public-shell">
    <article class="practice-public-panel identity-public-panel">
      <p class="eyebrow">${escapedEyebrow}</p>
      <h1>${escapedHeading}</h1>
      <p class="practice-public-intro">${escapedIntro}</p>
${page.sections.map(renderSection).join('\n')}
      <nav class="seo-practice-links identity-public-links" aria-label="KS2 Mastery public pages">
        <a href="/ks2-spelling-practice/">KS2 spelling practice online</a>
        <a href="/ks2-grammar-practice/">KS2 grammar practice online</a>
        <a href="/ks2-punctuation-practice/">KS2 punctuation practice online</a>
      </nav>
      <div class="actions practice-public-actions">
        <a class="btn primary lg" href="/demo">Try demo</a>
        <a class="btn secondary lg" href="/">KS2 Mastery home</a>
      </div>
    </article>
  </main>
</body>
</html>
`;
}
