// tests/journeys/punctuation-landing-skeleton.mjs
//
// Phase 5 U9 journey: verify the Punctuation landing page skeleton is
// invariant — every section landmark, the primary CTA, and the star
// meter text pattern render for a fresh learner.
//
// Flow:
//   1. clearStorage() — wipe prior journey's cookies + localStorage.
//   2. Open /demo → seeds a demo learner and redirects to /.
//   3. Navigate into Punctuation → Setup scene renders.
//   4. Assert all five landmark sections exist:
//        hero, progress-row, monster-row, map-link, secondary
//   5. Assert the primary CTA [data-punctuation-cta] exists.
//   6. Assert star meter text matches /\d+ \/ 100 Stars/ pattern.
//   7. Screenshot the full landing page.
//
// Follows clearStorage → open('/demo') ordering (P4-U8 fix).

export default async function run({ driver, artefacts, log, assert }) {
  log('clearStorage (cookies + localStorage from prior journey)');
  await driver.clearStorage();

  log('open /demo (seeds demo learner + redirects to /)');
  await driver.open('/demo');
  await driver.waitForSelector('.subject-grid', 15_000);

  log('click Punctuation subject card');
  await driver.click('[data-action="open-subject"][data-subject-id="punctuation"]');
  await driver.waitForSelector('[data-punctuation-phase="setup"]', 10_000);
  await driver.screenshot(artefacts.path('01-landing-full'));

  // --- Landmark section assertions ---

  const landmarks = [
    { selector: '[data-section="hero"]', label: 'hero' },
    { selector: '[data-section="progress-row"]', label: 'progress-row' },
    { selector: '[data-section="monster-row"]', label: 'monster-row' },
    { selector: '[data-section="map-link"]', label: 'map-link' },
    { selector: '[data-section="secondary"]', label: 'secondary' },
  ];

  for (const { selector, label } of landmarks) {
    log(`assert landmark: ${label}`);
    const found = await driver.eval(
      `(() => { const el = document.querySelector(${JSON.stringify(selector)}); return el ? 'yes' : 'no'; })()`,
    );
    assert(/yes/i.test(found), `Landmark section "${label}" (${selector}) must exist on the landing page.`);
  }

  // --- Primary CTA ---

  log('assert primary CTA [data-punctuation-cta] exists');
  const hasCta = await driver.eval(
    "(() => { const el = document.querySelector('[data-punctuation-cta]'); return el ? 'yes' : 'no'; })()",
  );
  assert(/yes/i.test(hasCta), 'Primary CTA [data-punctuation-cta] must exist on the landing page.');

  // --- Star meter text ---

  log('assert star meter text matches /\\d+ \\/ 100 Stars/ pattern');
  const monsterRowText = await driver.eval(
    "(() => { const el = document.querySelector('[data-section=\"monster-row\"]'); return el ? el.textContent : ''; })()",
  );
  const starPattern = /\d+ \/ 100 Stars/;
  assert(starPattern.test(monsterRowText),
    `Monster row must contain star meter text matching ${starPattern}. Got: "${monsterRowText.slice(0, 200)}"`);

  await driver.screenshot(artefacts.path('02-landing-verified'));
  log('PASS — landing skeleton verified with all 5 landmarks, CTA, and star meters');
}
