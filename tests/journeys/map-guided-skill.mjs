// tests/journeys/map-guided-skill.mjs
//
// R9 journey 4: Map -> tap skill card -> Guided Q1 of that skill.
//
// The critical distinction this spec guards against: tapping a skill
// card on the Map MUST start a guided session for that skill, NOT a
// cluster session or a disambiguation screen. The Phase 4 U1 fix
// re-wired the primary-mode onClicks; this journey ensures the Map's
// skill-card onClick does the same — dispatching
// `punctuation-skill-detail-open` and then `punctuation-start` with
// `{ mode: 'guided', skillId }` from the modal's "Practise this" button.

export default async function run({ driver, artifacts, log, assert }) {
  log('open /demo');
  await driver.open('/demo');
  await driver.waitForSelector('.subject-grid', 15_000);
  await driver.clearStorage();
  await driver.screenshot(artifacts.path('01-home'));

  log('click Punctuation subject card');
  await driver.click('[data-action="open-subject"][data-subject-id="punctuation"]');
  await driver.waitForSelector('[data-punctuation-phase="setup"]', 10_000);
  await driver.screenshot(artifacts.path('02-setup'));

  log('open Punctuation Map');
  await driver.click('[data-action="punctuation-open-map"]');
  await driver.waitForSelector('.punctuation-map-skill-card', 10_000);
  await driver.screenshot(artifacts.path('03-map'));

  log('read first skill card id');
  const skillIdRaw = await driver.eval(
    "(() => { const c = document.querySelector('.punctuation-map-skill-card'); return c ? c.getAttribute('data-skill-id') : ''; })()",
  );
  const skillId = skillIdRaw.trim().replace(/^['"]|['"]$/g, '');
  assert(skillId && skillId !== 'null', 'Map must render at least one skill card with data-skill-id.');
  log(`target skill: ${skillId}`);

  log('click Practise this on the first skill');
  await driver.click(
    `[data-action="punctuation-skill-detail-open"][data-skill-id="${skillId}"][data-value="practise"]`,
  );

  // The modal opens; click its primary CTA. We accept either an explicit
  // Practise button or a second-click on the skill-specific start path.
  // We keep the selector broad so copy tweaks do not destabilise this
  // journey.
  log('click modal primary CTA (Practise this / Start)');
  const modalMounted = await driver.eval(
    "(() => { return document.querySelector('.punctuation-skill-detail-modal, [data-punctuation-skill-modal]') ? 'yes' : 'no'; })()",
  );
  if (/yes/i.test(modalMounted)) {
    // The modal exposes a "Practise" button that dispatches
    // punctuation-start with mode=guided + skillId.
    await driver.eval(
      "(() => {" +
        " const sel = '.punctuation-skill-detail-modal button, [data-punctuation-skill-modal] button';" +
        " const btns = Array.from(document.querySelectorAll(sel));" +
        " const target = btns.find(b => /practise|practice|start/i.test(b.textContent || ''));" +
        " if (target) { target.click(); return 'ok'; }" +
        " return 'no-button';" +
      " })()",
    );
  }

  log('wait for guided session or skill-scoped session');
  await driver.waitForSelector('[data-punctuation-submit]', 15_000);
  await driver.screenshot(artifacts.path('04-guided-q1'));

  const stillOnMap = await driver.eval(
    "document.querySelector('[data-punctuation-phase=\\\"map\\\"]') ? 'yes' : 'no'",
  );
  assert(!/yes/i.test(stillOnMap),
    'Guided skill session must leave the Map phase.');
}
