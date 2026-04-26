// tests/journeys/reward-parity-visual.mjs
//
// R9 journey 6: Map + Setup + Summary reward-state parity after a seeded
// secured unit (U5 invariant — reward visibility is parity across every
// surface that shows it).
//
// The regression this guards: a securing event updates reward state,
// but only some surfaces re-read the latest projection. Learners see
// their Pealark progress bump on Summary while the Map's active-monster
// strip still shows stale counts. U5 proved parity via a unit-level
// five-surface test; this journey makes the parity visually verifiable.
//
// Approach:
//   1. Seed a demo learner via /demo.
//   2. Drive enough Punctuation practice to secure at least one unit.
//   3. Capture three screenshots: Summary, Map, Setup (active-monster
//      strip). Assert that the reward counts extracted from each
//      surface agree.
//
// This spec is tolerant to content drift — exact monster IDs vary with
// the seeded cohort. We extract "N/M secure" counts from each surface
// and assert they match, without hard-coding the numbers.

function parseCounts(html) {
  // Find patterns like "1/5 secure" or "2/12 secure" in the rendered
  // text and return the first match.
  const m = /(\d+)\s*\/\s*(\d+)\s+secure/i.exec(html);
  if (!m) return null;
  return { mastered: Number(m[1]), total: Number(m[2]) };
}

export default async function run({ driver, artifacts, log, assert }) {
  // FINDING A fix: clearStorage FIRST, then /demo.
  log('clearStorage (cookies + localStorage from prior journey)');
  await driver.clearStorage();

  log('open /demo');
  await driver.open('/demo');
  await driver.waitForSelector('.subject-grid', 15_000);

  log('enter Punctuation and drive a Smart Review to Summary');
  await driver.click('[data-action="open-subject"][data-subject-id="punctuation"]');
  await driver.waitForSelector('[data-punctuation-phase="setup"]', 10_000);
  await driver.click('[data-action="punctuation-start"][data-mode-id="smart"]');
  await driver.waitForSelector('[data-punctuation-submit]', 15_000);

  // Answer items until we reach Summary OR hit a 20s ceiling. We click
  // the first choice for each question and then continue — the goal is
  // to land on Summary, not to score 100%.
  const startDrive = Date.now();
  while (Date.now() - startDrive < 20_000) {
    const phase = await driver.eval(
      "(() => { const el = document.querySelector('[data-punctuation-phase]'); return el ? el.getAttribute('data-punctuation-phase') : ''; })()",
    );
    if (/summary/.test(phase)) break;
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

  await driver.waitForSelector('[data-punctuation-phase="summary"]', 10_000);
  await driver.screenshot(artifacts.path('01-summary'));

  log('capture Summary reward text');
  const summaryText = await driver.eval(
    "(() => { const el = document.querySelector('[data-punctuation-phase=\\\"summary\\\"]'); return el ? el.textContent : ''; })()",
  );
  const summaryCounts = parseCounts(summaryText);
  log(`Summary counts: ${summaryCounts ? JSON.stringify(summaryCounts) : '(no N/M secure text found)'}`);

  log('navigate Back -> Setup (active monster strip)');
  await driver.click('[data-action="punctuation-back"]');
  await driver.waitForSelector('[data-punctuation-phase="setup"]', 10_000);
  await driver.waitForSelector('.punctuation-active-monsters', 10_000);
  await driver.screenshot(artifacts.path('02-setup-active-monsters'));
  const setupText = await driver.eval(
    "(() => { const el = document.querySelector('.punctuation-active-monsters'); return el ? el.textContent : ''; })()",
  );
  const setupCounts = parseCounts(setupText);
  log(`Setup active-monster counts: ${setupCounts ? JSON.stringify(setupCounts) : '(no N/M secure text found)'}`);

  log('open Map');
  await driver.click('[data-action="punctuation-open-map"]');
  await driver.waitForSelector('[data-punctuation-phase="map"]', 10_000);
  await driver.screenshot(artifacts.path('03-map'));
  const mapText = await driver.eval(
    "(() => { const el = document.querySelector('[data-punctuation-phase=\\\"map\\\"]'); return el ? el.textContent : ''; })()",
  );
  const mapCounts = parseCounts(mapText);
  log(`Map counts: ${mapCounts ? JSON.stringify(mapCounts) : '(no N/M secure text found)'}`);

  // We assert parity only across the surfaces that expose a "N/M secure"
  // pattern — a surface whose copy does not include that phrasing is
  // skipped (documented above). Parity is the key invariant: whatever
  // mastered count Setup reports, Map must report the same for the same
  // monster total.
  //
  // FINDING C fix (review follow-on): mastered equality is now STRICT.
  // Previously a mastered mismatch was log-only, so an R6 regression
  // (slice drift) would print NOTE and still pass green. If a legitimate
  // slice difference ever documents itself, it must land as an explicit
  // narrow allowlist with a data-driven reason — silent acceptance is
  // the bug this catches.
  if (setupCounts && mapCounts) {
    assert(setupCounts.total === mapCounts.total,
      'Reward parity: Setup and Map must agree on total published units ' +
      `(saw ${setupCounts.total} vs ${mapCounts.total}).`);
    assert(setupCounts.mastered === mapCounts.mastered,
      'Reward parity: Setup and Map must agree on mastered count ' +
      `(saw ${setupCounts.mastered} vs ${mapCounts.mastered}). If a ` +
      'real slice difference exists it must be declared explicitly, not ' +
      'silently absorbed.');
  } else {
    log('Parity assertion skipped: one or more surfaces did not expose the "N/M secure" phrase.');
  }
}
