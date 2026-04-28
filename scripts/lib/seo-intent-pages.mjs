import { CANONICAL_ROOT, escapeHtml } from './seo-practice-pages.mjs';

export const INTENT_SEO_PAGES = Object.freeze([
  Object.freeze({
    slug: 'ks2-apostrophes-practice',
    title: 'KS2 Apostrophes Practice Online | KS2 Mastery',
    description: 'Practise KS2 apostrophes online with focused work on contractions, possession and clearer written English.',
    eyebrow: 'KS2 apostrophes practice',
    heading: 'KS2 apostrophes practice online',
    intro: 'KS2 Mastery helps learners practise apostrophes through focused online sessions that connect punctuation rules with clearer written English.',
    lane: 'Subject and problem intent',
    points: [
      'Practise apostrophes for contractions in everyday KS2 words',
      'Work on apostrophes for possession in singular, plural and irregular examples',
      'Use the demo path to try punctuation practice before signing in',
    ],
    relatedLinks: [
      Object.freeze({ href: '/ks2-punctuation-practice/', label: 'KS2 punctuation practice online' }),
      Object.freeze({ href: '/about/', label: 'About KS2 Mastery' }),
    ],
  }),
  Object.freeze({
    slug: 'year-5-spelling-practice',
    title: 'Year 5 Spelling Practice Online | KS2 Mastery',
    description: 'Practise Year 5 spelling online with focused KS2 word work for confidence, recall and independent English practice.',
    eyebrow: 'Year 5 spelling practice',
    heading: 'Year 5 spelling practice online',
    intro: 'KS2 Mastery supports Year 5 spelling practice with short online sessions that help learners build word confidence, accuracy and recall.',
    lane: 'Year and subject intent',
    points: [
      'Practise spelling through focused KS2 word work',
      'Build confidence with repeatable sessions for independent practice',
      'Try the demo first, then sign in when saved learner progress matters',
    ],
    relatedLinks: [
      Object.freeze({ href: '/ks2-spelling-practice/', label: 'KS2 spelling practice online' }),
      Object.freeze({ href: '/about/', label: 'About KS2 Mastery' }),
    ],
  }),
  Object.freeze({
    slug: 'help-child-ks2-grammar-at-home',
    title: 'Help My Child with KS2 Grammar at Home | KS2 Mastery',
    description: 'Help a child practise KS2 grammar at home with short online sessions for sentence accuracy and English confidence.',
    eyebrow: 'KS2 grammar help at home',
    heading: 'Help your child with KS2 grammar at home',
    intro: 'KS2 Mastery gives supporting adults a simple way to help a child practise KS2 grammar at home through focused online sessions.',
    lane: 'Parent support intent',
    points: [
      'Use short sessions to practise sentence-level grammar',
      'Support clearer English practice with guidance that stays focused on the session',
      'Start with the demo and sign in later when saved progress is useful',
    ],
    relatedLinks: [
      Object.freeze({ href: '/ks2-grammar-practice/', label: 'KS2 grammar practice online' }),
      Object.freeze({ href: '/about/', label: 'About KS2 Mastery' }),
    ],
  }),
]);

function renderPoint(point) {
  return `          <li>${escapeHtml(point)}</li>`;
}

function renderRelatedLink(link) {
  return `        <a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`;
}

export function canonicalIntentPageUrl(page) {
  return `${CANONICAL_ROOT}${page.slug}/`;
}

export function renderIntentSeoPage(page) {
  const canonicalUrl = canonicalIntentPageUrl(page);
  const escapedTitle = escapeHtml(page.title);
  const escapedDescription = escapeHtml(page.description);
  const escapedHeading = escapeHtml(page.heading);
  const escapedEyebrow = escapeHtml(page.eyebrow);
  const escapedIntro = escapeHtml(page.intro);
  const escapedLane = escapeHtml(page.lane);
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
<body class="practice-public-page intent-public-page">
  <header class="practice-public-nav" aria-label="Site">
    <a href="/">KS2 Mastery</a>
    <a href="/about/">About</a>
  </header>
  <main class="practice-public-shell">
    <section class="practice-public-panel intent-public-panel">
      <p class="eyebrow">${escapedEyebrow}</p>
      <h1>${escapedHeading}</h1>
      <p class="practice-public-intro">${escapedIntro}</p>
      <p class="intent-public-lane">${escapedLane}</p>
      <ul class="practice-public-list" aria-label="${escapedEyebrow} benefits">
${page.points.map(renderPoint).join('\n')}
      </ul>
      <nav class="seo-practice-links intent-public-links" aria-label="Related KS2 Mastery pages">
${page.relatedLinks.map(renderRelatedLink).join('\n')}
      </nav>
      <div class="actions practice-public-actions">
        <a class="btn primary lg" href="/demo">Try demo</a>
        <a class="btn secondary lg" href="/">KS2 Mastery home</a>
      </div>
    </section>
  </main>
</body>
</html>
`;
}
