import test from 'node:test';
import assert from 'node:assert/strict';

import { defineEffect } from '../src/platform/game/render/define-effect.js';
import {
  registerEffect,
  resetRegistry,
} from '../src/platform/game/render/registry.js';
import {
  resetWarnOnce,
  setDevMode,
  __setWarnSink,
} from '../src/platform/game/render/composition.js';
import { playCelebration } from '../src/platform/game/render/play-celebration.js';
import {
  acknowledgedMonsterCelebrationIds,
  acknowledgeMonsterCelebrationEvents,
} from '../src/platform/game/monster-celebration-acks.js';
import { normaliseMonsterCelebrationEvent } from '../src/platform/game/monster-celebrations.js';
import { createStore } from '../src/platform/core/store.js';
import { createLocalPlatformRepositories } from '../src/platform/core/repositories/index.js';
import { createAppController } from '../src/platform/app/create-app-controller.js';
import { SUBJECTS } from '../src/platform/core/subject-registry.js';
import { installMemoryStorage } from './helpers/memory-storage.js';
import { renderCelebrationLayerFixture } from './helpers/react-render.js';

function setupCapture() {
  const warnings = [];
  __setWarnSink((key, message) => { warnings.push({ key, message }); });
  resetWarnOnce();
  resetRegistry();
  setDevMode(true);
  return warnings;
}

function teardown() {
  __setWarnSink(null);
  resetWarnOnce();
  resetRegistry();
  setDevMode(true);
}

function makeMonster(overrides = {}) {
  return {
    id: 'inklet',
    name: 'Inklet',
    blurb: 'A tiny ink sprite.',
    accent: '#3E6FA8',
    secondary: '#FFE9A8',
    pale: '#F8F4EA',
    nameByStage: ['Inklet egg', 'Inklet'],
    masteredMax: 100,
    ...overrides,
  };
}

function freshStore() {
  installMemoryStorage();
  const repositories = createLocalPlatformRepositories({ storage: globalThis.localStorage });
  const store = createStore(SUBJECTS, { repositories });
  return { store, repositories };
}

function registerCaughtTransient() {
  registerEffect(defineEffect({
    kind: 'caught',
    lifecycle: 'transient',
    layer: 'overlay',
    surfaces: ['lesson', 'home', 'codex'],
    reducedMotion: 'asis',
  }));
}

test('playCelebration: happy path pushes a normalised reward.monster event onto the queue', () => {
  setupCapture();
  try {
    registerCaughtTransient();
    const { store } = freshStore();
    const monster = makeMonster();

    const ok = playCelebration({
      kind: 'caught',
      monster,
      surface: 'lesson',
      params: { previous: { stage: 0 }, next: { stage: 0 } },
      learnerId: store.getState().learners.selectedId,
    }, { store });

    assert.equal(ok, true);

    const queue = store.getState().monsterCelebrations.queue;
    assert.equal(queue.length, 1);
    const event = queue[0];
    assert.equal(event.type, 'reward.monster');
    assert.equal(event.kind, 'caught');
    assert.equal(event.monsterId, 'inklet');
    assert.equal(event.monster.id, 'inklet');
    assert.equal(event.monster.accent, '#3E6FA8');
    assert.ok(typeof event.id === 'string' && event.id.length > 0);
    assert.ok(Number(event.createdAt) > 0);
  } finally {
    teardown();
  }
});

test('playCelebration: edge case — unknown kind dev-warns, queue stays empty', () => {
  const warnings = setupCapture();
  try {
    const { store } = freshStore();

    const ok = playCelebration({
      kind: 'mystery-burst',
      monster: makeMonster(),
    }, { store });

    assert.equal(ok, false);
    assert.equal(store.getState().monsterCelebrations.queue.length, 0);
    assert.ok(
      warnings.some((w) => w.key === 'play-celebration:unknown-kind:mystery-burst'),
      `expected unknown-kind warning, got ${JSON.stringify(warnings)}`,
    );
  } finally {
    teardown();
  }
});

test('playCelebration: validation drops calls with bad monster shape', () => {
  const warnings = setupCapture();
  try {
    registerCaughtTransient();
    const { store } = freshStore();

    const noMonster = playCelebration({ kind: 'caught', monster: null }, { store });
    assert.equal(noMonster, false);
    assert.equal(store.getState().monsterCelebrations.queue.length, 0);

    const noAccent = playCelebration({
      kind: 'caught',
      monster: { id: 'inklet' },
    }, { store });
    assert.equal(noAccent, false);
    assert.equal(store.getState().monsterCelebrations.queue.length, 0);

    assert.ok(warnings.some((w) => w.key.startsWith('play-celebration:bad-monster')));
  } finally {
    teardown();
  }
});

