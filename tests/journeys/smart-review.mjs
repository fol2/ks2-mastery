// tests/journeys/smart-review.mjs
//
// R9 journey 1: Home -> Punctuation -> Start Smart Review -> Q1 rendered.
//
// This is the journey the Phase 3 SSR harness missed. The unit test in
// `tests/react-punctuation-scene.test.js` asserted on the rendered HTML
// after dispatching `punctuation-start` directly — it never exercised the
// primary-mode card's onClick, which was wiring `punctuation-set-mode`
// (preference save) instead of `punctuation-start` (session open). The
// bug shipped green. This spec clicks the real button.
//
// Flow:
//   1. clearStorage() — wipe prior journey's cookies + localStorage.
//   2. Open /demo — seeds a demo learner and redirects to /.
//   3. Click Home's Punctuation card ([data-subject-id="punctuation"]).
//   4. Click the Smart Review primary-mode card
//      ([data-action="punctuation-start"][data-mode-id="smart"]).
//   5. Assert the Session scene is mounted: the `[data-punctuation-submit]`
//      button appears within 10s (this is the first child-visible proof
//      that Q1 has rendered — Setup never shows the submit button).
//   6. Screenshot each step into artefacts/.
//
// FINDING A fix (review follow-on): order is clearStorage BEFORE open('/demo')
// so the fresh auth cookie /demo sets survives. The prior order wiped it.

export default async function run({ driver, artifacts, log, assert }) {
  log('clearStorage (cookies + localStorage from prior journey)');
  await driver.clearStorage();

  log('open /demo (seeds demo learner + redirects to /)');
  await driver.open('/demo');
  await driver.waitForSelector('.subject-grid', 15_000);
  await driver.screenshot(artifacts.path('01-home'));

  log('click Punctuation subject card');
  await driver.click('[data-action="open-subject"][data-subject-id="punctuation"]');
  await driver.waitForSelector('[data-punctuation-phase="setup"]', 10_000);
  await driver.screenshot(artifacts.path('02-setup'));

  log('click Start Smart Review primary-mode card');
  await driver.click('[data-action="punctuation-start"][data-mode-id="smart"]');

  log('wait for Session scene submit button to mount');
  await driver.waitForSelector('[data-punctuation-submit]', 15_000);
  await driver.screenshot(artifacts.path('03-session-q1'));

  const onSetup = await driver.eval(
    "document.querySelector('[data-punctuation-phase=\\\"setup\\\"]') ? 'yes' : 'no'",
  );
  assert(!/yes/i.test(onSetup), 'Setup scene should unmount after starting Smart Review.');

  const hasSubmit = await driver.eval(
    "document.querySelector('[data-punctuation-submit]') ? 'yes' : 'no'",
  );
  assert(/yes/i.test(hasSubmit), 'Session scene submit button must render for Q1.');
}
