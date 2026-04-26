// tests/journeys/wobbly-spots.mjs
//
// R9 journey 2: Home -> Punctuation -> Wobbly Spots -> Q1 OR empty state.
//
// The Wobbly Spots card (data-mode-id="weak") runs a `weak` cohort. On a
// fresh demo learner with no weak skills the Session scene is still
// expected to mount an empty state or defer to Smart Review; whichever
// path the engine picks, the child must land somewhere that is NOT still
// the Setup scene (the regression we are guarding against).

export default async function run({ driver, artifacts, log, assert }) {
  // FINDING A fix: clearStorage FIRST, then /demo (so /demo's auth cookie
  // survives — prior ordering wiped it and downstream API calls 401'd).
  log('clearStorage (cookies + localStorage from prior journey)');
  await driver.clearStorage();

  log('open /demo');
  await driver.open('/demo');
  await driver.waitForSelector('.subject-grid', 15_000);
  await driver.screenshot(artifacts.path('01-home'));

  log('click Punctuation subject card');
  await driver.click('[data-action="open-subject"][data-subject-id="punctuation"]');
  await driver.waitForSelector('[data-punctuation-phase="setup"]', 10_000);
  await driver.screenshot(artifacts.path('02-setup'));

  log('click Wobbly Spots primary-mode card');
  await driver.click('[data-action="punctuation-start"][data-mode-id="weak"]');

  log('wait for Setup to unmount OR empty-state surface');
  // We poll for "anything but Setup" — accepts Session, Summary, or an
  // explicit empty-state banner. We allow up to 15s for the engine round
  // trip.
  const start = Date.now();
  let outcome = null;
  while (Date.now() - start < 15_000) {
    // FINDING D fix (review follow-on): dropped `.punctuation-empty-state`
    // branch — no src hits. Accept Session, Summary, or generic "left
    // Setup" as proof of a mode-switch.
    const state = await driver.eval(
      "(() => {" +
        " if (document.querySelector('[data-punctuation-submit]')) return 'session';" +
        " if (document.querySelector('[data-punctuation-phase=\\\"summary\\\"]')) return 'summary';" +
        " if (!document.querySelector('[data-punctuation-phase=\\\"setup\\\"]')) return 'left-setup';" +
        " return 'still-setup';" +
      " })()",
    );
    const clean = state.trim().replace(/^['"]|['"]$/g, '');
    if (clean !== 'still-setup') { outcome = clean; break; }
    await new Promise((r) => setTimeout(r, 250));
  }
  await driver.screenshot(artifacts.path('03-after-wobbly'));
  assert(outcome && outcome !== 'still-setup',
    'Wobbly Spots click must leave the Setup scene (Session, Summary, or empty state).');
  log(`Wobbly Spots outcome: ${outcome}`);
}