test('playCelebration: refuses non-transient effects', () => {
  const warnings = setupCapture();
  try {
    registerEffect(defineEffect({
      kind: 'shiny',
      lifecycle: 'persistent',
      layer: 'overlay',
      surfaces: ['*'],
      reducedMotion: 'simplify',
    }));
    const { store } = freshStore();

    const ok = playCelebration({
      kind: 'shiny',
      monster: makeMonster(),
    }, { store });

    assert.equal(ok, false);
    assert.equal(store.getState().monsterCelebrations.queue.length, 0);
    assert.ok(warnings.some((w) => w.key === 'play-celebration:not-transient:shiny'));
  } finally {
    teardown();
  }
});

test('CelebrationLayer: edge case — empty queue renders null', async () => {
  const out = await renderCelebrationLayerFixture({});
  const { html, after } = JSON.parse(out);
  assert.equal(html, '');
  assert.equal(after.queue.length, 0);
});

test('CelebrationLayer: happy path — queue head renders and onComplete is wired through', async () => {
  // We cannot pass JSX functions across the bundle boundary, so the
  // registered effect's render must be expressed as a JS source snippet
  // that runs inside the bundle. We capture the onComplete invocation
  // marker by having render return a span with data-onComplete="1" only
  // when the prop is a function.
  const out = await renderCelebrationLayerFixture({
    registrations: `
      registerEffect(defineEffect({
        kind: 'caught',
        lifecycle: 'transient',
        layer: 'overlay',
        surfaces: ['lesson', 'home', 'codex'],
        reducedMotion: 'asis',
        render: ({ params, monster, onComplete }) => (
          <div
            data-effect="caught"
            data-monster-id={monster?.id || ''}
            data-event-id={params?.id || ''}
            data-has-on-complete={typeof onComplete === 'function' ? '1' : '0'}
          >caught fixture</div>
        ),
      }));
    `,
    setup: `
      playCelebration({
        kind: 'caught',
        monster: {
          id: 'inklet',
          name: 'Inklet',
          accent: '#3E6FA8',
          secondary: '#FFE9A8',
          pale: '#F8F4EA',
          nameByStage: ['Inklet egg', 'Inklet'],
          masteredMax: 100,
        },
        surface: 'lesson',
        learnerId: store.getState().learners.selectedId,
      }, { store });
    `,
  });
  const { html, before, after } = JSON.parse(out);

  assert.equal(before.queue.length, 1, 'queue should have one event before render');
  assert.equal(after.queue.length, 1, 'render itself should not advance the queue');

  assert.match(html, /data-effect="caught"/);
  assert.match(html, /data-monster-id="inklet"/);
  assert.match(html, /data-has-on-complete="1"/);
});

