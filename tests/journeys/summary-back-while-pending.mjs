// tests/journeys/summary-back-while-pending.mjs
//
// R9 journey 5: Summary Back stays enabled while a command is pending
// (U6 invariant — navigation gating is separate from mutation gating).
//
// The regression this guards: before U6, any in-flight `pendingCommand`
// disabled every button on the Summary scene, including the "Back to
// dashboard" navigation escape hatch. That trapped children on a stuck
// Summary. U6 split navigation from mutation; this spec asserts the Back
// button is tappable (not `disabled`, not `aria-disabled="true"`) while
// we inject a pendingCommand-like state.
//
// FINDING B fix (review follow-on): this spec previously asserted Back
// was not disabled on a CLEAN Summary render — that proves nothing about
// U6's invariant (which is that Back stays enabled DURING an in-flight
// pendingCommand). Asserting on a clean render is a tautology.
//
// Correct evidence requires a dev-only stall endpoint (x-ks2-fault-opt-in
// + stall-command plan) which has NOT landed. Until that hook ships, this
// spec returns the SKIPPED sentinel so the runner reports SKIP (not PASS),
// preserving the spec as documentation + future-executable scaffold
// without shipping a false-green assertion.
//
// The runner recognises the sentinel shape `{ status: 'SKIPPED', reason }`
// from a default-export run() and tags the result accordingly in
// machine-readable JSON + the prose summary.

export const JOURNEY_SKIP_SENTINEL = Symbol.for('ks2.journey.skipped');

export default async function run({ driver, artifacts, log }) {
  // FINDING B fix: emit SKIP sentinel. A live assertion on a clean render
  // is a tautology — a real test requires a dev-only stall endpoint to
  // hold a command in flight while we inspect the Back button. That hook
  // is deferred to a follow-on unit (see header).
  log('SKIPPED: pending-command injection requires a dev-only stall ' +
    'endpoint (x-ks2-fault-opt-in + stall-command plan) which has not ' +
    'landed. Asserting on a clean Summary render would be a tautology. ' +
    'Spec preserved as documentation + future-executable scaffold.');
  return {
    [JOURNEY_SKIP_SENTINEL]: true,
    status: 'SKIPPED',
    reason: 'pending-command injection requires dev-only stall endpoint; deferred to follow-on unit',
  };
}

// ---------------------------------------------------------------------------
// Future-executable body (kept for reference; invoked by /* disabled */ so
// no network / selector work fires). Once the stall endpoint lands, swap
// the early-return above for a gate on hook availability and run this.
// ---------------------------------------------------------------------------

/* eslint-disable no-unused-vars */
async function _futureRun({ driver, artifacts, log, assert }) {
  // FINDING A fix: clearStorage FIRST, then /demo.
  log('clearStorage (cookies + localStorage from prior journey)');
  await driver.clearStorage();

  log('open /demo');
  await driver.open('/demo');
  await driver.waitForSelector('.subject-grid', 15_000);

  log('navigate to Punctuation Setup');
  await driver.click('[data-action="open-subject"][data-subject-id="punctuation"]');
  await driver.waitForSelector('[data-punctuation-phase="setup"]', 10_000);
  await driver.screenshot(artifacts.path('01-setup'));

  log('start Smart Review and drive through to summary via Finish Now');
  await driver.click('[data-action="punctuation-start"][data-mode-id="smart"]');
  await driver.waitForSelector('[data-punctuation-submit]', 15_000);
  await driver.screenshot(artifacts.path('02-session-q1'));

  // FINDING D fix (review follow-on): dropped `[data-punctuation-finish]`
  // — no src hits. `data-action="punctuation-finish-now"` is also absent
  // from src today; once the real Finish Now CTA lands its data-action
  // MUST match whatever the production component uses. For now the
  // organic drive-through loop below covers the Summary-reach path.
  log('finish-now: no src hook yet — using organic drive-through below');

  // Poll for Summary.
  const summaryStart = Date.now();
  let reachedSummary = false;
  while (Date.now() - summaryStart < 15_000) {
    const phase = await driver.eval(
      "(() => { const el = document.querySelector('[data-punctuation-phase]'); return el ? el.getAttribute('data-punctuation-phase') : ''; })()",
    );
    if (/summary/.test(phase)) { reachedSummary = true; break; }
    // If not on Summary yet, try to answer the first choice-card.
    await driver.eval(
      "(() => {" +
        " const choice = document.querySelector('.choice-card');" +
        " if (choice) choice.click();" +
        " const submit = document.querySelector('[data-punctuation-submit]');" +
        " if (submit && !submit.disabled) submit.click();" +
        " const cont = document.querySelector('[data-punctuation-continue]');" +
        " if (cont && !cont.disabled) cont.click();" +
        " return 'nudged';" +
      " })()",
    );
    await new Promise((r) => setTimeout(r, 400));
  }
  assert(reachedSummary, 'Journey must reach Summary phase within 15s.');
  await driver.screenshot(artifacts.path('03-summary'));

  log('inject a pending-command-like signal and verify Back remains enabled');
  // The most reliable production-truthful assertion is: the Back button's
  // disabled / aria-disabled attributes reflect the compose signal, and
  // U6 decoupled navigation from mutation. We assert on the current
  // render; any regression that re-couples them will flip the attribute.
  const backState = await driver.eval(
    "(() => {" +
      " const back = document.querySelector('[data-action=\\\"punctuation-back\\\"]');" +
      " if (!back) return 'missing';" +
      " const disabled = back.hasAttribute('disabled');" +
      " const ariaDisabled = back.getAttribute('aria-disabled') === 'true';" +
      " return JSON.stringify({ disabled, ariaDisabled });" +
    " })()",
  );
  log(`back button state: ${backState}`);
  assert(/missing/i.test(backState) === false,
    'Summary scene must render a [data-action=\"punctuation-back\"] button.');
  assert(/"disabled":true/.test(backState) === false,
    'U6 invariant: Back button must NOT be disabled on the Summary scene.');
  assert(/"ariaDisabled":true/.test(backState) === false,
    'U6 invariant: Back button must NOT be aria-disabled on the Summary scene.');

  log('click Back to verify navigation works');
  await driver.click('[data-action="punctuation-back"]');
  await driver.waitForSelector('[data-punctuation-phase="setup"]', 10_000);
  await driver.screenshot(artifacts.path('04-back-to-setup'));
}
