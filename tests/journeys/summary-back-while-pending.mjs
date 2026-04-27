// tests/journeys/summary-back-while-pending.mjs
//
// R9 journey 5: Summary Back stays enabled while a command is pending
// (U6 invariant — navigation gating is separate from mutation gating).
//
// P7-U11 activation: this journey is now ACTIVE (was SKIPPED per P4-U8
// fix B). The dev-only stall endpoint has landed (P7-U9:
// `stall-punctuation-command` in `tests/helpers/fault-injection.mjs`).
//
// The deeper pending-state proof (stall fault injection with real command
// in flight) lives in the Playwright suite at
// `tests/playwright/punctuation-pending-navigation.playwright.test.mjs`
// because Playwright supports per-request header interception via
// `page.route()` which is required to attach the fault opt-in header.
//
// This journey exercises the production-truthful assertion that the
// bb-browser / agent-browser driver CAN verify: drive a real session to
// Summary, then assert the Back button is enabled AND that clicking it
// navigates away. The invariant under test is that `composeIsNavigationDisabled`
// never returns `true` when the `ui` shape is present — which is the
// Phase 4 U6 contract that decoupled navigation from mutation gating.
//
// Why this is not a tautology: a regression that re-couples navigation to
// `composeIsDisabled` (which reads `pendingCommand`, `availability`, and
// `readOnly`) would cause Back to be disabled whenever any of those signals
// are truthy. The journey verifies the wiring is correct in the real
// built app served by the Worker-backed dev server.

export default async function run({ driver, artefacts, log, assert }) {
  // FINDING A fix: clearStorage FIRST, then /demo.
  log('clearStorage (cookies + localStorage from prior journey)');
  await driver.clearStorage();

  log('open /demo');
  await driver.open('/demo');
  await driver.waitForSelector('.subject-grid', 15_000);

  log('navigate to Punctuation Setup');
  await driver.click('[data-action="open-subject"][data-subject-id="punctuation"]');
  await driver.waitForSelector('[data-punctuation-phase="setup"]', 10_000);
  await driver.screenshot(artefacts.path('01-setup'));

  log('start Smart Review and drive through to Summary');
  await driver.click('[data-punctuation-start]');
  await driver.waitForSelector('[data-punctuation-submit]', 15_000);
  await driver.screenshot(artefacts.path('02-session-q1'));

  // Drive through answers until we reach Summary.
  const summaryStart = Date.now();
  let reachedSummary = false;
  while (Date.now() - summaryStart < 20_000) {
    const phase = await driver.eval(
      "(() => { const el = document.querySelector('[data-punctuation-phase]'); return el ? el.getAttribute('data-punctuation-phase') : ''; })()",
    );
    if (/summary/.test(phase)) { reachedSummary = true; break; }
    // Answer / continue / finish-now — whatever is available.
    await driver.eval(
      "(() => {" +
        " const choice = document.querySelector('.choice-card');" +
        " if (choice) choice.click();" +
        " const submit = document.querySelector('[data-punctuation-submit]');" +
        " if (submit && !submit.disabled) submit.click();" +
        " const cont = document.querySelector('[data-punctuation-continue]');" +
        " if (cont && !cont.disabled) cont.click();" +
        " const finish = document.querySelector('[data-punctuation-finish-now]');" +
        " if (finish && !finish.disabled) finish.click();" +
        " return 'nudged';" +
      " })()",
    );
    await new Promise((r) => setTimeout(r, 400));
  }
  assert(reachedSummary, 'Journey must reach Summary phase within 20s.');
  await driver.screenshot(artefacts.path('03-summary'));

  // --- Core invariant: Back button is enabled on Summary ---
  log('assert Back button is present, enabled, and not aria-disabled on Summary');
  const backState = await driver.eval(
    "(() => {" +
      " const back = document.querySelector('[data-action=\"punctuation-back\"]');" +
      " if (!back) return JSON.stringify({ found: false });" +
      " return JSON.stringify({" +
      "   found: true," +
      "   disabled: back.hasAttribute('disabled') && back.disabled === true," +
      "   ariaDisabled: back.getAttribute('aria-disabled') === 'true'," +
      "   tagName: back.tagName," +
      " });" +
    " })()",
  );
  log(`back button state: ${backState}`);
  const parsed = JSON.parse(backState);
  assert(parsed.found === true,
    'Summary scene must render a [data-action="punctuation-back"] button.');
  assert(parsed.disabled === false,
    'U6 invariant: Back button must NOT be disabled on the Summary scene.');
  assert(parsed.ariaDisabled === false,
    'U6 invariant: Back button must NOT be aria-disabled on the Summary scene.');

  // --- Assert mutation buttons exist and are in a valid state ---
  log('assert mutation buttons exist on Summary (Start again, Open Map)');
  const mutationState = await driver.eval(
    "(() => {" +
      " const startAgain = document.querySelector('[data-punctuation-summary] button.btn.primary');" +
      " const openMap = document.querySelector('[data-action=\"punctuation-open-map\"]');" +
      " return JSON.stringify({" +
      "   startAgainFound: !!startAgain," +
      "   openMapFound: !!openMap," +
      " });" +
    " })()",
  );
  log(`mutation button state: ${mutationState}`);
  const mutations = JSON.parse(mutationState);
  assert(mutations.startAgainFound === true,
    'Summary must have a "Start again" primary button.');

  // --- Navigate via Back and verify ---
  log('click Back to verify navigation works from Summary');
  await driver.click('[data-action="punctuation-back"]');
  // Should land on setup or home grid.
  const postNavPhase = await Promise.race([
    driver.waitForSelector('[data-punctuation-phase="setup"]', 10_000)
      .then(() => 'setup'),
    driver.waitForSelector('.subject-grid', 10_000)
      .then(() => 'home'),
  ]);
  log(`post-Back navigation landed on: ${postNavPhase}`);
  assert(
    postNavPhase === 'setup' || postNavPhase === 'home',
    'Back button must navigate to setup or home grid.',
  );
  await driver.screenshot(artefacts.path('04-back-to-setup'));

  // Verify Summary is gone after Back.
  const summaryGone = await driver.eval(
    "(() => { return document.querySelector('[data-punctuation-summary]') ? 'still-visible' : 'gone'; })()",
  );
  assert(summaryGone === 'gone',
    'Summary must not be visible after clicking Back.');

  log('PASS — Summary Back navigation verified: Back enabled, mutation buttons present, navigation works');
}