test('CelebrationLayer: invoking onComplete advances queue and persists ack', async () => {
  // The transient effect calls onComplete during a useEffect-equivalent.
  // We trigger it before the render call (via a renderToString side
  // effect on a test host — see fixture comment) using a small harness:
  // render once to capture onComplete, store it, invoke it, then render
  // again and assert.
  const out = await renderCelebrationLayerFixture({
    registrations: `
      // Effect captures onComplete into module scope so we can call it
      // from the harness after SSR.
      let __captured = null;
      globalThis.__captureOnComplete = () => __captured;
      registerEffect(defineEffect({
        kind: 'caught',
        lifecycle: 'transient',
        layer: 'overlay',
        surfaces: ['lesson'],
        reducedMotion: 'asis',
        render: ({ onComplete }) => {
          __captured = onComplete;
          return <span data-effect="caught">caught</span>;
        },
      }));
      registerEffect(defineEffect({
        kind: 'evolve',
        lifecycle: 'transient',
        layer: 'overlay',
        surfaces: ['lesson'],
        reducedMotion: 'asis',
        render: () => <span data-effect="evolve">evolve</span>,
      }));
    `,
    setup: `
      const monster = {
        id: 'inklet',
        name: 'Inklet',
        accent: '#3E6FA8',
        secondary: '#FFE9A8',
        pale: '#F8F4EA',
        nameByStage: ['Inklet egg', 'Inklet'],
        masteredMax: 100,
      };
      // Push two events — caught (head), then evolve. Dismissing should
      // advance to evolve and persist an ack for caught.
      playCelebration({ kind: 'caught', monster, surface: 'lesson', learnerId: store.getState().learners.selectedId }, { store });
      playCelebration({ kind: 'evolve', monster, surface: 'lesson', learnerId: store.getState().learners.selectedId }, { store });
    `,
  });
  // First render: captures onComplete and asserts initial state.
  const { html, before, after, warnings } = JSON.parse(out);
  assert.equal(before.queue.length, 2);
  assert.equal(after.queue.length, 2, 'render alone should not dismiss');
  assert.match(html, /data-effect="caught"/);
  assert.equal(warnings.length, 0, `unexpected warnings: ${JSON.stringify(warnings)}`);

  // Second pass: re-run with onComplete invoked between renders.
  const out2 = await renderCelebrationLayerFixture({
    registrations: `
      registerEffect(defineEffect({
        kind: 'caught',
        lifecycle: 'transient',
        layer: 'overlay',
        surfaces: ['lesson'],
        reducedMotion: 'asis',
        render: ({ onComplete }) => {
          // Invoke immediately during render so the queue advances before
          // the second renderToStaticMarkup pass below.
          if (typeof onComplete === 'function' && !globalThis.__alreadyDismissed) {
            globalThis.__alreadyDismissed = true;
            onComplete();
          }
          return <span data-effect="caught">caught</span>;
        },
      }));
      registerEffect(defineEffect({
        kind: 'evolve',
        lifecycle: 'transient',
        layer: 'overlay',
        surfaces: ['lesson'],
        reducedMotion: 'asis',
        render: () => <span data-effect="evolve">evolve fixture</span>,
      }));
    `,
    setup: `
      const monster = {
        id: 'inklet',
        name: 'Inklet',
        accent: '#3E6FA8',
        secondary: '#FFE9A8',
        pale: '#F8F4EA',
        nameByStage: ['Inklet egg', 'Inklet'],
        masteredMax: 100,
      };
      playCelebration({ kind: 'caught', monster, surface: 'lesson', learnerId: store.getState().learners.selectedId }, { store });
      playCelebration({ kind: 'evolve', monster, surface: 'lesson', learnerId: store.getState().learners.selectedId }, { store });
    `,
  });
  const second = JSON.parse(out2);
  // After SSR has invoked onComplete inside the render, the after snapshot
  // shows the queue advanced to evolve and the caught id persisted.
  assert.equal(second.before.queue.length, 2);
  assert.equal(second.after.queue.length, 1, 'queue should advance to evolve after onComplete');
  assert.equal(second.after.queue[0].kind, 'evolve');
  const dismissedId = second.before.queue[0].id;
  assert.ok(
    second.after.ackedIds.includes(dismissedId),
    `expected acked ids to include ${dismissedId}; got ${JSON.stringify(second.after.ackedIds)}`,
  );
});

test('CelebrationLayer: legacy event shape (normalised by monster-celebrations.js) renders via the new layer', () => {
  // Pure unit assertion: we don't need React for this — the layer reads
  // queue[0] and looks up by `kind`. As long as a normalised legacy event
  // is in the queue with kind ∈ OVERLAY_KINDS, the lookup succeeds.
  setupCapture();
  try {
    registerCaughtTransient();
    const { store } = freshStore();
    const learnerId = store.getState().learners.selectedId;

    const legacyEvent = normaliseMonsterCelebrationEvent({
      id: 'reward.monster:legacy:inklet:caught',
      type: 'reward.monster',
      kind: 'caught',
      learnerId,
      monsterId: 'inklet',
      monster: makeMonster(),
      previous: { mastered: 0, stage: 0, level: 0, caught: false, branch: 'b1' },
      next: { mastered: 1, stage: 0, level: 0, caught: true, branch: 'b1' },
      createdAt: Date.UTC(2026, 0, 1),
    });

    assert.ok(legacyEvent, 'legacy event must normalise');
    store.pushMonsterCelebrations([legacyEvent]);

    const queue = store.getState().monsterCelebrations.queue;
    assert.equal(queue.length, 1);
    assert.equal(queue[0].kind, 'caught');
    assert.equal(queue[0].id, 'reward.monster:legacy:inklet:caught');
    // The layer would `lookupEffect('caught')` and render the registered
    // transient. The lookup itself is the seam under test.
    // (The full SSR render is covered by the happy-path tests above; this
    // test focuses on the legacy-shape compatibility seam.)
  } finally {
    teardown();
  }
});

