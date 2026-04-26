// tests/journeys/gps-check.mjs
//
// R9 journey 3: Home -> Punctuation -> GPS Check -> Q1 with test-mode banner.
//
// GPS Check is the `gps` primary mode. The child-visible contract is
// that the Session scene exposes a "test mode" banner — answers at the
// end, not after each item. We assert both:
//   - The submit button mounts (Q1 rendered)
//   - A test-mode banner is present (class / text hint)
//
// We keep the banner assertion permissive: any of the known class hooks
// or the substring "test mode" (case-insensitive) counts as proof, to
// avoid over-coupling to an exact string that copy sweeps may evolve.

export default async function run({ driver, artifacts, log, assert }) {
  // FINDING A fix: clearStorage FIRST, then /demo (so /demo's auth cookie
  // survives).
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

  log('click GPS Check primary-mode card');
  await driver.click('[data-action="punctuation-start"][data-mode-id="gps"]');

  log('wait for Session submit + test-mode banner');
  await driver.waitForSelector('[data-punctuation-submit]', 15_000);
  await driver.screenshot(artifacts.path('03-session-q1'));

  const bannerCheck = await driver.eval(
    "(() => {" +
      " const bodyText = (document.body.textContent || '').toLowerCase();" +
      " const hasClassHook = !!document.querySelector(" +
      "   '.punctuation-test-mode-banner, [data-punctuation-mode=\\\"gps\\\"], [data-test-mode]');" +
      " const hasTextHook = bodyText.includes('test mode') || bodyText.includes('answers at the end');" +
      " return hasClassHook || hasTextHook ? 'yes' : 'no';" +
    " })()",
  );
  assert(/yes/i.test(bannerCheck),
    'GPS Check session must surface a test-mode banner (class hook or text).');
}