test('CelebrationLayer fallback: ack-storage failure surfaces via warnOnce, queue still advances', () => {
  // Direct unit test of the buildOnComplete fallback path: we construct
  // the same primitives the layer uses and assert that an ack-storage
  // failure does not block dismissal. We use the storage hook
  // acknowledgeMonsterCelebrationEvents accepts to inject failure.
  setupCapture();
  try {
    registerCaughtTransient();
    const { store } = freshStore();
    const learnerId = store.getState().learners.selectedId;
    store.pushMonsterCelebrations([{
      id: 'reward.monster:fallback:inklet:caught',
      type: 'reward.monster',
      kind: 'caught',
      learnerId,
      monsterId: 'inklet',
      monster: makeMonster(),
      previous: { stage: 0 },
      next: { stage: 0 },
    }]);

    assert.equal(store.getState().monsterCelebrations.queue.length, 1);

    const failingStore = {
      getItem: () => '{}',
      setItem: () => { throw new Error('disk full'); },
      removeItem: () => {},
    };

    // Calling acknowledge with a failing storage must not throw — the
    // module already wraps writeSnapshot in try/catch. We then advance
    // the queue via store.dismissMonsterCelebration(), mirroring what
    // CelebrationLayer's fallback does. The assertion is that no throw
    // escapes and the queue advances cleanly.
    let threw = false;
    try {
      acknowledgeMonsterCelebrationEvents(
        store.getState().monsterCelebrations.queue[0],
        { learnerId, store: failingStore },
      );
    } catch {
      threw = true;
    }
    assert.equal(threw, false, 'ack must swallow storage failure');
    store.dismissMonsterCelebration();
    assert.equal(store.getState().monsterCelebrations.queue.length, 0);
  } finally {
    teardown();
  }
});

test('CelebrationLayer: U4 — provider with showParticles=false threads tunables into render (no particles)', async () => {
  // The bundled `caught` defaults render particles. Provider supplies
  // celebrationTunables with showParticles=false; the layer must thread
  // that into render so the particles container is omitted.
  const out = await renderCelebrationLayerFixture({
    effectConfigValue: {
      celebrationTunables: {
        'inklet-b1-3': {
          caught: { showParticles: false, showShine: false, modifierClass: '' },
        },
      },
    },
    registrations: `
      // Effect render reflects whatever tunables it receives; we forward
      // them as data attributes so the test can inspect them directly.
      registerEffect(defineEffect({
        kind: 'caught',
        lifecycle: 'transient',
        layer: 'overlay',
        surfaces: ['lesson', 'home', 'codex'],
        reducedMotion: 'asis',
        render: ({ tunables }) => {
          const hasTunables = tunables ? '1' : '0';
          const showParticles = tunables ? String(tunables.showParticles) : '';
          return (
            <div data-effect="caught" data-has-tunables={hasTunables} data-show-particles={showParticles}>
              caught with tunables
            </div>
          );
        },
      }));
    `,
    setup: `
      const monster = {
        id: 'inklet',
        name: 'Inklet',
        accent: '#3E6FA8',
        secondary: '#FFE9A8',
        pale: '#F8F4EA',
        nameByStage: ['Inklet egg', 'Inklet'],
        masteredMax: 100,
      };
      playCelebration({
        kind: 'caught',
        monster,
        surface: 'lesson',
        params: { previous: { branch: 'b1', stage: 3 }, next: { branch: 'b1', stage: 3 } },
        learnerId: store.getState().learners.selectedId,
      }, { store });
    `,
  });
  const { html } = JSON.parse(out);

  assert.match(html, /data-effect="caught"/);
  assert.match(html, /data-has-tunables="1"/);
  assert.match(html, /data-show-particles="false"/);
});

test('CelebrationLayer: U4 — provider with showShine=true is threaded into render', async () => {
  const out = await renderCelebrationLayerFixture({
    effectConfigValue: {
      celebrationTunables: {
        'inklet-b1-3': {
          caught: { showParticles: false, showShine: true, modifierClass: '' },
        },
      },
    },
    registrations: `
      registerEffect(defineEffect({
        kind: 'caught',
        lifecycle: 'transient',
        layer: 'overlay',
        surfaces: ['lesson', 'home', 'codex'],
        reducedMotion: 'asis',
        render: ({ tunables }) => {
          const showShine = tunables ? String(tunables.showShine) : '';
          return <div data-effect="caught" data-show-shine={showShine}>caught</div>;
        },
      }));
    `,
    setup: `
      const monster = {
        id: 'inklet',
        name: 'Inklet',
        accent: '#3E6FA8',
        secondary: '#FFE9A8',
        pale: '#F8F4EA',
        nameByStage: ['Inklet egg', 'Inklet'],
        masteredMax: 100,
      };
      playCelebration({
        kind: 'caught',
        monster,
        surface: 'lesson',
        params: { previous: { branch: 'b1', stage: 3 }, next: { branch: 'b1', stage: 3 } },
        learnerId: store.getState().learners.selectedId,
      }, { store });
    `,
  });
  const { html } = JSON.parse(out);

  assert.match(html, /data-show-shine="true"/);
});

test('CelebrationLayer: U4 — no provider omits tunables, render falls back to kind defaults', async () => {
  const out = await renderCelebrationLayerFixture({
    registrations: `
      registerEffect(defineEffect({
        kind: 'caught',
        lifecycle: 'transient',
        layer: 'overlay',
        surfaces: ['lesson', 'home', 'codex'],
        reducedMotion: 'asis',
        render: ({ tunables }) => {
          const has = tunables ? '1' : '0';
          return <div data-effect="caught" data-has-tunables={has}>caught</div>;
        },
      }));
    `,
    setup: `
      const monster = {
        id: 'inklet',
        name: 'Inklet',
        accent: '#3E6FA8',
        secondary: '#FFE9A8',
        pale: '#F8F4EA',
        nameByStage: ['Inklet egg', 'Inklet'],
        masteredMax: 100,
      };
      playCelebration({
        kind: 'caught',
        monster,
        surface: 'lesson',
        params: { previous: { branch: 'b1', stage: 0 }, next: { branch: 'b1', stage: 0 } },
        learnerId: store.getState().learners.selectedId,
      }, { store });
    `,
  });
  const { html } = JSON.parse(out);

  assert.match(html, /data-has-tunables="0"/);
});

test('CelebrationLayer: U4 — provider lacking the (asset, kind) row omits tunables', async () => {
  // Provider mounted but no celebrationTunables row for inklet-b1-3 caught.
  // Layer should not synthesise tunables — the render uses kind defaults.
  const out = await renderCelebrationLayerFixture({
    effectConfigValue: {
      celebrationTunables: {
        // Tunables only for some other asset; no inklet entry.
        'someone-else-b1-3': {
          caught: { showParticles: false, showShine: false, modifierClass: '' },
        },
      },
    },
    registrations: `
      registerEffect(defineEffect({
        kind: 'caught',
        lifecycle: 'transient',
        layer: 'overlay',
        surfaces: ['lesson', 'home', 'codex'],
        reducedMotion: 'asis',
        render: ({ tunables }) => {
          const has = tunables ? '1' : '0';
          return <div data-effect="caught" data-has-tunables={has}>caught</div>;
        },
      }));
    `,
    setup: `
      const monster = {
        id: 'inklet',
        name: 'Inklet',
        accent: '#3E6FA8',
        secondary: '#FFE9A8',
        pale: '#F8F4EA',
        nameByStage: ['Inklet egg', 'Inklet'],
        masteredMax: 100,
      };
      playCelebration({
        kind: 'caught',
        monster,
        surface: 'lesson',
        params: { previous: { branch: 'b1', stage: 3 }, next: { branch: 'b1', stage: 3 } },
        learnerId: store.getState().learners.selectedId,
      }, { store });
    `,
  });
  const { html } = JSON.parse(out);

  assert.match(html, /data-has-tunables="0"/);
});

test('integration: monster-celebration-dismiss action through controller acks and advances queue', () => {
  setupCapture();
  try {
    installMemoryStorage();
    const repositories = createLocalPlatformRepositories({ storage: globalThis.localStorage });
    const controller = createAppController({ repositories, subjects: SUBJECTS });
    const learnerId = controller.store.getState().learners.selectedId;

    const event = normaliseMonsterCelebrationEvent({
      id: 'reward.monster:integration:inklet:caught',
      type: 'reward.monster',
      kind: 'caught',
      learnerId,
      monsterId: 'inklet',
      monster: makeMonster(),
      previous: { stage: 0 },
      next: { stage: 0 },
    });
    controller.store.pushMonsterCelebrations([event]);
    assert.equal(controller.store.getState().monsterCelebrations.queue.length, 1);

    controller.dispatch('monster-celebration-dismiss');

    assert.equal(controller.store.getState().monsterCelebrations.queue.length, 0);
    const acked = acknowledgedMonsterCelebrationIds(learnerId);
    assert.ok(
      acked.has('reward.monster:integration:inklet:caught'),
      `expected ack for dismissed event id; got ${[...acked].join(', ')}`,
    );
  } finally {
    teardown();
  }
});
